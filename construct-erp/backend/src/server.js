// src/server.js
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
// Ensure uploads directory exists (Railway ephemeral FS won't have it after deploy)
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

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
const estimatesRoutes = require('./routes/estimates.routes');
const recurringInvoicesRoutes = require('./routes/recurring-invoices.routes');
const recurringBillsRoutes = require('./routes/recurring-bills.routes');
const chartOfAccountsRoutes = require('./routes/chart-of-accounts.routes');
const journalEntriesRoutes = require('./routes/journal-entries.routes');
const billAccountsRoutes = require('./routes/bill-accounts.routes');
const bankAccountsRoutes = require('./routes/bank-accounts.routes');
const companySettingsRoutes = require('./routes/company-settings.routes');
const inventoryRoutes = require('./routes/inventory.routes');
const workerRoutes = require('./routes/worker.routes');
const attendanceRoutes = require('./routes/attendance.routes');
const payrollRoutes = require('./routes/payroll.routes');
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
const copilotRoutes           = require('./routes/copilot.routes');
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
const paymentRecommendationsRoutes = require('./routes/payment-recommendations.routes');
const supplyTrackerRoutes = require('./routes/supply-tracker.routes');
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

// ── Data migration: move 13 bills to DQS Tower project ───────────────────────
const { runSchemaInit } = require('./utils/schemaInit');
const { query: dbQuery } = require('./config/database');

// Extract the numeric parts: ['511','516','321','534','540','607','612','623','672','673','785','796','797']
const DQS_BILL_SERIALS = ['511','516','321','534','540','607','612','623','672','673','785','796','797'];

// Delete the two duplicate bills that have 'IN/' prefix in inv_number (PO-429, PO-430)
runSchemaInit('data_migration_delete_in_prefix_duplicates_2026', async () => {
  const res = await dbQuery(
    `UPDATE tqs_bills SET is_deleted = true, updated_at = NOW()
     WHERE inv_number LIKE 'IN/%'
       AND inv_number IN ('IN/00511/26-27','IN/00516/26-27')
       AND is_deleted = false`
  );
  console.log(`[migration] Soft-deleted ${res.rowCount} IN/ prefix duplicate bill(s)`);
});

// Rename inv_number 00511/26-27 → IN/00511/26-27 and 00516/26-27 → IN/00516/26-27
runSchemaInit('data_migration_rename_00516_to_in_prefix_2026', async () => {
  const res = await dbQuery(
    `UPDATE tqs_bills SET inv_number = 'IN/00516/26-27', updated_at = NOW()
     WHERE inv_number = '00516/26-27' AND is_deleted = false`
  );
  console.log(`[migration] Renamed 00516/26-27 → IN/00516/26-27 (${res.rowCount} row)`);
});

// Rename inv_number 00511/26-27 → IN/00511/26-27 (user correction 2026-07-10)
runSchemaInit('data_migration_rename_00511_to_in_prefix_2026', async () => {
  const res = await dbQuery(
    `UPDATE tqs_bills SET inv_number = 'IN/00511/26-27', updated_at = NOW()
     WHERE inv_number = '00511/26-27' AND is_deleted = false`
  );
  console.log(`[migration] Renamed 00511/26-27 → IN/00511/26-27 (${res.rowCount} row)`);
});

