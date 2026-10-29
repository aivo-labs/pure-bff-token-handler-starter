import fp from 'fastify-plugin';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';

export interface UserInfo {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
}

export interface SessionData {
  session_id?: string;
  user?: UserInfo;
  csrf_token?: string;
  oidc_state?: string;
  oidc_nonce?: string;
  oidc_code_verifier?: string;
  [key: string]: any;
}

export class Session {
  private data: SessionData;
  private modified = false;

  constructor(initialData: SessionData = {}) {
    this.data = { ...initialData };
  }

  get<K extends keyof SessionData>(key: K): SessionData[K] {
    return this.data[key];
  }

  set<K extends keyof SessionData>(key: K, value: SessionData[K]): void {
    this.data[key] = value;
    this.modified = true;
  }

  delete(): void {
    this.data = {};
    this.modified = true;
  }

  isModified(): boolean {
    return this.modified;
  }

  toJSON(): SessionData {
    return this.data;
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    session: Session;
  }
}

function encrypt(data: object, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const json = JSON.stringify(data);
  let encrypted = cipher.update(json, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

function decrypt(encryptedString: string, key: Buffer): object | null {
  try {
    const parts = encryptedString.split(':');
    if (parts.length !== 3) return null;
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const ciphertext = parts[2];
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  } catch {
    return null;
  }
}

export default fp(async function sessionPlugin(
  fastify: FastifyInstance,
  opts: { secret: Buffer; cookieName?: string; maxAge?: number }
) {
  const cookieName = opts.cookieName || 'bff_session';
  const secretKey = opts.secret;
  const maxAge = opts.maxAge || 7 * 24 * 60 * 60; // 7 days in seconds

  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    const cookieValue = request.cookies[cookieName];
    let initialData = {};
    if (cookieValue) {
      const decrypted = decrypt(cookieValue, secretKey);
      if (decrypted) initialData = decrypted;
    }
    request.session = new Session(initialData);
  });

  fastify.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.session && request.session.isModified()) {
      const sessionData = request.session.toJSON();
      const domain = process.env.COOKIE_DOMAIN || undefined;
      const isSecure =
        process.env.COOKIE_SECURE === 'true' ||
        request.protocol === 'https' ||
        process.env.NODE_ENV === 'production';
      const sameSiteOption = (process.env.COOKIE_SAMESITE as 'lax' | 'none' | 'strict') || 'lax';

      if (Object.keys(sessionData).length === 0) {
        const clearOptions = {
          path: '/',
          httpOnly: true,
          secure: isSecure,
          sameSite: sameSiteOption,
        };
        if (domain) {
          reply.clearCookie(cookieName, { ...clearOptions, domain });
        }
        reply.clearCookie(cookieName, clearOptions);
      } else {
        const encrypted = encrypt(sessionData, secretKey);
        reply.setCookie(cookieName, encrypted, {
          path: '/',
          httpOnly: true,
          secure: isSecure,
          sameSite: sameSiteOption,
          domain,
          maxAge,
        });
      }
    }
  });
});
