import { createRouter, createWebHistory } from 'vue-router';
import { useAuth } from '../composables/useAuth';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('../views/DashboardView.vue'),
    },
    {
      path: '/',
      redirect: '/dashboard',
    },
  ],
});

router.beforeEach(async (to, _from, next) => {
  const { checkAuth } = useAuth();

  if (to.meta.public) {
    if (to.path === '/login') {
      const isAuthed = await checkAuth();
      if (isAuthed) return next({ path: '/dashboard' });
    }
    return next();
  }

  // Active validation: if Keycloak session was deleted in admin console,
  // user is instantly redirected to /login on next navigation
  const isAuthed = await checkAuth();
  if (!isAuthed) {
    return next({ path: '/login', query: { redirect: to.fullPath } });
  }

  next();
});

export default router;
