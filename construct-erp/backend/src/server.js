// src/server.js
require('dotenv').config();
const { isConfigured } = require('./services/onedrive.service');
const logger = require('./utils/logger');

// OneDrive Configuration Check
if (isConfigured()) {
  logger.info('✅ OneDrive integration configured');
} else {
  logger.warn('⚠️ OneDrive integration NOT configured (check .env)');
}
require('express-async-errors'); // Automatically catch async route errors
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { pool } = require('./config/database');
// Route imports
const authRoutes = require('./routes/auth.routes');
const projectRoutes = require('./routes/project.routes');
const boqRoutes = require('./routes/boq.routes');
const boqBudgetRoutes = require('./routes/boq-budget.routes');
const measurementRoutes = require('./routes/measurement.routes');
const raBillRoutes = require('./routes/raBill.routes');
const clientAdvanceRoutes = require('./routes/client-advance.routes');
const priceEscalationRoutes = require('./routes/price-escalation.routes');
const vendorQsCertificationRoutes = require('./routes/vendor-qs-certification.routes');
const invoiceRoutes = require('./routes/invoice.routes');
const paymentRoutes = require('./routes/payment.routes');
const vendorRoutes = require('./routes/vendor.routes');
const poRoutes = require('./routes/po.routes');
const poAmendmentRoutes = require('./routes/poAmendment.routes');
const liveRatesRoutes = require('./routes/live-rates.routes');
const rateContractRoutes = require('./routes/rate-contract.routes');
const stockVerifRoutes = require('./routes/stock-verification.routes');
// grnRoutes removed — GRN features merged into IGN (grn.routes.js kept for historical data, not mounted)
const grsRoutes = require('./routes/grs.routes');
const ignRoutes = require('./routes/ign.routes');
const materialTrackerRoutes = require('./routes/material-tracker.routes');
const gatePassRoutes = require('./routes/gate-pass.routes');
const procurementAlertsRoutes = require('./routes/procurement-alerts.routes');
const creditNotesRoutes = require('./routes/credit-notes.routes');
const storesPettyCashRoutes = require('./routes/stores-petty-cash.routes');
const storesReportsRoutes  = require('./routes/stores-reports.routes');
const debitNotesRoutes = require('./routes/debit-notes.routes');
const chartOfAccountsRoutes = require('./routes/chart-of-accounts.routes');
const journalEntriesRoutes = require('./routes/journal-entries.routes');
const billAccountsRoutes = require('./routes/bill-accounts.routes');
const bankAccountsRoutes = require('./routes/bank-accounts.routes');
const companySettingsRoutes = require('./routes/company-settings.routes');
const inventoryRoutes = require('./routes/inventory.routes');
const workerRoutes = require('./routes/worker.routes');
const attendanceRoutes = require('./routes/attendance.routes');
const payrollRoutes = require('./routes/payroll.routes');
const dprRoutes      = require('./routes/dpr.routes');
const planningRoutes   = require('./routes/planning.routes');
const planningP6Routes = require('./routes/planning-p6.routes');
const incidentRoutes = require('./routes/incident.routes');
const permitRoutes = require('./routes/permit.routes');
const ppeRoutes = require('./routes/ppe.routes');
const qualityRoutes = require('./routes/quality.routes');
const { itpRouter: qualityItpRoutes, msRouter: qualityMsRoutes } = require('./routes/quality-itp.routes');
const { mirRouter: qualityMirRoutes, mtcRouter: qualityMtcRoutes } = require('./routes/quality-mir.routes');
const qualityPourRoutes = require('./routes/quality-pour.routes');
const qualityAuditRoutes = require('./routes/quality-audit.routes');
const assetRoutes = require('./routes/asset.routes');
const assetMgmtRoutes = require('./routes/asset-mgmt.routes');
const plantRoutes = require('./routes/plant.routes');
const inventoryAssetRoutes = require('./routes/inventoryAsset.routes');
const itAssetRoutes = require('./routes/itAsset.routes');
const itTicketRoutes = require('./routes/itTicket.routes');
const budgetRoutes = require('./routes/budget.routes');
const mrsRoutes = require('./routes/mrs.routes');
const minRoutes = require('./routes/min.routes');
const mtrRoutes = require('./routes/material-transfer.routes');
const engineerLogRoutes = require('./routes/engineer-log.routes');
const bookingRoutes = require('./routes/booking.routes');
const reportRoutes = require('./routes/report.routes');
const uploadRoutes        = require('./routes/upload.routes');
const syncRoutes          = require('./routes/sync.routes');
const notificationsRoutes = require('./routes/notifications.routes');
const mailRoutes          = require('./routes/mail.routes');
const indentRoutes = require('./routes/indent.routes');
const quotationRoutes = require('./routes/quotation.routes');
const subcontractorRoutes = require('./routes/subcontractor.routes');
const usersRoutes  = require('./routes/users.routes');
const licenseRoutes = require('./routes/license.routes');
const materialReconRoutes = require('./routes/materialRecon.routes');
const analyticsRoutes     = require('./routes/analytics.routes');
const variationRoutes          = require('./routes/variation.routes');
const variationStatementRoutes = require('./routes/variation-statement.routes');
const normsRoutes         = require('./routes/norms.routes');
const documentsRoutes     = require('./routes/documents.routes');
const tqsBillsRoutes         = require('./routes/tqs-bills.routes');
const tqsTrackerRoutes       = require('./routes/tqs-tracker.routes');
const tqsVendorsRoutes       = require('./routes/tqs-vendors.routes');
const tqsTransmittalRoutes   = require('./routes/tqs-transmittal.routes');
const procurementAdvanceRoutes       = require('./routes/procurement-advance.routes');
const liabilityRegisterRoutes = require('./routes/liability-register.routes');
const tdsRoutes           = require('./routes/tds.routes');
const hrMastersRoutes     = require('./routes/hr-masters.routes');
const hrEmployeesRoutes   = require('./routes/hr-employees.routes');
const hrLeaveRoutes       = require('./routes/hr-leave.routes');
const hrAttendanceRoutes  = require('./routes/hr-attendance.routes');
const hrSalaryRoutes      = require('./routes/hr-salary.routes');
const hrPayrollRoutes     = require('./routes/hr-payroll.routes');
const hrLoansRoutes       = require('./routes/hr-loans.routes');
const hrExpensesRoutes    = require('./routes/hr-expenses.routes');
const hrAppraisalsRoutes   = require('./routes/hr-appraisals.routes');
const hrEvaluationsRoutes  = require('./routes/hr-evaluations.routes');
const hrImportRoutes      = require('./routes/hr-import.routes');
const hrEsslRoutes        = require('./routes/hr-essl.routes');
const hrAdvancedRoutes    = require('./routes/hr-advanced.routes');
const hrComplianceRoutes  = require('./routes/hr-compliance.routes');
const hrShiftsRoutes      = require('./routes/hr-shifts.routes');
const hrFnfRoutes         = require('./routes/hr-fnf.routes');
const hrLettersRoutes     = require('./routes/hr-letters.routes');
const hrTrainingRoutes    = require('./routes/hr-training.routes');
const hrEmpAssetsRoutes   = require('./routes/hr-employee-assets.routes');
const hrTravelRoutes      = require('./routes/hr-travel.routes');
const hrRecruitmentRoutes = require('./routes/hr-recruitment.routes');
const essRoutes           = require('./routes/ess.routes');
const snagRoutes          = require('./routes/snag.routes');
const { tenderRouter, bidRouter } = require('./routes/tender.routes');
const tenderMgmtRoutes    = require('./routes/tender-mgmt.routes');
const scRoutes            = require('./routes/sc.routes');
const hireLogRoutes       = require('./routes/hireLog.routes');
const hireRentalRoutes    = require('./routes/hireRental.routes');
const auditLogRoutes      = require('./routes/audit-log.routes');
const rolePermissionsRoutes = require('./routes/role-permissions.routes');
const approvalsRoutes     = require('./routes/approvals.routes');
const dmsRoutes           = require('./routes/dms.routes');
const gfcRoutes           = require('./routes/gfc.routes');
const subMgmtRoutes       = require('./routes/subcontractor-mgmt.routes');
const retentionRoutes             = require('./routes/retention.routes');
const chatRoutes                  = require('./routes/chat.routes');
const ocrRoutes                   = require('./routes/ocr.routes');
const pettyCashRoutes             = require('./routes/petty-cash.routes');
const automationIdeasRoutes       = require('./routes/automation-ideas.routes');
const approvalEngineRoutes        = require('./routes/approval-engine.routes');
const ewayBillRoutes              = require('./routes/ewayBill.routes');
const searchRoutes                = require('./routes/search.routes');

