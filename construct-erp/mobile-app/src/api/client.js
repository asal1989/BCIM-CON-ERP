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

export const mrsAPI = {
  list:    (projectId) => api.get('/stores/mrs', { params: { project_id: projectId, limit: 50 } }),
  detail:  (id)        => api.get(`/stores/mrs/${id}`),
  create:  (data)      => api.post('/stores/mrs', data),
  reject:  (id, reason)=> api.patch(`/stores/mrs/${id}/reject`, { reason }),
  approve: (id, stage) => api.patch(`/stores/mrs/${id}/${stage}`),
};

export const storesAPI = {
  list: (projectId) => api.get('/inventory', { params: { project_id: projectId, limit: 100 } }),
};

export const ignAPI = {
  list:    (projectId) => api.get('/ign', { params: { project_id: projectId, limit: 50 } }),
  detail:  (id)        => api.get(`/ign/${id}`),
  create:  (data)      => api.post('/ign', data),
  receive: (id)        => api.patch(`/ign/${id}/receive`),
  inspect: (id)        => api.patch(`/ign/${id}/inspect`),
  approve: (id)        => api.patch(`/ign/${id}/approve`),
  cancel:  (id)        => api.patch(`/ign/${id}/cancel`),
};

export const grsAPI = {
  list:        (projectId, params = {}) => api.get('/grs', { params: { project_id: projectId, ...params } }),
  detail:      (id)      => api.get(`/grs/${id}`),
  acknowledge: (id)      => api.patch(`/grs/${id}/acknowledge`),
  cancel:      (id)      => api.patch(`/grs/${id}/cancel`),
};

export const materialTrackerAPI = {
  list:    (projectId, materialType) => api.get('/material-tracker', { params: { project_id: projectId, material_type: materialType } }),
  detail:  (id)         => api.get(`/material-tracker/${id}`),
  create:  (data)       => api.post('/material-tracker', data),
  addLoad: (id, data)   => api.post(`/material-tracker/${id}/loads`, data),
};

export const vendorAPI = {
  list:   (params = {}) => api.get('/vendors', { params }),
  detail: (id)           => api.get(`/vendors/${id}`),
};

export const poAPI = {
  list:    (projectId) => api.get('/purchase-orders', { params: { project_id: projectId, limit: 50 } }),
  detail:  (id)        => api.get(`/purchase-orders/${id}`),
  bills:   (id)        => api.get(`/purchase-orders/${id}/bills`),
  approve: (id, stage) => api.patch(`/purchase-orders/${id}/${stage}`),
  reject:  (id, reason) => api.patch(`/purchase-orders/${id}/reject`, { reason }),
};

export const workOrderAPI = {
  list:    (projectId) => api.get('/sc/work-orders', { params: { project_id: projectId, limit: 50 } }),
  detail:  (id)        => api.get(`/sc/work-orders/${id}`),
  approve: (id)        => api.patch(`/sc/work-orders/${id}/approve`),
  close:   (id)        => api.patch(`/sc/work-orders/${id}/close`),
};

export const boqAPI = {
  list: (projectId) => api.get('/boq', { params: { project_id: projectId } }),
};

export const boqBudgetAPI = {
  list:              (projectId) => api.get(`/boq-budget/${projectId}`),
  costheadSummary:   (projectId) => api.get(`/boq-budget/${projectId}/costhead-summary`),
  costheadDrilldown: (projectId, costHead) => api.get(`/boq-budget/${projectId}/costhead-drilldown`, { params: { cost_head: costHead } }),
};

export const raBillAPI = {
  list:    (projectId) => api.get('/ra-bills', { params: { project_id: projectId } }),
  detail:  (id)        => api.get(`/ra-bills/${id}`),
  verify:  (id)        => api.patch(`/ra-bills/${id}/verify`),
  approve: (id)        => api.patch(`/ra-bills/${id}/approve`),
  reject:  (id, reason)=> api.patch(`/ra-bills/${id}/reject`, { reason }),
  pay:     (id)        => api.patch(`/ra-bills/${id}/pay`),
};

export const variationAPI = {
  list:    (projectId) => api.get('/variations', { params: { project_id: projectId } }),
  detail:  (id)        => api.get(`/variations/${id}`),
  approve: (id)        => api.patch(`/variations/${id}/approve`),
};

