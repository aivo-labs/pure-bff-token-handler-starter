<template>
  <div class="login-container">
    <div class="login-card">
      <div class="brand">
        <div class="badge">OWASP & IETF Compliant</div>
        <h1>Pure BFF & Token Handler</h1>
        <p class="subtitle">Secure SPA Architecture with Fastify & Keycloak</p>
      </div>

      <div class="features-list">
        <div class="feature-item">
          <span class="icon">🛡️</span>
          <div>
            <strong>Zero Tokens in Browser</strong>
            <p>No JWTs in localStorage or JavaScript memory.</p>
          </div>
        </div>
        <div class="feature-item">
          <span class="icon">🍪</span>
          <div>
            <strong>Encrypted HttpOnly Cookie</strong>
            <p>AES-256-GCM cookie capped at ~500 bytes (No RFC 6265 overflow).</p>
          </div>
        </div>
        <div class="feature-item">
          <span class="icon">⚡</span>
          <div>
            <strong>Active Session Liveness</strong>
            <p>Instant revocation when session is terminated on Keycloak.</p>
          </div>
        </div>
      </div>

      <button @click="login" class="btn-login">
        <span>Sign in with Keycloak SSO</span>
        <span class="arrow">→</span>
      </button>

      <div class="credentials-hint">
        <h3>🔑 Pre-configured Test Accounts:</h3>
        <div class="cred-grid">
          <div class="cred-box">
            <span class="role-badge">Standard User</span>
            <code>demo / demo</code>
          </div>
          <div class="cred-box">
            <span class="role-badge admin">Admin</span>
            <code>admin / admin</code>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAuth } from '../composables/useAuth';

const { login } = useAuth();
</script>

<style scoped>
.login-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 1.5rem;
}

.login-card {
  background: #131b2e;
  border: 1px solid #1e293b;
  border-radius: 16px;
  max-width: 480px;
  width: 100%;
  padding: 2.5rem;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

.brand {
  text-align: center;
  margin-bottom: 2rem;
}

.badge {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 600;
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.1);
  border: 1px solid rgba(56, 189, 248, 0.2);
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  margin-bottom: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

h1 {
  font-size: 1.75rem;
  font-weight: 700;
  margin: 0 0 0.5rem 0;
  color: #ffffff;
}

.subtitle {
  color: #94a3b8;
  font-size: 0.95rem;
  margin: 0;
}

.features-list {
  background: #0b1120;
  border-radius: 12px;
  padding: 1.25rem;
  margin-bottom: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.feature-item {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.feature-item .icon {
  font-size: 1.25rem;
  line-height: 1;
}

.feature-item strong {
  display: block;
  font-size: 0.875rem;
  color: #e2e8f0;
}

.feature-item p {
  margin: 0.15rem 0 0 0;
  font-size: 0.8rem;
  color: #64748b;
}

.btn-login {
  width: 100%;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: white;
  border: none;
  border-radius: 10px;
  padding: 0.875rem 1.5rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transition: all 0.2s ease;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
}

.btn-login:hover {
  background: linear-gradient(135deg, #1d4ed8, #1e40af);
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(37, 99, 235, 0.4);
}

.arrow {
  transition: transform 0.2s ease;
}

.btn-login:hover .arrow {
  transform: translateX(4px);
}

.credentials-hint {
  margin-top: 2rem;
  padding-top: 1.5rem;
  border-top: 1px solid #1e293b;
}

.credentials-hint h3 {
  font-size: 0.825rem;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 0.75rem 0;
}

.cred-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.cred-box {
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 8px;
  padding: 0.6rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.role-badge {
  font-size: 0.7rem;
  color: #38bdf8;
  font-weight: 500;
}

.role-badge.admin {
  color: #f59e0b;
}

code {
  font-family: var(--font-mono);
  font-size: 0.825rem;
  color: #cbd5e1;
}
</style>
