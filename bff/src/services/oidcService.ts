import { FastifyBaseLogger } from 'fastify';
import { Session } from '../plugins/session.js';
import {
  getSession,
  updateSessionTokens,
  updateLastVerifiedAt,
  deleteSession,
  KeycloakTokens,
} from './sessionStore.js';

export interface OidcEndpoints {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint: string;
  endSessionEndpoint?: string;
  revocationEndpoint?: string;
}

let cachedEndpoints: OidcEndpoints | null = null;

export function getOidcConfig() {
  const issuerUrl = (process.env.OIDC_ISSUER_URL || process.env.KEYCLOAK_URL || '').replace(/\/+$/, '');
  const internalIssuerUrl = (process.env.OIDC_INTERNAL_ISSUER_URL || process.env.KEYCLOAK_INTERNAL_URL || issuerUrl).replace(/\/+$/, '');
  const realm = process.env.KEYCLOAK_REALM || 'pure-bff-demo';
  const clientId = process.env.OIDC_CLIENT_ID || process.env.KEYCLOAK_CLIENT_ID || 'bff-client';
  const clientSecret = process.env.OIDC_CLIENT_SECRET || process.env.KEYCLOAK_CLIENT_SECRET || 'bff-secret-super-secure-change-in-prod';
  const redirectUri = process.env.OIDC_REDIRECT_URI || 'http://localhost:3000/api/auth/callback';
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');

  return {
    issuerUrl,
    internalIssuerUrl,
    realm,
    clientId,
    clientSecret,
    redirectUri,
    frontendUrl,
  };
}

/**
 * Returns HTTP headers required for internal container-to-container calls to the IAM.
 * Ensures the `Host` header matches the canonical public issuer (e.g. `localhost:8080`)
 * so that Keycloak validates the token's issuer without mismatch.
 */
export function getInternalHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
  const config = getOidcConfig();
  const headers: Record<string, string> = { ...extraHeaders };
  if (config.issuerUrl && config.internalIssuerUrl && config.issuerUrl !== config.internalIssuerUrl) {
    try {
      headers['Host'] = new URL(config.issuerUrl).host;
    } catch {}
  }
  return headers;
}

/**
 * Resolves OIDC endpoints using standard Discovery (RFC 8414 / OIDC Discovery 1.0)
 * Works universally with Keycloak, Authelia, Authentik, Okta, Auth0, Entra ID!
 */
export async function getEndpoints(): Promise<OidcEndpoints> {
  if (cachedEndpoints) return cachedEndpoints;

  const config = getOidcConfig();
  if (!config.issuerUrl) {
    // Mock / local fallback
    return {
      authorizationEndpoint: '',
      tokenEndpoint: '',
      userinfoEndpoint: '',
    };
  }

  // Determine base issuer URL for internal calls
  let discoveryBase = config.internalIssuerUrl;
  if (!discoveryBase.includes('/realms/') && config.realm && !discoveryBase.includes('okta') && !discoveryBase.includes('authelia')) {
    discoveryBase = `${config.internalIssuerUrl}/realms/${config.realm}`;
  }

  // Public authorization base (for user browser redirect)
  let publicAuthBase = config.issuerUrl;
  if (!publicAuthBase.includes('/realms/') && config.realm && !publicAuthBase.includes('okta') && !publicAuthBase.includes('authelia')) {
    publicAuthBase = `${config.issuerUrl}/realms/${config.realm}`;
  }

  try {
    const discoveryUrl = `${discoveryBase}/.well-known/openid-configuration`;
    const res = await fetch(discoveryUrl, { headers: getInternalHeaders() });
    if (res.ok) {
      const disco = await res.json() as any;

      // Ensure authorization endpoint is accessible by the user's browser (public issuer)
      let authEndpoint: string = disco.authorization_endpoint;
      if (config.issuerUrl && config.internalIssuerUrl) {
        authEndpoint = authEndpoint.replace(config.internalIssuerUrl, config.issuerUrl);
      }

      // Ensure backchannel endpoints use internal network (internal issuer)
      const toInternal = (url?: string): string => {
        if (!url) return '';
        if (config.issuerUrl && config.internalIssuerUrl) {
          return url.replace(config.issuerUrl, config.internalIssuerUrl);
        }
        return url;
      };

      cachedEndpoints = {
        authorizationEndpoint: authEndpoint,
        tokenEndpoint: toInternal(disco.token_endpoint) || disco.token_endpoint,
        userinfoEndpoint: toInternal(disco.userinfo_endpoint) || disco.userinfo_endpoint,
        endSessionEndpoint: authEndpoint.replace(/\/protocol\/openid-connect\/auth.*/, '/protocol/openid-connect/logout'),
        revocationEndpoint: toInternal(disco.revocation_endpoint) || disco.revocation_endpoint,
      };
      return cachedEndpoints;
    }
  } catch (err) {
    console.warn('[OidcService] Discovery failed, falling back to standard Keycloak endpoints pattern.');
  }

  // Fallback to Keycloak standard endpoints
  const internalFallback = `${config.internalIssuerUrl}/realms/${config.realm}/protocol/openid-connect`;
  const publicFallback = `${config.issuerUrl}/realms/${config.realm}/protocol/openid-connect`;
  cachedEndpoints = {
    authorizationEndpoint: `${publicFallback}/auth`,
    tokenEndpoint: `${internalFallback}/token`,
    userinfoEndpoint: `${internalFallback}/userinfo`,
    endSessionEndpoint: `${publicFallback}/logout`,
    revocationEndpoint: `${internalFallback}/revoke`,
  };
  return cachedEndpoints;
}