runSchemaInit('data_migration_bills_to_dqs_tower_2026_v2', async () => {
  const projRes = await dbQuery(
    `SELECT id, name FROM projects WHERE LOWER(name) LIKE '%dqs%' ORDER BY name LIMIT 1`
  );
  if (!projRes.rows.length) {
    console.warn('[migration-dqs] DQS Tower project not found — skipping');
    return;
  }
  const dqsId   = projRes.rows[0].id;
  const dqsName = projRes.rows[0].name;

  // Diagnostic: find bills matching any of the serial numbers in sl_number or inv_number
  const diagRes = await dbQuery(
    `SELECT id, sl_number, inv_number, vendor_name, project_id,
            (SELECT name FROM projects WHERE id = tqs_bills.project_id) AS current_project
       FROM tqs_bills
      WHERE is_deleted = false
        AND (
          REGEXP_REPLACE(COALESCE(sl_number,''), '[^0-9]', '', 'g') = ANY($1)
          OR REGEXP_REPLACE(COALESCE(inv_number,''), '[^0-9/\\-]', '', 'g') = ANY($2)
        )`,
    [
      DQS_BILL_SERIALS,
      ['00511/26-27','00516/26-27','00321/26-27','00534/26-27','00540/26-27',
       '00607/26-27','00612/26-27','00623/26-27','00672/26-27','00673/26-27',
       '00785/26-27','00796/26-27','00797/26-27'],
    ]
  );
  console.log(`[migration-dqs] Diagnostic — found ${diagRes.rows.length} candidate bill(s):`);
  diagRes.rows.forEach(r =>
    console.log(`  sl=${r.sl_number} | inv=${r.inv_number} | vendor=${r.vendor_name} | project=${r.current_project}`)
  );

  // Move ALL candidate bills to DQS Tower (not yet there)
  const toMove = diagRes.rows.filter(r => r.project_id !== dqsId).map(r => r.id);
  if (toMove.length) {
    const updRes = await dbQuery(
      `UPDATE tqs_bills SET project_id = $1 WHERE id = ANY($2)`,
      [dqsId, toMove]
    );
    console.log(`[migration-dqs] Moved ${updRes.rowCount} bill(s) → "${dqsName}" (${dqsId})`);
  } else {
    console.log(`[migration-dqs] All candidate bills already in "${dqsName}" — nothing to move`);
  }

  // Also try exact match on the original number strings
  const exactRes = await dbQuery(
    `UPDATE tqs_bills SET project_id = $1
     WHERE (sl_number = ANY($2) OR inv_number = ANY($2))
       AND project_id IS DISTINCT FROM $1
       AND is_deleted = false`,
    [dqsId, ['00511/26-27','00516/26-27','00321/26-27','00534/26-27','00540/26-27',
              '00607/26-27','00612/26-27','00623/26-27','00672/26-27','00673/26-27',
              '00785/26-27','00796/26-27','00797/26-27']]
  );
  if (exactRes.rowCount)
    console.log(`[migration-dqs] Exact-match also moved ${exactRes.rowCount} additional bill(s)`);
});
// ─────────────────────────────────────────────────────────────────────────────

