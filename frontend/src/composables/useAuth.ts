import { ref } from 'vue';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
}

const user = ref<UserProfile | null>(null);
const isAuthenticated = ref<boolean>(false);
const csrfToken = ref<string>('');
const loading = ref<boolean>(true);

export function useAuth() {
  /**
   * Actively checks session status with the BFF
   */
  async function checkAuth(): Promise<boolean> {
    loading.value = true;
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          user.value = data.user;
          csrfToken.value = data.csrfToken || '';
          isAuthenticated.value = true;
          return true;
        }
      }
      user.value = null;
      csrfToken.value = '';
      isAuthenticated.value = false;
      return false;
    } catch {
      user.value = null;
      csrfToken.value = '';
      isAuthenticated.value = false;
      return false;
    } finally {
      loading.value = false;
    }
  }

  function login() {
    window.location.href = '/api/auth/login';
  }

  /**
   * Universal logout: Clears local state, calls BFF backchannel revocation and redirects
   */
  async function logout() {
    try {
      const res = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken.value,
        },
        body: JSON.stringify({}), // Prevents empty body parser 400 error
        credentials: 'include',
      });

      user.value = null;
      isAuthenticated.value = false;
      csrfToken.value = '';

      if (res.ok) {
        const data = await res.json();
        if (data.logoutUrl) {
          window.location.href = data.logoutUrl;
          return;
        }
      }
      window.location.href = '/login';
    } catch {
      user.value = null;
      isAuthenticated.value = false;
      csrfToken.value = '';
      window.location.href = '/login';
    }
  }

  /**
   * Secure fetch wrapper that injects anti-CSRF token and credentials automatically
   */
  async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers || {});

    if (init.method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(init.method.toUpperCase())) {
      if (csrfToken.value) {
        headers.set('X-CSRF-Token', csrfToken.value);
      }
    }

    const response = await fetch(input, { ...init, headers, credentials: 'include' });

    if (response.status === 401) {
      isAuthenticated.value = false;
      user.value = null;
      csrfToken.value = '';
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    return response;
  }

  return {
    user,
    isAuthenticated,
    csrfToken,
    loading,
    checkAuth,
    login,
    logout,
    apiFetch,
  };
}
