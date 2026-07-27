// src/services/copilot.service.js
// AI Copilot (Bill Tracker pilot) — Claude tool-use loop over read-only
// Bill Tracker data. Every tool re-applies the same project-scoping the
// human-facing tqs-bills.routes.js endpoints use, so the AI can never see
// data the logged-in user couldn't already see via the UI.
const Anthropic = require('@anthropic-ai/sdk');
const { query } = require('../config/database');
const { applyProjectScope, scopedProjectIds } = require('../middleware/projectScope');
const { billOutstandingSql, getVendorLiabilitySummary } = require('./tqsLiability.service');

const MODEL = process.env.BCIM_COPILOT_MODEL || 'claude-sonnet-5';
const MAX_TOKENS = Number(process.env.BCIM_COPILOT_MAX_TOKENS) || 2048;
const MAX_TOOL_ITERATIONS = 6;
const MAX_HISTORY_TURNS = 10;
const MAX_MESSAGE_LENGTH = 4000;

const SYSTEM_PROMPT = `You are the Bill Tracker AI Copilot for a construction ERP (BCIM Engineering).
You can only answer questions about vendor bills, cash flow, AP aging, vendor ledgers/liability,
deductions, and individual bill details — using the tools provided. Data returned by tools is
already scoped to what this user is allowed to see.

Rules:
- Always cite concrete numbers returned by your tools. Never estimate, paraphrase, or invent figures.
- If a question needs data outside these tools (e.g. HR, planning, quality, other modules), reply:
  "I don't have data for that — I'm scoped to Bill Tracker only."
- If a tool errors or returns no rows, say so plainly rather than guessing.
- Use the list_projects tool to resolve a project name to its id before calling other tools with a
  project filter, unless the user is clearly asking about "the current project" (see context below).
- Keep answers concise and numbers-first.
- Format every rupee amount in Indian numbering (lakh/crore grouping), never Western thousands
  grouping. E.g. write ₹1,20,29,440 — NOT ₹12,029,440. Grouping rule: the last 3 digits together,
  then every 2 digits after that (12029440 -> 1,20,29,440; 450000 -> 4,50,000; 1234567 -> 12,34,567).`;

// Deterministic safety net: the system prompt tells the model to use Indian
// numbering, but LLM instruction-following on number formatting isn't
// guaranteed every time. Re-group any Rs/₹ amount the model wrote in Western
// thousands grouping into lakh/crore grouping before it reaches the user.
const CURRENCY_AMOUNT_RE = /(₹|Rs\.?\s?)([\d,]+)(\.\d+)?/g;
function toIndianCurrencyGrouping(text) {
  return String(text || '').replace(CURRENCY_AMOUNT_RE, (match, prefix, digits, decimals) => {
    const intPart = digits.replace(/,/g, '');
    if (!intPart) return match;
    const grouped = intPart.replace(/(\d)(?=(\d\d)+\d$)/g, '$1,');
    return `${prefix}${grouped}${decimals || ''}`;
  });
}

function anthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

const TOOLS = [
  {
    name: 'list_projects',
    description: 'List projects the current user can access (id + name). Use this to resolve a project name mentioned by the user into a project_id for other tools.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_bills',
    description: 'List/search vendor bills with filters. Returns up to 50 bills, most recent invoice date first.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Filter to one project (UUID from list_projects)' },
        status: { type: 'string', description: 'Workflow status: pending, stores, document_controller, qs, accounts, procurement, qs_sign, paid, partial, rejected' },
        bill_type: { type: 'string', enum: ['po', 'wo', 'hire'] },
        search: { type: 'string', description: 'Matches SL number, invoice number, or vendor name' },
        from_date: { type: 'string', description: 'YYYY-MM-DD, invoice date lower bound' },
        to_date: { type: 'string', description: 'YYYY-MM-DD, invoice date upper bound' },
      },
      required: [],
    },
  },
  {
    name: 'get_cash_flow',
    description: 'Monthly cash flow summary: gross billed, paid, in-process, pending, retention, deductions, net payable.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        from_date: { type: 'string' },
        to_date: { type: 'string' },
      },
      required: [],
    },
  },
  {
    name: 'get_ap_aging',
    description: 'Accounts payable aging for certified-but-unpaid bills, bucketed 0-30/31-60/61-90/90+ days.',
    input_schema: {
      type: 'object',
      properties: { project_id: { type: 'string' } },
      required: [],
    },
  },
  {
    name: 'get_vendor_ledger',
    description: 'Vendor-wise payable/liability summary: total invoiced, advances given/recovered, TDS, outstanding balance.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        vendor_id: { type: 'string' },
        bill_type: { type: 'string', enum: ['po', 'wo'] },
      },
      required: [],
    },
  },
  {
    name: 'get_deduction_register',
    description: 'WO bills grouped by WO/vendor with deduction breakdown: retention, advance recovered, TDS, credit notes, other deductions.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        vendor_id: { type: 'string' },
        from_date: { type: 'string' },
        to_date: { type: 'string' },
      },
      required: [],
    },
  },
  {
    name: 'get_bill_detail',
    description: 'Full detail for one bill by id, including line items.',
    input_schema: {
      type: 'object',
      properties: { bill_id: { type: 'string' } },
      required: ['bill_id'],
    },
  },
];

