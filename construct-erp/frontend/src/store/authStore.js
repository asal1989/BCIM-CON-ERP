// src/store/authStore.js
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { authAPI } from '../api/client';

const AUTH_KEY = 'construct-erp-auth-v2';

function clearAuthStorage() {
  sessionStorage.removeItem('accessToken');
  sessionStorage.removeItem('refreshToken');
  sessionStorage.removeItem(AUTH_KEY);
  sessionStorage.removeItem('selectedProjectId');
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem(AUTH_KEY);
}

const blankAuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  loginAt: null,
  isDemoMode: false,
  error: null,
  selectedProjectId: null,
  selectedProjectName: null,
  selectedProjectCode: null,
};

const useAuthStore = create(
  persist(
    (set, get) => ({
      ...blankAuthState,
      isLoading: false,
      isInitialized: false,

      // Project context - selected at login, scopes data for project users.
      setSelectedProject: (project) => {
        if (!project) {
          sessionStorage.removeItem('selectedProjectId');
          set({ selectedProjectId: null, selectedProjectName: null, selectedProjectCode: null });
          return;
        }
        sessionStorage.setItem('selectedProjectId', project.id);
        set({
          selectedProjectId: project.id,
          selectedProjectName: project.name || null,
          selectedProjectCode: project.project_code || project.code || null,
        });
      },

      clearSelectedProject: () => {
        sessionStorage.removeItem('selectedProjectId');
        set({ selectedProjectId: null, selectedProjectName: null, selectedProjectCode: null });
      },

      // Startup token check. Auth lives in localStorage so sessions survive
      // browser close/reopen (server enforces 8-hour absolute limit).
      initialize: async () => {
        sessionStorage.removeItem('accessToken');
        sessionStorage.removeItem('refreshToken');
        sessionStorage.removeItem(AUTH_KEY);

        const { accessToken, user, logout } = get();
        if (!accessToken) {
          set({ isInitialized: true });
          return;
        }

        if (user) set({ isInitialized: true });

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 10000)
        );

        try {
          const { data } = await Promise.race([authAPI.me(), timeoutPromise]);
          set({ user: data, isInitialized: true });
        } catch {
          await logout('session_expired');
          set({ isInitialized: true });
        }
      },

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          clearAuthStorage();
          const { data } = await authAPI.login({ email, password });
          localStorage.setItem('accessToken', data.accessToken);
          localStorage.setItem('refreshToken', data.refreshToken);
          set({
            user: data.user,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            loginAt: Date.now(),
            isLoading: false,
            isInitialized: true,
            isDemoMode: false,
            error: null,
            selectedProjectId: null,
            selectedProjectName: null,
            selectedProjectCode: null,
          });
          return { success: true };
        } catch (err) {
          const isNetwork = !err.response;
          const msg = isNetwork
            ? 'Cannot connect to server. Make sure the backend is running.'
            : (err.response?.data?.error || 'Invalid email or password.');
          set({ error: msg, isLoading: false });
          return { success: false, error: msg };
        }
      },

      logout: async (reason = 'manual') => {
        const { refreshToken } = get();
        clearAuthStorage();
        set({ ...blankAuthState, isInitialized: true, isLoading: false });
        window.dispatchEvent(new CustomEvent('auth:logout', { detail: { reason } }));

        if (refreshToken) {
          const timeout = new Promise(resolve => setTimeout(resolve, 1500));
          try {
            await Promise.race([authAPI.logout({ refreshToken }), timeout]);
          } catch (_) {}
        }
      },

      fetchMe: async () => {
        try {
          const { data } = await authAPI.me();
          set({ user: data });
        } catch {
          await get().logout('session_expired');
        }
      },

      clearError: () => set({ error: null }),

      isAdmin: () => ['super_admin', 'admin'].includes(get().user?.role),
      isProjectHead: () => get().user?.role === 'project_head',
      isPM: () => get().user?.role === 'project_manager',
      isSiteEngineer: () => get().user?.role === 'site_engineer',
      isQS: () => get().user?.role === 'qs_engineer',
      isHSE: () => get().user?.role === 'hse_officer',
      isAccountant: () => get().user?.role === 'accountant',
      isIT: () => get().user?.role === 'it_admin',
      hasRole: (roles) => roles.includes(get().user?.role),
    }),
    {
      name: AUTH_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        loginAt: state.loginAt,
        selectedProjectId: state.selectedProjectId,
        selectedProjectName: state.selectedProjectName,
        selectedProjectCode: state.selectedProjectCode,
      }),
    }
  )
);

if (typeof window !== 'undefined') {
  window.addEventListener('auth:token-refreshed', ({ detail }) => {
    localStorage.setItem('accessToken', detail.accessToken);
    localStorage.setItem('refreshToken', detail.refreshToken);
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('refreshToken');
    useAuthStore.setState({
      accessToken: detail.accessToken,
      refreshToken: detail.refreshToken,
    });
  });

  window.addEventListener('auth:logout', () => {
    clearAuthStorage();
    useAuthStore.setState({ ...blankAuthState, isInitialized: true, isLoading: false });
  });
}

export default useAuthStore;
