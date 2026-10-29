<template>
  <div class="dashboard-layout">
    <header class="navbar">
      <div class="nav-brand">
        <span class="logo-shield">🛡️</span>
        <span class="brand-title">Pure BFF Demo</span>
      </div>
      <div class="nav-user">
        <div class="user-meta">
          <span class="user-name">{{ user?.name }}</span>
          <span class="role-tag" :class="user?.role">{{ user?.role }}</span>
        </div>
        <button type="button" @click.prevent="logout" class="btn-logout">
          Logout
        </button>
      </div>
    </header>

    <main class="content">
      <div class="banner">
        <h2>🎉 Authenticated via Pure BFF & Token Handler</h2>
        <p>No tokens are stored in this browser. All JWT operations occur on the Fastify BFF server.</p>
      </div>

      <div class="grid">
        <!-- Session State Card -->
        <div class="card">
          <div class="card-header">
            <h3>🔒 Client Session Information</h3>
            <span class="status-indicator">
              <span class="pulse"></span> Active Session
            </span>
          </div>
          <div class="card-body">
            <div class="info-row">
              <span class="label">User Name:</span>
              <span class="value">{{ user?.name }}</span>
            </div>
            <div class="info-row">
              <span class="label">User Email:</span>
              <span class="value">{{ user?.email }}</span>
            </div>
            <div class="info-row">
              <span class="label">Assigned Role:</span>
              <span class="value">{{ user?.role }}</span>
            </div>
            <div class="info-row">
              <span class="label">Anti-CSRF Token:</span>
              <code class="value-code">{{ csrfToken.substring(0, 16) }}...</code>
            </div>
            <div class="info-row">
              <span class="label">Browser Storage:</span>
              <span class="value text-success">Clean (0 tokens in localStorage)</span>
            </div>
          </div>
        </div>

        <!-- Interactive API Mutation Card -->
        <div class="card">
          <div class="card-header">
            <h3>⚡ Interactive API Testing</h3>
          </div>
          <div class="card-body">
            <p class="description">Test secured endpoints with automatic CSRF header injection:</p>
            <div class="actions-group">
              <button @click="testFetchProfile" :disabled="apiLoading" class="btn-action">
                GET /api/protected/profile
              </button>
              <button @click="testPostAction" :disabled="apiLoading" class="btn-action primary">
                POST /api/protected/action (With CSRF)
              </button>
            </div>

            <div v-if="apiResponse" class="response-viewer">
              <div class="response-header">Server Response:</div>
              <pre><code>{{ JSON.stringify(apiResponse, null, 2) }}</code></pre>
            </div>
          </div>
        </div>
      </div>

      <!-- Live Revocation Test Guide -->
      <div class="guide-box">
        <h3>🧪 How to Test Active Session Revocation:</h3>
        <ol>
          <li>Open Keycloak Admin Console at <a href="http://localhost:8080" target="_blank">http://localhost:8080</a> (Login: <code>admin / admin</code>).</li>
          <li>Select the <strong>pure-bff-demo</strong> realm > <strong>Sessions</strong> menu.</li>
          <li>Click <strong>Revoke</strong> on this active user session.</li>
          <li>Return here and click either button above or refresh the page (F5).</li>
          <li><strong>Result :</strong> The BFF instantly detects the dead IAM session, wipes the local cookie, and evicts you to <code>/login</code>!</li>
        </ol>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useAuth } from '../composables/useAuth';

const { user, csrfToken, logout, apiFetch } = useAuth();

const apiLoading = ref(false);
const apiResponse = ref<any>(null);

async function testFetchProfile() {
  apiLoading.value = true;
  try {
    const res = await apiFetch('/api/protected/profile');
    apiResponse.value = await res.json();
  } catch (err: any) {
    apiResponse.value = { error: err.message };
  } finally {
    apiLoading.value = false;
  }
}

async function testPostAction() {
  apiLoading.value = true;
  try {
    const res = await apiFetch('/api/protected/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'trigger_order', item: 'sovereign_cloud_pack' }),
    });
    apiResponse.value = await res.json();
  } catch (err: any) {
    apiResponse.value = { error: err.message };
  } finally {
    apiLoading.value = false;
  }
}
</script>