export const invoiceAPI = {
  list:       (projectId) => api.get('/invoices', { params: { project_id: projectId } }),
  detail:     (id)        => api.get(`/invoices/${id}`),
  gstSummary: (projectId) => api.get('/invoices/gst-summary', { params: { project_id: projectId } }),
  verify:     (id)        => api.patch(`/invoices/${id}/verify`),
  authorize:  (id)        => api.patch(`/invoices/${id}/authorize`),
};

export const chartOfAccountsAPI = {
  list: (params = {}) => api.get('/chart-of-accounts', { params }),
};

export const tdsAPI = {
  list: (projectId) => api.get('/tds', { params: { project_id: projectId } }),
};

export const milestonesAPI = {
  list: (projectId) => api.get('/planning/milestones', { params: { project_id: projectId } }),
};

export const activitiesAPI = {
  list: (projectId) => api.get('/planning/activities', { params: { project_id: projectId } }),
};

export const tenderAPI = {
  list:   () => api.get('/tenders'),
  detail: (id) => api.get(`/tenders/${id}`),
};

export const incidentAPI = {
  list:   (projectId) => api.get('/incidents', { params: { project_id: projectId } }),
  detail: (id)        => api.get(`/incidents/${id}`),
  create: (data)      => api.post('/incidents', data),
  close:  (id)        => api.patch(`/incidents/${id}/close`),
};

export const itAssetAPI = {
  list:           (projectId) => api.get('/it-assets', { params: { project_id: projectId } }),
  detail:         (id)        => api.get(`/it-assets/${id}`),
  addMaintenance: (id, data)  => api.post(`/it-assets/${id}/maintenance`, data),
};

export const plantAPI = {
  list:   (projectId) => api.get('/plant/equipment', { params: { project_id: projectId } }),
  detail: (id)        => api.get(`/plant/equipment/${id}`),
};

export const hireRentalAPI = {
  list: (projectId) => api.get('/hire-rental/orders', { params: { project_id: projectId } }),
};

export const subcontractorAPI = {
  list:           ()          => api.get('/subcontractors/list'),
  listWorkOrders: (projectId) => api.get('/sc/work-orders', { params: { project_id: projectId, limit: 100 } }),
};

export const quotationAPI = {
  list: (projectId) => api.get('/quotations', { params: { project_id: projectId, limit: 100 } }),
};

export const inventoryAPI = {
  list:     (projectId) => api.get('/inventory', { params: { project_id: projectId, limit: 200 } }),
  lowStock: (projectId) => api.get('/inventory/low-stock', { params: { project_id: projectId } }),
};

export const minAPI = {
  list: (projectId) => api.get('/stores/min', { params: { project_id: projectId, limit: 50 } }),
};

export const bankAccountsAPI = {
  list: () => api.get('/bank-accounts'),
};

export const projectsAPI = {
  list: () => api.get('/projects'),
};

export const vendorPaymentsAPI = {
  list:   (projectId) => api.get('/payments', { params: { project_id: projectId } }),
  detail: (id)        => api.get(`/payments/${id}`),
  create: (data)      => api.post('/payments', data),
};

export const storeLedgerAPI = {
  list:   (projectId)   => api.get('/inventory', { params: { project_id: projectId, limit: 100 } }),
  ledger: (inventoryId) => api.get('/inventory/ledger', { params: { inventory_id: inventoryId } }),
};

export const pettyCashAPI = {
  list:         (projectId) => api.get('/stores-petty-cash/entries', { params: { project_id: projectId, limit: 200 } }),
  detail:       (id)        => api.get(`/stores-petty-cash/entries/${id}`),
  create:       (data)      => api.post('/stores-petty-cash/entries', data),
  updateStatus: (id, data)  => api.patch(`/stores-petty-cash/entries/${id}/status`, data),
};

export const gatePassAPI = {
  list:   (projectId) => api.get('/gate-passes', { params: { project_id: projectId } }),
  detail: (id)         => api.get(`/gate-passes/${id}`),
  create: (data)       => api.post('/gate-passes', data),
  return: (id)         => api.patch(`/gate-passes/${id}/return`),
  close:  (id)         => api.patch(`/gate-passes/${id}/close`),
  cancel: (id)         => api.patch(`/gate-passes/${id}/cancel`),
};