async function toolListProjects(req) {
  const params = [req.user.company_id];
  const conds = ['p.company_id = $1'];
  if (!req.isGlobalRole) {
    const allowed = req.allowedProjectIds || [];
    if (allowed.length === 0) return [];
    params.push(allowed);
    conds.push(`p.id = ANY($${params.length}::uuid[])`);
  }
  const { rows } = await query(
    `SELECT p.id, p.name FROM projects p WHERE ${conds.join(' AND ')} ORDER BY p.name`,
    params
  );
  return rows;
}

async function toolListBills(req, input = {}) {
  const { project_id, status, bill_type, search, from_date, to_date } = input;
  const conditions = ['b.is_deleted = FALSE'];
  const params = [];
  if (req.user.company_id) {
    conditions.push(`(b.company_id = $${params.length + 1} OR b.company_id IS NULL)`);
    params.push(req.user.company_id);
  }
  applyProjectScope(req, conditions, params, 'b', project_id);
  let i = params.length + 1;
  if (status)    { conditions.push(`b.workflow_status = $${i++}`); params.push(status); }
  if (bill_type) { conditions.push(`b.bill_type = $${i++}`); params.push(bill_type); }
  if (from_date) { conditions.push(`b.inv_date >= $${i++}`); params.push(from_date); }
  if (to_date)   { conditions.push(`b.inv_date <= $${i++}`); params.push(to_date); }
  if (search) {
    conditions.push(`(b.sl_number ILIKE $${i} OR b.inv_number ILIKE $${i} OR b.vendor_name ILIKE $${i})`);
    params.push(`%${search}%`); i++;
  }

  const { rows } = await query(`
    SELECT b.sl_number, b.inv_number, b.vendor_name, p.name AS project_name,
           b.bill_type, b.total_amount, b.workflow_status, b.inv_date,
           u.paid_amount, u.certified_net, u.tds_deduction, u.payment_date,
           ${billOutstandingSql('b', 'u')} AS balance_to_pay
    FROM tqs_bills b
    LEFT JOIN tqs_bill_updates u ON u.bill_id = b.id
    LEFT JOIN projects p ON p.id = b.project_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY b.inv_date DESC NULLS LAST, b.created_at DESC
    LIMIT 50
  `, params);
  return rows;
}

async function toolGetCashFlow(req, input = {}) {
  const { project_id, from_date, to_date } = input;
  const params = [req.user.company_id];
  const conds = ['b.company_id = $1', 'b.is_deleted = FALSE', 'b.inv_date IS NOT NULL'];
  applyProjectScope(req, conds, params, 'b', project_id);
  let idx = params.length + 1;
  if (from_date) { conds.push(`b.inv_date >= $${idx++}`); params.push(from_date); }
  if (to_date)   { conds.push(`b.inv_date <= $${idx++}`); params.push(to_date); }

  const { rows } = await query(`
    SELECT
      TO_CHAR(b.inv_date, 'YYYY-MM')  AS month,
      TO_CHAR(b.inv_date, 'Mon YYYY') AS month_label,
      COUNT(b.id)::int                AS bill_count,
      SUM(COALESCE(b.basic_amount,0) + COALESCE(b.gst_amount,0)) AS total_billed,
      SUM(CASE WHEN b.workflow_status = 'paid' THEN COALESCE(u.certified_net, b.basic_amount, 0) ELSE 0 END) AS paid,
      SUM(CASE WHEN b.workflow_status NOT IN ('pending','paid') THEN COALESCE(u.certified_net, b.basic_amount, 0) ELSE 0 END) AS in_process,
      SUM(CASE WHEN b.workflow_status = 'pending' THEN COALESCE(u.certified_net, b.basic_amount, 0) ELSE 0 END) AS pending,
      SUM(COALESCE(u.retention_money,0))    AS retention_held,
      SUM(COALESCE(u.total_deductions,0))   AS total_deductions,
      SUM(CASE WHEN b.workflow_status != 'paid' THEN COALESCE(u.certified_net, b.basic_amount, 0) ELSE 0 END) AS net_payable
    FROM tqs_bills b
    LEFT JOIN tqs_bill_updates u ON u.bill_id = b.id
    WHERE ${conds.join(' AND ')}
    GROUP BY 1, 2
    ORDER BY 1
  `, params);
  return rows;
}

