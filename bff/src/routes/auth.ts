import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { UserInfo } from '../plugins/session.js';
import {
  getOidcConfig,
  getEndpoints,
  getInternalHeaders,
  verifyOrRefreshSession,
  revokeOidcSession,
} from '../services/oidcService.js';
import { saveSession, KeycloakTokens } from '../services/sessionStore.js';

export async function authRoutes(fastify: FastifyInstance) {
  const config = getOidcConfig();
  const isMockMode = !config.issuerUrl;

  // 1. Initiate OIDC Authorization Flow with PKCE (RFC 7636)
  fastify.get('/login', async (request, reply) => {
    if (isMockMode) {
      const state = crypto.randomBytes(16).toString('hex');
      request.session.set('oidc_state', state);
      return reply.redirect(`/api/auth/callback?code=mock_code&state=${state}`);
    }

    const endpoints = await getEndpoints();
    const state = crypto.randomBytes(16).toString('hex');
    const nonce = crypto.randomBytes(16).toString('hex');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    request.session.set('oidc_state', state);
    request.session.set('oidc_nonce', nonce);
    request.session.set('oidc_code_verifier', codeVerifier);

    const authUrl = new URL(endpoints.authorizationEndpoint);
    authUrl.searchParams.append('client_id', config.clientId);
    authUrl.searchParams.append('redirect_uri', config.redirectUri);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', 'openid email profile');
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('nonce', nonce);
    authUrl.searchParams.append('code_challenge', codeChallenge);
    authUrl.searchParams.append('code_challenge_method', 'S256');
    authUrl.searchParams.append('prompt', 'login');

    return reply.redirect(authUrl.toString());
  });

  // 2. OIDC Callback: Code exchange with PKCE and session creation
  fastify.get('/callback', async (request, reply) => {
    const { code, state, error, error_description } = request.query as any;

    if (error) {
      return reply.code(400).send({ error: 'Auth Error', message: error_description || error });
    }

    const savedState = request.session.get('oidc_state');
    const codeVerifier = request.session.get('oidc_code_verifier');

    if (savedState && state && state !== savedState) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Invalid state parameter.' });
    }

    let userInfo: UserInfo;
    let tokens: KeycloakTokens;

    if (isMockMode) {
      userInfo = { id: 'user_001', name: 'Demo User', email: 'demo@example.com', role: 'user' };
      tokens = { access_token: 'mock_access_token', refresh_token: 'mock_refresh_token', expires_at: Date.now() + 3600000 };
    } else {
      const endpoints = await getEndpoints();
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code: code || '',
        redirect_uri: config.redirectUri,
        client_id: config.clientId,
      });
      if (config.clientSecret) body.append('client_secret', config.clientSecret);
      if (codeVerifier) body.append('code_verifier', codeVerifier);

      const tokenRes = await fetch(endpoints.tokenEndpoint, {
        method: 'POST',
        headers: getInternalHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }),
        body: body.toString(),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        throw new Error(`Token exchange failed (${tokenRes.status}): ${errText}`);
      }

      const rawTokens = await tokenRes.json() as any;
      tokens = {
        access_token: rawTokens.access_token,
        refresh_token: rawTokens.refresh_token,
        id_token: rawTokens.id_token,
        expires_at: Date.now() + ((rawTokens.expires_in || 300) * 1000),
      };

      // Extract user claims: start with id_token payload (standard OIDC), then enrich via /userinfo
      let rawUser: any = {};
      if (rawTokens.id_token) {
        try {
          const parts = rawTokens.id_token.split('.');
          if (parts.length >= 2) {
            rawUser = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
          }
        } catch (e) {
          request.log.warn({ err: e }, 'Failed to parse id_token payload');
        }
      }

      if (endpoints.userinfoEndpoint) {
        try {
          const userInfoRes = await fetch(endpoints.userinfoEndpoint, {
            headers: getInternalHeaders({ Authorization: `Bearer ${tokens.access_token}` }),
          });

          if (userInfoRes.ok) {
            const uiJson = await userInfoRes.json() as any;
            rawUser = { ...rawUser, ...uiJson };
          } else {
            const errBody = await userInfoRes.text();
            request.log.warn(`UserInfo returned HTTP ${userInfoRes.status}: ${errBody}. Falling back to token claims.`);
          }
        } catch (err) {
          request.log.warn({ err }, 'Error querying UserInfo endpoint, falling back to token claims.');
        }
      }

      // If rawUser still has no sub, fallback to access_token payload
      if (!rawUser.sub && rawTokens.access_token) {
        try {
          const parts = rawTokens.access_token.split('.');
          if (parts.length >= 2) {
            const atClaims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
            rawUser = { ...atClaims, ...rawUser };
          }
        } catch (e) {}
      }

      userInfo = {
        id: rawUser.sub || 'user_unknown',
        name: rawUser.name || rawUser.preferred_username || 'User',
        email: rawUser.email || '',
        role: (rawUser.roles?.includes('admin') || rawUser.realm_access?.roles?.includes('admin')) ? 'admin' : 'user',
      };
    }

    // Generate cryptographic session ID and persist tokens server-side
    const sessionId = crypto.randomBytes(32).toString('hex');
    await saveSession(sessionId, userInfo, tokens);

    // Generate ephemeral anti-CSRF token
    const csrfToken = crypto.randomBytes(32).toString('hex');

    request.session.set('session_id', sessionId);
    request.session.set('user', userInfo);
    request.session.set('csrf_token', csrfToken);

    return reply.redirect(`${config.frontendUrl}/dashboard`);
  });

  // 3. Active session check endpoint (/me)
  fastify.get('/me', async (request, reply) => {
    const user = request.session.get('user');
    const csrfToken = request.session.get('csrf_token');

    if (!user) {
      return reply.code(401).send({ authenticated: false, message: 'Unauthenticated.' });
    }

    if (config.issuerUrl) {
      const isAlive = await verifyOrRefreshSession(request.session, request.log);
      if (!isAlive) {
        request.session.delete();
        return reply.code(401).send({
          authenticated: false,
          code: 'SESSION_REVOKED',
          message: 'IAM session was revoked or expired.',
        });
      }
    }

    return {
      authenticated: true,
      user: request.session.get('user'),
      csrfToken: request.session.get('csrf_token') || csrfToken,
    };
  });

  // 4. Universal logout endpoint (POST & GET)
  const handleLogout = async (request: any) => {
    const logoutUrl = await revokeOidcSession(request.session, request.log);
    request.session.delete();
    return { success: true, logoutUrl };
  };

  fastify.post('/logout', async (request) => handleLogout(request));
  fastify.get('/logout', async (request, reply) => {
    const { logoutUrl } = await handleLogout(request);
    return reply.redirect(logoutUrl);
  });
}
