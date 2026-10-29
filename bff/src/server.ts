import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import crypto from 'crypto';
import sessionPlugin from './plugins/session.js';
import { authRoutes } from './routes/auth.js';
import { apiRoutes } from './routes/api.js';
import { verifyOrRefreshSession, getOidcConfig } from './services/oidcService.js';
import { initDbPool } from './services/sessionStore.js';

const isProduction = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '0.0.0.0';

// Initialize PostgreSQL pool
initDbPool();

const server = Fastify({
  trustProxy: true,
  logger: isProduction ? true : { level: 'info' },
});

// TOLERATE EMPTY JSON BODIES ON POST (prevents FST_ERR_CTP_EMPTY_JSON_BODY on logouts)
server.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
  if (!body || (typeof body === 'string' && body.trim() === '')) {
    return done(null, {});
  }
  try {
    const json = JSON.parse(body as string);
    done(null, json);
  } catch (err: any) {
    err.statusCode = 400;
    done(err, undefined);
  }
});

// CORS: allow frontend with credentials
const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
await server.register(cors, {
  origin: [frontendUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
});

await server.register(cookie);

// Symmetric 256-bit key for session cookie encryption
const rawSecret = process.env.SESSION_SECRET || 'starter_secret_key_must_be_32_bytes_long_min!';
const sessionSecret = crypto.createHash('sha256').update(rawSecret).digest();

await server.register(sessionPlugin, {
  cookieName: process.env.COOKIE_NAME || 'bff_session',
  secret: sessionSecret,
  maxAge: 7 * 24 * 60 * 60,
});

// Health check endpoint
server.get('/api/health', async () => ({
  status: 'ok',
  service: 'pure-bff-token-handler',
  time: new Date().toISOString(),
}));

// GLOBAL BFF SECURITY GUARD HOOK
server.addHook('preHandler', async (request, reply) => {
  const rawUrl = request.raw.url || request.url;
  const path = rawUrl.split('?')[0];
  const method = request.method;

  const isPublic =
    path === '/api/health' ||
    path === '/api/auth/login' ||
    path === '/api/auth/callback' ||
    path === '/api/auth/me' ||
    path === '/api/auth/logout';

  if (isPublic) return;

  // 1. Check local session
  const user = request.session?.get('user');
  if (!user) {
    return reply.code(401).send({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
  }

  // 2. Active validation against IAM
  const config = getOidcConfig();
  const sessionId = request.session?.get('session_id');
  if (config.issuerUrl && sessionId) {
    const isAlive = await verifyOrRefreshSession(request.session, request.log);
    if (!isAlive) {
      request.session.delete();
      return reply.code(401).send({ error: 'Unauthorized', code: 'IAM_SESSION_EXPIRED' });
    }
  }

  // 3. Strict Anti-CSRF verification on mutations
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const sessionCsrf = request.session.get('csrf_token');
    const headerCsrf = request.headers['x-csrf-token'];

    if (!sessionCsrf || !headerCsrf || sessionCsrf !== headerCsrf) {
      return reply.code(403).send({ error: 'Forbidden', code: 'CSRF_INVALID', message: 'Invalid or missing CSRF token' });
    }
  }
});

// Register routes
await server.register(authRoutes, { prefix: '/api/auth' });
await server.register(apiRoutes, { prefix: '/api' });

try {
  await server.listen({ port, host });
  console.log(`🚀 Pure BFF Server running on http://${host}:${port}`);
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
