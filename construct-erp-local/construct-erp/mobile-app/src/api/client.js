import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from '../config';

const api = axios.create({ baseURL: API_BASE_URL, timeout: 15000 });

api.interceptors.request.use(async (config) => {
  try {
    const token = await SecureStore.getItemAsync('auth_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } catch {}
  return config;
});

// Access tokens are short-lived (15 min). On a 401, try the refresh token once
// and retry the original request before giving up — otherwise every session
// silently drops after 15 minutes even though a valid refresh token exists.
let refreshPromise = null;
let onAuthExpired = null;
export const setOnAuthExpired = (fn) => { onAuthExpired = fn; };

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status !== 401 || original._retried || original.url === '/auth/refresh') {
      throw error;
    }
    original._retried = true;
    try {
      if (!refreshPromise) {
        refreshPromise = (async () => {
          const refreshToken = await SecureStore.getItemAsync('refresh_token');
          if (!refreshToken) throw new Error('No refresh token');
          const { data } = await api.post('/auth/refresh', { refreshToken });
          await SecureStore.setItemAsync('auth_token', data.accessToken);
          await SecureStore.setItemAsync('refresh_token', data.refreshToken);
          return data.accessToken;
        })();
      }
      const newToken = await refreshPromise;
      refreshPromise = null;
      original.headers.Authorization = `Bearer ${newToken}`;
      return api(original);
    } catch (refreshErr) {
      refreshPromise = null;
      await SecureStore.deleteItemAsync('auth_token');
      await SecureStore.deleteItemAsync('refresh_token');
      if (onAuthExpired) onAuthExpired();
      throw error;
    }
  }
);

export const authAPI = {
  login:   (email, password) => api.post('/auth/login', { email, password }),
  refresh: (refreshToken)    => api.post('/auth/refresh', { refreshToken }),
  logout:  (refreshToken)    => api.post('/auth/logout', { refreshToken }),
  me:      ()                => api.get('/auth/me'),
};

export const projectAPI = {
  list: () => api.get('/projects'),
};

export const dashboardAPI = {
  kpis: (projectId) => api.get('/analytics/dashboard', { params: { project_id: projectId } }),
};

export const mrsAPI = {
  list:   (projectId) => api.get('/mrs', { params: { project_id: projectId, limit: 50 } }),
  detail: (id)         => api.get(`/mrs/${id}`),
  create: (data)       => api.post('/mrs', data),
};

export const storesAPI = {
  list: (projectId) => api.get('/inventory', { params: { project_id: projectId, limit: 100 } }),
};

export const billsAPI = {
  list:   (projectId) => api.get('/tqs-bills', { params: { project_id: projectId, limit: 50 } }),
  detail: (id)         => api.get(`/tqs-bills/${id}`),
};

export const assetAPI = {
  list:   (projectId) => api.get('/asset', { params: { project_id: projectId, limit: 100 } }),
  detail: (id)         => api.get(`/asset/${id}`),
};

export const dmsAPI = {
  list: (projectId) => api.get('/dms', { params: { project_id: projectId, limit: 50 } }),
};

export const essAPI = {
  summary:       () => api.get('/ess/summary'),
  attendance:    () => api.get('/ess/attendance'),
  leaveBalances: () => api.get('/ess/leave/balances'),
  leaveRequests: () => api.get('/ess/leave/requests'),
  applyLeave:    (data) => api.post('/ess/leave/requests', data),
};

export const dprAPI = {
  list:   (projectId) => api.get('/dpr', { params: { project_id: projectId } }),
  create: (data)       => api.post('/dpr', data),
};

export const approvalsAPI = {
  pending: (params = {}) => api.get('/approvals/pending', { params }),
  decide:  (entity_type, entity_id, action, comments) =>
    api.post('/approvals/action', { entity_type, entity_id, action, comments }),
};

export const notificationsAPI = {
  registerDevice: (token, platform) => api.post('/notifications/devices', { token, platform, enabled: true }),
};

export default api;