const http   = require('http');
const { Server: SocketIO } = require('socket.io');
const jwt    = require('jsonwebtoken');

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 5000;
// erp.bcim.in is the only production frontend (confirmed 2026-07 — nothing
// else calls this backend from a raw *.railway.app URL), so the blanket
// *.up.railway.app / *.railway.app wildcard below was broader than needed:
// with credentials:true, ANY tenant's free Railway deploy could otherwise
// issue a matching-origin credentialed request. Prod + dev/LAN access is now
// via this explicit allowlist instead of a wildcard.
const extraAllowedOrigins = [
  'http://bcim.ddns.net:3000',
  'https://bcim.ddns.net:3000',
  'https://erp.bcim.in',
];

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (extraAllowedOrigins.includes(origin)) return true;
  if (/^https?:\/\/localhost(:\d+)?\/?$/.test(origin)) return true;
  if (/^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(origin)) return true;
  // Vercel: only allow the specific team slug or an explicit env var override
  // (a bare *.vercel.app wildcard lets ANY Vercel deploy make credentialed requests)
  const vercelSlug = process.env.VERCEL_DEPLOY_SLUG; // e.g. "bcim-con-erp"
  if (vercelSlug && origin.includes(`.vercel.app`) && origin.includes(vercelSlug)) return true;
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
// (This callback used to re-list every localhost/LAN/Vercel/Railway/
// FRONTEND_URL check a second time below isAllowedOrigin(origin) — all dead
// code, since isAllowedOrigin already covers each of those cases and returns
// early. isAllowedOrigin is the single source of truth now.)
app.use(cors({
  origin: (origin, cb) => {
    if (isAllowedOrigin(origin)) return cb(null, true);
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
// /uploads sits outside the /api/ prefix so the general limiter below never
// covered it — an authenticated client could otherwise hammer disk reads
// with no throttle at all. Generous limit since legit DMS/document pages can
// legitimately load many attachments in a normal session.
const uploadsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { error: 'Too many file requests, please try again later.' }
});
app.use('/uploads', uploadsLimiter, authenticate, express.static(path.join(__dirname, '../uploads')));
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
// Auth rate limiter removed — private office ERP, shared IP causes false lockouts

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
app.use(`${API}/auth`, authRoutes);

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
app.use(`${API}/estimates`, estimatesRoutes);
app.use(`${API}/recurring-invoices`, recurringInvoicesRoutes);
app.use(`${API}/recurring-bills`, recurringBillsRoutes);
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
app.use(`${API}/copilot`, copilotRoutes);

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
app.use(`${API}/hr-admin/fnf`,         hrFnfRoutes);
app.use(`${API}/hr-admin/letters`,     hrLettersRoutes);
app.use(`${API}/hr-admin/training`,    hrTrainingRoutes);
app.use(`${API}/hr-admin/emp-assets`,  hrEmpAssetsRoutes);
app.use(`${API}/hr-admin/travel`,      hrTravelRoutes);
app.use(`${API}/hr-admin/recruitment`, hrRecruitmentRoutes);
// Shifts router defines its paths as /shifts, /employee-shifts, /overtime,
// /comp-off — mounting it at /hr-admin/shifts produced /hr-admin/shifts/shifts
// etc., so every frontend call (which uses /hr-admin/shifts, /hr-admin/overtime,
// ...) 404'd. Mounted last among hr-admin routers so the specific mounts above
// keep first match.
app.use(`${API}/hr-admin`,             hrShiftsRoutes);
app.use(`${API}/ess`,                  essRoutes);

// Tender Management
app.use(`${API}/tenders`,             tenderRouter);
app.use(`${API}/tender-mgmt`,         tenderMgmtRoutes);
app.use(`${API}/sc`,                  scRoutes);
app.use(`${API}/hire-log`,            hireLogRoutes);
app.use(`${API}/hire-rental`,         hireRentalRoutes);
app.use(`${API}/payment-recommendations`, paymentRecommendationsRoutes);
app.use(`${API}/supply-tracker`,      supplyTrackerRoutes);
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

// GET /api/v1/chat/pending-call — returns the stored call:offer for this user (if any, not expired).
// Called by the mobile app after it wakes from an FCM incoming-call push notification.
const { authenticate: authMw } = require('./middleware/auth');
app.get(`${API}/chat/pending-call`, authMw, (req, res) => {
  const entry = getPendingCall(req.user.id);
  if (!entry) return res.json({ pending: null });
  res.json({ pending: entry });
});

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

// Fixed channel list (must match CHANNELS in frontend/src/pages/ERPChat.jsx).
// Every socket joins ALL of these on connect so unread badges and desktop
// notifications work for channels the user isn't currently viewing — the
// client filters by msg.channel to decide what to render vs. what to notify.
const CHAT_CHANNELS = [
  'general', 'finance', 'procurement', 'stores', 'qs-billing', 'tqs',
  'hr', 'planning', 'quality', 'subcontractors', 'tender', 'it-support',
];

// Pending call store — holds the last call:offer for each callee for up to 45 s.
// Used by the mobile app after waking from an FCM notification to fetch the offer.
const pendingCalls = new Map(); // userId → { from, callerName, callerPhoto, callType, offer, expiresAt }
function setPendingCall(userId, data) {
  pendingCalls.set(String(userId), { ...data, expiresAt: Date.now() + 45_000 });
}
function getPendingCall(userId) {
  const entry = pendingCalls.get(String(userId));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { pendingCalls.delete(String(userId)); return null; }
  return entry;
}
function clearPendingCall(userId) { pendingCalls.delete(String(userId)); }

// Minimal per-socket flood guard. The REST POST that persists a chat message
// sits behind the general /api/ limiter, but `send_message` itself is only a
// broadcast — a raw socket client could emit it directly (bypassing REST
// entirely) and spam every channel member with no throttle at all. Same risk
// applies to call signaling. This tracks a rolling window per socket+event.
const socketRateState = new WeakMap();
function isRateLimited(socket, event, max, windowMs) {
  let state = socketRateState.get(socket);
  if (!state) { state = {}; socketRateState.set(socket, state); }
  const now = Date.now();
  const hits = (state[event] || []).filter(t => now - t < windowMs);
  hits.push(now);
  state[event] = hits;
  return hits.length > max;
}

io.on('connection', (socket) => {
  logger.info(`💬 Chat: ${socket.user?.name || socket.user?.id} connected`);
  CHAT_CHANNELS.forEach(ch => socket.join(ch));
  // Personal room — DM delivery uses this instead of the dm-<id>-<id> channel
  // room, since a socket only joins that room once the recipient has actually
  // opened that specific DM. Without a personal room, a first-time DM (or one
  // the recipient hasn't opened yet) never reaches them: no live message, no
  // desktop notification.
  if (socket.user?.id) socket.join(`user-${socket.user.id}`);

  // Fixed channels are already joined above at connect time (so cross-channel
  // notifications work); this still needs to join dynamic rooms that aren't
  // in that fixed list — e.g. direct-message channels ("dm-<id>-<id>") —
  // since those can't be pre-joined. Joining an already-joined room is a
  // harmless no-op.
  socket.on('join_channel', (channel) => {
    socket.join(channel);
    socket.currentChannel = channel;
  });

  // New message — broadcast to everyone in the channel
  socket.on('send_message', (msg) => {
    if (isRateLimited(socket, 'send_message', 30, 10_000)) return; // >30 broadcasts/10s — drop silently
    // msg already saved via REST POST, just broadcast to others
    if (msg.channel?.startsWith('dm-')) {
      const raw = msg.channel.slice(3);
      const id1 = raw.slice(0, 36);
      const id2 = raw.slice(37);
      const recipientId = id1 === String(socket.user?.id) ? id2 : id1;
      io.to(`user-${recipientId}`).emit('new_message', msg);
      // Push notification for DM
      try {
        const { sendPushToUser } = require('./services/fcm.service');
        const senderName = socket.user?.name || socket.user?.username || 'Someone';
        sendPushToUser(recipientId, {
          title: `💬 ${senderName}`,
          body: msg.text || (msg.file_name ? `📎 ${msg.file_name}` : 'New message'),
          data: { type: 'dm', channel: msg.channel, senderId: String(socket.user?.id) },
        });
      } catch (_) {}
    } else {
      socket.to(msg.channel).emit('new_message', msg);
      // Push for @mentions in channel messages
      try {
        const mentionRegex = /@([A-Za-z0-9 _]+)/g;
        const text = msg.text || '';
        let match;
        const mentionedNames = new Set();
        while ((match = mentionRegex.exec(text)) !== null) mentionedNames.add(match[1].trim().toLowerCase());
        if (mentionedNames.size > 0) {
          const { query: dbQ } = require('./config/database');
          const { sendPushToUser } = require('./services/fcm.service');
          const senderName = socket.user?.name || 'Someone';
          dbQ(`SELECT id, full_name, name FROM users WHERE is_active = TRUE`).then(({ rows }) => {
            rows.forEach(u => {
              const uname = (u.full_name || u.name || '').toLowerCase();
              if (mentionedNames.has(uname) && String(u.id) !== String(socket.user?.id)) {
                sendPushToUser(u.id, {
                  title: `🔔 ${senderName} mentioned you`,
                  body: text.slice(0, 100),
                  data: { type: 'mention', channel: msg.channel },
                });
              }
            });
          }).catch(() => {});
        }
      } catch (_) {}
    }
  });

  // Pin toggle
  socket.on('pin_message', ({ id, channel, pinned }) => {
    socket.to(channel).emit('message_pinned', { id, channel, pinned });
  });

  // Reaction
  socket.on('react_message', ({ id, channel, reactions }) => {
    socket.to(channel).emit('message_reacted', { id, channel, reactions });
  });

  // Typing indicator
  socket.on('typing', ({ channel, name }) => {
    socket.to(channel).emit('user_typing', { channel, name });
  });
  socket.on('stop_typing', ({ channel }) => {
    socket.to(channel).emit('user_stop_typing', { channel });
  });

  // ── WebRTC call signaling ──────────────────────────────────────────────────
  // All events are routed via the user-{id} room so they reach the target
  // regardless of which socket instance is connected. The server acts purely
  // as a relay — no media flows through here, only SDP offers/answers and
  // ICE candidates.

  socket.on('call:offer', ({ to, offer, callerName, callerPhoto, callType }) => {
    if (isRateLimited(socket, 'call:offer', 10, 60_000)) return; // >10 call attempts/min — drop (prevents ring-spam)
    const targetRoom = `user-${to}`;
    const roomSockets = io.sockets.adapter.rooms.get(targetRoom);
    const callerDisplay = callerName || socket.user.name || 'Someone';
    const resolvedCallType = callType || 'video';
    logger.info(`📞 call:offer from ${socket.user.id} → ${targetRoom} (${roomSockets?.size ?? 0} sockets in room)`);
    io.to(targetRoom).emit('call:offer', {
      from: socket.user.id,
      callerName: callerDisplay,
      callerPhoto: callerPhoto || null,
      callType: resolvedCallType,
      offer,
    });
    // Store offer so the mobile can fetch it after waking from FCM notification
    setPendingCall(to, {
      from: socket.user.id, callerName: callerDisplay, callerPhoto: callerPhoto || null,
      callType: resolvedCallType, offer,
    });
    // FCM push so the callee is alerted when the app is backgrounded/killed
    try {
      const { sendPushToUser } = require('./services/fcm.service');
      const callLabel = resolvedCallType === 'video' ? 'Video call' : resolvedCallType === 'screen' ? 'Screen share' : 'Voice call';
      sendPushToUser(to, {
        title: `📞 Incoming ${callLabel}`,
        body: `${callerDisplay} is calling you — tap to answer`,
        data: {
          type:         'incoming_call',
          call_type:    resolvedCallType,
          from:         String(socket.user.id),
          caller_name:  callerDisplay,
          caller_photo: callerPhoto || '',
        },
      }, { channelId: 'erp-calls', fullScreen: true });
    } catch (_) {}
  });

  socket.on('call:answer', ({ to, answer }) => {
    clearPendingCall(socket.user.id); // callee answered — no longer pending
    io.to(`user-${to}`).emit('call:answer', { from: socket.user.id, answer });
  });

  socket.on('call:ice-candidate', ({ to, candidate }) => {
    io.to(`user-${to}`).emit('call:ice-candidate', { from: socket.user.id, candidate });
  });

  socket.on('call:end', ({ to }) => {
    clearPendingCall(to);
    io.to(`user-${to}`).emit('call:end', { from: socket.user.id });
  });

  socket.on('call:reject', ({ to }) => {
    clearPendingCall(socket.user.id); // callee rejected
    io.to(`user-${to}`).emit('call:reject', { from: socket.user.id });
  });

  socket.on('call:busy', ({ to }) => {
    clearPendingCall(to);
    io.to(`user-${to}`).emit('call:busy', { from: socket.user.id });
  });

  // ── Screen share signaling ────────────────────────────────────────────────────
  // Pass sharerName/sharerPhoto through from the client (like call:offer does) —
  // profile_photo_url is NOT in the JWT payload so socket.user.profile_photo_url
  // is always undefined, which would break the avatar in IncomingShareModal.
  socket.on('screenshare:offer', ({ to, offer, sharerName, sharerPhoto }) => {
    io.to(`user-${to}`).emit('screenshare:offer', {
      from: socket.user.id,
      sharerName:  sharerName || socket.user.name || socket.user.username,
      sharerPhoto: sharerPhoto || null,
      offer,
    });
  });
  socket.on('screenshare:answer',        ({ to, answer })    => io.to(`user-${to}`).emit('screenshare:answer',        { from: socket.user.id, answer }));
  socket.on('screenshare:ice-candidate', ({ to, candidate }) => io.to(`user-${to}`).emit('screenshare:ice-candidate', { from: socket.user.id, candidate }));
  socket.on('screenshare:end',           ({ to })            => io.to(`user-${to}`).emit('screenshare:end',           { from: socket.user.id }));

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
  // Multer errors (file too large, wrong field, too many files, etc.) happen in
  // upload middleware BEFORE the route handler's own try/catch runs, so they
  // always fell through to here — where production mode hid them behind a bare
  // "Internal server error", giving no hint that the file itself was the problem
  // (e.g. a >10MB scan on Employee Documents). Multer sets err.name itself, so
  // this needs no extra dependency to detect.
  if (err.name === 'MulterError') {
    const messages = {
      LIMIT_FILE_SIZE: 'File is too large. Please upload a file under 10MB.',
      LIMIT_FILE_COUNT: 'Too many files — please upload fewer at a time.',
      LIMIT_UNEXPECTED_FILE: 'Unexpected file field — please check what you\'re uploading.',
    };
    logger.error(`${err.status || 400} — Multer:${err.code} — ${req.originalUrl}`);
    return res.status(400).json({ error: messages[err.code] || `Upload failed: ${err.message}` });
  }
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
    // 041 P6 activity → BOQ chapter link (for pulling activity budgets from the
    // BOQ Budget Breakdown chapter totals instead of re-entering them)
    await client.query(`ALTER TABLE project_activities ADD COLUMN IF NOT EXISTS boq_chapter_no VARCHAR(50)`);
    // 042 Add labour_contractor to sc_subcontractors.contractor_type check constraint
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.check_constraints
          WHERE constraint_schema = current_schema()
            AND constraint_name = 'sc_subcontractors_contractor_type_check'
            AND check_clause LIKE '%labour_contractor%'
        ) THEN
          ALTER TABLE sc_subcontractors DROP CONSTRAINT IF EXISTS sc_subcontractors_contractor_type_check;
          ALTER TABLE sc_subcontractors ADD CONSTRAINT sc_subcontractors_contractor_type_check
            CHECK (contractor_type IN ('company','individual','partnership','llp','proprietorship','labour_contractor'));
        END IF;
      END $$`);
    // 043 Bulk-seed DQS Tower workers for Habibur Rahman and MD Faruk
    await client.query(`
      DO $$
      DECLARE
        v_cid        UUID;
        v_sc_habib   UUID;
        v_sc_faruk   UUID;
        v_wo_habib   UUID;
        v_wo_faruk   UUID;
        v_proj       UUID;
        v_cnt        INTEGER;
        v_code       TEXT;
      BEGIN
        -- Get company id
        SELECT id INTO v_cid FROM companies LIMIT 1;
        IF v_cid IS NULL THEN RETURN; END IF;

        -- Get DQS Tower project id
        SELECT id INTO v_proj FROM projects
        WHERE company_id = v_cid
          AND (LOWER(name) LIKE '%dqs%' OR LOWER(project_code) LIKE '%dqs%')
        LIMIT 1;

        -- Find Habibur Rahman subcontractor
        SELECT id INTO v_sc_habib FROM sc_subcontractors
        WHERE company_id = v_cid AND LOWER(name) LIKE '%habib%'
        ORDER BY created_at LIMIT 1;

        -- Find MD Faruk subcontractor
        SELECT id INTO v_sc_faruk FROM sc_subcontractors
        WHERE company_id = v_cid AND LOWER(name) LIKE '%faruk%'
        ORDER BY created_at LIMIT 1;

        -- Get active WO for Habibur Rahman
        IF v_sc_habib IS NOT NULL THEN
          SELECT id INTO v_wo_habib FROM sc_work_orders
          WHERE company_id = v_cid AND sc_id = v_sc_habib AND status = 'active'
          ORDER BY created_at LIMIT 1;
        END IF;

        -- Get active WO for MD Faruk
        IF v_sc_faruk IS NOT NULL THEN
          SELECT id INTO v_wo_faruk FROM sc_work_orders
          WHERE company_id = v_cid AND sc_id = v_sc_faruk AND status = 'active'
          ORDER BY created_at LIMIT 1;
        END IF;

        -- Helper function to insert a worker (skip if worker_code already exists)
        -- Habibur Rahman workers
        IF v_sc_habib IS NOT NULL THEN
          WITH workers(code, name, skill) AS (VALUES
            ('3030009','Chanchal Oraw','Unskilled'),
            ('3030024','Sudeb Pahan','Unskilled'),
            ('3030027','Joskel Tudu','Unskilled'),
            ('3030044','Shyamal Nunia','Mason'),
            ('3030076','Halu Hansda','Unskilled'),
            ('3030078','Gali Saren','Unskilled'),
            ('3030087','Sunil Murmu','Unskilled'),
            ('3030111','Shyamal Chandra Lohara','Carpenter'),
            ('3030112','Khit Kalu Sarkar','Unskilled'),
            ('3030113','Sukda Besara','Unskilled'),
            ('3030114','Delu Sarkar','Unskilled'),
            ('3030118','Shiba Nunia','Carpenter'),
            ('3030119','Arun Nuniya','Carpenter'),
            ('3030120','Arjun Nunia','Carpenter'),
            ('3030126','Mangal Murmu','Unskilled'),
            ('3030127','Majhi Soren','Unskilled'),
            ('3030128','Kishtu Murmu','Unskilled'),
            ('3030129','Sapol Murmu','Unskilled'),
            ('3030131','Shankar Mahaldar','Unskilled'),
            ('3030132','Gorkha Nuniya','Unskilled'),
            ('3030133','Chhutu Nuniya','Unskilled'),
            ('3030140','Sufal Hemram','Mason'),
            ('3030141','Suraj Mandal','Mason'),
            ('3030142','Semanta Desi','Mason'),
            ('3030148','Parimal Hemrom','Mason'),
            ('3030149','Kiran Murmu','Unskilled'),
            ('3030150','Salkhan Murmu','Unskilled'),
            ('3030151','Raman Murmu','Unskilled'),
            ('3030152','Uttam Kisku','Unskilled'),
            ('3030153','Biswajit Hasda','Unskilled'),
            ('3030154','Sujit Hasda','Unskilled')
          )
          INSERT INTO sc_workers (company_id, project_id, sc_id, wo_id, worker_code, worker_name, skill_type, status)
          SELECT v_cid, v_proj, v_sc_habib, v_wo_habib, w.code, w.name, w.skill, 'active'
          FROM workers w
          WHERE NOT EXISTS (
            SELECT 1 FROM sc_workers x WHERE x.company_id = v_cid AND x.worker_code = w.code
          );
        END IF;

        -- MD Faruk workers
        IF v_sc_faruk IS NOT NULL THEN
          WITH workers(code, name, skill) AS (VALUES
            ('3030008','Umesh Paswan','Steel Fitter'),
            ('3030136','Bijay Bhuiyan','Steel Fitter'),
            ('3030138','Sachin Kumar','Steel Helper'),
            ('3030139','Bijay Bhuiyan','Steel Helper'),
            ('3030161','Sulendra Oraon','Steel Helper'),
            ('3030169','Tanveer Bhuiyan','Steel Fitter'),
            ('3030170','Sulendra Kumar','Steel Fitter'),
            ('3030171','Bisun Bhuyan','Steel Helper'),
            ('3030172','Mohan Saw','Steel Helper'),
            ('3030173','Jeetendra Kumar','Steel Helper'),
            ('3030174','Abhishek Kumar','Steel Helper'),
            ('3030175','Kailash Bhuiyan','Steel Helper'),
            ('3030176','Tileshwar Bhuiyan','Steel Fitter'),
            ('3030177','Gandori Bhuinya','Steel Fitter'),
            ('3030178','Arjun Bhuiyan','Cook')
          )
          INSERT INTO sc_workers (company_id, project_id, sc_id, wo_id, worker_code, worker_name, skill_type, status)
          SELECT v_cid, v_proj, v_sc_faruk, v_wo_faruk, w.code, w.name, w.skill, 'active'
          FROM workers w
          WHERE NOT EXISTS (
            SELECT 1 FROM sc_workers x WHERE x.company_id = v_cid AND x.worker_code = w.code
          );
        END IF;
      END $$`);
    // Migration 044 — add in_time / out_time to sc_attendance for ESSL sync
    await client.query(`
      ALTER TABLE sc_attendance
        ADD COLUMN IF NOT EXISTS in_time  TIME,
        ADD COLUMN IF NOT EXISTS out_time TIME
    `);
    logger.info('✅ Auto-migrations complete (003–044)');
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

    const { initBirthdayAnniversary } = require('./utils/hr-birthday-anniversary.service');
    initBirthdayAnniversary();

    const { initLateArrivalAlert } = require('./utils/late-arrival-alert.service');
    initLateArrivalAlert();

    const { initLateSummary } = require('./utils/hr-late-summary.service');
    initLateSummary();

    const { initAbsentSummary } = require('./utils/hr-absent-summary.service');
    initAbsentSummary();
  });
  }); // end .finally()
}

module.exports = app;
module.exports.app = app;
module.exports.server = server;
module.exports.io = io;