const http   = require('http');
const { Server: SocketIO } = require('socket.io');
const jwt    = require('jsonwebtoken');

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 5000;
const extraAllowedOrigins = [
  'http://bcim.ddns.net:3000',
  'https://bcim.ddns.net:3000',
];

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (extraAllowedOrigins.includes(origin)) return true;
  if (/^https?:\/\/localhost(:\d+)?\/?$/.test(origin)) return true;
  if (/^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(origin)) return true;
  if (origin.endsWith('.vercel.app')) return true;
  if (origin.endsWith('.up.railway.app') || origin.endsWith('.railway.app')) return true;
  if (process.env.FRONTEND_URL && origin.startsWith(process.env.FRONTEND_URL)) return true;
  return false;
};

// ============================================
// MIDDLEWARE
// ============================================

// Security headers
// CSP is disabled: the React SPA uses Vite's type="module" crossorigin scripts
// which need 'unsafe-inline' or a nonce-based CSP — not worth the complexity for
// an internal ERP. All other Helmet protections (HSTS, X-Frame, etc.) stay on.
app.use(helmet({
  // App runs on HTTP (not HTTPS) — disable headers that only work on HTTPS
  // and cause browser console warnings on plain HTTP origins
  crossOriginResourcePolicy:    { policy: 'cross-origin' },
  contentSecurityPolicy:        false,  // React/Vite scripts need this off
  crossOriginOpenerPolicy:      false,  // requires HTTPS — ignore on HTTP
  crossOriginEmbedderPolicy:    false,  // requires HTTPS — ignore on HTTP
  originAgentCluster:           false,  // suppresses "site-keyed agent cluster" warning
  strictTransportSecurity:      false,  // HSTS only applies to HTTPS
}));