export const payrollAPI = {
  list: () => api.get('/payroll'),
};

export const employeeDirectoryAPI = {
  list: () => api.get('/hr-admin/employees'),
};

export const qualityAPI = {
  itp:               (projectId) => api.get('/quality/itp',    { params: { project_id: projectId } }),
  itpDetail:         (id)        => api.get(`/quality/itp/${id}`),
  itpApprove:        (id)        => api.patch(`/quality/itp/${id}/approve`),
  mir:               (projectId) => api.get('/quality/mir',    { params: { project_id: projectId } }),
  mirDetail:         (id)        => api.get(`/quality/mir/${id}`),
  mirStartInspection:(id)        => api.patch(`/quality/mir/${id}/start-inspection`),
  mirApprove:        (id)        => api.patch(`/quality/mir/${id}/approve`),
  mirReject:         (id, reason)=> api.patch(`/quality/mir/${id}/reject`, { reason }),
  audits:            (projectId) => api.get('/quality/audits', { params: { project_id: projectId } }),
};

export const permitAPI = {
  list:   (projectId) => api.get('/permits', { params: { project_id: projectId } }),
  create: (data)      => api.post('/permits', data),
  close:  (id)        => api.patch(`/permits/${id}/close`),
};

export const ppeAPI = {
  list:   (projectId) => api.get('/ppe', { params: { project_id: projectId } }),
  create: (data)      => api.post('/ppe', data),
  return: (id)        => api.patch(`/ppe/${id}/return`),
};

export const itTicketAPI = {
  list:    ()          => api.get('/it-tickets'),
  detail:  (id)        => api.get(`/it-tickets/${id}`),
  create:  (data)      => api.post('/it-tickets', data),
  update:  (id, data)  => api.patch(`/it-tickets/${id}`, data),
  resolve: (id, notes) => api.patch(`/it-tickets/${id}/resolve`, { resolution_notes: notes }),
};

export const lookAheadAPI = {
  list: (projectId) => api.get('/planning/look-ahead', { params: { project_id: projectId } }),
};

export const engineerLogAPI = {
  list:   (projectId) => api.get('/engineer-logs', { params: { project_id: projectId } }),
  detail: (id)        => api.get(`/engineer-logs/${id}`),
  create: (data)      => api.post('/engineer-logs', data),
};

export const methodStatementAPI = {
  list: (projectId) => api.get('/quality/method-statements', { params: { project_id: projectId } }),
};

export const measurementAPI = {
  list: (projectId) => api.get('/measurements', { params: { project_id: projectId } }),
};

export const appraisalAPI = {
  list: () => api.get('/hr-admin/appraisals'),
};

export const usersAPI = {
  list: () => api.get('/users'),
};

export const projectDashboardAPI = {
  get: (projectId) => api.get(`/projects/${projectId}/dashboard`),
};

export const planningDashboardAPI = {
  get: (projectId) => api.get('/planning/dashboard', { params: { project_id: projectId } }),
};

export const reportsAPI = {
  projectPL: (projectId) => api.get('/reports/project-pl', { params: { project_id: projectId } }),
};

export const billsAPI = {
  list:          (projectId) => api.get('/tqs/bills', { params: { project_id: projectId, limit: 50 } }),
  detail:        (id)        => api.get(`/tqs/bills/${id}`),
  advanceStage:  (id)        => api.patch(`/tqs/bills/${id}/advance-stage`),
};

export const assetAPI = {
  list:   (projectId) => api.get('/assets', { params: { project_id: projectId, limit: 100 } }),
  detail: (id)         => api.get(`/assets/${id}`),
};

export const dmsAPI = {
  list: (projectId) => api.get('/dms', { params: { project_id: projectId, limit: 50 } }),
};

export const essAPI = {
  summary:       () => api.get('/ess/summary'),
  attendance:    () => api.get('/ess/attendance'),
  attendanceCorrections: () => api.get('/ess/attendance/corrections'),
  leaveBalances: () => api.get('/ess/leave/balances'),
  leaveRequests: () => api.get('/ess/leave/requests'),
  applyLeave:    (data) => api.post('/ess/leave/requests', data),
  requestAttendanceCorrection: (data) => api.post('/ess/attendance/corrections', data),
  cancelLeave:   (id)   => api.patch(`/ess/leave/requests/${id}/cancel`),
  payslips:      ()     => api.get('/ess/payslips'),
  payslipDetail: (id)   => api.get(`/ess/payslips/${id}`),
  documents:     ()     => api.get('/ess/documents'),
};