/**
 * Actively validates the session against the IAM (UserInfo) with silent refresh
 */
export async function verifyOrRefreshSession(
  session: Session,
  log?: FastifyBaseLogger
): Promise<boolean> {
  const config = getOidcConfig();
  if (!config.issuerUrl) return true; // Mock mode

  const sessionId = session.get('session_id');
  if (!sessionId) return false;

  const stored = await getSession(sessionId);
  if (!stored || !stored.tokens || !stored.tokens.access_token) return false;

  const { tokens } = stored;
  const now = Date.now();
  const isAccessTokenExpired = tokens.expires_at ? now >= tokens.expires_at : false;

  // Short 15s in-memory throttle to avoid hammering the IdP on rapid clicks
  if (now - (stored.lastVerifiedAt || 0) < 15000 && !isAccessTokenExpired) {
    return true;
  }

  const endpoints = await getEndpoints();

  // 1. Verify current access token with UserInfo endpoint
  if (!isAccessTokenExpired && endpoints.userinfoEndpoint) {
    try {
      const userRes = await fetch(endpoints.userinfoEndpoint, {
        headers: getInternalHeaders({ Authorization: `Bearer ${tokens.access_token}` }),
      });

      if (userRes.ok) {
        const rawUser = await userRes.json() as any;
        if (rawUser && rawUser.sub) {
          const currentUser = session.get('user') || stored.user;
          session.set('user', {
            id: rawUser.sub,
            name: rawUser.name || rawUser.preferred_username || currentUser?.name || 'User',
            email: rawUser.email || currentUser?.email || '',
            role: (rawUser.roles?.includes('admin') || currentUser?.role === 'admin') ? 'admin' : 'user',
          });
        }
        await updateLastVerifiedAt(sessionId);
        return true;
      }
      log?.info('OIDC UserInfo rejected token. Attempting background token refresh...');
    } catch (err) {
      log?.warn({ err }, 'Network error querying OIDC UserInfo endpoint');
    }
  }

  // 2. Token expired or UserInfo failed: execute refresh_token grant
  if (!tokens.refresh_token) {
    await deleteSession(sessionId);
    return false;
  }

  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: config.clientId,
    });
    if (config.clientSecret) body.append('client_secret', config.clientSecret);

    const refreshRes = await fetch(endpoints.tokenEndpoint, {
      method: 'POST',
      headers: getInternalHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }),
      body: body.toString(),
    });

    if (!refreshRes.ok) {
      log?.warn('Session was revoked or deleted in IAM. Purging local BFF session.');
      await deleteSession(sessionId);
      return false;
    }

    const rawNewTokens = await refreshRes.json() as any;
    const newTokens: KeycloakTokens = {
      access_token: rawNewTokens.access_token,
      refresh_token: rawNewTokens.refresh_token || tokens.refresh_token,
      id_token: rawNewTokens.id_token || tokens.id_token,
      expires_at: Date.now() + ((rawNewTokens.expires_in || 300) * 1000),
    };

    await updateSessionTokens(sessionId, newTokens);
    await updateLastVerifiedAt(sessionId);
    return true;
  } catch (err) {
    log?.error({ err }, 'Critical error refreshing OIDC session');
    await deleteSession(sessionId);
    return false;
  }
}

/**
 * Revokes the session: Direct backchannel logout + RFC 7009 revocation + Frontchannel redirect URL
 */
export async function revokeOidcSession(
  session: Session,
  log?: FastifyBaseLogger
): Promise<string> {
  const config = getOidcConfig();
  let logoutUrl = `${config.frontendUrl}/login`;
  if (!config.issuerUrl) return logoutUrl;

  const sessionId = session.get('session_id');
  const stored = sessionId ? await getSession(sessionId) : null;
  const tokens = stored?.tokens;

  const endpoints = await getEndpoints();

  // 1. Direct backchannel logout if supported
  if (tokens?.refresh_token && endpoints.endSessionEndpoint) {
    try {
      const body = new URLSearchParams({
        client_id: config.clientId,
        refresh_token: tokens.refresh_token,
      });
      if (config.clientSecret) body.append('client_secret', config.clientSecret);

      await fetch(endpoints.endSessionEndpoint, {
        method: 'POST',
        headers: getInternalHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }),
        body: body.toString(),
      });
      log?.info('OIDC backchannel logout request executed');
    } catch (err) {
      log?.warn({ err }, 'OIDC backchannel logout failed');
    }
  }

  // 2. RFC 7009 token revocation
  if (tokens?.refresh_token && endpoints.revocationEndpoint) {
    try {
      const revokeBody = new URLSearchParams({
        client_id: config.clientId,
        token: tokens.refresh_token,
        token_type_hint: 'refresh_token',
      });
      if (config.clientSecret) revokeBody.append('client_secret', config.clientSecret);

      await fetch(endpoints.revocationEndpoint, {
        method: 'POST',
        headers: getInternalHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }),
        body: revokeBody.toString(),
      });
    } catch {}
  }

  // Purge local server session
  if (sessionId) await deleteSession(sessionId);

  // 3. Build RP-Initiated Logout frontchannel redirect URL
  if (endpoints.endSessionEndpoint) {
    const logoutParams = new URLSearchParams();
    if (tokens?.id_token) logoutParams.append('id_token_hint', tokens.id_token);
    logoutParams.append('client_id', config.clientId);
    logoutParams.append('post_logout_redirect_uri', `${config.frontendUrl}/login`);

    logoutUrl = `${endpoints.endSessionEndpoint}?${logoutParams.toString()}`;
  }

  return logoutUrl;
}