// CORS
app.use(cors({
  origin: (origin, cb) => {
    if (isAllowedOrigin(origin)) return cb(null, true);
    // no origin = same-origin requests (production), curl, mobile apps
    if (!origin) return cb(null, true);
    // any localhost port — allow in dev
    if (/^https?:\/\/localhost(:\d+)?\/?$/.test(origin)) return cb(null, true);
    // LAN / local network IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
    if (/^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(origin)) return cb(null, true);
    // any Vercel preview or production deploy
    if (origin.endsWith('.vercel.app')) return cb(null, true);
    // Railway deployments
    if (origin.endsWith('.up.railway.app') || origin.endsWith('.railway.app')) return cb(null, true);
    // explicit production frontend URL
    if (process.env.FRONTEND_URL && origin.startsWith(process.env.FRONTEND_URL)) return cb(null, true);
    cb(new Error(`CORS: ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Compression
app.use(compression());

// Request logging
app.use(morgan('combined', {
  stream: { write: msg => logger.info(msg.trim()) }
}));

// Trust Railway/Nginx reverse proxy — required for express-rate-limit to
// correctly read the client IP from X-Forwarded-For
app.set('trust proxy', 1);

// Body parsing — increased limit for large file uploads (DMS, documents)
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Static file serving (uploads) — authenticated only
// Requires a valid JWT so private documents cannot be hot-linked
const { authenticate } = require('./middleware/auth');
app.use('/uploads', authenticate, express.static(path.join(__dirname, '../uploads')));
// If express.static didn't find the file it calls next() — catch it here so
// the React catch-all doesn't return index.html with a 200 status
app.use('/uploads', (req, res) => res.status(404).json({ error: 'File not found or has been deleted' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 500,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Auth-specific limiter (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 200,                   // raised: small team + dev environment
  message: { error: 'Too many login attempts, try again in 15 minutes.' }
});

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      db: 'connected',
      version: '3.0.0',
      service: 'ConstructERP India'
    });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', db: 'disconnected', error: err.message });
  }
});

// ============================================
// API ROUTES
// ============================================

const API = '/api/v1';

// Auth
app.use(`${API}/auth`, authLimiter, authRoutes);

// Core
app.use(`${API}/projects`, projectRoutes);

// QS Module
app.use(`${API}/boq`, boqRoutes);
app.use(`${API}/boq-budget`, boqBudgetRoutes);
app.use(`${API}/measurements`, measurementRoutes);
app.use(`${API}/ra-bills`, raBillRoutes);
app.use(`${API}/client-advances`, clientAdvanceRoutes);
app.use(`${API}/price-escalations`, priceEscalationRoutes);
app.use(`${API}/vendor-qs-certifications`, vendorQsCertificationRoutes);
app.use(`${API}/material-recon`, materialReconRoutes);
app.use(`${API}/variations`, variationRoutes);
app.use(`${API}/variation-statements`, variationStatementRoutes);
app.use(`${API}/norms`, normsRoutes);

// Finance
app.use(`${API}/invoices`, invoiceRoutes);
app.use(`${API}/payments`, paymentRoutes);
app.use(`${API}/tds`, tdsRoutes);

// Procurement
app.use(`${API}/vendors`, vendorRoutes);
app.use(`${API}/indents`, indentRoutes);
app.use(`${API}/quotations`, quotationRoutes);
app.use(`${API}/purchase-orders`, poRoutes);
app.use(`${API}/procurement/po-amendments`, poAmendmentRoutes);
app.use(`${API}/procurement/live-rates`, liveRatesRoutes);
app.use(`${API}/procurement/rate-contracts`, rateContractRoutes);
app.use(`${API}/stock-verifications`, stockVerifRoutes);
// GRN route removed — /api/v1/grn no longer served; features merged into IGN
app.use(`${API}/grs`, grsRoutes);
app.use(`${API}/ign`, ignRoutes);
app.use(`${API}/material-tracker`, materialTrackerRoutes);
app.use(`${API}/gate-passes`, gatePassRoutes);
app.use(`${API}/procurement/alerts`, procurementAlertsRoutes);
app.use(`${API}/credit-notes`, creditNotesRoutes);
app.use(`${API}/stores-petty-cash`, storesPettyCashRoutes);
app.use(`${API}/debit-notes`, debitNotesRoutes);
app.use(`${API}/chart-of-accounts`, chartOfAccountsRoutes);
app.use(`${API}/journal-entries`, journalEntriesRoutes);
app.use(`${API}/bill-accounts`, billAccountsRoutes);
app.use(`${API}/bank-accounts`, bankAccountsRoutes);
app.use(`${API}/company-settings`, companySettingsRoutes);
app.use(`${API}/inventory`, inventoryRoutes);
app.use(`${API}/subcontractors`, subcontractorRoutes);

// Site & HR
app.use(`${API}/workers`, workerRoutes);
app.use(`${API}/attendance`, attendanceRoutes);
app.use(`${API}/payroll`, payrollRoutes);
app.use(`${API}/dpr`,      dprRoutes);
app.use(`${API}/planning`,    planningRoutes);
app.use(`${API}/planning-p6`, planningP6Routes);

// HSE & Quality
app.use(`${API}/incidents`, incidentRoutes);
app.use(`${API}/permits`, permitRoutes);
app.use(`${API}/ppe`, ppeRoutes);
app.use(`${API}/quality`, qualityRoutes);
app.use(`${API}/quality/itp`, qualityItpRoutes);
app.use(`${API}/quality/method-statements`, qualityMsRoutes);
app.use(`${API}/quality/mir`, qualityMirRoutes);
app.use(`${API}/quality/mtc`, qualityMtcRoutes);
app.use(`${API}/quality/pour-cards`, qualityPourRoutes);
app.use(`${API}/quality/audits`, qualityAuditRoutes);
app.use(`${API}/snags`, snagRoutes);

// Assets
app.use(`${API}/assets`, assetRoutes);
app.use(`${API}/asset-mgmt`, assetMgmtRoutes);
app.use(`${API}/plant`, plantRoutes);
app.use(`${API}/inventory-assets`, inventoryAssetRoutes);

// IT
app.use(`${API}/it-assets`, itAssetRoutes);
app.use(`${API}/it-tickets`, itTicketRoutes);
app.use(`${API}/licenses`, licenseRoutes);

// Budget
app.use(`${API}/budget`, budgetRoutes);

// Stores
app.use(`${API}/stores/mrs`, mrsRoutes);
app.use(`${API}/stores/min`, minRoutes);
app.use(`${API}/stores/mtr`, mtrRoutes);
app.use(`${API}/stores-reports`, storesReportsRoutes);
app.use(`${API}/engineer-logs`, engineerLogRoutes);

// CRM
app.use(`${API}/bookings`, bookingRoutes);

// Reports & Strategic Analytics
app.use(`${API}/reports`, reportRoutes);
app.use(`${API}/analytics`, analyticsRoutes);

// File upload
app.use(`${API}/upload`, uploadRoutes);
// Backward-compatible upload endpoint used by older built pages/modules.
app.use('/api/upload', uploadRoutes);

// Documents (cross-module, OneDrive-backed)
app.use(`${API}/documents`, documentsRoutes);

// Mail test endpoint (admin only) — POST /api/mail/test { email }
app.post(`${API}/mail/test`, require('./middleware/auth').authenticate, async (req, res) => {
  const { sendTestMail, isGraphConfigured, isSmtpConfigured } = require('./services/mail.service');
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email is required' });
  const provider = isGraphConfigured() ? 'graph' : isSmtpConfigured() ? 'smtp' : 'none';
  if (provider === 'none') {
    return res.status(503).json({ error: 'No mail provider configured. Set Azure Graph or SMTP variables in .env' });
  }
  try {
    const result = await sendTestMail(email);
    res.json({ ok: result.sent, provider: result.provider, reason: result.reason });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// WhatsApp test endpoint (admin only) — POST /api/whatsapp/test { phone, message }
app.post(`${API}/whatsapp/test`, require('./middleware/auth').authenticate, (req, res) => {
  const wa = require('./services/whatsapp.service');
  if (!wa.isConfigured()) return res.status(503).json({ error: 'Twilio not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM in .env' });
  const { phone, message } = req.body;
  if (!phone || !message) return res.status(400).json({ error: 'phone and message are required' });
  wa.sendWhatsApp(`whatsapp:${phone}`, message)
    .then(() => res.json({ ok: true, to: phone }))
    .catch(err => res.status(500).json({ error: err.message }));
});

// DQS Invoice Tracker
app.use(`${API}/tqs/bills`, tqsBillsRoutes);
app.use(`${API}/tqs/material-tracker`, tqsTrackerRoutes);
app.use(`${API}/tqs/vendors`,          tqsVendorsRoutes);
app.use(`${API}/tqs/transmittals`,     tqsTransmittalRoutes);
app.use(`${API}/procurement/advances`,           procurementAdvanceRoutes);
app.use(`${API}/tqs/liability-register`, liabilityRegisterRoutes);

// DQS Sync (no JWT — key-based, for cross-app data sharing)
app.use(`${API}/sync`, syncRoutes);

// Notifications (live alerts from all modules)
app.use(`${API}/notifications`, notificationsRoutes);

// Mail diagnostics (admin only)
app.use(`${API}/mail`, mailRoutes);

// HR & Admin Module (salaried permanent employees)
app.use(`${API}/hr-admin/masters`,     hrMastersRoutes);
app.use(`${API}/hr-admin/employees`,   hrEmployeesRoutes);
app.use(`${API}/hr-admin/leave`,       hrLeaveRoutes);
app.use(`${API}/hr-admin/attendance`,  hrAttendanceRoutes);
app.use(`${API}/hr-admin/salary`,      hrSalaryRoutes);
app.use(`${API}/hr-admin/payroll`,     hrPayrollRoutes);
app.use(`${API}/hr-admin/loans`,       hrLoansRoutes);
app.use(`${API}/hr-admin/expenses`,    hrExpensesRoutes);
app.use(`${API}/hr-admin/appraisals`,   hrAppraisalsRoutes);
app.use(`${API}/hr-admin/evaluations`,  hrEvaluationsRoutes);
app.use(`${API}/hr-admin/import`,      hrImportRoutes);
app.use(`${API}/hr-admin/essl`,        hrEsslRoutes);
app.use(`${API}/hr-admin/advanced`,    hrAdvancedRoutes);
app.use(`${API}/hr-admin/compliance`, hrComplianceRoutes);
app.use(`${API}/hr-admin/shifts`,      hrShiftsRoutes);
app.use(`${API}/hr-admin/fnf`,         hrFnfRoutes);
app.use(`${API}/hr-admin/letters`,     hrLettersRoutes);
app.use(`${API}/hr-admin/training`,    hrTrainingRoutes);
app.use(`${API}/hr-admin/emp-assets`,  hrEmpAssetsRoutes);
app.use(`${API}/hr-admin/travel`,      hrTravelRoutes);
app.use(`${API}/hr-admin/recruitment`, hrRecruitmentRoutes);
app.use(`${API}/ess`,                  essRoutes);

// Tender Management
app.use(`${API}/tenders`,             tenderRouter);
app.use(`${API}/tender-mgmt`,         tenderMgmtRoutes);
app.use(`${API}/sc`,                  scRoutes);
app.use(`${API}/hire-log`,            hireLogRoutes);
app.use(`${API}/hire-rental`,         hireRentalRoutes);
app.use(`${API}/audit-log`,           auditLogRoutes);
app.use(`${API}/role-permissions`,    rolePermissionsRoutes);
app.use(`${API}/approvals`,           approvalsRoutes);
app.use(`${API}/dms`,                 dmsRoutes);
app.use(`${API}/gfc`,                 gfcRoutes);
app.use(`${API}/subcontractor-mgmt`,  subMgmtRoutes);
app.use(`${API}/bid-opportunities`,   bidRouter);
app.use(`${API}/retention-releases`,  retentionRoutes);
app.use(`${API}/eway-bills`,          ewayBillRoutes);

// User / Team Management
app.use(`${API}/users`, usersRoutes);

// ERP Chat
app.use(`${API}/chat`,       chatRoutes);
app.use(`${API}/ocr`,        ocrRoutes);
app.use(`${API}/petty-cash`, pettyCashRoutes);
app.use(`${API}/automation-ideas`, automationIdeasRoutes);
app.use(`${API}/approval-engine`, approvalEngineRoutes);
app.use(`${API}/search`, searchRoutes);

// ============================================
// SOCKET.IO — Real-time Chat
// ============================================
const io = new SocketIO(server, {
  cors: {
    origin: (origin, cb) => {
      if (isAllowedOrigin(origin)) return cb(null, true);
      cb(new Error(`CORS: ${origin} not allowed`));
    },
    credentials: true,
  },
});

// Auth middleware for Socket.IO
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) return next(new Error('No token'));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded?.id) return next(new Error('Invalid token'));
    socket.user = decoded;
    next();
  } catch (e) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  logger.info(`💬 Chat: ${socket.user?.name || socket.user?.id} connected`);

  // Join a channel room
  socket.on('join_channel', (channel) => {
    socket.rooms.forEach(r => { if (r !== socket.id) socket.leave(r); });
    socket.join(channel);
    socket.currentChannel = channel;
  });

  // New message — broadcast to everyone in the channel
  socket.on('send_message', (msg) => {
    // msg already saved via REST POST, just broadcast to others
    socket.to(msg.channel).emit('new_message', msg);
  });

  // Pin toggle
  socket.on('pin_message', ({ id, channel, pinned }) => {
    socket.to(channel).emit('message_pinned', { id, pinned });
  });

  // Reaction
  socket.on('react_message', ({ id, channel, reactions }) => {
    socket.to(channel).emit('message_reacted', { id, reactions });
  });

  // Typing indicator
  socket.on('typing', ({ channel, name }) => {
    socket.to(channel).emit('user_typing', { name });
  });
  socket.on('stop_typing', ({ channel }) => {
    socket.to(channel).emit('user_stop_typing');
  });

  socket.on('disconnect', () => {
    logger.info(`💬 Chat: ${socket.user?.name || socket.user?.id} disconnected`);
  });
});

// ============================================
// SERVE REACT FRONTEND (production)
// ============================================
if (process.env.NODE_ENV === 'production') {
  const buildPath = path.join(__dirname, '../../frontend/build');
  app.use(express.static(buildPath));
  // All non-API routes → React index.html (client-side routing)
  app.get('*', (req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
  });
}

// ============================================
// ERROR HANDLING
// ============================================

// 404 (only reached in dev — production falls through to React above)
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.url} not found` });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error(`${err.status || 500} — ${err.message} — ${req.originalUrl}`);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ============================================
// START SERVER
// ============================================

async function runAutoMigrations() {
  const client = await pool.connect();
  try {
    // 003: PO Register fields
    await client.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(200)`);
    await client.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS tcs_amount NUMERIC(15,2) DEFAULT 0`);
    await client.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS po_req_no VARCHAR(100)`);
    await client.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS po_req_date DATE`);
    await client.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS approval_no VARCHAR(100)`);
    await client.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS delivery_address TEXT`);
    await client.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS order_intro TEXT`);
    await client.query(`ALTER TABLE po_items ADD COLUMN IF NOT EXISTS req_date DATE`);
    // 004: Cost head on PO + WO
    await client.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS cost_head VARCHAR(100)`);
    await client.query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS cost_head VARCHAR(100)`);
    await client.query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS rejection_reason TEXT`);
    // 005: Backfill missing tqs_bill_updates rows
    await client.query(`
      INSERT INTO tqs_bill_updates (bill_id, balance_to_pay, certified_net)
      SELECT b.id, b.total_amount,
        CASE WHEN b.workflow_status IN ('qs','accounts','paid','procurement') THEN b.total_amount ELSE 0 END
      FROM tqs_bills b
      LEFT JOIN tqs_bill_updates u ON u.bill_id = b.id
      WHERE u.bill_id IS NULL AND b.is_deleted = FALSE
    `);
    // 033: RA Bill enhancements — GST split, Labour Cess, Section E
    await client.query(`ALTER TABLE sc_bills ADD COLUMN IF NOT EXISTS is_igst BOOLEAN DEFAULT FALSE`);
    await client.query(`ALTER TABLE sc_bills ADD COLUMN IF NOT EXISTS cgst_amount NUMERIC(18,2) DEFAULT 0`);
    await client.query(`ALTER TABLE sc_bills ADD COLUMN IF NOT EXISTS sgst_amount NUMERIC(18,2) DEFAULT 0`);
    await client.query(`ALTER TABLE sc_bills ADD COLUMN IF NOT EXISTS igst_amount NUMERIC(18,2) DEFAULT 0`);
    await client.query(`ALTER TABLE sc_bills ADD COLUMN IF NOT EXISTS labour_cess_amount NUMERIC(18,2) DEFAULT 0`);
    await client.query(`ALTER TABLE sc_bills ADD COLUMN IF NOT EXISTS retention_release_amount NUMERIC(18,2) DEFAULT 0`);
    await client.query(`ALTER TABLE sc_bills ADD COLUMN IF NOT EXISTS credit_note_amount NUMERIC(18,2) DEFAULT 0`);
    await client.query(`
      UPDATE sc_bills
         SET cgst_amount = ROUND(gst_amount / 2, 2),
             sgst_amount = gst_amount - ROUND(gst_amount / 2, 2)
       WHERE is_igst = FALSE AND gst_amount > 0 AND cgst_amount = 0
    `);
    // 034: SC P3 — query status, QA clearance, IPC table
    await client.query(`ALTER TABLE sc_bills ADD COLUMN IF NOT EXISTS query_remarks TEXT`);
    await client.query(`ALTER TABLE sc_mb_entries ADD COLUMN IF NOT EXISTS qaqc_cleared     BOOLEAN DEFAULT FALSE`);
    await client.query(`ALTER TABLE sc_mb_entries ADD COLUMN IF NOT EXISTS qaqc_cleared_by  UUID REFERENCES users(id)`);
    await client.query(`ALTER TABLE sc_mb_entries ADD COLUMN IF NOT EXISTS qaqc_cleared_at  TIMESTAMPTZ`);
    await client.query(`ALTER TABLE sc_mb_entries ADD COLUMN IF NOT EXISTS qaqc_remarks     TEXT`);
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.check_constraints
          WHERE constraint_schema=current_schema() AND constraint_name='sc_bills_status_check'
            AND check_clause LIKE '%queried%'
        ) THEN
          ALTER TABLE sc_bills DROP CONSTRAINT IF EXISTS sc_bills_status_check;
          ALTER TABLE sc_bills ADD CONSTRAINT sc_bills_status_check
            CHECK (status IN ('draft','submitted','under_review','queried','approved','rejected','paid'));
        END IF;
      END $$`);
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.check_constraints
          WHERE constraint_schema=current_schema() AND constraint_name='sc_bill_approvals_action_check'
            AND check_clause LIKE '%queried%'
        ) THEN
          ALTER TABLE sc_bill_approvals DROP CONSTRAINT IF EXISTS sc_bill_approvals_action_check;
          ALTER TABLE sc_bill_approvals ADD CONSTRAINT sc_bill_approvals_action_check
            CHECK (action IN ('submitted','approved','rejected','revised','queried'));
        END IF;
      END $$`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS sc_ipcs (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        project_id       UUID REFERENCES projects(id),
        wo_id            UUID NOT NULL REFERENCES sc_work_orders(id),
        sc_id            UUID NOT NULL REFERENCES sc_subcontractors(id),
        bill_id          UUID NOT NULL REFERENCES sc_bills(id) UNIQUE,
        ipc_number       VARCHAR(60) NOT NULL,
        ipc_date         DATE NOT NULL DEFAULT CURRENT_DATE,
        gross_amount     NUMERIC(18,2) DEFAULT 0,
        net_payable      NUMERIC(18,2) DEFAULT 0,
        gst_amount       NUMERIC(18,2) DEFAULT 0,
        tds_amount       NUMERIC(18,2) DEFAULT 0,
        retention_amount NUMERIC(18,2) DEFAULT 0,
        notes            TEXT,
        status           VARCHAR(20) DEFAULT 'issued',
        approved_by      UUID REFERENCES users(id),
        approved_at      TIMESTAMPTZ,
        created_at       TIMESTAMPTZ DEFAULT NOW(),
        updated_at       TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (company_id, ipc_number)
      )`);
    // 034 P4 DLP fields
    await client.query(`ALTER TABLE sc_work_orders ADD COLUMN IF NOT EXISTS dlp_end_date DATE`);
    await client.query(`ALTER TABLE sc_work_orders ADD COLUMN IF NOT EXISTS dlp_months SMALLINT DEFAULT 12`);
    // 035 P5 WO Closure columns
    await client.query(`ALTER TABLE sc_work_orders ADD COLUMN IF NOT EXISTS closed_by       UUID REFERENCES users(id)`);
    await client.query(`ALTER TABLE sc_work_orders ADD COLUMN IF NOT EXISTS closed_at       TIMESTAMPTZ`);
    await client.query(`ALTER TABLE sc_work_orders ADD COLUMN IF NOT EXISTS closure_remarks TEXT`);
    // 036 Client advance received on project
    await client.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_advance_received NUMERIC(15,2) DEFAULT 0`);
    // 037 Per-item GST rate on Work Orders (mirrors po_items.gst_rate)
    await client.query(`ALTER TABLE work_order_items ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5,2) DEFAULT 18`);
    // 037b Line-item display order on Work Orders (preserve the order items were entered/reordered)
    await client.query(`ALTER TABLE work_order_items ADD COLUMN IF NOT EXISTS sequence_no INTEGER`);
    // 038 Head-wise material master fields on inventory
    await client.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS major_head VARCHAR(50)`);
    await client.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS dc_idc     VARCHAR(10)`);
    await client.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS remarks    TEXT`);
    // 039 Payroll COA codes — salary/PF/ESI liability and expense accounts
    await client.query(`
      INSERT INTO chart_of_accounts (company_id, code, name, account_type, sub_type)
      SELECT c.id, v.code, v.name, v.account_type, v.sub_type
      FROM companies c
      CROSS JOIN (VALUES
        ('2400','Salary Payable',            'liability','Current Liability'),
        ('2410','EPF Payable',               'liability','Current Liability'),
        ('2420','ESI Payable',               'liability','Current Liability'),
        ('2430','Professional Tax Payable',  'liability','Current Liability'),
        ('2440','Employee Deductions Payable','liability','Current Liability'),
        ('6010','EPF Employer Contribution', 'expense',  'Indirect Expense'),
        ('6020','ESI Employer Contribution', 'expense',  'Indirect Expense')
      ) AS v(code, name, account_type, sub_type)
      ON CONFLICT (company_id, code) DO NOTHING
    `);
    // 040 Menu-level permissions per user
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS accessible_menus JSONB`);
    logger.info('✅ Auto-migrations complete (003–040)');
  } catch (err) {
    logger.warn('⚠️  Auto-migration warning:', err.message);
  } finally {
    client.release();
  }
}