export const hrServiceRequestAPI = {
  list:   (params) => api.get('/hr-admin/advanced/service-requests', { params }),
  create: (data)    => api.post('/hr-admin/advanced/service-requests', data),
};

export const holidaysAPI = {
  list: (year) => api.get('/hr-admin/masters/holidays', { params: { year } }),
};

export const currentSalaryAPI = {
  get: (userId) => api.get(`/hr-admin/salary/employee-salaries/${userId}/current`),
};

export const taxDeclarationAPI = {
  list:   (financialYear) => api.get('/hr-admin/advanced/payroll-compliance/tax-declarations', { params: { financial_year: financialYear } }),
  create: (data)           => api.post('/hr-admin/advanced/payroll-compliance/tax-declarations', data),
};

export const dprAPI = {
  list:   (projectId) => api.get('/planning/dpr', { params: { project_id: projectId } }),
  create: (data)       => api.post('/planning/dpr', data),
};

// ── QS Dashboard helpers ──────────────────────────────────────────────────────
export const tqsDashAPI = {
  getAPAging:   (params) => api.get('/tqs/bills/ap-aging',      { params }),
  listAdvances: (params) => api.get('/tqs/bills/advances',      { params }),
};

// ── Accounts Dashboard helpers ────────────────────────────────────────────────
export const accountsDashAPI = {
  pcPending: (params) => api.get('/tqs/bills/pc-pending', { params }),
  apAging:   (params) => api.get('/tqs/bills/ap-aging',   { params }),
  payments:  (params) => api.get('/payments',             { params }),
};

// ── HR Dashboard helpers ──────────────────────────────────────────────────────
export const hrDashAPI = {
  employees:       (params) => api.get('/hr-admin/employees',                         { params }),
  leaveRequests:   (params) => api.get('/hr-admin/leave/requests',                    { params }),
  payroll:         (params) => api.get('/hr-admin/payroll',                           { params }),
  overtime:        (params) => api.get('/hr-admin/overtime',                          { params }),
  serviceRequests: (params) => api.get('/hr-admin/advanced/service-requests',         { params }),
  deptSummary:     (params) => api.get('/hr-admin/attendance/department-summary',     { params }),
};

export const approvalsAPI = {
  pending: (params = {}) => api.get('/approvals/pending', { params }),
  decide:  (entity_type, entity_id, action, comments) =>
    api.post('/approvals/action', { entity_type, entity_id, action, comments }),
};

export const notificationsAPI = {
  registerDevice: (token, platform) => api.post('/notifications/devices', { token, platform, enabled: true }),
};

// ── Team Chat ─────────────────────────────────────────────────────────────────
export const chatAPI = {
  previews:   ()                          => api.get('/chat/previews'),
  messages:   (channel, limit = 100)      => api.get('/chat/messages', { params: { channel, limit } }),
  send:       (payload)                    => api.post('/chat/messages', payload),
  react:      (id, emoji)                  => api.patch(`/chat/messages/${id}/react`, { emoji }),
  pin:        (id)                         => api.patch(`/chat/messages/${id}/pin`),
  search:     (q, channel, limit = 100)    => api.get('/chat/search', { params: { q, channel, limit } }),
  markRead:   (channel)                    => api.post('/chat/messages/mark-read', { channel }),
  callLogs:   (limit = 100)                => api.get('/chat/call-logs', { params: { limit } }),
  saveCallLog:(data)                       => api.post('/chat/call-logs', data),
  pendingCall:()                           => api.get('/chat/pending-call'),
  meetings:   (limit = 30)                 => api.get('/chat/meetings', { params: { limit } }),
};

export const uploadAPI = {
  // React Native FormData file entries take a {uri, name, type} object rather
  // than a browser File — see expo-document-picker's DocumentPickerAsset shape.
  single: (file, onProgress) => {
    const fd = new FormData();
    fd.append('file', { uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' });
    return api.post('/upload/single', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress ? (e) => onProgress(e.total ? Math.round((e.loaded * 100) / e.total) : 0) : undefined,
    });
  },
};

export default api;