async function toolGetApAging(req, input = {}) {
  const { project_id } = input;
  const conditions = [
    'b.company_id = $1', 'b.is_deleted = FALSE',
    "b.workflow_status IN ('qs','accounts')", 'COALESCE(u.certified_net, 0) > 0',
  ];
  const params = [req.user.company_id];
  applyProjectScope(req, conditions, params, 'b', project_id);

  const { rows } = await query(`
    SELECT
      b.sl_number, b.vendor_name, b.inv_number, b.inv_date, p.name AS project_name,
      u.certified_net, COALESCE(u.paid_amount, 0) AS paid_amount,
      ${billOutstandingSql('b', 'u')} AS balance,
      EXTRACT(DAY FROM NOW() - u.qs_certified_date)::INT AS days_outstanding,
      CASE
        WHEN u.qs_certified_date IS NULL THEN 'unscheduled'
        WHEN EXTRACT(DAY FROM NOW() - u.qs_certified_date) <= 30 THEN '0-30'
        WHEN EXTRACT(DAY FROM NOW() - u.qs_certified_date) <= 60 THEN '31-60'
        WHEN EXTRACT(DAY FROM NOW() - u.qs_certified_date) <= 90 THEN '61-90'
        ELSE '90+'
      END AS aging_bucket
    FROM tqs_bills b
    LEFT JOIN tqs_bill_updates u ON u.bill_id = b.id
    LEFT JOIN projects p ON p.id = b.project_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY days_outstanding DESC NULLS LAST
    LIMIT 50
  `, params);

  const bucketSummary = {};
  for (const r of rows) {
    const b = r.aging_bucket;
    if (!bucketSummary[b]) bucketSummary[b] = { count: 0, total_balance: 0 };
    bucketSummary[b].count += 1;
    bucketSummary[b].total_balance += parseFloat(r.balance || 0);
  }
  return { bucket_summary: bucketSummary, bills: rows };
}

async function toolGetVendorLedger(req, input = {}) {
  const { project_id, vendor_id, bill_type } = input;
  const rows = await getVendorLiabilitySummary({
    companyId: req.user.company_id,
    projectId: project_id,
    projectIds: scopedProjectIds(req, project_id),
    vendorId: vendor_id,
    billType: bill_type,
  });
  return rows.slice(0, 30).map(row => ({
    vendor_name: row.vendor_name,
    total_invoiced: row.total_invoiced,
    total_advance_given: row.total_advance_given,
    total_advance_recovered: row.total_advance_recovered,
    total_advance_open: row.total_advance_open,
    total_tds: row.total_tds,
    total_paid: row.total_paid,
    payable_balance: row.payable_balance,
    net_balance: row.net_balance,
  }));
}

