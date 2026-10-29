# 🛡️ Pure BFF & Token Handler Starter

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![OIDC 1.0](https://img.shields.io/badge/OIDC-1.0%20Compliant-green.svg)](https://openid.net/developers/specs/)
[![OAuth 2.0 PKCE](https://img.shields.io/badge/OAuth%202.0-RFC%207636%20(PKCE)-orange.svg)](https://datatracker.ietf.org/doc/html/rfc7636)
[![OWASP Recommended](https://img.shields.io/badge/OWASP-BFF%20Pattern-brightgreen.svg)](https://owasp.org/)
[![Built with Fastify & Vue](https://img.shields.io/badge/Stack-Fastify%20%2B%20Vue%203-blueviolet.svg)](https://aivo.fr)

> **Production-grade reference implementation of the Pure Backend-For-Frontend (BFF) and Token Handler pattern.**  
> Completely eliminates JWT token storage in client browsers, overcomes the **RFC 6265 4KB Cookie Overflow trap**, and enforces active session revocation against **Keycloak**, **Authelia**, **Authentik**, or **Okta**.

---

## 📌 Why this Starter?

Most modern Single-Page Applications (SPA) make one of two critical security mistakes:
1. **Storing JWTs in `localStorage` or `sessionStorage`:** 100% vulnerable to Cross-Site Scripting (XSS). Any third-party NPM dependency or injection can exfiltrate your `refresh_token`.
2. **Storing raw tokens directly in cookies:** Keycloak JWTs (`access_token`, `refresh_token`, `id_token`) total ~3.8 KB. Once encrypted with AES-256-GCM, the cookie header reaches **~7.8 KB**. Browsers **silently drop cookies over 4,096 bytes** (RFC 6265), causing random `401 Unauthorized` errors.

### The Solution: Pure BFF & Hybrid Token Handler
* **Zero tokens in the browser:** The Vue client only holds an encrypted `httpOnly`, `sameSite: lax` cookie containing an ephemeral session ID (~500 bytes).
* **Server-side Token Handler:** Full OIDC tokens reside in Fastify's RAM cache (`< 1 ms`) backed by PostgreSQL for persistence across container restarts.
* **Active Session Liveness:** If an administrator revokes a session in Keycloak, the user is evicted on their very next click!

---

## 📐 Architecture Schema (ASCII)

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 BROWSER (VUE 3 SPA)                                    │
│  - HttpOnly Cookie: bff_session (AES-256 Encrypted, ~500 bytes)                       │
│  - Ephemeral Anti-CSRF Token in RAM memory                                             │
└───────────────────┬──────────────────────────────────────────────▲─────────────────────┘
                    │                                              │
    (1) HTTPS POST  │ [Cookie: bff_session]                        │ (8) 302 Redirect
    with credentials│ [X-CSRF-Token: ...]                          │     Set-Cookie
                    ▼                                              │
┌──────────────────────────────────────────────────────────────────┴─────────────────────┐
│                             BACKEND-FOR-FRONTEND (FASTIFY)                             │
│  - Node.js TypeScript + AES-256-GCM Cookie Encryption                                  │
│  - Strict Anti-CSRF PreHandler Guard Hook                                              │
│                                                                                        │
│   ┌────────────────────────────────┐       ┌──────────────────────────────────────┐    │
│   │   Session Store (In-Memory)    │ <===> │    PostgreSQL (user_sessions)        │    │
│   │   Cache < 1ms for OIDC tokens  │       │    Inter-container persistence       │    │
│   └───────────────▲────────────────┘       └──────────────────▲───────────────────┘    │
└───────────────────┼───────────────────────────────────────────┼────────────────────────┘
                    │                                           │
    (3) Code Exch.  │ (5) UserInfo / Token Refresh              │ (7) Backchannel Logout
        + PKCE S256 │     (Active session validation)           │     (RFC 7009 Revocation)
                    ▼                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                           IDENTITY PROVIDER (KEYCLOAK / OIDC)                          │
│  - OpenID Connect 1.0 & OAuth 2.0 PKCE                                                 │
│  - Single Sign-On (SSO) & Realm Session Management                                    │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 1-Minute Quickstart

### Prerequisites
* [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/) installed.

### Start the entire stack with one command:
```bash
docker compose up --build
```

That's it! Docker will automatically initialize:
1. **PostgreSQL 16** on `localhost:5432`
2. **Keycloak 24** on `http://localhost:8080` (auto-importing the `pure-bff-demo` realm)
3. **Fastify BFF** on `http://localhost:3000`
4. **Vue 3 SPA** on `http://localhost:5173`

---

## 🔑 Pre-Configured Test Accounts

Open `http://localhost:5173` in your browser and click **Sign in with Keycloak SSO**:

| Username | Password | Role | Description |
| :--- | :--- | :--- | :--- |
| **`demo`** | `demo` | `user` | Standard authenticated user |
| **`admin`** | `admin` | `admin` | Administrator with elevated privileges |

*Keycloak Admin Console: [http://localhost:8080](http://localhost:8080) (Credentials: `admin / admin`)*

---

## 🧪 Testing Active Session Revocation

One of the greatest features of this architecture is **Active Session Liveness**:
1. Log in to the application at `http://localhost:5173`.
2. Open the Keycloak Admin Console at `http://localhost:8080`.
3. Go to **pure-bff-demo** realm > **Sessions** > Find the user and click **Revoke**.
4. Return to your Vue dashboard and click **GET /api/protected/profile** or refresh the page.
5. **Observation:** The Fastify BFF immediately detects that Keycloak terminated the session, purges the local cookie, and evicts the browser to `/login`.

---

## 🔄 Adapting to Authelia, Authentik or Okta

This starter implements **RFC 8414 / OpenID Connect Discovery 1.0** via `/.well-known/openid-configuration`.

To switch from Keycloak to another Identity Provider, simply update your `.env`:

### For Authelia:
```env
OIDC_ISSUER_URL=https://auth.example.com
OIDC_CLIENT_ID=my-authelia-client
OIDC_CLIENT_SECRET=my-authelia-secret
```

### For Okta:
```env
OIDC_ISSUER_URL=https://dev-123456.okta.com/oauth2/default
OIDC_CLIENT_ID=my-okta-client
OIDC_CLIENT_SECRET=my-okta-secret
```

---

## 📁 Repository Structure

```text
pure-bff-token-handler-starter/
├── docker-compose.yml          # One-command orchestration
├── .env.example                # Configuration template
├── keycloak/
│   └── realm-export.json       # Pre-provisioned realm, client, and users
├── bff/
│   ├── src/
│   │   ├── plugins/session.ts  # AES-256-GCM HttpOnly cookie plugin
│   │   ├── services/
│   │   │   ├── sessionStore.ts # Hybrid RAM + PostgreSQL Token Handler
│   │   │   └── oidcService.ts  # Generic OIDC Discovery & Lifecycle service
│   │   ├── routes/
│   │   │   ├── auth.ts         # PKCE login, callback, /me, and logout
│   │   │   └── api.ts          # Protected API examples with CSRF checks
│   │   └── server.ts           # Fastify server, empty body parser, CSRF hook
│   ├── schema.sql              # PostgreSQL user_sessions DDL
│   ├── package.json
│   └── Dockerfile
└── frontend/
    ├── src/
    │   ├── composables/useAuth.ts # Secure fetch & CSRF injection
    │   ├── router/index.ts        # Router guard with active verification
    │   ├── views/
    │   │   ├── LoginView.vue      # Login screen with test accounts
    │   │   └── DashboardView.vue  # Interactive API tester & metrics
    │   └── main.ts
    ├── vite.config.ts
    ├── package.json
    └── Dockerfile
```

---

## 📖 In-Depth Guide & Community

* 📰 **Full Architecture Guide:** [https://aivo.fr/en/blog/pure-bff-architecture-oidc-security](https://aivo.fr/en/blog/pure-bff-architecture-oidc-security)
* 💡 **Substack & Newsletters:** Subscribe to our [AIVO Blog](https://aivo.fr/en/blog) or our [AIVO Tech Insights](https://aivolabs.substack.com/) Substack for deep dives on Sovereign Cloud, Zero-Trust, and AppSec.
* ✍️ **Author:** [Nicolas BAUD](https://nicolas.baud.dev)

## 📄 License

Licensed under the [MIT License](LICENSE). Free for commercial and personal use.