if (require.main === module) {
  if (process.env.CLEAR_SESSIONS_ON_STARTUP === 'true') {
    pool.query('DELETE FROM refresh_tokens').catch(() => {});
    logger.warn('All sessions cleared on startup because CLEAR_SESSIONS_ON_STARTUP=true');
  }

  // Run pending schema migrations before accepting requests
  runAutoMigrations()
    .catch(err => logger.warn('Migration error:', err.message))
    .finally(() => {
  server.listen(PORT, () => {
    logger.info(`🚀 ConstructERP API running on port ${PORT}`);
    logger.info(`📍 Environment: ${process.env.NODE_ENV}`);
    logger.info(`🏗  India v3.0 — 12 modules active`);
    logger.info(`💬 Socket.IO chat server ready`);
    logger.info('Session persistence enabled');

    const { initBackupService } = require('./utils/backup.service');
    initBackupService();

    const { initLiabilityAutomation } = require('./utils/liability-automation.service');
    initLiabilityAutomation();

    const { initTodayBillAlert } = require('./utils/today-bill-alert.service');
    initTodayBillAlert();

    const { initMdApprovalDigest } = require('./utils/md-approval-digest.service');
    initMdApprovalDigest();

    const { initDailyActivityDigest } = require('./utils/daily-activity-digest.service');
    initDailyActivityDigest();
  });
  }); // end .finally()
}

module.exports = app;
module.exports.app = app;
module.exports.server = server;
module.exports.io = io;


