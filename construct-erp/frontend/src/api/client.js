// src/api/client.js
import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_URL || '/api/v1';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Request interceptor: attach JWT + auto-inject selected project_id ───────
// Endpoints that must NEVER receive the project scope (they manage projects
// themselves or are global)
const PROJECT_INJECT_SKIP = [
  /\/auth\//,
  /\/projects(\/|$|\?)/,
  /\/users(\/|$|\?)/,
  /\/me(\/|$|\?)/,
  /\/notifications/,
  /\/upload/,
  /\/documents/,        // many document routes already filter by project_id explicitly
  /\/vendor/,           // vendor master data is company-wide
  /\/quotations\/vendor-rfq/,
];

function shouldInjectProject(url) {
  if (!url) return false;
  return !PROJECT_INJECT_SKIP.some((rx) => rx.test(url));
}

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
    if (token) config.headers.Authorization = `Bearer ${token}`;

    // Auto-inject project_id for scoped users
    const projectId = sessionStorage.getItem('selectedProjectId');
    if (projectId && !config.skipProjectInject && shouldInjectProject(config.url)) {
      // GET / DELETE — add to query params
      const method = (config.method || 'get').toLowerCase();
      if (method === 'get' || method === 'delete') {
        config.params = config.params || {};
        if (config.params.project_id == null) {
          config.params.project_id = projectId;
        }
      } else {
        // POST / PUT / PATCH — add to JSON body if not already present
        if (config.data && typeof config.data === 'object' && !(config.data instanceof FormData)) {
          if (config.data.project_id == null) {
            config.data = { ...config.data, project_id: projectId };
          }
        } else if (!config.data) {
          config.data = { project_id: projectId };
        }
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response interceptor: auto refresh token ────────────────────────────────
let isRefreshing = false;
let failedQueue = [];
let isAuthRedirecting = false;

const clearAuthStorage = () => {
  sessionStorage.removeItem('accessToken');
  sessionStorage.removeItem('refreshToken');
  sessionStorage.removeItem('construct-erp-auth-v2');
  sessionStorage.removeItem('selectedProjectId');
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('construct-erp-auth-v2');
};

const forceLogin = (reason = 'session_expired') => {
  clearAuthStorage();
  window.dispatchEvent(new CustomEvent('auth:logout', { detail: { reason } }));
  if (!isAuthRedirecting && !window.location.pathname.startsWith('/login')) {
    isAuthRedirecting = true;
    window.location.replace(`/login?reason=${reason}`);
  }
};

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const url = original?.url || '';
    const isAuthEndpoint = /\/auth\/(login|register|refresh|logout|forgot-password|reset-password)/.test(url);
    const isPublicEndpoint = /\/quotations\/vendor-rfq\//.test(url);

    if (error.response?.status === 401 && !original._retry && !isAuthEndpoint && !isPublicEndpoint) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        });
      }

      original._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refreshToken') || sessionStorage.getItem('refreshToken');
      if (!refreshToken) {
        forceLogin('session_expired');
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        sessionStorage.removeItem('accessToken');
        sessionStorage.removeItem('refreshToken');
        window.dispatchEvent(new CustomEvent('auth:token-refreshed', {
          detail: { accessToken: data.accessToken, refreshToken: data.refreshToken },
        }));
        api.defaults.headers.common.Authorization = `Bearer ${data.accessToken}`;
        processQueue(null, data.accessToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch (refreshError) {
        processQueue(refreshError, null);
        const code = refreshError?.response?.data?.code;
        const reason = code === 'SESSION_EXPIRED' ? 'session_expired' : 'token_expired';
        forceLogin(reason);
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// ─── API modules ──────────────────────────────────────────────────────────────
export const authAPI = {
  login:          (data) => api.post('/auth/login', data),
  register:       (data) => api.post('/auth/register', data),
  logout:         (data) => api.post('/auth/logout', data),
  refresh:        (data) => api.post('/auth/refresh', data),
  me:             ()     => api.get('/auth/me'),
  changePassword: (data) => api.post('/auth/change-password', data),
  forgotPassword: (data) => api.post('/auth/forgot-password', data),
  resetPassword:  (data) => api.post('/auth/reset-password', data),
};

export const projectAPI = {
  list:      (params) => api.get('/projects', { params }),
  get:       (id)     => api.get(`/projects/${id}`),
  dashboard: (id)     => api.get(`/projects/${id}/dashboard`),
  create:    (data)   => api.post('/projects', data),
  update:    (id, d)  => api.put(`/projects/${id}`, d),
  delete:    (id)     => api.delete(`/projects/${id}`),
};

export const subcontractorAPI = {
  // Dashboard
  getDashboard:      (params) => api.get('/subcontractors/dashboard', { params }),
  // Work Orders
  listWorkOrders:    (params) => api.get('/subcontractors/work-orders', { params }),
  getWorkOrder:      (id)     => api.get(`/subcontractors/work-orders/${id}`),
  createWorkOrder:   (data)   => api.post('/subcontractors/work-orders', data),
  updateWorkOrder:   (id, d)  => api.patch(`/subcontractors/work-orders/${id}`, d),
  importWOPreview:   (file)   => { const fd = new FormData(); fd.append('file', file); return api.post('/subcontractors/work-orders/import/preview', fd, { headers: { 'Content-Type': undefined } }); },
  importWOConfirm:   (data)   => api.post('/subcontractors/work-orders/import/confirm', data),
  bulkImportWOs:     (data)   => api.post('/subcontractors/work-orders/bulk-import', data),
  deleteWorkOrder:   (id)     => api.delete(`/subcontractors/work-orders/${id}`),
  approveWorkOrder:  (id, d)  => api.patch(`/subcontractors/work-orders/${id}/approve`, d),
  mdApproveWorkOrder:(id)     => api.patch(`/subcontractors/work-orders/${id}/md-approve`),
  rejectWorkOrder:   (id, d)  => api.patch(`/subcontractors/work-orders/${id}/reject`, d),
  downloadWOTemplate:()       => api.get('/subcontractors/work-orders/import/template', { responseType: 'blob' }),
  excelImportPreview:(file)   => { const fd = new FormData(); fd.append('file', file); return api.post('/subcontractors/work-orders/import/excel', fd, { headers: { 'Content-Type': undefined } }); },
  // Measurements
  getMeasurements:   (params) => api.get('/subcontractors/measurements', { params }),
  recordMeasurement: (data)   => api.post('/subcontractors/measurements', data),
  // Bills
  createBill:        (data)   => api.post('/subcontractors/bills', data),
  listBills:         (params) => api.get('/subcontractors/bills', { params }),
  getBill:           (id)     => api.get(`/subcontractors/bills/${id}`),
  updateBill:        (id, d)  => api.patch(`/subcontractors/bills/${id}`, d),
  // Subcontractor master
  listSubcontractors:(params) => api.get('/subcontractors/list', { params }),
  // Labour / worker attendance
  listWorkers:       (params) => api.get('/subcontractors/workers', { params }),
  createWorker:      (data)   => api.post('/subcontractors/workers', data),
  listLabourAttendance:(params) => api.get('/subcontractors/labour-attendance', { params }),
  createLabourAttendance:(data) => api.post('/subcontractors/labour-attendance', data),
  getSettings:      ()      => api.get('/subcontractors/settings'),
  updateSettings:   (data)  => api.patch('/subcontractors/settings', data),
  // Documents
  listDocuments:     (vendorId)      => api.get(`/subcontractors/${vendorId}/documents`),
  uploadDocument:    (vendorId, d)   => api.post(`/subcontractors/${vendorId}/documents`, d),
  deleteDocument:    (vendorId, did) => api.delete(`/subcontractors/${vendorId}/documents/${did}`),
  listExpiringDocs:  (params)        => api.get('/subcontractors/documents/expiring', { params }),
  // Approval workflow
  approveBill:       (id, data)      => api.post(`/subcontractors/bills/${id}/approve`, data),
  rejectBill:        (id, data)      => api.post(`/subcontractors/bills/${id}/reject`, data),
  getBillApprovals:  (id)            => api.get(`/subcontractors/bills/${id}/approvals`),
  // Advances
  listAdvances:    (params)   => api.get('/subcontractors/advances', { params }),
  createAdvance:   (data)     => api.post('/subcontractors/advances', data),
  recoverAdvance:  (id, data) => api.patch(`/subcontractors/advances/${id}/recover`, data),
  // Retention releases
  listRetentionReleases:  (params) => api.get('/subcontractors/retention-releases', { params }),
  createRetentionRelease: (data)   => api.post('/subcontractors/retention-releases', data),
  retentionSummary:       (params) => api.get('/subcontractors/retention-summary', { params }),
  // Reports
  reportLedger:           (params)   => api.get('/subcontractors/reports/ledger', { params }),
  reportDeductionSummary: (params)   => api.get('/subcontractors/reports/deduction-summary', { params }),
  reportWOUtilization:    (params)   => api.get('/subcontractors/reports/wo-utilization', { params }),
  // Portal
  portalMyBills:     ()              => api.get('/subcontractors/portal/my-bills'),
};


export const boqAPI = {
  list:    (params = {}) => api.get('/boq', { params: { ...params, _ts: Date.now() } }),
  summary: (pid)    => api.get(`/boq/summary/${pid}`, { params: { _ts: Date.now() } }),
  create:  (data)   => api.post('/boq', data),
  update:  (id, d)  => api.put(`/boq/${id}`, d),
  delete:  (id)     => api.delete(`/boq/${id}`),
  import:  (data)   => api.post('/boq/import', data, { headers: { 'Content-Type': undefined } }),
};

export const boqBudgetAPI = {
  list:       (projectId)          => api.get(`/boq-budget/${projectId}`),
  updateItem: (boqItemId, entries) => api.put(`/boq-budget/item/${boqItemId}`, { entries }),
};

export const boqMappingAPI = {
  // Allocation / mapping
  listMappings:    (pid)    => api.get(`/boq/${pid}/mappings`),
  createMapping:   (d)      => api.post('/boq/mappings', d),
  updateMapping:   (id, d)  => api.put(`/boq/mappings/${id}`, d),
  cancelMapping:   (id)     => api.delete(`/boq/mappings/${id}`),
  confirmMapping:  (id)     => api.post(`/boq/mappings/${id}/confirm`),
  // Balance & WO
  getBalance:      (pid)    => api.get(`/boq/${pid}/balance`),
  unlinkedWOItems: (pid)    => api.get(`/boq/${pid}/unlinked-wo-items`),
  linkExistingWOItem: (d)   => api.post('/boq/link-existing-wo-item', d),
  createWOFromMap: (id)     => api.post(`/boq/mappings/${id}/create-wo`),
  // Reports
  marginRegister:  (pid)    => api.get(`/boq/${pid}/margin-register`),
  dashboard:       (pid)    => api.get(`/boq/${pid}/dashboard`),
  // Own-team costs
  addOwnCost:      (d)      => api.post('/boq/own-team-costs', d),
  listOwnCosts:    (id)     => api.get(`/boq/mappings/${id}/own-team-costs`),
};

export const measurementAPI = {
  list:    (params)   => api.get('/measurements', { params }),
  create:  (data)     => api.post('/measurements', data),
  update:  (id, data) => api.put(`/measurements/${id}`, data),
  approve: (id, data) => api.patch(`/measurements/${id}/approve`, data),
  import:  (data)     => api.post('/measurements/import', data, { headers: { 'Content-Type': undefined } }),
};

export const raBillAPI = {
  list:          (params) => api.get('/ra-bills', { params }),
  get:           (id)     => api.get(`/ra-bills/${id}`),
  create:        (data)   => api.post('/ra-bills', data),
  verify:        (id)     => api.patch(`/ra-bills/${id}/verify`),
  approve:       (id, d)  => api.patch(`/ra-bills/${id}/approve`, d),
  reject:        (id, d)  => api.patch(`/ra-bills/${id}/reject`, d),
  pay:           (id, d)  => api.patch(`/ra-bills/${id}/pay`, d),
  delete:        (id)     => api.delete(`/ra-bills/${id}`),
  getPrevStats:  (params) => api.get('/ra-bills/previous-stats', { params }),
};

export const clientAdvanceAPI = {
  list:     (params) => api.get('/client-advances', { params }),
  stats:    (params) => api.get('/client-advances/stats', { params }),
  create:   (data)   => api.post('/client-advances', data),
  update:   (id, d)  => api.put(`/client-advances/${id}`, d),
  receive:  (id, d)  => api.post(`/client-advances/${id}/receive`, d),
  receipts: (id)     => api.get(`/client-advances/${id}/receipts`),
  remove:   (id)     => api.delete(`/client-advances/${id}`),
};

export const priceEscalationAPI = {
  list:   (params) => api.get('/price-escalations', { params }),
  stats:  (params) => api.get('/price-escalations/stats', { params }),
  create: (data)   => api.post('/price-escalations', data),
  bulk:   (data)   => api.post('/price-escalations/bulk', data),
  update: (id, d)  => api.put(`/price-escalations/${id}`, d),
  remove: (id)     => api.delete(`/price-escalations/${id}`),
};

export const retentionAPI = {
  list:    (params) => api.get('/retention-releases', { params }),
  summary: (params) => api.get('/retention-releases/summary', { params }),
  get:     (id)     => api.get(`/retention-releases/${id}`),
  create:  (data)   => api.post('/retention-releases', data),
  approve: (id)     => api.patch(`/retention-releases/${id}/approve`),
  reject:  (id, d)  => api.patch(`/retention-releases/${id}/reject`, d),
  release: (id, d)  => api.patch(`/retention-releases/${id}/release`, d),
  remove:  (id)     => api.delete(`/retention-releases/${id}`),
};

export const invoiceAPI = {
  list:       (params)  => api.get('/invoices', { params }),
  get:        (id)      => api.get(`/invoices/${id}`),
  create:     (data)    => api.post('/invoices', data),
  verify:     (id)      => api.patch(`/invoices/${id}/verify`),
  authorize:  (id)      => api.patch(`/invoices/${id}/authorize`),
  reject:     (id)      => api.patch(`/invoices/${id}/reject`),
  gstSummary: (params)  => api.get('/invoices/gst-summary', { params }),
  markPaid:   (id, d)   => api.patch(`/invoices/${id}/mark-paid`, d),
};

export const financeAPI = {
  summary: () => api.get('/invoices/finance-summary'),
};

export const pettyCashAPI = {
  // Dashboard
  dashboard:    (params) => api.get('/petty-cash/dashboard', { params }),
  // Masters
  accounts:     (params) => api.get('/petty-cash/accounts', { params }),
  createAccount:(data)   => api.post('/petty-cash/accounts', data),
  updateAccount:(id, d)  => api.patch(`/petty-cash/accounts/${id}`, d),
  custodians:   (params) => api.get('/petty-cash/custodians', { params }),
  createCustodian:(data) => api.post('/petty-cash/custodians', data),
  updateCustodian:(id,d) => api.patch(`/petty-cash/custodians/${id}`, d),
  users:        ()       => api.get('/users'),
  topupAccount: (id, d)  => api.post(`/petty-cash/accounts/${id}/topup`, d),
  categories:   (params) => api.get('/petty-cash/categories', { params }),
  createCategory:(data)  => api.post('/petty-cash/categories', data),
  updateCategory:(id, d) => api.patch(`/petty-cash/categories/${id}`, d),
  // Requests
  requests:     (params) => api.get('/petty-cash/requests', { params }),
  createRequest:(data)   => api.post('/petty-cash/requests', data),
  updateRequest:(id, d)  => api.patch(`/petty-cash/requests/${id}`, d),
  submitRequest:(id)     => api.post(`/petty-cash/requests/${id}/submit`),
  approveRequest:(id, d) => api.post(`/petty-cash/requests/${id}/approve`, d),
  issueRequest: (id, d)  => api.post(`/petty-cash/requests/${id}/issue`, d),
  // Expenses
  expenses:     (params) => api.get('/petty-cash/expenses', { params }),
  createExpense:(data)   => api.post('/petty-cash/expenses', data),
  updateExpense:(id, d)  => api.patch(`/petty-cash/expenses/${id}`, d),
  submitExpense:(id)     => api.post(`/petty-cash/expenses/${id}/submit`),
  approveExpense:(id, d) => api.post(`/petty-cash/expenses/${id}/approve`, d),
  deleteExpense:(id)     => api.delete(`/petty-cash/expenses/${id}`),
  // Settlements
  settlements:  (params) => api.get('/petty-cash/settlements', { params }),
  createSettlement:(data)=> api.post('/petty-cash/settlements', data),
  verifySettlement:(id,d)=> api.post(`/petty-cash/settlements/${id}/verify`, d),
  // Transfers
  transfers:    (params) => api.get('/petty-cash/transfers', { params }),
  createTransfer:(data)  => api.post('/petty-cash/transfers', data),
  approveTransfer:(id)   => api.post(`/petty-cash/transfers/${id}/approve`),
  // Adjustments
  adjustments:  (params) => api.get('/petty-cash/adjustments', { params }),
  createAdjustment:(data)=> api.post('/petty-cash/adjustments', data),
  approveAdjustment:(id) => api.post(`/petty-cash/adjustments/${id}/approve`),
  // Approvals
  pendingApprovals:() => api.get('/petty-cash/approvals/pending'),
  // Reports
  cashBook:     (params) => api.get('/petty-cash/reports/cash-book', { params }),
  expenseRegister:(params)=> api.get('/petty-cash/reports/expense-register', { params }),
  siteWise:     (params) => api.get('/petty-cash/reports/site-wise', { params }),
  custodianWise:(params) => api.get('/petty-cash/reports/custodian-wise', { params }),
  categoryWise: (params) => api.get('/petty-cash/reports/category-wise', { params }),
  pendingSettlement:() => api.get('/petty-cash/reports/pending-settlement'),
  auditTrail:   (params) => api.get('/petty-cash/reports/audit-trail', { params }),
  // SC Advances
  scAdvances:       (params) => api.get('/petty-cash/sc-advances', { params }),
  createScAdvance:  (data)   => api.post('/petty-cash/sc-advances', data),
  scVendorLookup:   (params) => api.get('/petty-cash/sc-advances/lookup/vendors', { params }),
  // Legacy
  summary:      (params) => api.get('/petty-cash/summary', { params }),
};

export const paymentAPI = {
  list:   (params) => api.get('/payments', { params }),
  create: (data)   => api.post('/payments', data),
  tds:    (params) => api.get('/payments/tds-report', { params }),
};

export const vendorAPI = {
  list:    (params) => api.get('/vendors', { params }),
  get:     (id)     => api.get(`/vendors/${id}`),
  create:  (data)   => api.post('/vendors', data),
  update:  (id, d)  => api.put(`/vendors/${id}`, d),
  delete:  (id)     => api.delete(`/vendors/${id}`),
  import:  (data)   => api.post('/vendors/import', data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  performance: (params) => api.get('/vendors/performance', { params }),
  compare: (params) => api.get('/vendors/compare', { params }),
  liveCheck: (params) => api.get('/vendors/live-check', { params }),
  // Vendor-Project mapping
  projectMap:   (params)  => api.get('/vendors/project-map', { params }),
  unmapped:     (params)  => api.get('/vendors/unmapped', { params }),
  mapToProject: (data)    => api.post('/vendors/project-map', data),
  unmapFromProject: (data)=> api.delete('/vendors/project-map', { data }),
  backfillProjectMap: ()  => api.post('/vendors/project-map/backfill'),
  projectBreakdown: (params) => api.get('/vendors/project-breakdown', { params }),
};

export const poAPI = {
  list:    (params, config = {})   => api.get('/purchase-orders', { ...config, params }),
  get:     (id)       => api.get(`/purchase-orders/${id}`),
  create:  (data)     => api.post('/purchase-orders', data),
  update:  (id, data) => api.patch(`/purchase-orders/${id}`, data),
  delete:  (id)        => api.delete(`/purchase-orders/${id}`),
  approve: (id, stage, data) => api.patch(`/purchase-orders/${id}/${stage}`, data),
  mailPreview:  (id)     => api.get(`/purchase-orders/${id}/mail-preview`),
  sendToVendor: (id, d)  => api.post(`/purchase-orders/${id}/send-to-vendor`, d),
  receive: (id, data) => api.patch(`/purchase-orders/${id}/receive`, data),
  importPreview: (file) => { const fd = new FormData(); fd.append('file', file); return api.post('/purchase-orders/import/preview', fd, { headers: { 'Content-Type': undefined } }); },
  importConfirm: (data) => api.post('/purchase-orders/import/confirm', data),
  bulkImport:    (data) => api.post('/purchase-orders/bulk-import', data),
  register:      (params) => api.get('/purchase-orders/register', { params }),
  registerExport:(params) => api.get('/purchase-orders/register/export', { params, responseType: 'blob' }),
  bills:         (id)     => api.get(`/purchase-orders/${id}/bills`),
  amendmentContext: (id)      => api.get(`/purchase-orders/${id}/amendment-context`),
  submitAmendment:  (id, data) => api.post(`/purchase-orders/${id}/amend`, data),
};

export const poAmendmentAPI = {
  list:   (params) => api.get('/procurement/po-amendments', { params }),
  create: (data)   => api.post('/procurement/po-amendments', data),
  update: (id, data) => api.patch(`/procurement/po-amendments/${id}`, data),
  approve:(id)     => api.patch(`/procurement/po-amendments/${id}/approve`),
  reject: (id)     => api.patch(`/procurement/po-amendments/${id}/reject`),
  delete: (id)     => api.delete(`/procurement/po-amendments/${id}`),
};

// grnAPI removed — GRN features merged into IGN. Use ignAPI instead.

export const grsAPI = {
  list:        (params) => api.get('/grs', { params }),
  get:         (id)     => api.get(`/grs/${id}`),
  create:      (data)   => api.post('/grs', data),
  update:      (id, data) => api.put(`/grs/${id}`, data),
  acknowledge: (id)     => api.patch(`/grs/${id}/acknowledge`),
  cancel:      (id)     => api.patch(`/grs/${id}/cancel`),
  remove:      (id)     => api.delete(`/grs/${id}`),
};

export const ignAPI = {
  list:    (params) => api.get('/ign', { params }),
  get:     (id)     => api.get(`/ign/${id}`),
  create:  (data)   => api.post('/ign', data),
  inspect: (id)     => api.patch(`/ign/${id}/inspect`),
  approve: (id)     => api.patch(`/ign/${id}/approve`),
  cancel:  (id)     => api.patch(`/ign/${id}/cancel`),
  remove:  (id)     => api.delete(`/ign/${id}`),
};

// ── HR Extended APIs ──────────────────────────────────────────────────────────
export const hrShiftsAPI = {
  shifts:       (p)        => api.get('/hr-admin/shifts', { params: p }),
  createShift:  (d)        => api.post('/hr-admin/shifts', d),
  updateShift:  (id, d)    => api.put(`/hr-admin/shifts/${id}`, d),
  deleteShift:  (id)       => api.delete(`/hr-admin/shifts/${id}`),
  empShifts:    (p)        => api.get('/hr-admin/employee-shifts', { params: p }),
  assignShift:  (d)        => api.post('/hr-admin/employee-shifts', d),
  removeShift:  (id)       => api.delete(`/hr-admin/employee-shifts/${id}`),
  overtime:     (p)        => api.get('/hr-admin/overtime', { params: p }),
  addOT:        (d)        => api.post('/hr-admin/overtime', d),
  approveOT:    (id)       => api.patch(`/hr-admin/overtime/${id}/approve`),
  rejectOT:     (id)       => api.patch(`/hr-admin/overtime/${id}/reject`),
  compOff:      (p)        => api.get('/hr-admin/comp-off', { params: p }),
  addCompOff:   (d)        => api.post('/hr-admin/comp-off', d),
  approveCompOff:(id)      => api.patch(`/hr-admin/comp-off/${id}/approve`),
};

export const hrFnfAPI = {
  list:       (p)     => api.get('/hr-admin/fnf', { params: p }),
  get:        (id)    => api.get(`/hr-admin/fnf/${id}`),
  create:     (d)     => api.post('/hr-admin/fnf', d),
  update:     (id,d)  => api.put(`/hr-admin/fnf/${id}`, d),
  approve:    (id)    => api.patch(`/hr-admin/fnf/${id}/approve`),
  pay:        (id,d)  => api.patch(`/hr-admin/fnf/${id}/pay`, d),
  gratuity:   (p)     => api.get('/hr-admin/fnf/calculate-gratuity', { params: p }),
};

export const hrLettersAPI = {
  templates:   (p)      => api.get('/hr-admin/letters/templates', { params: p }),
  createTmpl:  (d)      => api.post('/hr-admin/letters/templates', d),
  updateTmpl:  (id,d)   => api.put(`/hr-admin/letters/templates/${id}`, d),
  generated:   (p)      => api.get('/hr-admin/letters/generated', { params: p }),
  generate:    (d)      => api.post('/hr-admin/letters/generate', d),
  getGenerated:(id)     => api.get(`/hr-admin/letters/generated/${id}`),
};

export const hrTrainingAPI = {
  list:        (p)        => api.get('/hr-admin/training', { params: p }),
  get:         (id)       => api.get(`/hr-admin/training/${id}`),
  create:      (d)        => api.post('/hr-admin/training', d),
  update:      (id,d)     => api.put(`/hr-admin/training/${id}`, d),
  addParticipants:(id,d)  => api.post(`/hr-admin/training/${id}/participants`, d),
  updateParticipant:(id,pid,d) => api.patch(`/hr-admin/training/${id}/participants/${pid}`, d),
  removeParticipant:(id,pid)   => api.delete(`/hr-admin/training/${id}/participants/${pid}`),
  empHistory:  (empId)    => api.get(`/hr-admin/training/employee/${empId}/history`),
};

export const hrEmpAssetsAPI = {
  list:     (p)     => api.get('/hr-admin/emp-assets', { params: p }),
  create:   (d)     => api.post('/hr-admin/emp-assets', d),
  update:   (id,d)  => api.put(`/hr-admin/emp-assets/${id}`, d),
  return:   (id,d)  => api.patch(`/hr-admin/emp-assets/${id}/return`, d),
  remove:   (id)    => api.delete(`/hr-admin/emp-assets/${id}`),
  byEmp:    (empId) => api.get(`/hr-admin/emp-assets/by-employee/${empId}`),
};

export const hrTravelAPI = {
  list:     (p)     => api.get('/hr-admin/travel', { params: p }),
  create:   (d)     => api.post('/hr-admin/travel', d),
  update:   (id,d)  => api.put(`/hr-admin/travel/${id}`, d),
  approve:  (id,d)  => api.patch(`/hr-admin/travel/${id}/approve`, d),
  reject:   (id,d)  => api.patch(`/hr-admin/travel/${id}/reject`, d),
  settle:   (id,d)  => api.patch(`/hr-admin/travel/${id}/settle`, d),
};

export const hrRecruitmentAPI = {
  jobs:           (p)      => api.get('/hr-admin/recruitment/jobs', { params: p }),
  createJob:      (d)      => api.post('/hr-admin/recruitment/jobs', d),
  updateJob:      (id,d)   => api.put(`/hr-admin/recruitment/jobs/${id}`, d),
  applicants:     (p)      => api.get('/hr-admin/recruitment/applicants', { params: p }),
  getApplicant:   (id)     => api.get(`/hr-admin/recruitment/applicants/${id}`),
  addApplicant:   (d)      => api.post('/hr-admin/recruitment/applicants', d),
  updateStatus:   (id,d)   => api.patch(`/hr-admin/recruitment/applicants/${id}/status`, d),
  addInterview:   (id,d)   => api.post(`/hr-admin/recruitment/applicants/${id}/interviews`, d),
  updateInterview:(id,d)   => api.patch(`/hr-admin/recruitment/interviews/${id}`, d),
  pipeline:       ()       => api.get('/hr-admin/recruitment/pipeline'),
};

export const hrSalaryExtAPI = {
  ptSlabs:      (p)     => api.get('/hr-admin/salary/pt-slabs', { params: p }),
  createPT:     (d)     => api.post('/hr-admin/salary/pt-slabs', d),
  updatePT:     (id,d)  => api.put(`/hr-admin/salary/pt-slabs/${id}`, d),
  deletePT:     (id)    => api.delete(`/hr-admin/salary/pt-slabs/${id}`),
  revisions:    (p)     => api.get('/hr-admin/salary/revisions', { params: p }),
  createRevision:(d)    => api.post('/hr-admin/salary/revisions', d),
};

export const hrLeaveExtAPI = {
  encashment:     (p)    => api.get('/hr-admin/leave/encashment', { params: p }),
  createEncash:   (d)    => api.post('/hr-admin/leave/encashment', d),
  approveEncash:  (id)   => api.patch(`/hr-admin/leave/encashment/${id}/approve`),
  payEncash:      (id,d) => api.patch(`/hr-admin/leave/encashment/${id}/pay`, d),
  runCarryForward:(d)    => api.post('/hr-admin/leave/carry-forward/run', d),
  carryHistory:   ()     => api.get('/hr-admin/leave/carry-forward/history'),
};

export const hrPayrollExtAPI = {
  form16:    (p) => api.get('/hr-admin/payroll/reports/form16', { params: p }),
  attrition: (p) => api.get('/hr-admin/payroll/reports/attrition', { params: p }),
};

export const materialTrackerAPI = {
  list:        (params)           => api.get('/material-tracker', { params }),
  register:    (data)             => api.post('/material-tracker', data),
  get:         (id)               => api.get(`/material-tracker/${id}`),
  update:      (id, data)         => api.put(`/material-tracker/${id}`, data),
  remove:      (id)               => api.delete(`/material-tracker/${id}`),
  addLoad:     (id, data)         => api.post(`/material-tracker/${id}/loads`, data),
  updateLoad:  (id, loadId, data) => api.put(`/material-tracker/${id}/loads/${loadId}`, data),
  deleteLoad:  (id, loadId)       => api.delete(`/material-tracker/${id}/loads/${loadId}`),
  abstract:          (params)           => api.get('/material-tracker/report/abstract', { params }),
  loadwise:          (params)           => api.get('/material-tracker/report/loadwise', { params }),
  autoImportPreview: (params)           => api.get('/material-tracker/auto-import/preview', { params }),
  autoImportRun:     (data)             => api.post('/material-tracker/auto-import/run', data),
};

export const gatePassAPI = {
  list:   (params) => api.get('/gate-passes', { params }),
  get:    (id)     => api.get(`/gate-passes/${id}`),
  create: (data)   => api.post('/gate-passes', data),
  return: (id)     => api.patch(`/gate-passes/${id}/return`),
  close:  (id)     => api.patch(`/gate-passes/${id}/close`),
  cancel: (id)     => api.patch(`/gate-passes/${id}/cancel`),
};

export const creditNoteAPI = {
  list:         (params) => api.get('/credit-notes', { params }),
  get:          (id)     => api.get(`/credit-notes/${id}`),
  create:       (data)   => api.post('/credit-notes', data),
  update:       (id, d)  => api.put(`/credit-notes/${id}`, d),
  updateStatus: (id, status) => api.patch(`/credit-notes/${id}/status`, { status }),
  remove:       (id)     => api.delete(`/credit-notes/${id}`),
};

export const storesPettyCashAPI = {
  // Local Purchase entries (header + line items)
  listEntries:   (params)      => api.get('/stores-petty-cash/entries', { params }),
  getEntry:      (id)          => api.get(`/stores-petty-cash/entries/${id}`),
  createEntry:   (data)        => api.post('/stores-petty-cash/entries', data),
  updateEntry:   (id, d)       => api.put(`/stores-petty-cash/entries/${id}`, d),
  patchStatus:   (id, status, remarks, rejected_reason)  => api.patch(`/stores-petty-cash/entries/${id}/status`, { status, remarks, rejected_reason }),
  deleteEntry:   (id)          => api.delete(`/stores-petty-cash/entries/${id}`),
  clearAttachments: (project_id) => api.patch('/stores-petty-cash/entries/clear-attachments', null, { params: project_id ? { project_id } : {} }),
  // Other Petty Cash (advances)
  listAdvances:  (params)      => api.get('/stores-petty-cash/advances', { params }),
  createAdvance: (data)        => api.post('/stores-petty-cash/advances', data),
  updateAdvance: (id, d)       => api.put(`/stores-petty-cash/advances/${id}`, d),
  deleteAdvance: (id)          => api.delete(`/stores-petty-cash/advances/${id}`),
  // HO Receipts
  listReceipts:  (params)      => api.get('/stores-petty-cash/receipts', { params }),
  createReceipt: (data)        => api.post('/stores-petty-cash/receipts', data),
  updateReceipt: (id, d)       => api.put(`/stores-petty-cash/receipts/${id}`, d),
  deleteReceipt: (id)          => api.delete(`/stores-petty-cash/receipts/${id}`),
  // Budgets
  getBudgets:    (params)      => api.get('/stores-petty-cash/budgets', { params }),
  updateBudgets: (data)        => api.put('/stores-petty-cash/budgets', data),
  // SC Advances
  listScAdvances:  (params) => api.get('/stores-petty-cash/sc-advances', { params }),
  createScAdvance: (data)   => api.post('/stores-petty-cash/sc-advances', data),
  deleteScAdvance: (id)     => api.delete(`/stores-petty-cash/sc-advances/${id}`),
  scVendorLookup:  (params) => api.get('/stores-petty-cash/sc-advances/lookup/vendors', { params }),
  // Summary
  summary:       (params)      => api.get('/stores-petty-cash/summary', { params }),
};

export const debitNoteAPI = {
  list:         (params) => api.get('/debit-notes', { params }),
  get:          (id)     => api.get(`/debit-notes/${id}`),
  create:       (data)   => api.post('/debit-notes', data),
  updateStatus: (id, status) => api.patch(`/debit-notes/${id}/status`, { status }),
  remove:       (id)     => api.delete(`/debit-notes/${id}`),
};

export const chartOfAccountsAPI = {
  list:   (params) => api.get('/chart-of-accounts', { params }),
  create: (data)   => api.post('/chart-of-accounts', data),
  update: (id, d)  => api.put(`/chart-of-accounts/${id}`, d),
  remove: (id)     => api.delete(`/chart-of-accounts/${id}`),
  seed:   ()       => api.post('/chart-of-accounts/seed'),
  transactions: (id, params) => api.get(`/chart-of-accounts/${id}/transactions`, { params }),
  taxMonthlySummary: (params) => api.get('/chart-of-accounts/tax/monthly-summary', { params }),
  setOpeningBalances: (balances) => api.post('/chart-of-accounts/opening-balances', { balances }),
};

export const journalEntryAPI = {
  list:           (params) => api.get('/journal-entries', { params }),
  get:            (id)     => api.get(`/journal-entries/${id}`),
  create:         (data)   => api.post('/journal-entries', data),
  update:         (id, data) => api.patch(`/journal-entries/${id}`, data),
  updateStatus:   (id, status) => api.patch(`/journal-entries/${id}/status`, { status }),
  remove:         (id)     => api.delete(`/journal-entries/${id}`),
  dayBook:        (params) => api.get('/journal-entries/day-book', { params }),
  automationLog:  (params) => api.get('/journal-entries/automation-log', { params }),
  // Recurring templates
  templates:        (params) => api.get('/journal-entries/templates', { params }),
  getTemplate:      (id)     => api.get(`/journal-entries/templates/${id}`),
  createTemplate:   (data)   => api.post('/journal-entries/templates', data),
  updateTemplate:   (id, d)  => api.patch(`/journal-entries/templates/${id}`, d),
  deleteTemplate:   (id)     => api.delete(`/journal-entries/templates/${id}`),
  executeTemplate:  (id, d)  => api.post(`/journal-entries/templates/${id}/execute`, d),
  dueTemplates:     ()       => api.get('/journal-entries/templates/due'),
};

// Bill-tracker accounts automation (ITC / TDS / retention)
export const billAccountsAPI = {
  itcRegister:       (params) => api.get('/bill-accounts/itc-register', { params }),
  tdsRegister:       (params) => api.get('/bill-accounts/tds-register', { params }),
  tdsDeposit:        (data)   => api.post('/bill-accounts/tds-deposit', data),
  tdsDeposits:       ()       => api.get('/bill-accounts/tds-deposits'),
  retentionRegister: (params) => api.get('/bill-accounts/retention-register', { params }),
  retentionRelease:  (billId, data) => api.post(`/bill-accounts/retention-release/${billId}`, data || {}),
  // reused from the bill tracker
  vendorLedger:      (params) => api.get('/tqs/bills/vendor-ledger', { params }),
  apAging:           (params) => api.get('/tqs/bills/ap-aging', { params }),
};

export const bankAccountAPI = {
  list:   (params) => api.get('/bank-accounts', { params }),
  create: (data)   => api.post('/bank-accounts', data),
  update: (id, d)  => api.put(`/bank-accounts/${id}`, d),
  remove: (id)     => api.delete(`/bank-accounts/${id}`),
};

export const companySettingsAPI = {
  get:            ()     => api.get('/company-settings'),
  updateProfile:  (data) => api.put('/company-settings/profile', data),
  updateSettings: (data) => api.put('/company-settings/settings', data),
  uploadLogo:     (file) => { const fd = new FormData(); fd.append('logo', file); return api.post('/company-settings/logo', fd, { headers: { 'Content-Type': undefined } }); },
};

export const auditLogAPI = {
  list:   (params) => api.get('/audit-log', { params }),
  tables: ()        => api.get('/audit-log/tables'),
};

export const rolePermissionsAPI = {
  list:    ()              => api.get('/role-permissions'),
  modules: ()              => api.get('/role-permissions/modules'),
  save:    (role, modules) => api.put(`/role-permissions/${role}`, { modules }),
  apply:   (role)          => api.post(`/role-permissions/${role}/apply`),
};

export const inventoryAPI = {
  list:          (params) => api.get('/inventory', { params }),
  create:        (data)   => api.post('/inventory', data),
  categories:    ()       => api.get('/inventory/categories'),
  itemsLookup:   (params) => api.get('/inventory/items-lookup', { params }),
  monthlyReport: (params) => api.get('/inventory/monthly-report', { params }),
  valuation:     (params) => api.get('/inventory/valuation', { params }),
  ledger:        (inventory_id) => api.get('/inventory/ledger', { params: { inventory_id } }),
  issue:         (data)   => api.post('/inventory/issue', data),
  transfer:      (data)   => api.post('/inventory/transfer', data),
  lowStock:      (params) => api.get('/inventory/low-stock', { params }),
  getBatches:    (id)     => api.get(`/inventory/${id}/batches`),
  update:        (id, data) => api.patch(`/inventory/${id}`, data),
  importPreview: (file)   => { const fd = new FormData(); fd.append('file', file); return api.post('/inventory/import/preview', fd, { headers: { 'Content-Type': undefined } }); },
  importData:    (file, project_id, site_location, overwrite) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('project_id', project_id);
    fd.append('site_location', site_location || 'main');
    fd.append('overwrite', overwrite ? 'true' : 'false');
    return api.post('/inventory/import', fd, { headers: { 'Content-Type': undefined } });
  },
  repairDoubleStock: (project_id) => api.post('/inventory/repair-double-stock', null, { params: project_id ? { project_id } : {} }),
};

export const workerAPI = {
  list:   (params) => api.get('/workers', { params }),
  get:    (id)     => api.get(`/workers/${id}`),
  create: (data)   => api.post('/workers', data),
  update: (id, d)  => api.put(`/workers/${id}`, d),
};

export const attendanceAPI = {
  list:     (params) => api.get('/attendance', { params }),
  bulkMark: (data)   => api.post('/attendance/bulk', data),
  summary:  (params) => api.get('/attendance/summary', { params }),
};

export const payrollAPI = {
  list:     (params) => api.get('/payroll', { params }),
  generate: (data)   => api.post('/payroll/generate', data),
  pay:      (id)     => api.patch(`/payroll/${id}/pay`),
};

export const dprAPI = {
  list:   (params) => api.get('/dpr', { params }),
  get:    (id)     => api.get(`/dpr/${id}`),
  create: (data)   => api.post('/dpr', data),
};

export const planningAPI = {
  // DPR
  listDPRs:       (p)     => api.get('/planning/dpr', { params: p }),
  getDPR:         (id)    => api.get(`/planning/dpr/${id}`),
  createDPR:      (d)     => api.post('/planning/dpr', d),
  updateDPR:      (id, d) => api.put(`/planning/dpr/${id}`, d),
  deleteDPR:      (id)    => api.delete(`/planning/dpr/${id}`),
  approveDPR:     (id)    => api.patch(`/planning/dpr/${id}/approve`),
  importDPR:      (file, projectId, overwrite = true) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('project_id', projectId);
    fd.append('overwrite', overwrite ? 'true' : 'false');
    return api.post('/planning/dpr/import', fd, { headers: { 'Content-Type': undefined } });
  },

  // Activities
  listActivities:  (p)     => api.get('/planning/activities', { params: p }),
  getActivity:     (id)    => api.get(`/planning/activities/${id}`),
  createActivity:  (d)     => api.post('/planning/activities', d),
  updateActivity:  (id, d) => api.put(`/planning/activities/${id}`, d),
  deleteActivity:  (id)    => api.delete(`/planning/activities/${id}`),
  updateProgress:  (id, d) => api.patch(`/planning/activities/${id}/progress`, d),

  // Milestones
  listMilestones:  (p)     => api.get('/planning/milestones', { params: p }),
  createMilestone: (d)     => api.post('/planning/milestones', d),
  updateMilestone: (id, d) => api.put(`/planning/milestones/${id}`, d),
  achieveMilestone:(id, d) => api.patch(`/planning/milestones/${id}/achieve`, d),

  // Look-Ahead Plans
  getLookAhead:    (p)     => api.get('/planning/look-ahead', { params: p }),
  saveLookAhead:   (d)     => api.post('/planning/look-ahead', d),
  approveLookAhead:(id)    => api.patch(`/planning/look-ahead/${id}/approve`),

  // Progress Tracking
  listProgress:    (p)     => api.get('/planning/progress', { params: p }),
  recordProgress:  (d)     => api.post('/planning/progress', d),

  // S-Curve
  getScurve:       (p)     => api.get('/planning/scurve', { params: p }),
  snapshotScurve:  (d)     => api.post('/planning/scurve/snapshot', d),

  // Delay Analysis
  listDelays:      (p)     => api.get('/planning/delays', { params: p }),
  logDelay:        (d)     => api.post('/planning/delays', d),
  updateDelay:     (id, d) => api.put(`/planning/delays/${id}`, d),

  // Activity import
  importActivities: (data) => api.post('/planning/activities/import', data),
  downloadActivityTemplate: () => api.get('/planning/activities/template', { responseType: 'blob' }),
  // DPR Analytics
  dprAnalytics:    (p)     => api.get('/planning/dpr/analytics', { params: p }),
  // Dashboard
  getDashboard:    (p)     => api.get('/planning/dashboard', { params: p }),
};

export const snagAPI = {
  list:      (p)     => api.get('/snags', { params: p }),
  get:       (id)    => api.get(`/snags/${id}`),
  create:    (d)     => api.post('/snags', d),
  update:    (id, d) => api.put(`/snags/${id}`, d),
  setStatus: (id, d) => api.patch(`/snags/${id}/status`, d),
  qaSignOff: (id, d) => api.patch(`/snags/${id}/qa-signoff`, d),
  remove:    (id)    => api.delete(`/snags/${id}`),
  getStats:  (p)     => api.get('/snags/stats', { params: p }),
};

export const incidentAPI = {
  list:            (params) => api.get('/incidents', { params }),
  get:             (id)     => api.get(`/incidents/${id}`),
  create:          (data)   => api.post('/incidents', data),
  addCapa:         (id, d)  => api.post(`/incidents/${id}/capa`, d),
  safetyDashboard: (params) => api.get('/incidents/safety-dashboard', { params }),
};

export const permitAPI = {
  list:   (params) => api.get('/permits', { params }),
  get:    (id)     => api.get(`/permits/${id}`),
  create: (data)   => api.post('/permits', data),
  close:  (id)     => api.patch(`/permits/${id}/close`),
};

export const materialReconAPI = {
  list:    (params) => api.get('/material-recon', { params }),
  audit:   (projectId) => api.get(`/material-recon/audit/${projectId}`),
  summary: (projectId) => api.get(`/material-recon/summary/${projectId}`),
  create:  (data)   => api.post('/material-recon', data),
};

export const variationAPI = {
  list:           (params) => api.get('/variations', { params }),
  get:            (id)     => api.get(`/variations/${id}`),
  create:         (data)   => api.post('/variations', data),
  approve:        (id, d)  => api.patch(`/variations/${id}/approve`, d || {}),
  approvedItems:  (params) => api.get('/variations/approved-items', { params }),
  amendments:     (params) => api.get('/variations/amendments', { params }),
  amendmentItems: (id)     => api.get(`/variations/amendments/${id}/items`),
};

export const variationStatementAPI = {
  list:    (params)   => api.get('/variation-statements', { params }),
  get:     (id)       => api.get(`/variation-statements/${id}`),
  create:  (data)     => api.post('/variation-statements', data),
  update:  (id, data) => api.patch(`/variation-statements/${id}`, data),
  pullVOs: (id)       => api.patch(`/variation-statements/${id}/pull-vos`),
  submit:  (id)       => api.patch(`/variation-statements/${id}/submit`),
  remove:  (id)       => api.delete(`/variation-statements/${id}`),
};

export const normsAPI = {
  list:   (params) => api.get('/norms', { params }),
  create: (data)   => api.post('/norms', data),
  delete: (id)     => api.delete(`/norms/${id}`),
};

export const ppeAPI = {
  list:   (params) => api.get('/ppe', { params }),
  issue:  (data)   => api.post('/ppe', data),
  return: (id)     => api.patch(`/ppe/${id}/return`),
  expiry: (params) => api.get('/ppe/expiring', { params }),
};

export const assetAPI = {
  list:             (params) => api.get('/assets', { params }),
  get:              (id)     => api.get(`/assets/${id}`),
  create:           (data)   => api.post('/assets', data),
  update:           (id, d)  => api.put(`/assets/${id}`, d),
  delete:           (id)     => api.delete(`/assets/${id}`),
  bulkImport:       (rows)   => api.post('/assets/bulk-import', { rows }),
  depreciation:     (id, params) => api.get(`/assets/${id}/depreciation`, { params }),
  logFuel:          (data)   => api.post('/assets/logs/fuel', data),
  logUsage:         (data)   => api.post('/assets/logs/usage', data),
  alerts:           ()       => api.get('/assets/alerts'),
  movements:        (params) => api.get('/assets/movements', { params }),
  transfer:         (data)   => api.post('/assets/transfer', data),
  returnAsset:      (id, d)  => api.patch(`/assets/movements/${id}/return`, d),
  maintenanceLogs:  (params) => api.get('/assets/maintenance', { params }),
  maintenance:      (data)   => api.post('/assets/maintenance', data),
  closeMaintenance: (id, d)  => api.patch(`/assets/maintenance/${id}/close`, d),
};

export const assetMgmtAPI = {
  // Categories
  listCategories:  (params) => api.get('/asset-mgmt/categories', { params }),
  createCategory:  (data)   => api.post('/asset-mgmt/categories', data),
  updateCategory:  (id, d)  => api.put(`/asset-mgmt/categories/${id}`, d),
  deleteCategory:  (id)     => api.delete(`/asset-mgmt/categories/${id}`),
  // Documents
  listDocuments:   (params) => api.get('/asset-mgmt/documents', { params }),
  addDocument:     (data)   => api.post('/asset-mgmt/documents', data),
  deleteDocument:  (id)     => api.delete(`/asset-mgmt/documents/${id}`),
  // Allocations
  listAllocations: (params) => api.get('/asset-mgmt/allocations', { params }),
  allocate:        (data)   => api.post('/asset-mgmt/allocations', data),
  returnAsset:     (id, d)  => api.patch(`/asset-mgmt/allocations/${id}/return`, d),
  // Transfers
  listTransfers:   (params) => api.get('/asset-mgmt/transfers', { params }),
  createTransfer:  (data)   => api.post('/asset-mgmt/transfers', data),
  approveTransfer: (id)     => api.patch(`/asset-mgmt/transfers/${id}/approve`),
  rejectTransfer:  (id)     => api.patch(`/asset-mgmt/transfers/${id}/reject`),
  // Work Orders
  listWorkOrders:  (params) => api.get('/asset-mgmt/work-orders', { params }),
  createWorkOrder: (data)   => api.post('/asset-mgmt/work-orders', data),
  completeWorkOrder:(id, d) => api.patch(`/asset-mgmt/work-orders/${id}/complete`, d),
  // Disposals
  listDisposals:   (params) => api.get('/asset-mgmt/disposals', { params }),
  createDisposal:  (data)   => api.post('/asset-mgmt/disposals', data),
  approveDisposal: (id)     => api.patch(`/asset-mgmt/disposals/${id}/approve`),
  // Dashboard & Reports
  dashboard:       ()       => api.get('/asset-mgmt/dashboard'),
  reportUtilisation:(params)=> api.get('/asset-mgmt/reports/utilisation', { params }),
  reportExpiry:    ()       => api.get('/asset-mgmt/reports/expiry'),
};

export const plantAPI = {
  // Masters — generic CRUD per master path
  listCategories:    (p)     => api.get('/plant/categories', { params: p }),
  createCategory:    (d)     => api.post('/plant/categories', d),
  updateCategory:    (id, d) => api.put(`/plant/categories/${id}`, d),
  deleteCategory:    (id)    => api.delete(`/plant/categories/${id}`),
  listManufacturers: (p)     => api.get('/plant/manufacturers', { params: p }),
  createManufacturer:(d)     => api.post('/plant/manufacturers', d),
  updateManufacturer:(id, d) => api.put(`/plant/manufacturers/${id}`, d),
  deleteManufacturer:(id)    => api.delete(`/plant/manufacturers/${id}`),
  listFuelTypes:     (p)     => api.get('/plant/fuel-types', { params: p }),
  createFuelType:    (d)     => api.post('/plant/fuel-types', d),
  updateFuelType:    (id, d) => api.put(`/plant/fuel-types/${id}`, d),
  deleteFuelType:    (id)    => api.delete(`/plant/fuel-types/${id}`),
  listMaintVendors:  (p)     => api.get('/plant/maintenance-vendors', { params: p }),
  createMaintVendor: (d)     => api.post('/plant/maintenance-vendors', d),
  updateMaintVendor: (id, d) => api.put(`/plant/maintenance-vendors/${id}`, d),
  deleteMaintVendor: (id)    => api.delete(`/plant/maintenance-vendors/${id}`),
  listDocTypes:      (p)     => api.get('/plant/document-types', { params: p }),
  createDocType:     (d)     => api.post('/plant/document-types', d),
  updateDocType:     (id, d) => api.put(`/plant/document-types/${id}`, d),
  deleteDocType:     (id)    => api.delete(`/plant/document-types/${id}`),
  listOperators:     (p)     => api.get('/plant/operators', { params: p }),
  createOperator:    (d)     => api.post('/plant/operators', d),
  updateOperator:    (id, d) => api.put(`/plant/operators/${id}`, d),
  deleteOperator:    (id)    => api.delete(`/plant/operators/${id}`),
  // Equipment — mirrored from the general Asset Master (Assets & IT), no manual create
  listEquipment:     (p)     => api.get('/plant/equipment', { params: p }),
  getEquipment:      (id)    => api.get(`/plant/equipment/${id}`),
  updateEquipment:   (id, d) => api.put(`/plant/equipment/${id}`, d),
  deleteEquipment:   (id)    => api.delete(`/plant/equipment/${id}`),
  addDocument:       (id, d) => api.post(`/plant/equipment/${id}/documents`, d),
  deleteDocument:    (id)    => api.delete(`/plant/documents/${id}`),
  // Transfers / Disposals
  listTransfers:     (p)     => api.get('/plant/transfers', { params: p }),
  createTransfer:    (d)     => api.post('/plant/transfers', d),
  listDisposals:     (p)     => api.get('/plant/disposals', { params: p }),
  createDisposal:    (d)     => api.post('/plant/disposals', d),
  // Hire In / Out
  listHireIn:        (p)     => api.get('/plant/hire-in', { params: p }),
  createHireIn:      (d)     => api.post('/plant/hire-in', d),
  updateHireIn:      (id, d) => api.put(`/plant/hire-in/${id}`, d),
  deleteHireIn:      (id)    => api.delete(`/plant/hire-in/${id}`),
  listHireOut:       (p)     => api.get('/plant/hire-out', { params: p }),
  createHireOut:     (d)     => api.post('/plant/hire-out', d),
  updateHireOut:     (id, d) => api.put(`/plant/hire-out/${id}`, d),
  deleteHireOut:     (id)    => api.delete(`/plant/hire-out/${id}`),
  // Deployment
  listDeployment:    (p)     => api.get('/plant/deployment', { params: p }),
  createDeployment:  (d)     => api.post('/plant/deployment', d),
  deleteDeployment:  (id)    => api.delete(`/plant/deployment/${id}`),
  // Fuel
  listFuel:          (p)     => api.get('/plant/fuel', { params: p }),
  createFuel:        (d)     => api.post('/plant/fuel', d),
  deleteFuel:        (id)    => api.delete(`/plant/fuel/${id}`),
  fuelAnalysis:      ()      => api.get('/plant/fuel/analysis'),
  // Equipment Daily Log (hour-meter / KM / diesel stock ledger — DG, JCB, etc.)
  listEquipmentLogs:   (p)     => api.get('/plant/equipment-logs', { params: p }),
  lastEquipmentLog:    (equipment_id) => api.get('/plant/equipment-logs/last', { params: { equipment_id } }),
  equipmentLogSummary: (equipment_id) => api.get('/plant/equipment-logs/summary', { params: { equipment_id } }),
  createEquipmentLog:  (d)     => api.post('/plant/equipment-logs', d),
  updateEquipmentLog:  (id, d) => api.put(`/plant/equipment-logs/${id}`, d),
  deleteEquipmentLog:  (id)    => api.delete(`/plant/equipment-logs/${id}`),
  // Maintenance
  listSchedule:      (p)     => api.get('/plant/maintenance/schedule', { params: p }),
  createSchedule:    (d)     => api.post('/plant/maintenance/schedule', d),
  updateSchedule:    (id, d) => api.put(`/plant/maintenance/schedule/${id}`, d),
  deleteSchedule:    (id)    => api.delete(`/plant/maintenance/schedule/${id}`),
  listWorkOrders:    (p)     => api.get('/plant/work-orders', { params: p }),
  getWorkOrder:      (id)    => api.get(`/plant/work-orders/${id}`),
  createWorkOrder:   (d)     => api.post('/plant/work-orders', d),
  completeWorkOrder: (id, d) => api.patch(`/plant/work-orders/${id}/complete`, d),
  deleteWorkOrder:   (id)    => api.delete(`/plant/work-orders/${id}`),
  listAmc:           (p)     => api.get('/plant/amc', { params: p }),
  createAmc:         (d)     => api.post('/plant/amc', d),
  deleteAmc:         (id)    => api.delete(`/plant/amc/${id}`),
  // Cost
  listCostAllocation:(p)     => api.get('/plant/cost-allocation', { params: p }),
  createCostAllocation:(d)   => api.post('/plant/cost-allocation', d),
  deleteCostAllocation:(id)  => api.delete(`/plant/cost-allocation/${id}`),
  // Dashboard / Reports / Compliance
  dashboard:         ()      => api.get('/plant/dashboard'),
  expiryAlerts:      ()      => api.get('/plant/expiry-alerts'),
  utilizationReport: (p)     => api.get('/plant/utilization-report', { params: p }),
  costReport:        (p)     => api.get('/plant/cost-report', { params: p }),
  maintenanceDue:    ()      => api.get('/plant/maintenance-due'),
};

// Hire & Rental — vendor invoice → QS certification → approval → payment,
// layered on the Plant & Machinery hire/allocation/log tables.
export const hireRentalAPI = {
  orders:        (p)        => api.get('/hire-rental/orders', { params: p }),
  listInvoices:  (p)        => api.get('/hire-rental/invoices', { params: p }),
  getInvoice:    (id)       => api.get(`/hire-rental/invoices/${id}`),
  createInvoice: (d)        => api.post('/hire-rental/invoices', d),
  updateInvoice: (id, d)    => api.put(`/hire-rental/invoices/${id}`, d),
  certify:       (id, d)    => api.patch(`/hire-rental/invoices/${id}/certify`, d),
  approve:       (id)       => api.patch(`/hire-rental/invoices/${id}/approve`),
  reject:        (id, d)    => api.patch(`/hire-rental/invoices/${id}/reject`, d),
  pay:           (id, d)    => api.patch(`/hire-rental/invoices/${id}/pay`, d),
  deleteInvoice: (id)       => api.delete(`/hire-rental/invoices/${id}`),
  dashboard:     ()         => api.get('/hire-rental/dashboard'),
  reportOrders:  (p)        => api.get('/hire-rental/reports/orders', { params: p }),
};

export const rentalInvoiceAPI = {
  nextSeq:       (prefix) => api.get('/hire-rental/rental/next-seq', { params: { prefix } }),
  logCheck:      (p)      => api.get('/hire-rental/rental/log-check', { params: p }),
  saveLog:       (d)      => api.post('/hire-rental/rental/log-sheets', d),
  getLog:        (id)     => api.get(`/hire-rental/rental/log-sheets/${id}`),
  createInvoice: (d)      => api.post('/hire-rental/rental/invoices-v2', d),
};

export const ewayBillAPI = {
  list:   (params) => api.get('/eway-bills', { params }),
  get:    (id)     => api.get(`/eway-bills/${id}`),
  create: (data)   => api.post('/eway-bills', data),
  cancel: (id)     => api.patch(`/eway-bills/${id}/cancel`),
};

export const itAssetAPI = {
  list:            (params)    => api.get('/it-assets', { params }),
  get:             (id)        => api.get(`/it-assets/${id}`),
  create:          (data)      => api.post('/it-assets', data),
  update:          (id, d)     => api.put(`/it-assets/${id}`, d),
  delete:          (id)        => api.delete(`/it-assets/${id}`),
  addMaintenance:  (id, d)     => api.post(`/it-assets/${id}/maintenance`, d),
  closeMaintenance:(id, mid, d)=> api.patch(`/it-assets/${id}/maintenance/${mid}/close`, d),
  import:          (rows)      => api.post('/it-assets/import', { rows }),
};

export const itTicketAPI = {
  list:    (params)   => api.get('/it-tickets', { params }),
  get:     (id)       => api.get(`/it-tickets/${id}`),
  create:  (data)     => api.post('/it-tickets', data),
  update:  (id, data) => api.patch(`/it-tickets/${id}`, data),
  resolve: (id, data) => api.patch(`/it-tickets/${id}/resolve`, data),
};

export const licenseAPI = {
  list:      (params) => api.get('/licenses', { params }),
  create:    (data)   => api.post('/licenses', data),
  update:    (id, d)  => api.put(`/licenses/${id}`, d),
  remove:    (id)     => api.delete(`/licenses/${id}`),
  listAMC:   (params) => api.get('/licenses/amc', { params }),
  createAMC: (data)   => api.post('/licenses/amc', data),
};

export const budgetAPI = {
  list:       (params) => api.get('/budget', { params }),
  create:     (data)   => api.post('/budget', data),
  update:     (id, d)  => api.put(`/budget/${id}`, d),
  delete:     (id)     => api.delete(`/budget/${id}`),
  commitment:    (params) => api.get('/budget/commitment', { params }),
  commitmentPos: (params) => api.get('/budget/commitment-pos', { params }),
  actuals:       (params) => api.get('/budget/actuals', { params }),
};
export const qualityAPI = {
  // Checklists
  listChecklists: (params) => api.get('/quality/checklists', { params }),
  createChecklist: (data)   => api.post('/quality/checklists', data),
  
  // RFI
  listRFI:           (params) => api.get('/quality/rfi', { params }),
  createRFI:         (data)   => api.post('/quality/rfi', data),
  inspectRFI:        (id, d)  => api.patch(`/quality/rfi/${id}/inspect`, d),
  signRFI:           (id, d)  => api.patch(`/quality/rfi/${id}/sign`, d),
  updateRFIAttachments: (id, attachments) => api.patch(`/quality/rfi/${id}/attachments`, { attachments }),

  // NCR
  listNCR:           (params) => api.get('/quality/ncr', { params }),
  createNCR:         (data)   => api.post('/quality/ncr', data),
  saveRCA:           (id, d)  => api.patch(`/quality/ncr/${id}/rca`, d),
  verifyNCR:         (id, d)  => api.patch(`/quality/ncr/${id}/verify`, d),
  updateNCRAttachments: (id, attachments) => api.patch(`/quality/ncr/${id}/attachments`, { attachments }),

  // Drawings
  listDrawings:   (params) => api.get('/quality/drawings', { params }),
  createDrawing:  (data)   => api.post('/quality/drawings', data),

  // Submittals
  listSubmittals:   (params)   => api.get('/quality/submittals', { params }),
  createSubmittal:  (data)     => api.post('/quality/submittals', data),
  updateSubmittal:  (id, d)    => api.patch(`/quality/submittals/${id}`, d),
  // Transmittals
  listTransmittals:  (params)  => api.get('/quality/transmittals', { params }),
  createTransmittal: (data)    => api.post('/quality/transmittals', data),
  acknowledgeTransmittal: (id, d) => api.patch(`/quality/transmittals/${id}/acknowledge`, d),
  deleteTransmittal: (id)      => api.delete(`/quality/transmittals/${id}`),

  // Lab Tests
  listLabTests:   (params) => api.get('/quality/lab-tests', { params }),
  createLabTest:  (data)   => api.post('/quality/lab-tests', data),
  updateLabTest:  (id, d)  => api.patch(`/quality/lab-tests/${id}`, d),
  updateLabTestAttachments: (id, attachments) => api.patch(`/quality/lab-tests/${id}/attachments`, { attachments }),

  // ITP
  listITPs:           (params)       => api.get('/quality/itp', { params }),
  createITP:          (data)         => api.post('/quality/itp', data),
  getITP:             (id)           => api.get(`/quality/itp/${id}`),
  updateITP:          (id, d)        => api.put(`/quality/itp/${id}`, d),
  approveITP:         (id)           => api.patch(`/quality/itp/${id}/approve`),
  supersedeITP:       (id)           => api.patch(`/quality/itp/${id}/supersede`),
  deleteITP:          (id)           => api.delete(`/quality/itp/${id}`),
  updateITPAttachments:(id, atts)    => api.patch(`/quality/itp/${id}/attachments`, { attachments: atts }),
  listITPActivities:  (itpId)        => api.get(`/quality/itp/${itpId}/activities`),
  createITPActivity:  (itpId, d)     => api.post(`/quality/itp/${itpId}/activities`, d),
  updateITPActivity:  (itpId, aId, d)=> api.put(`/quality/itp/${itpId}/activities/${aId}`, d),
  deleteITPActivity:  (itpId, aId)   => api.delete(`/quality/itp/${itpId}/activities/${aId}`),

  // Method Statements
  listMS:     (params) => api.get('/quality/method-statements', { params }),
  createMS:   (data)   => api.post('/quality/method-statements', data),
  getMS:      (id)     => api.get(`/quality/method-statements/${id}`),
  updateMS:   (id, d)  => api.put(`/quality/method-statements/${id}`, d),
  submitMS:   (id)     => api.patch(`/quality/method-statements/${id}/submit`),
  approveMS:  (id)     => api.patch(`/quality/method-statements/${id}/approve`),
  rejectMS:   (id, d)  => api.patch(`/quality/method-statements/${id}/reject`, d),
  deleteMS:   (id)     => api.delete(`/quality/method-statements/${id}`),
  updateMSAttachments: (id, atts) => api.patch(`/quality/method-statements/${id}/attachments`, { attachments: atts }),

  // MIR — Material Inspection Request
  listMIR:           (params) => api.get('/quality/mir', { params }),
  createMIR:         (data)   => api.post('/quality/mir', data),
  getMIR:            (id)     => api.get(`/quality/mir/${id}`),
  updateMIR:         (id, d)  => api.put(`/quality/mir/${id}`, d),
  startMIRInspection:(id)     => api.patch(`/quality/mir/${id}/start-inspection`),
  approveMIR:        (id, d)  => api.patch(`/quality/mir/${id}/approve`, d),
  rejectMIR:         (id, d)  => api.patch(`/quality/mir/${id}/reject`, d),
  deleteMIR:         (id)     => api.delete(`/quality/mir/${id}`),
  updateMIRAttachments:(id, atts) => api.patch(`/quality/mir/${id}/attachments`, { attachments: atts }),
  linkLabTestToMIR:  (id, lab_test_id) => api.post(`/quality/mir/${id}/link-lab-test`, { lab_test_id }),

  // MTC — Material Test Certificates
  listMTC:          (params) => api.get('/quality/mtc', { params }),
  createMTC:        (data)   => api.post('/quality/mtc', data),
  getMTC:           (id)     => api.get(`/quality/mtc/${id}`),
  updateMTC:        (id, d)  => api.put(`/quality/mtc/${id}`, d),
  reviewMTC:        (id, d)  => api.patch(`/quality/mtc/${id}/review`, d),
  deleteMTC:        (id)     => api.delete(`/quality/mtc/${id}`),
  updateMTCAttachments:(id, atts) => api.patch(`/quality/mtc/${id}/attachments`, { attachments: atts }),
  linkLabTestToMTC: (id, lab_test_id) => api.post(`/quality/mtc/${id}/link-lab-test`, { lab_test_id }),

  // Pour Cards
  listPourCards:    (params) => api.get('/quality/pour-cards', { params }),
  createPourCard:   (data)   => api.post('/quality/pour-cards', data),
  getPourCard:      (id)     => api.get(`/quality/pour-cards/${id}`),
  updatePourCard:   (id, d)  => api.put(`/quality/pour-cards/${id}`, d),
  prePourApprove:   (id, d)  => api.patch(`/quality/pour-cards/${id}/pre-pour-approve`, d),
  startPour:        (id, d)  => api.patch(`/quality/pour-cards/${id}/start-pour`, d),
  postPourSign:     (id, d)  => api.patch(`/quality/pour-cards/${id}/post-pour-sign`, d),
  linkLabTestToPour:(id, lab_test_id) => api.post(`/quality/pour-cards/${id}/link-lab-test`, { lab_test_id }),
  getPourLabTests:  (id)     => api.get(`/quality/pour-cards/${id}/lab-tests`),
  deletePourCard:   (id)     => api.delete(`/quality/pour-cards/${id}`),
  updatePourAttachments: (id, atts) => api.patch(`/quality/pour-cards/${id}/attachments`, { attachments: atts }),

  // Quality Audits
  listAudits:    (params) => api.get('/quality/audits', { params }),
  createAudit:   (data)   => api.post('/quality/audits', data),
  getAudit:      (id)     => api.get(`/quality/audits/${id}`),
  updateAudit:   (id, d)  => api.put(`/quality/audits/${id}`, d),
  setAuditStatus:(id, status) => api.patch(`/quality/audits/${id}/status`, { status }),
  deleteAudit:   (id)     => api.delete(`/quality/audits/${id}`),
  updateAuditAttachments: (id, atts) => api.patch(`/quality/audits/${id}/attachments`, { attachments: atts }),
  listFindings:  (id)     => api.get(`/quality/audits/${id}/findings`),
  createFinding: (id, d)  => api.post(`/quality/audits/${id}/findings`, d),
  updateFinding: (id, fid, d) => api.put(`/quality/audits/${id}/findings/${fid}`, d),
  closeFinding:  (id, fid, d) => api.patch(`/quality/audits/${id}/findings/${fid}/close`, d),
  deleteFinding: (id, fid) => api.delete(`/quality/audits/${id}/findings/${fid}`),

  // Dashboard stats
  qualityStats:  (params) => api.get('/quality/stats', { params }),
};

export const mrsAPI = {
  list:              (params, config = {}) => api.get('/stores/mrs', { ...config, params }),
  get:               (id)            => api.get(`/stores/mrs/${id}`),
  create:            (data)          => api.post('/stores/mrs', data),
  update:            (id, data)      => api.patch(`/stores/mrs/${id}`, data),
  approve:           (id, stage, data) => api.patch(`/stores/mrs/${id}/${stage}`, data),
  reject:            (id, data)      => api.patch(`/stores/mrs/${id}/reject`, data),
  cancelItems:       (id, data)      => api.patch(`/stores/mrs/${id}/cancel-items`, data),
  delete:            (id)            => api.delete(`/stores/mrs/${id}`),
  getWorkflowConfig: ()              => api.get('/stores/mrs/workflow-config'),
  saveWorkflow:      (projectId, stages) => api.put(`/stores/mrs/workflow-config/${projectId}`, { stages }),
  saveNumbering:     (projectId, data) => api.put(`/stores/mrs/numbering-config/${projectId}`, data),
  renumber:          (id, serial)    => api.patch(`/stores/mrs/${id}/renumber`, { serial }),
  resendNotify:      (id)            => api.post(`/stores/mrs/${id}/resend-notify`),
  bulkUpdateDates:   (rows)          => api.post('/stores/mrs/bulk-update-dates', { rows }),
};

export const minAPI = {
  list:      (params) => api.get('/stores/min', { params }),
  get:       (id)     => api.get(`/stores/min/${id}`),
  create:    (data)   => api.post('/stores/min', data),
  authorize: (id)     => api.patch(`/stores/min/${id}/authorize`),
  receive:   (id, data) => api.patch(`/stores/min/${id}/receive`, data),
  remove:    (id)     => api.delete(`/stores/min/${id}`),
};

export const engineerLogAPI = {
  list:   (params)      => api.get('/engineer-logs', { params }),
  stats:  ()            => api.get('/engineer-logs/stats'),
  get:    (id)          => api.get(`/engineer-logs/${id}`),
  create: (data)        => api.post('/engineer-logs', data),
  update: (id, data)    => api.put(`/engineer-logs/${id}`, data),
  review: (id, data)    => api.post(`/engineer-logs/${id}/review`, data),
};

export const mtrAPI = {
  list:    (params)     => api.get('/stores/mtr', { params }),
  stats:   ()           => api.get('/stores/mtr/stats'),
  get:     (id)         => api.get(`/stores/mtr/${id}`),
  create:  (data)       => api.post('/stores/mtr', data),
  update:  (id, data)   => api.put(`/stores/mtr/${id}`, data),
  submit:  (id)         => api.post(`/stores/mtr/${id}/submit`),
  approve: (id, data)   => api.post(`/stores/mtr/${id}/approve`, data),
  issue:   (id, data)   => api.post(`/stores/mtr/${id}/issue`, data),
  receive: (id, data)   => api.post(`/stores/mtr/${id}/receive`, data),
  cancel:  (id, data)   => api.delete(`/stores/mtr/${id}`, { data }),
};

export const bookingAPI = {
  list:            (params) => api.get('/bookings', { params }),
  get:             (id)     => api.get(`/bookings/${id}`),
  create:          (data)   => api.post('/bookings', data),
  schedulePayment: (data)   => api.post('/bookings/payment-schedule', data),
};

export const reportAPI = {
  profitability: (params) => api.get('/reports/profitability', { params }),
  gstReport:     (params) => api.get('/reports/gst', { params }),
  gstCompliance: (params) => api.get('/reports/gst/compliance', { params }),
  gstr1:         (params) => api.get('/reports/gst/gstr1', { params }),
  tdsCompliance: (params) => api.get('/reports/tds/compliance', { params }),
  labourCompliance:   (params) => api.get('/reports/labour/compliance', { params }),
  complianceCalendar: (params) => api.get('/reports/compliance/calendar', { params }),
  tdsReport:     (params) => api.get('/reports/tds', { params }),
  vendorLedger:  (params) => api.get('/reports/vendor-ledger', { params }),
  laborReport:   (params) => api.get('/reports/labor', { params }),
  stockReport:   (params) => api.get('/reports/stock', { params }),
  boqActual:     (params) => api.get('/reports/boq-actual', { params }),
  safetyReport:  (params) => api.get('/reports/safety', { params }),
  projectPL:     (params) => api.get('/reports/project-pl', { params }),
  arAging:       (params) => api.get('/reports/ar-aging', { params }),
  apAging:       (params) => api.get('/reports/ap-aging', { params }),
  procurementStoresSummary: (params) => api.get('/reports/accounts/procurement-stores-summary', { params }),
};

export const uploadAPI = {
  upload: (formData) => api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  uploadSingle: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/upload/single', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
};

export const indentAPI = {
  list:     (params) => api.get('/indents', { params }),
  get:      (id)     => api.get(`/indents/${id}`),
  create:   (data)   => api.post('/indents', data),
  submit:   (id)     => api.patch(`/indents/${id}/submit`),
  approve:  (id, data) => api.patch(`/indents/${id}/approve`, data),
  reject:   (id, data) => api.patch(`/indents/${id}/reject`, data),
  escalate: (id, data) => api.patch(`/indents/${id}/escalate`, data),
};

export const quotationAPI = {
  list:       (params)  => api.get('/quotations', { params }),
  listRFQs:   (params)  => api.get('/quotations/rfqs', { params }),
  getRFQSettings: ()    => api.get('/quotations/rfq-settings'),
  updateRFQSettings: (data) => api.patch('/quotations/rfq-settings', data),
  getRFQ:     (mrsId)   => api.get(`/quotations/rfqs/${mrsId}`),
  issueRFQ:   (data)    => api.post('/quotations/rfqs', data),
  getVendorRFQ: (token) => api.get(`/quotations/vendor-rfq/${token}`),
  submitVendorRFQ: (token, data) => api.post(`/quotations/vendor-rfq/${token}`, data),
  getCS:      (mrsId)   => api.get(`/quotations/comparison/${mrsId}`),
  create:     (data)    => api.post('/quotations', data),
  verifyCS:   (mrsId)   => api.patch(`/quotations/comparison/${mrsId}/verify`),
  checkCS:    (mrsId)   => api.patch(`/quotations/comparison/${mrsId}/check`),
  approveCS:  (mrsId, data) => api.patch(`/quotations/comparison/${mrsId}/approve`, data),
};

// ─── Tender Management ────────────────────────────────────────────────────────
export const tenderMgmtAPI = {
  list:           (p)       => api.get('/tender-mgmt', { params: p }),
  get:            (id)      => api.get(`/tender-mgmt/${id}`),
  create:         (d)       => api.post('/tender-mgmt', d),
  update:         (id, d)   => api.put(`/tender-mgmt/${id}`, d),
  updateStatus:   (id, d)   => api.patch(`/tender-mgmt/${id}/status`, d),
  dashboard:      ()        => api.get('/tender-mgmt/dashboard'),
  // EMD
  listEMD:        (id)      => api.get(`/tender-mgmt/${id}/emd`),
  addEMD:         (id, d)   => api.post(`/tender-mgmt/${id}/emd`, d),
  updateEMD:      (eid, d)  => api.patch(`/tender-mgmt/emd/${eid}`, d),
  // Pre-Bid
  addPrebid:      (id, d)   => api.post(`/tender-mgmt/${id}/prebid`, d),
  listClarifications: (id)  => api.get(`/tender-mgmt/${id}/clarifications`),
  addClarification:  (id, d)=> api.post(`/tender-mgmt/${id}/clarifications`, d),
  respondClarification:(cid,d)=> api.patch(`/tender-mgmt/clarifications/${cid}`, d),
  addAddendum:    (id, d)   => api.post(`/tender-mgmt/${id}/addendums`, d),
  // Costing
  listCosting:    (id)      => api.get(`/tender-mgmt/${id}/costing`),
  createCosting:  (id, d)   => api.post(`/tender-mgmt/${id}/costing`, d),
  // Competitors
  listCompetitors: ()       => api.get('/tender-mgmt/competitors'),
  addCompetitor:   (d)      => api.post('/tender-mgmt/competitors', d),
  addCompetitorBid:(id, d)  => api.post(`/tender-mgmt/${id}/competitor-bids`, d),
  winLossAnalysis: (p)      => api.get('/tender-mgmt/analytics/win-loss', { params: p }),
};

// ─── DMS ─────────────────────────────────────────────────────────────────────
export const dmsAPI = {
  list:           (p)       => api.get('/dms', { params: p }),
  get:            (id)      => api.get(`/dms/${id}`),
  preview:        (id, p)   => api.get(`/dms/${id}/preview`, { params: p }),
  fileBlob:       (id)      => api.get(`/dms/${id}/file`, { responseType: 'blob' }),
  docxPreviewUrl: (id)      => `/api/v1/dms/${id}/docx-preview`,
  updateMetadata: (id, d)   => api.patch(`/dms/${id}/metadata`, d),
  users:          ()        => api.get('/users'),
  dashboard:      ()        => api.get('/dms/dashboard'),
  delete:         (id)      => api.delete(`/dms/${id}`),
  search:         (p)       => api.get('/dms/search', { params: p }),
  // Upload (single or bulk)
  upload:         (formData)=> api.post('/dms/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  // Folders
  listFolders:    ()        => api.get('/dms/folders'),
  createFolder:   (d)       => api.post('/dms/folders', d),
  deleteFolder:   (fid)     => api.delete(`/dms/folders/${fid}`),
  // Versions
  listVersions:   (id)      => api.get(`/dms/${id}/versions`),
  addVersion:     (id, d)   => api.post(`/dms/${id}/versions`, d, d instanceof FormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined),
  // Approvals
  submitForReview:(id, d)   => api.post(`/dms/${id}/submit-for-review`, d),
  actionApproval: (aid, d)  => api.patch(`/dms/approvals/${aid}`, d),
  myApprovals:    ()        => api.get('/dms/my-approvals'),
  // Signatures
  listSignatures: (id)      => api.get(`/dms/${id}/signatures`),
  sign:           (id, d)   => api.post(`/dms/${id}/sign`, d),
  verifySignatures:(id)     => api.get(`/dms/${id}/verify-signatures`),
  // Linking
  linkDoc:        (id, d)   => api.patch(`/dms/${id}/link`, d),
  logDownload:    (id)      => api.post(`/dms/${id}/log-download`),
  // Sharing
  shareDoc:       (id, d)   => api.post(`/dms/${id}/share`, d),
  getShared:      (token)   => api.get(`/dms/shared/${token}`),
  // Logs
  getLogs:        (id)      => api.get(`/dms/${id}/logs`),
  // Reports
  reportRegister: (p)       => api.get('/dms/reports/register', { params: p }),
  reportRevision: ()        => api.get('/dms/reports/revision'),
  reportApproval: ()        => api.get('/dms/reports/approval'),
  reportAudit:    (p)       => api.get('/dms/reports/audit', { params: p }),
  reportUserActivity: ()    => api.get('/dms/reports/user-activity'),
};

// ─── GFC Master Log ──────────────────────────────────────────────────────────
export const gfcAPI = {
  list:           (p)           => api.get('/gfc/drawings', { params: p }),
  stats:          (p)           => api.get('/gfc/stats', { params: p }),
  create:         (d)           => api.post('/gfc/drawings', d),
  update:         (id, d)       => api.patch(`/gfc/drawings/${id}`, d),
  remove:         (id)          => api.delete(`/gfc/drawings/${id}`),
  addRevision:    (id, d)       => api.post(`/gfc/drawings/${id}/revisions`, d),
  revisions:      (id)          => api.get(`/gfc/drawings/${id}/revisions`),
  allRevisions:   (p)           => api.get('/gfc/drawings/revisions/all', { params: p }),
  superseded:     (p)           => api.get('/gfc/drawings/superseded', { params: p }),
  uploadFile:     (id, fd)      => api.post(`/gfc/drawings/${id}/upload`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  uploadRevFile:  (id, rid, fd) => api.post(`/gfc/drawings/${id}/revisions/${rid}/upload`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  downloadFile:   (id)          => api.get(`/gfc/drawings/${id}/file`, { responseType: 'blob' }),
  // multi-file attachments
  listFiles:      (id)          => api.get(`/gfc/drawings/${id}/files`),
  addFile:        (id, fd)      => api.post(`/gfc/drawings/${id}/files`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  downloadFileById: (id, fid)   => api.get(`/gfc/drawings/${id}/files/${fid}`, { responseType: 'blob' }),
  deleteFile:     (id, fid)     => api.delete(`/gfc/drawings/${id}/files/${fid}`),
};

// ─── Subcontractor Management ─────────────────────────────────────────────────
export const subMgmtAPI = {
  dashboard:       (p)      => api.get('/subcontractor-mgmt/dashboard', { params: p }),
  // Prequalification
  listPrequal:     (p)      => api.get('/subcontractor-mgmt/prequalification', { params: p }),
  createPrequal:   (d)      => api.post('/subcontractor-mgmt/prequalification', d),
  // Contracts
  listContracts:   (p)      => api.get('/subcontractor-mgmt/contracts', { params: p }),
  createContract:  (d)      => api.post('/subcontractor-mgmt/contracts', d),
  updateContract:  (id, d)  => api.put(`/subcontractor-mgmt/contracts/${id}`, d),
  // MB
  listMB:          (p)      => api.get('/subcontractor-mgmt/mb', { params: p }),
  createMB:        (d)      => api.post('/subcontractor-mgmt/mb', d),
  certifyMB:       (id, d)  => api.patch(`/subcontractor-mgmt/mb/${id}/certify`, d),
  // Performance
  listPerformance: (p)      => api.get('/subcontractor-mgmt/performance', { params: p }),
  addPerformance:  (d)      => api.post('/subcontractor-mgmt/performance', d),
  // Material Issues
  listMaterialIssues:(p)    => api.get('/subcontractor-mgmt/material-issues', { params: p }),
  addMaterialIssue:  (d)    => api.post('/subcontractor-mgmt/material-issues', d),
  updateMaterialIssue:(id,d)=> api.patch(`/subcontractor-mgmt/material-issues/${id}`, d),
  // Claims
  listClaims:      (p)      => api.get('/subcontractor-mgmt/claims', { params: p }),
  createClaim:     (d)      => api.post('/subcontractor-mgmt/claims', d),
  reviewClaim:     (id, d)  => api.patch(`/subcontractor-mgmt/claims/${id}/review`, d),
  // Retention
  listRetention:   (p)      => api.get('/subcontractor-mgmt/retention', { params: p }),
  releaseRetention:(d)      => api.post('/subcontractor-mgmt/retention/release', d),
};

export const planningP6API = {
  // Phases
  listPhases:          (p)       => api.get('/planning-p6/phases', { params: p }),
  createPhase:         (d)       => api.post('/planning-p6/phases', d),
  updatePhase:         (id, d)   => api.put(`/planning-p6/phases/${id}`, d),
  deletePhase:         (id)      => api.delete(`/planning-p6/phases/${id}`),
  // WBS
  listWBS:             (p)       => api.get('/planning-p6/wbs', { params: p }),
  createWBS:           (d)       => api.post('/planning-p6/wbs', d),
  updateWBS:           (id, d)   => api.put(`/planning-p6/wbs/${id}`, d),
  deleteWBS:           (id)      => api.delete(`/planning-p6/wbs/${id}`),
  // Dependencies
  listDeps:            (p)       => api.get('/planning-p6/dependencies', { params: p }),
  createDep:           (d)       => api.post('/planning-p6/dependencies', d),
  deleteDep:           (id)      => api.delete(`/planning-p6/dependencies/${id}`),
  // CPM
  calculateCPM:        (d)       => api.post('/planning-p6/cpm/calculate', d),
  // Resources
  listResources:       (p)       => api.get('/planning-p6/resources', { params: p }),
  createResource:      (d)       => api.post('/planning-p6/resources', d),
  updateResource:      (id, d)   => api.put(`/planning-p6/resources/${id}`, d),
  // Activity Resources
  listActResources:    (p)       => api.get('/planning-p6/activity-resources', { params: p }),
  assignResource:      (d)       => api.post('/planning-p6/activity-resources', d),
  updateActualRes:     (id, d)   => api.patch(`/planning-p6/activity-resources/${id}/actual`, d),
  resourceHistogram:   (p)       => api.get('/planning-p6/resource-histogram', { params: p }),
  // Baselines
  listBaselines:       (p)       => api.get('/planning-p6/baselines', { params: p }),
  createBaseline:      (d)       => api.post('/planning-p6/baselines', d),
  compareBaseline:     (id)      => api.get(`/planning-p6/baselines/${id}/compare`),
  // EVM
  getEVM:              (p)       => api.get('/planning-p6/evm', { params: p }),
  snapshotEVM:         (d)       => api.post('/planning-p6/evm/snapshot', d),
  updateActivityEVM:   (id, d)   => api.patch(`/planning-p6/activities/${id}/evm`, d),
  // Risk Register
  listRisks:           (p)       => api.get('/planning-p6/risks', { params: p }),
  createRisk:          (d)       => api.post('/planning-p6/risks', d),
  updateRisk:          (id, d)   => api.put(`/planning-p6/risks/${id}`, d),
  deleteRisk:          (id)      => api.delete(`/planning-p6/risks/${id}`),
  // MRP
  listMRP:             (p)       => api.get('/planning-p6/mrp', { params: p }),
  createMRP:           (d)       => api.post('/planning-p6/mrp', d),
  updateMRP:           (id, d)   => api.patch(`/planning-p6/mrp/${id}`, d),
  deleteMRP:           (id)      => api.delete(`/planning-p6/mrp/${id}`),
  // P6 Dashboard
  p6Dashboard:         (p)       => api.get('/planning-p6/p6-dashboard', { params: p }),
};

// ─── Subcontractor Module (sc) ────────────────────────────────────────────────
export const scAPI = {
  // Dashboard
  dashboard:          (p)       => api.get('/sc/dashboard', { params: p }),
  // Subcontractors
  listSC:             (p)       => api.get('/sc/subcontractors', { params: p }),
  getSC:              (id)      => api.get(`/sc/subcontractors/${id}`),
  createSC:           (d)       => api.post('/sc/subcontractors', d),
  updateSC:           (id, d)   => api.put(`/sc/subcontractors/${id}`, d),
  // Work Orders
  listAllWO:          (p)       => api.get('/sc/all-work-orders', { params: p }),
  getLegacyWO:        (id)      => api.get(`/sc/legacy-work-orders/${id}`),
  listWO:             (p)       => api.get('/sc/work-orders', { params: p }),
  listSubWO:          (p)       => api.get('/sc/work-orders', { params: { ...p, contractor_type:'sub_contractor' } }),
  listLabourWO:       (p)       => api.get('/sc/work-orders', { params: { ...p, contractor_type:'labour_contractor' } }),
  getWO:              (id)      => api.get(`/sc/work-orders/${id}`),
  createWO:           (d)       => api.post('/sc/work-orders', d),
  updateWO:           (id, d)   => api.put(`/sc/work-orders/${id}`, d),
  approveWO:          (id)      => api.patch(`/sc/work-orders/${id}/approve`),
  // Workers
  listWorkers:        (p)       => api.get('/sc/workers', { params: p }),
  createWorker:       (d)       => api.post('/sc/workers', d),
  // Attendance
  listAttendance:     (p)       => api.get('/sc/attendance', { params: p }),
  markAttendance:     (d)       => api.post('/sc/attendance', d),
  bulkAttendance:     (d)       => api.post('/sc/attendance/bulk', d),
  // Progress
  listProgress:       (p)       => api.get('/sc/progress', { params: p }),
  addProgress:        (d)       => api.post('/sc/progress', d),
  verifyProgress:     (id)      => api.patch(`/sc/progress/${id}/verify`),
  // Bills
  listBills:          (p)       => api.get('/sc/bills', { params: p }),
  getBill:            (id)      => api.get(`/sc/bills/${id}`),
  createBill:         (d)       => api.post('/sc/bills', d),
  submitBill:         (id, d)   => api.patch(`/sc/bills/${id}/submit`, d),
  approveBill:        (id, d)   => api.patch(`/sc/bills/${id}/approve`, d),
  rejectBill:         (id, d)   => api.patch(`/sc/bills/${id}/reject`, d),
  queryBill:          (id, d)   => api.patch(`/sc/bills/${id}/query`, d),
  qaqcClearMB:        (id, d)   => api.patch(`/sc/mb/${id}/qaqc-clear`, d),
  listIPCs:           (p)       => api.get('/sc/ipcs', { params: p }),
  // Payments
  listPayments:       (p)       => api.get('/sc/payments', { params: p }),
  recordPayment:      (d)       => api.post('/sc/payments', d),
  // Reports
  reportSummary:      (p)       => api.get('/sc/reports/summary', { params: p }),
  reportWOBalance:    (p)       => api.get('/sc/reports/wo-balance', { params: p }),
  reportOutstanding:  (p)       => api.get('/sc/reports/outstanding', { params: p }),
  reportRetention:    (p={})    => api.get('/sc/reports/retention', { params: p }),
  reportLabour:       (p)       => api.get('/sc/reports/labour', { params: p }),
  // Settings
  getSettings:        ()        => api.get('/sc/settings'),
  saveSettings:       (d)       => api.post('/sc/settings', d),
  // Measurement Book
  listMB:             (p)       => api.get('/sc/mb', { params: p }),
  getMB:              (id)      => api.get(`/sc/mb/${id}`),
  createMB:           (d)       => api.post('/sc/mb', d),
  submitMB:           (id)      => api.patch(`/sc/mb/${id}/submit`),
  checkMB:            (id, d)   => api.patch(`/sc/mb/${id}/check`, d),
  approveMB:          (id, d)   => api.patch(`/sc/mb/${id}/approve`, d),
  rejectMB:           (id, d)   => api.patch(`/sc/mb/${id}/reject`, d),
  // Advances
  listAdvances:       (p)       => api.get('/sc/advances', { params: p }),
  createAdvance:      (d)       => api.post('/sc/advances', d),
  // Material Recoveries
  listMaterialRec:    (p)       => api.get('/sc/material-recoveries', { params: p }),
  createMaterialRec:  (d)       => api.post('/sc/material-recoveries', d),
  // ESSL Biometric Integration
  esslTest:           (d)       => api.post('/sc/essl/test', d),
  esslEmployees:      ()        => api.get('/sc/essl/employees'),
  esslPreview:        (p)       => api.get('/sc/essl/preview', { params: p }),
  esslSync:           (d)       => api.post('/sc/essl/sync', d),
  // NMR — Nominal Muster Roll
  listNMR:        (p)       => api.get('/sc/nmr', { params: p }),
  getNMR:         (id)      => api.get(`/sc/nmr/${id}`),
  previewNMR:     (id)      => api.get(`/sc/nmr/${id}/preview`),
  createNMR:      (d)       => api.post('/sc/nmr', d),
  submitNMR:      (id)      => api.patch(`/sc/nmr/${id}/submit`),
  checkNMR:       (id, d)   => api.patch(`/sc/nmr/${id}/check`, d),
  approveNMR:     (id, d)   => api.patch(`/sc/nmr/${id}/approve`, d),
  raiseBillNMR:   (id)      => api.post(`/sc/nmr/${id}/raise-bill`),
  // Retention Releases
  listRetentionRel:   (p)       => api.get('/sc/retention-releases', { params: p }),
  retentionSummary:   (p)       => api.get('/sc/retention-summary', { params: p }),
  createRetentionRel: (d)       => api.post('/sc/retention-releases', d),
  approveRetention:   (id)      => api.patch(`/sc/retention-releases/${id}/approve`),
  releaseRetention:   (id)      => api.patch(`/sc/retention-releases/${id}/release`),
  // Final Bills
  listFinalBills:     (p)       => api.get('/sc/final-bills', { params: p }),
  createFinalBill:    (d)       => api.post('/sc/final-bills', d),
  // Enhanced Reports
  reportLedger:       (p)       => api.get('/sc/reports/ledger', { params: p }),
  reportBOQActual:    (p)       => api.get('/sc/reports/boq-actual', { params: p }),
  reportAdvRec:       (p)       => api.get('/sc/reports/advance-recovery', { params: p }),
  reportPayReg:       (p)       => api.get('/sc/reports/payment-register', { params: p }),
  // P5 — TDS 26Q, COP, Final Account, WO Closure
  reportTDS26Q:       (p)       => api.get('/sc/reports/tds-26q', { params: p }),
  reportCOP:          (p)       => api.get('/sc/reports/cop', { params: p }),
  getWOFinalAccount:  (id)      => api.get(`/sc/work-orders/${id}/final-account`),
  closeWO:            (id, d)   => api.patch(`/sc/work-orders/${id}/close`, d),
};

export const hireLogAPI = {
  listWOs:       ()           => api.get('/hire-log/work-orders'),
  get:           (woId)       => api.get(`/hire-log/${woId}`),
  addEntry:      (woId, d)    => api.post(`/hire-log/${woId}`, d),
  updateEntry:   (woId, id, d)=> api.patch(`/hire-log/${woId}/${id}`, d),
  deleteEntry:   (woId, id)   => api.delete(`/hire-log/${woId}/${id}`),
  markBilled:    (woId, id, scBillId) => api.patch(`/hire-log/${woId}/${id}/mark-billed`, { sc_bill_id: scBillId }),
  categorizeItem:(woId, itemId, d) => api.patch(`/hire-log/${woId}/items/${itemId}/categorize`, d),
};

export const analyticsAPI = {
  global:     ()        => api.get('/analytics/global'),
  executive:  (params)  => api.get('/analytics/executive', { params }),
  project360: (id)      => api.get(`/analytics/project-360/${id}`),
};

export const approvalsAPI = {
  getPending:   ()            => api.get('/approvals/pending'),
  doAction:     (d)           => api.post('/approvals/action', d),
};

export const documentsAPI = {
  list:           (params)        => api.get('/documents', { params }),
  listForRecord:  (module, record_id) => api.get('/documents', { params: { module, module_record_id: record_id }, skipProjectInject: true }),
  modules:        ()              => api.get('/documents/modules'),
  parseOrder:     (id, body = {}) => api.post(`/documents/${id}/parse-order-v2`, body),
  upload: (formData) => api.post('/documents/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  uploadForRecord: (file, module, module_record_id, project_id, doc_type = 'general') => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('module', module);
    fd.append('doc_type', doc_type);
    if (module_record_id) fd.append('module_record_id', module_record_id);
    if (project_id)       fd.append('project_id', project_id);
    return api.post('/documents/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  delete: (id) => api.delete(`/documents/${id}`),
};

export const tqsBillsAPI = {
  list:         (params)   => api.get('/tqs/bills', { params }),
  deductionRegister: (params) => api.get('/tqs/bills/deduction-register', { params }),
  get:          (id)       => api.get(`/tqs/bills/${id}`),
  create:       (data)     => api.post('/tqs/bills', data),
  update:       (id, d)    => api.put(`/tqs/bills/${id}`, d),
  updateStores: (id, d)    => api.patch(`/tqs/bills/${id}/stores`, d),
  updateDocumentControl: (id, d) => api.patch(`/tqs/bills/${id}/document-control`, d),
  updateQS:     (id, d)    => api.patch(`/tqs/bills/${id}/qs`, d),
  updateAccounts:(id, d)   => api.patch(`/tqs/bills/${id}/accounts`, d),
  updateProcurement:(id, d)=> api.patch(`/tqs/bills/${id}/procurement`, d),
  updateQSSign: (id, d)    => api.patch(`/tqs/bills/${id}/qs-sign`, d),
  updatePayment:(id, d)    => api.patch(`/tqs/bills/${id}/payment`, d),
  markPaid:    (id)        => api.patch(`/tqs/bills/${id}/mark-paid`),
  uploadFile:   (id, fd)   => api.post(`/tqs/bills/${id}/files`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  linkOneDrive: (id, data) => api.post(`/tqs/bills/${id}/files/link`, data),
  syncFileToOneDrive: (id, fid) => api.post(`/tqs/bills/${id}/files/${fid}/sync-onedrive`),
  getFilePreviewUrl: (id, fid) => api.get(`/tqs/bills/${id}/files/${fid}/preview-url`),
  serveFile: (id, fid) => api.get(`/tqs/bills/${id}/files/${fid}/serve`, { responseType: 'blob' }),
  deleteFile:   (id, fid)  => api.delete(`/tqs/bills/${id}/files/${fid}`),
  delete:       (id)       => api.delete(`/tqs/bills/${id}`),
  repairCertifiedNet: ()  => api.post('/tqs/bills/repair-certified-net'),
  backfillJV:   (data)    => api.post('/tqs/bills/backfill-jv', data || {}),
  // ── Import ──
  downloadTemplate: ()         => api.get('/tqs/bills/import/template', { responseType: 'blob' }),
  bulkImport:       (fd)       => api.post('/tqs/bills/bulk-import', fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  // ── Cross-module lookups ──
  lookupPOs:        (params)   => api.get('/tqs/bills/lookup/pos',        { params }),
  lookupWOs:        (params)   => api.get('/tqs/bills/lookup/wos',        { params }),
  lookupGRNs:       (params)   => api.get('/tqs/bills/lookup/grns',       { params }),
  lookupPOBalance:  (po_id)    => api.get('/tqs/bills/lookup/po-balance',  { params: { po_id } }),
  // ── RA Bill Summary + Payment Certificate ──
  getRASummary:       (id)    => api.get(`/tqs/bills/${id}/ra-summary`),
  generatePaymentCert:(id)    => api.post(`/tqs/bills/${id}/payment-certificate`),
  signPaymentCert:    (id, d) => api.patch(`/tqs/bills/${id}/payment-certificate/sign`, d),
  // ── Vendor Ledger + AP Aging ──
  getVendorLedger: (params) => api.get('/tqs/bills/vendor-ledger', { params }),
  getAPAging:      (params) => api.get('/tqs/bills/ap-aging',      { params }),
  updateMeta:      (id, d)  => api.patch(`/tqs/bills/${id}/meta`, d),
  // ── Advance payments ──
  listAdvances:    (params) => api.get('/tqs/bills/advances', { params }),
  pendingAdvances: (params) => api.get('/tqs/bills/advances/pending', { params }),
  recordAdvance:   (data)   => api.post('/tqs/bills/advances', data),
  updateAdvance:   (id, d)  => api.put(`/tqs/bills/advances/${id}`, d),
  deleteAdvance:   (id)     => api.delete(`/tqs/bills/advances/${id}`),
  recoverAdvance:  (id, d)  => api.patch(`/tqs/bills/advances/${id}/recover`, d),
  // ── Cash flow ──
  cashFlow:        (params) => api.get('/tqs/bills/cash-flow', { params }),
  // ── PC-level payment ──
  pcPending:       (params) => api.get('/tqs/bills/pc-pending', { params }),
  pcPayment:       (data)   => api.post('/tqs/bills/pc-payment', data),
  // ── Export & Stage advancement ──
  exportExcel:     (params) => api.get('/tqs/bills/export/excel', { params, responseType: 'blob' }),
  advanceStage:    (id)     => api.patch(`/tqs/bills/${id}/advance-stage`),
  concreteTracker: (params) => api.get('/tqs/bills/concrete-tracker', { params }),
};

export const liabilityRegisterAPI = {
  summary:       (params)   => api.get('/tqs/liability-register',                 { params }),
  ledger:        (params)   => api.get('/tqs/liability-register/ledger',          { params }),
  updateAdvance: (id, data) => api.patch(`/tqs/liability-register/advance/${id}`, data),
  runAutomation: ()         => api.post('/tqs/liability-register/automation/run'),
};

export const procurementAdvanceAPI = {
  list:          (params)   => api.get('/procurement/advances', { params }),
  summary:       (params)   => api.get('/procurement/advances/summary', { params }),
  get:           (id)       => api.get(`/procurement/advances/${id}`),
  create:        (data)     => api.post('/procurement/advances', data),
  update:        (id, data) => api.put(`/procurement/advances/${id}`, data),
  delete:        (id)       => api.delete(`/procurement/advances/${id}`),
  issue:         (id, data) => api.patch(`/procurement/advances/${id}/issue`, data),
  recover:       (id, data) => api.post(`/procurement/advances/${id}/recover`, data),
  approveProcurement: (id)       => api.patch(`/procurement/advances/${id}/approve-procurement`),
  approveMD:          (id)       => api.patch(`/procurement/advances/${id}/approve-md`),
  reject:             (id, data) => api.patch(`/procurement/advances/${id}/reject`, data),
  lookupVendors:       (params) => api.get('/procurement/advances/lookup/vendors', { params }),
  lookupWOs:           (params) => api.get('/procurement/advances/lookup/wos', { params }),
  lookupPOs:           (params) => api.get('/procurement/advances/lookup/pos', { params }),
  lookupBillsByVendor: (params) => api.get('/procurement/advances/lookup/bills-by-vendor', { params }),
  importExcel:         (fd)     => api.post('/procurement/advances/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  resyncFromBills:     ()       => api.post('/procurement/advances/resync-from-bills'),
};

// Backwards compatibility alias
export const tqsAdvanceAPI = procurementAdvanceAPI;

export const tqsTrackerAPI = {
  list:      (params) => api.get('/tqs/material-tracker', { params }),
  lifecycle: (params) => api.get('/tqs/material-tracker/lifecycle', { params }),
  create: (data)   => api.post('/tqs/material-tracker', data),
  update: (id, d)  => api.put(`/tqs/material-tracker/${id}`, d),
  delete: (id)     => api.delete(`/tqs/material-tracker/${id}`),
  linkPO:  (data)  => api.patch('/tqs/material-tracker/link-po', data),
};

export const tqsVendorsAPI = {
  list:   (params) => api.get('/tqs/vendors', { params }),
  create: (data)   => api.post('/tqs/vendors', data),
  update: (id, d)  => api.put(`/tqs/vendors/${id}`, d),
  delete: (id)     => api.delete(`/tqs/vendors/${id}`),
};

export const tqsTransmittalAPI = {
  list:         (params) => api.get('/tqs/transmittals', { params }),
  get:          (id)     => api.get(`/tqs/transmittals/${id}`),
  create:       (data)   => api.post('/tqs/transmittals', data),
  submit:       (id)     => api.patch(`/tqs/transmittals/${id}/submit`),
  receive:      (id, d)  => api.patch(`/tqs/transmittals/${id}/receive`, d),
  delete:       (id)     => api.delete(`/tqs/transmittals/${id}`),
  lookupBills:  (params) => api.get('/tqs/transmittals/lookup/bills', { params }),
};

export const vendorQSCertificationAPI = {
  list:            (params) => api.get('/vendor-qs-certifications', { params }),
  get:             (id)     => api.get(`/vendor-qs-certifications/${id}`),
  accountsPending: (params) => api.get('/vendor-qs-certifications/accounts-pending', { params }),
  pendingInvoices:   (params) => api.get('/vendor-qs-certifications/pending-invoices', { params }),
  pendingScAdvances: (params) => api.get('/vendor-qs-certifications/pending-sc-advances', { params }),
  summaryItems:    (data)   => api.post('/vendor-qs-certifications/summary-items', data),
  create:          (data)   => api.post('/vendor-qs-certifications', data),
  refreshFromBills:(id)     => api.post(`/vendor-qs-certifications/${id}/refresh-from-bills`),
  updateAmounts:   (id, d)  => api.patch(`/vendor-qs-certifications/${id}/amounts`, d),
  updateStatus:    (id, d)  => api.patch(`/vendor-qs-certifications/${id}/status`, d),
  recordPayment:   (id, d)  => api.post(`/vendor-qs-certifications/${id}/payment`, d),
  delete:          (id)     => api.delete(`/vendor-qs-certifications/${id}`),
};

// ─── HR & Admin API ───────────────────────────────────────────────────────────
export const hrMastersAPI = {
  // Departments
  listDepts:    (params) => api.get('/hr-admin/masters/departments', { params }),
  createDept:   (data)   => api.post('/hr-admin/masters/departments', data),
  updateDept:   (id, d)  => api.put(`/hr-admin/masters/departments/${id}`, d),
  deleteDept:   (id)     => api.delete(`/hr-admin/masters/departments/${id}`),
  // Designations
  listDesigs:   (params) => api.get('/hr-admin/masters/designations', { params }),
  createDesig:  (data)   => api.post('/hr-admin/masters/designations', data),
  updateDesig:  (id, d)  => api.put(`/hr-admin/masters/designations/${id}`, d),
  deleteDesig:  (id)     => api.delete(`/hr-admin/masters/designations/${id}`),
  // Leave Types
  listLeaveTypes:   (params) => api.get('/hr-admin/masters/leave-types', { params }),
  createLeaveType:  (data)   => api.post('/hr-admin/masters/leave-types', data),
  updateLeaveType:  (id, d)  => api.put(`/hr-admin/masters/leave-types/${id}`, d),
  deleteLeaveType:  (id)     => api.delete(`/hr-admin/masters/leave-types/${id}`),
  // Holidays
  listHolidays:   (params) => api.get('/hr-admin/masters/holidays', { params }),
  createHoliday:  (data)   => api.post('/hr-admin/masters/holidays', data),
  updateHoliday:  (id, d)  => api.put(`/hr-admin/masters/holidays/${id}`, d),
  deleteHoliday:  (id)     => api.delete(`/hr-admin/masters/holidays/${id}`),
};

export const hrEmployeesAPI = {
  list:           (params)  => api.get('/hr-admin/employees', { params }),
  compliance:     ()        => api.get('/hr-admin/employees/compliance/alerts'),
  get:            (id)      => api.get(`/hr-admin/employees/${id}`),
  create:         (data)    => api.post('/hr-admin/employees', data),
  update:         (id, d)   => api.put(`/hr-admin/employees/${id}`, d),
  updateStatus:   (id, d)   => api.patch(`/hr-admin/employees/${id}/status`, d),
  updateLifecycle:(id, itemId, d) => api.patch(`/hr-admin/employees/${id}/lifecycle/${itemId}`, d),
  uploadDocument: (id, fd)  => api.post(`/hr-admin/employees/${id}/documents`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteDocument: (id, did) => api.delete(`/hr-admin/employees/${id}/documents/${did}`),
};

export const hrLeaveAPI = {
  getBalances:   (params) => api.get('/hr-admin/leave/balances', { params }),
  updateBalance: (id, d)  => api.put(`/hr-admin/leave/balances/${id}`, d),
  listRequests:  (params) => api.get('/hr-admin/leave/requests', { params }),
  submitRequest: (data)   => api.post('/hr-admin/leave/requests', data),
  approve:       (id)     => api.patch(`/hr-admin/leave/requests/${id}/approve`),
  reject:        (id, d)  => api.patch(`/hr-admin/leave/requests/${id}/reject`, d),
  cancel:        (id)     => api.patch(`/hr-admin/leave/requests/${id}/cancel`),
};

export const hrAttendanceAPI = {
  list:        (params) => api.get('/hr-admin/attendance', { params }),
  summary:     (params) => api.get('/hr-admin/attendance/summary', { params }),
  dailyTrend:  (params) => api.get('/hr-admin/attendance/daily-trend', { params }),
  deptSummary: (params) => api.get('/hr-admin/attendance/department-summary', { params }),
  bulk:    (data)   => api.post('/hr-admin/attendance/bulk', data),
  baseline:(data)   => api.post('/hr-admin/attendance/month-baseline', data),
  upsert:  (data)   => api.post('/hr-admin/attendance', data),
  update:  (id, d)  => api.put(`/hr-admin/attendance/${id}`, d),
};

export const hrSalaryAPI = {
  listStructures:     (params) => api.get('/hr-admin/salary/structures', { params }),
  createStructure:    (data)   => api.post('/hr-admin/salary/structures', data),
  updateStructure:    (id, d)  => api.put(`/hr-admin/salary/structures/${id}`, d),
  listEmpSalaries:    (params) => api.get('/hr-admin/salary/employee-salaries', { params }),
  getCurrentSalary:   (uid)    => api.get(`/hr-admin/salary/employee-salaries/${uid}/current`),
  assignSalary:       (data)   => api.post('/hr-admin/salary/employee-salaries', data),
};

export const hrPayrollAPI = {
  list:          (params) => api.get('/hr-admin/payroll', { params }),
  get:           (id)     => api.get(`/hr-admin/payroll/${id}`),
  getPayslip:    (id)     => api.get(`/hr-admin/payroll/${id}/payslip`),
  run:           (data)   => api.post('/hr-admin/payroll/run', data),
  update:        (id, d)  => api.put(`/hr-admin/payroll/${id}`, d),
  submit:        (id)     => api.patch(`/hr-admin/payroll/${id}/submit`),
  bulkSubmit:    (data)   => api.post('/hr-admin/payroll/bulk-submit', data),
  approve:       (id, d)  => api.patch(`/hr-admin/payroll/${id}/approve`, d || {}),
  bulkApprove:   (data)   => api.post('/hr-admin/payroll/bulk-approve', data),
  reject:        (id, d)  => api.patch(`/hr-admin/payroll/${id}/reject`, d || {}),
  remove:        (id)     => api.delete(`/hr-admin/payroll/${id}`),
  bulkPay:       (data)   => api.post('/hr-admin/payroll/bulk-pay', data),
  pfEcr:         (params) => api.get('/hr-admin/payroll/reports/pf-ecr', { params }),
  esiReturn:     (params) => api.get('/hr-admin/payroll/reports/esi-return', { params }),
  headcount:     ()       => api.get('/hr-admin/payroll/reports/headcount'),
};

export const hrLopAPI = {
  list:   (params) => api.get('/hr-admin/payroll/lop', { params }),
  save:   (data)   => api.post('/hr-admin/payroll/lop', data),
  remove: (id)     => api.delete(`/hr-admin/payroll/lop/${id}`),
};

export const hrStopSalaryAPI = {
  list:   ()       => api.get('/hr-admin/payroll/stop-salary'),
  save:   (data)   => api.post('/hr-admin/payroll/stop-salary', data),
  remove: (id)     => api.delete(`/hr-admin/payroll/stop-salary/${id}`),
};

export const hrLoansAPI = {
  list:    (params) => api.get('/hr-admin/loans', { params }),
  create:  (data)   => api.post('/hr-admin/loans', data),
  approve: (id, d)  => api.patch(`/hr-admin/loans/${id}/approve`, d),
  reject:  (id)     => api.patch(`/hr-admin/loans/${id}/reject`),
  repay:   (id, d)  => api.patch(`/hr-admin/loans/${id}/repay`, d),
};

export const hrExpensesAPI = {
  list:    (params) => api.get('/hr-admin/expenses', { params }),
  create:  (fd)     => api.post('/hr-admin/expenses', fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  approve: (id)     => api.patch(`/hr-admin/expenses/${id}/approve`),
  reject:  (id)     => api.patch(`/hr-admin/expenses/${id}/reject`),
  pay:     (id, d)  => api.patch(`/hr-admin/expenses/${id}/pay`, d),
};

export const hrAppraisalsAPI = {
  list:        (params) => api.get('/hr-admin/appraisals', { params }),
  get:         (id)     => api.get(`/hr-admin/appraisals/${id}`),
  create:      (data)   => api.post('/hr-admin/appraisals', data),
  update:      (id, d)  => api.put(`/hr-admin/appraisals/${id}`, d),
  acknowledge: (id)     => api.patch(`/hr-admin/appraisals/${id}/acknowledge`),
};

export const hrEvaluationsAPI = {
  kraTemplate:  ()       => api.get('/hr-admin/evaluations/kra-template'),
  list:         (params) => api.get('/hr-admin/evaluations', { params }),
  get:          (id)     => api.get(`/hr-admin/evaluations/${id}`),
  create:       (data)   => api.post('/hr-admin/evaluations', data),
  update:       (id, d)  => api.put(`/hr-admin/evaluations/${id}`, d),
  updateStatus: (id, s)  => api.patch(`/hr-admin/evaluations/${id}/status`, { status: s }),
  remove:       (id)     => api.delete(`/hr-admin/evaluations/${id}`),
};

export const hrEsslAPI = {
  getConfig:      ()           => api.get('/hr-admin/essl/config'),
  saveConfig:     (data)       => api.post('/hr-admin/essl/config', data),
  testConnection: (data)       => api.post('/hr-admin/essl/test-connection', data),
  preview:        (from, to)   => api.get('/hr-admin/essl/preview', { params: { from, to } }),
  sync:           (from, to)   => api.post('/hr-admin/essl/sync', { from, to }),
  unmatched:      ()           => api.get('/hr-admin/essl/unmatched'),
  agentKey:       ()           => api.get('/hr-admin/essl/agent-key'),
};

export const hrComplianceAPI = {
  pfRegister:          (p) => api.get('/hr-admin/compliance/pf-register',          { params: p }),
  esiRegister:         (p) => api.get('/hr-admin/compliance/esi-register',         { params: p }),
  ptRegister:          (p) => api.get('/hr-admin/compliance/pt-register',          { params: p }),
  employmentRegister:  (p) => api.get('/hr-admin/compliance/employment-register',  { params: p }),
  musterRoll:          (p) => api.get('/hr-admin/compliance/muster-roll',          { params: p }),
  wageRegister:        (p) => api.get('/hr-admin/compliance/wage-register',        { params: p }),
  incomeTaxRegister:   (p) => api.get('/hr-admin/compliance/income-tax-register',  { params: p }),
  departments:         ()  => api.get('/hr-admin/compliance/departments'),
};

export const mailAPI = {
  status:        ()        => api.get('/mail/status'),
  test:          (to)      => api.post('/mail/test', { to }),
  send:          (data)    => api.post('/mail/send', data),
  resendWelcome: (to)      => api.post('/mail/welcome', { to }),
};

const multipart = { headers: { 'Content-Type': undefined } };
export const hrImportAPI = {
  previewEmployees: (file)       => { const fd = new FormData(); fd.append('file', file); return api.post('/hr-admin/import/preview-employees', fd, multipart); },
  previewAttendance:(file)       => { const fd = new FormData(); fd.append('file', file); return api.post('/hr-admin/import/preview-attendance', fd, multipart); },
  importEmployees:  (file, mode) => { const fd = new FormData(); fd.append('file', file); fd.append('mode', mode); return api.post('/hr-admin/import/employees', fd, multipart); },
  importAttendance: (file, month, year) => { const fd = new FormData(); fd.append('file', file); fd.append('month', month); fd.append('year', year); return api.post('/hr-admin/import/attendance', fd, multipart); },
};

export const hrAdvancedAPI = {
  listJobs:             (params)       => api.get('/hr-admin/advanced/recruitment/jobs', { params }),
  createJob:            (data)         => api.post('/hr-admin/advanced/recruitment/jobs', data),
  updateJob:            (id, data)     => api.patch(`/hr-admin/advanced/recruitment/jobs/${id}`, data),
  listCandidates:       (params)       => api.get('/hr-admin/advanced/recruitment/candidates', { params }),
  createCandidate:      (data)         => api.post('/hr-admin/advanced/recruitment/candidates', data),
  updateCandidate:      (id, data)     => api.patch(`/hr-admin/advanced/recruitment/candidates/${id}`, data),
  scheduleInterview:    (id, data)     => api.post(`/hr-admin/advanced/recruitment/candidates/${id}/interviews`, data),
  createOffer:          (id, data)     => api.post(`/hr-admin/advanced/recruitment/candidates/${id}/offer`, data),
  updateOffer:          (id, data)     => api.patch(`/hr-admin/advanced/recruitment/offers/${id}`, data),
  listShifts:           (params)       => api.get('/hr-admin/advanced/shifts', { params }),
  createShift:          (data)         => api.post('/hr-admin/advanced/shifts', data),
  updateShift:          (id, data)     => api.patch(`/hr-admin/advanced/shifts/${id}`, data),
  listRosters:          (params)       => api.get('/hr-admin/advanced/rosters', { params }),
  createRoster:         (data)         => api.post('/hr-admin/advanced/rosters', data),
  listRegularizations:  (params)       => api.get('/hr-admin/advanced/regularizations', { params }),
  createRegularization: (data)         => api.post('/hr-admin/advanced/regularizations', data),
  actionRegularization: (id, action, data = {}) => api.patch(`/hr-admin/advanced/regularizations/${id}/${action}`, data),
  listLeavePolicies:    ()             => api.get('/hr-admin/advanced/leave-policies'),
  createLeavePolicy:    (data)         => api.post('/hr-admin/advanced/leave-policies', data),
  updateLeavePolicy:    (id, data)     => api.patch(`/hr-admin/advanced/leave-policies/${id}`, data),
  runLeaveAccrual:      (data)         => api.post('/hr-admin/advanced/leave-policies/accrue', data),
  getComplianceSettings:()             => api.get('/hr-admin/advanced/payroll-compliance/settings'),
  saveComplianceSettings:(data)        => api.post('/hr-admin/advanced/payroll-compliance/settings', data),
  listTaxDeclarations:  (params)       => api.get('/hr-admin/advanced/payroll-compliance/tax-declarations', { params }),
  createTaxDeclaration: (data)         => api.post('/hr-admin/advanced/payroll-compliance/tax-declarations', data),
  updateTaxDeclaration: (id, data)     => api.patch(`/hr-admin/advanced/payroll-compliance/tax-declarations/${id}`, data),
  listTrainingPrograms: (params)       => api.get('/hr-admin/advanced/training/programs', { params }),
  createTrainingProgram:(data)         => api.post('/hr-admin/advanced/training/programs', data),
  updateTrainingProgram:(id, data)     => api.patch(`/hr-admin/advanced/training/programs/${id}`, data),
  listNominations:      (params)       => api.get('/hr-admin/advanced/training/nominations', { params }),
  nominateTraining:     (data)         => api.post('/hr-admin/advanced/training/nominations', data),
  listGoals:            (params)       => api.get('/hr-admin/advanced/performance/goals', { params }),
  createGoal:           (data)         => api.post('/hr-admin/advanced/performance/goals', data),
  updateGoal:           (id, data)     => api.patch(`/hr-admin/advanced/performance/goals/${id}`, data),
  listEmployeeCases:    (params)       => api.get('/hr-admin/advanced/employee-cases', { params }),
  createEmployeeCase:   (data)         => api.post('/hr-admin/advanced/employee-cases', data),
  updateEmployeeCase:   (id, data)     => api.patch(`/hr-admin/advanced/employee-cases/${id}`, data),
  listExits:            (params)       => api.get('/hr-admin/advanced/exits', { params }),
  createExit:           (data)         => api.post('/hr-admin/advanced/exits', data),
  updateExit:           (id, data)     => api.patch(`/hr-admin/advanced/exits/${id}`, data),
  listLetterTemplates:  (params)       => api.get('/hr-admin/advanced/letters/templates', { params }),
  createLetterTemplate: (data)         => api.post('/hr-admin/advanced/letters/templates', data),
  listLetterIssues:     (params)       => api.get('/hr-admin/advanced/letters/issues', { params }),
  issueLetter:          (data)         => api.post('/hr-admin/advanced/letters/issues', data),
  listPolicies:         (params)       => api.get('/hr-admin/advanced/policies', { params }),
  createPolicy:         (data)         => api.post('/hr-admin/advanced/policies', data),
  listPolicyAcks:       (params)       => api.get('/hr-admin/advanced/policies/acknowledgements', { params }),
  acknowledgePolicy:    (id, data)     => api.post(`/hr-admin/advanced/policies/${id}/acknowledge`, data),
  listServiceRequests:  (params)       => api.get('/hr-admin/advanced/service-requests', { params }),
  createServiceRequest: (data)         => api.post('/hr-admin/advanced/service-requests', data),
  updateServiceRequest: (id, data)     => api.patch(`/hr-admin/advanced/service-requests/${id}`, data),
  analyticsSummary:     ()             => api.get('/hr-admin/advanced/analytics/summary'),
  analyticsCharts:      ()             => api.get('/hr-admin/advanced/analytics/charts'),
  orgChart:             ()             => api.get('/hr-admin/advanced/org-chart'),
  confirmationReport:   (p)            => api.get('/hr-admin/advanced/confirmation-report', { params: p }),
  confirmEmployee:      (id, data)     => api.patch(`/hr-admin/advanced/employees/${id}/confirm`, data),
  listSegments:         ()             => api.get('/hr-admin/advanced/segments'),
  createSegment:        (data)         => api.post('/hr-admin/advanced/segments', data),
  updateSegment:        (id, data)     => api.patch(`/hr-admin/advanced/segments/${id}`, data),
  deleteSegment:        (id)           => api.delete(`/hr-admin/advanced/segments/${id}`),
  listEmpFilters:       ()             => api.get('/hr-admin/advanced/emp-filters'),
  createEmpFilter:      (data)         => api.post('/hr-admin/advanced/emp-filters', data),
  deleteEmpFilter:      (id)           => api.delete(`/hr-admin/advanced/emp-filters/${id}`),
};

export const essAPI = {
  summary:              (params)       => api.get('/ess/summary', { params }),
  attendance:           (params)       => api.get('/ess/attendance', { params }),
  attendanceCorrections:()             => api.get('/ess/attendance/corrections'),
  createCorrection:     (data)         => api.post('/ess/attendance/corrections', data),
  leaveBalances:        (params)       => api.get('/ess/leave/balances', { params }),
  leaveRequests:        ()             => api.get('/ess/leave/requests'),
  createLeaveRequest:   (data)         => api.post('/ess/leave/requests', data),
  cancelLeaveRequest:   (id)           => api.patch(`/ess/leave/requests/${id}/cancel`),
  payslips:             ()             => api.get('/ess/payslips'),
  payslip:              (id)           => api.get(`/ess/payslips/${id}`),
  managerLeaveRequests: (params)       => api.get('/ess/manager/leave-requests', { params }),
  managerLeaveAction:   (id, action, data = {}) => api.patch(`/ess/manager/leave-requests/${id}/${action}`, data),
  managerCorrections:   (params)       => api.get('/ess/manager/attendance-corrections', { params }),
  managerCorrectionAction:(id, action, data = {}) => api.patch(`/ess/manager/attendance-corrections/${id}/${action}`, data),
  assetLookup:          (code)         => api.get('/ess/assets/lookup', { params: { code } }),
  notifications:        ()             => api.get('/ess/notifications'),
  documents:            ()             => api.get('/ess/documents'),
  uploadDocument:       (file, data = {}) => { const fd = new FormData(); fd.append('file', file); Object.entries(data).forEach(([k, v]) => fd.append(k, v ?? '')); return api.post('/ess/documents', fd, multipart); },
  onboarding:           ()             => api.get('/ess/onboarding'),
  updateOnboarding:     (id, data)     => api.patch(`/ess/onboarding/${id}`, data),
};

export const notificationsAPI = {
  list:        ()   => api.get('/notifications'),            // aggregated + persisted feed
  listPersisted: () => api.get('/notifications/persistent'), // table-backed only
  markRead:    (id) => api.patch(`/notifications/${id}/read`),
  markAllRead: ()   => api.post('/notifications/mark-all-read'),
};

export const automationIdeasAPI = {
  stats:  ()        => api.get('/automation-ideas/stats'),
  list:   (params) => api.get('/automation-ideas', { params }),
  create: (data)   => api.post('/automation-ideas', data),
  update: (id, d)  => api.patch(`/automation-ideas/${id}`, d),
  remove: (id)     => api.delete(`/automation-ideas/${id}`),
};

export const approvalEngineAPI = {
  seedDefaults: ()          => api.post('/approval-engine/seed-defaults'),
  stats:        ()          => api.get('/approval-engine/stats'),
  workflows:    ()          => api.get('/approval-engine/workflows'),
  toggle:       (id, d)     => api.patch(`/approval-engine/workflows/${id}/toggle`, d),
  instances:    (params)    => api.get('/approval-engine/instances', { params }),
  pending:      ()          => api.get('/approval-engine/pending'),
  create:       (data)      => api.post('/approval-engine/instances', data),
  action:       (id, data)  => api.patch(`/approval-engine/instances/${id}/action`, data),
  history:      (id)        => api.get(`/approval-engine/instances/${id}/history`),
};

// ─── Tender Management ────────────────────────────────────────────────────────
export const tenderAPI = {
  list:           (p)       => api.get('/tenders', { params: p }),
  stats:          ()        => api.get('/tenders/stats'),
  get:            (id)      => api.get(`/tenders/${id}`),
  create:         (d)       => api.post('/tenders', d),
  update:         (id, d)   => api.put(`/tenders/${id}`, d),
  remove:         (id)      => api.delete(`/tenders/${id}`),
  publish:        (id)      => api.patch(`/tenders/${id}/publish`),
  openBids:       (id)      => api.patch(`/tenders/${id}/open-bids`),
  evaluate:       (id)      => api.patch(`/tenders/${id}/evaluate`),
  award:          (id, d)   => api.patch(`/tenders/${id}/award`, d),
  cancel:         (id, d)   => api.patch(`/tenders/${id}/cancel`, d),
  listVendors:    (id)      => api.get(`/tenders/${id}/vendors`),
  inviteVendors:  (id, d)   => api.post(`/tenders/${id}/vendors`, d),
  removeVendor:   (id, vid) => api.delete(`/tenders/${id}/vendors/${vid}`),
  listScopeItems: (id)      => api.get(`/tenders/${id}/scope-items`),
  addScopeItem:   (id, d)   => api.post(`/tenders/${id}/scope-items`, d),
  updateScopeItem:(id,iid,d)=> api.put(`/tenders/${id}/scope-items/${iid}`, d),
  removeScopeItem:(id, iid) => api.delete(`/tenders/${id}/scope-items/${iid}`),
  listDocs:       (id)      => api.get(`/tenders/${id}/documents`),
  uploadDocs:     (id, fd)  => api.post(`/tenders/${id}/documents`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  removeDoc:      (id, did) => api.delete(`/tenders/${id}/documents/${did}`),
  listBids:       (id)      => api.get(`/tenders/${id}/bids`),
  getBidComparison:(id)     => api.get(`/tenders/${id}/bids/comparison`),
  submitBid:      (id, d)   => api.post(`/tenders/${id}/bids`, d),
  updateBid:      (id,bid,d)=> api.put(`/tenders/${id}/bids/${bid}`, d),
  shortlistBid:   (id, bid) => api.patch(`/tenders/${id}/bids/${bid}/shortlist`),
  rejectBid:      (id,bid,d)=> api.patch(`/tenders/${id}/bids/${bid}/reject`, d),
};

export const bidOpportunityAPI = {
  list:           (p)       => api.get('/bid-opportunities', { params: p }),
  stats:          ()        => api.get('/bid-opportunities/stats'),
  get:            (id)      => api.get(`/bid-opportunities/${id}`),
  create:         (d)       => api.post('/bid-opportunities', d),
  update:         (id, d)   => api.put(`/bid-opportunities/${id}`, d),
  remove:         (id)      => api.delete(`/bid-opportunities/${id}`),
  transition:     (id, d)   => api.patch(`/bid-opportunities/${id}/status`, d),
  uploadDocs:     (id, fd)  => api.post(`/bid-opportunities/${id}/documents`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  removeDoc:      (id, did) => api.delete(`/bid-opportunities/${id}/documents/${did}`),
  listCostItems:  (id)      => api.get(`/bid-opportunities/${id}/cost-items`),
  saveCostItems:  (id, d)   => api.post(`/bid-opportunities/${id}/cost-items`, d),
  updateCostItem: (id,iid,d)=> api.put(`/bid-opportunities/${id}/cost-items/${iid}`, d),
  removeCostItem: (id, iid) => api.delete(`/bid-opportunities/${id}/cost-items/${iid}`),
};

export const rateContractAPI = {
  list:   ()      => api.get('/procurement/rate-contracts'),
  create: (d)     => api.post('/procurement/rate-contracts', d),
  update: (id, d) => api.patch(`/procurement/rate-contracts/${id}`, d),
  delete: (id)    => api.delete(`/procurement/rate-contracts/${id}`),
};

export const procurementAlertsAPI = {
  summary:      (params) => api.get('/procurement/alerts/summary',      { params }),
  overdue:      (params) => api.get('/procurement/alerts/overdue',      { params }),
  partial:      (params) => api.get('/procurement/alerts/partial',      { params }),
  rateVariance: (params) => api.get('/procurement/alerts/rate-variance',{ params }),
  orphanBills:  (params) => api.get('/procurement/alerts/orphan-bills', { params }),
};

export const stockVerifAPI = {
  list:      (params)    => api.get('/stock-verifications', { params }),
  get:       (id)        => api.get(`/stock-verifications/${id}`),
  create:    (d)         => api.post('/stock-verifications', d),
  update:    (id, d)     => api.patch(`/stock-verifications/${id}`, d),
  remove:    (id)        => api.delete(`/stock-verifications/${id}`),
  saveItems: (id, items) => api.put(`/stock-verifications/${id}/items`, { items }),
};

export const storesReportAPI = {
  get: (type, params) => api.get(`/stores-reports/${type}`, { params }),
};

export default api;