async function toolGetDeductionRegister(req, input = {}) {
  const { project_id, vendor_id, from_date, to_date } = input;
  const params = [req.user.company_id];
  const conds = ['b.company_id = $1', 'b.is_deleted = FALSE'];
  applyProjectScope(req, conds, params, 'b', project_id);
  let idx = params.length + 1;
  if (vendor_id)  { conds.push(`b.vendor_id = $${idx++}`); params.push(vendor_id); }
  if (from_date)  { conds.push(`b.inv_date >= $${idx++}`); params.push(from_date); }
  if (to_date)    { conds.push(`b.inv_date <= $${idx++}`); params.push(to_date); }

  const { rows } = await query(`
    SELECT
      b.wo_number, b.vendor_name, p.name AS project_name,
      COUNT(b.id)::int AS bill_count,
      SUM(COALESCE(b.basic_amount,0) + COALESCE(b.gst_amount,0)) AS total_amount,
      SUM(COALESCE(u.retention_money,0))   AS retention_held,
      SUM(COALESCE(u.advance_recovered,0)) AS advance_recovered,
      SUM(COALESCE(u.tds_deduction,0))     AS tds_deducted,
      SUM(COALESCE(u.other_deductions,0))  AS other_deductions,
      SUM(COALESCE(u.total_deductions,0))  AS total_deductions
    FROM tqs_bills b
    LEFT JOIN tqs_bill_updates u ON u.bill_id = b.id
    LEFT JOIN projects p ON p.id = b.project_id
    WHERE ${conds.join(' AND ')} AND b.bill_type = 'wo'
    GROUP BY b.wo_number, b.vendor_name, p.name
    ORDER BY total_amount DESC
    LIMIT 30
  `, params);
  return rows;
}

async function toolGetBillDetail(req, input = {}) {
  const { bill_id } = input;
  if (!bill_id) throw new Error('bill_id is required');
  const billConds = ['b.id = $1', 'b.is_deleted = FALSE', '(b.company_id = $2 OR b.company_id IS NULL)'];
  const billParams = [bill_id, req.user.company_id];
  applyProjectScope(req, billConds, billParams, 'b', null);

  const [bill, items] = await Promise.all([
    query(`
      SELECT b.sl_number, b.inv_number, b.inv_date, b.vendor_name, b.bill_type,
             b.total_amount, b.workflow_status, p.name AS project_name,
             ${billOutstandingSql('b', 'u')} AS liability_balance
      FROM tqs_bills b
      LEFT JOIN tqs_bill_updates u ON u.bill_id = b.id
      LEFT JOIN projects p ON p.id = b.project_id
      WHERE ${billConds.join(' AND ')}
    `, billParams),
    query(`SELECT description, quantity, rate, amount FROM tqs_bill_line_items WHERE bill_id = $1 ORDER BY sort_order`, [bill_id]),
  ]);

  if (!bill.rows.length) return { error: 'Bill not found or not accessible.' };
  return { ...bill.rows[0], line_items: items.rows };
}

const TOOL_IMPL = {
  list_projects: toolListProjects,
  list_bills: toolListBills,
  get_cash_flow: toolGetCashFlow,
  get_ap_aging: toolGetApAging,
  get_vendor_ledger: toolGetVendorLedger,
  get_deduction_register: toolGetDeductionRegister,
  get_bill_detail: toolGetBillDetail,
};

async function runTool(req, name, input) {
  const impl = TOOL_IMPL[name];
  if (!impl) return { error: `Unknown tool: ${name}` };
  try {
    return await impl(req, input || {});
  } catch (err) {
    return { error: err.message };
  }
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(m => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
    .slice(-MAX_HISTORY_TURNS)
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_LENGTH) }));
}

async function chat({ req, message, history, projectId }) {
  const client = anthropicClient();
  if (!client) {
    const err = new Error('AI Copilot is not configured. Contact IT.');
    err.statusCode = 503;
    throw err;
  }
  if (!message || typeof message !== 'string') {
    const err = new Error('message is required');
    err.statusCode = 400;
    throw err;
  }

  const contextNote = projectId
    ? `\n\nContext: the user currently has project_id=${projectId} selected in the app. Use it as the default project scope unless they name a different project.`
    : '';

  const messages = [
    ...sanitizeHistory(history),
    { role: 'user', content: message.slice(0, MAX_MESSAGE_LENGTH) },
  ];

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT + contextNote,
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason !== 'tool_use') {
      const textBlock = response.content.find(b => b.type === 'text');
      return textBlock ? toIndianCurrencyGrouping(textBlock.text) : '';
    }

    messages.push({ role: 'assistant', content: response.content });

    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
    const toolResults = await Promise.all(toolUseBlocks.map(async block => ({
      type: 'tool_result',
      tool_use_id: block.id,
      content: JSON.stringify(await runTool(req, block.name, block.input)),
    })));
    messages.push({ role: 'user', content: toolResults });
  }

  return "I wasn't able to finish looking that up — try narrowing your question (e.g. a specific project or vendor).";
}

module.exports = { chat };