<style scoped>
.dashboard-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  background: #131b2e;
  border-bottom: 1px solid #1e293b;
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.logo-shield {
  font-size: 1.5rem;
}

.brand-title {
  font-weight: 700;
  font-size: 1.125rem;
  color: #ffffff;
}

.nav-user {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

.user-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.user-name {
  font-size: 0.875rem;
  color: #e2e8f0;
  font-weight: 500;
}

.role-tag {
  font-size: 0.7rem;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  background: rgba(56, 189, 248, 0.1);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.2);
  text-transform: uppercase;
}

.role-tag.admin {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
  border-color: rgba(245, 158, 11, 0.2);
}

.btn-logout {
  background: transparent;
  border: 1px solid #334155;
  color: #cbd5e1;
  padding: 0.4rem 0.875rem;
  border-radius: 6px;
  font-size: 0.825rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-logout:hover {
  background: #dc2626;
  border-color: #dc2626;
  color: #ffffff;
}

.content {
  max-width: 1000px;
  margin: 0 auto;
  padding: 2.5rem 1.5rem;
  width: 100%;
}

.banner {
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.1), rgba(14, 165, 233, 0.05));
  border: 1px solid rgba(56, 189, 248, 0.2);
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 2rem;
}

.banner h2 {
  margin: 0 0 0.5rem 0;
  font-size: 1.25rem;
  color: #ffffff;
}

.banner p {
  margin: 0;
  font-size: 0.9rem;
  color: #94a3b8;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  margin-bottom: 2rem;
}

@media (max-width: 768px) {
  .grid {
    grid-template-columns: 1fr;
  }
}

.card {
  background: #131b2e;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 1.5rem;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.25rem;
}

.card-header h3 {
  margin: 0;
  font-size: 1rem;
  color: #ffffff;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  color: #10b981;
  font-weight: 500;
}

.pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
  animation: pulse-green 2s infinite;
}

@keyframes pulse-green {
  0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
  70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
  100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.info-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  border-bottom: 1px solid #1e293b;
  padding-bottom: 0.5rem;
}

.info-row .label {
  color: #64748b;
}

.info-row .value {
  color: #e2e8f0;
  font-weight: 500;
}

.info-row .value.text-success {
  color: #34d399;
}

.value-code {
  font-family: var(--font-mono);
  background: #0f172a;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  font-size: 0.75rem;
  color: #38bdf8;
}

.description {
  font-size: 0.85rem;
  color: #94a3b8;
  margin: 0 0 1rem 0;
}

.actions-group {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.btn-action {
  background: #1e293b;
  border: 1px solid #334155;
  color: #e2e8f0;
  padding: 0.65rem 1rem;
  border-radius: 8px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}

.btn-action:hover:not(:disabled) {
  background: #334155;
}

.btn-action.primary {
  background: #1d4ed8;
  border-color: #2563eb;
  color: #ffffff;
}

.btn-action.primary:hover:not(:disabled) {
  background: #2563eb;
}

.btn-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.response-viewer {
  margin-top: 1rem;
  background: #0b1120;
  border: 1px solid #1e293b;
  border-radius: 8px;
  padding: 0.75rem;
}

.response-header {
  font-size: 0.7rem;
  text-transform: uppercase;
  color: #64748b;
  margin-bottom: 0.35rem;
}

pre {
  margin: 0;
  overflow-x: auto;
}

pre code {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: #38bdf8;
}

.guide-box {
  background: #0f172a;
  border: 1px dashed #334155;
  border-radius: 12px;
  padding: 1.5rem;
}

.guide-box h3 {
  margin: 0 0 0.75rem 0;
  font-size: 0.95rem;
  color: #f8fafc;
}

.guide-box ol {
  margin: 0;
  padding-left: 1.25rem;
  color: #94a3b8;
  font-size: 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.guide-box code {
  font-family: var(--font-mono);
  background: #1e293b;
  color: #f1f5f9;
  padding: 0.1rem 0.3rem;
  border-radius: 4px;
}

.guide-box a {
  color: #38bdf8;
  text-decoration: underline;
}
</style>
