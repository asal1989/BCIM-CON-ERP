/**
 * BCIM CONSTRUCT-ERP — ESSL Local Sync Agent
 * ============================================
 * Runs on the HRADMIN Windows machine (192.168.1.26).
 * Reads attendance from ESSL ETimetracklite SQL Server locally,
 * then pushes the data to the cloud ERP via HTTPS.
 *
 * Setup:
 *   1. Install Node.js on HRADMIN (https://nodejs.org)
 *   2. Copy this folder to C:\essl-agent\
 *   3. Edit config.json with your API key and company ID
 *   4. Run:  npm install
 *   5. Test: node sync.js --minutes 10
 *   6. Continuous: node sync.js --loop          (every 1 min, runs forever)
 *      Or use Task Scheduler to run run-sync.bat daily (legacy mode)
 */

'use strict';
const sql    = require('mssql');
const https  = require('https');
const http   = require('http');
const fs     = require('fs');
const path   = require('path');

// ── Load config ───────────────────────────────────────────────────────────────
const CFG_PATH = path.join(__dirname, 'config.json');
if (!fs.existsSync(CFG_PATH)) {
  console.error('ERROR: config.json not found. Copy config.example.json -> config.json and fill in your details.');
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));

const LOOP_INTERVAL_MS   = (cfg.loop_interval_minutes || 1) * 60 * 1000;
const DEFAULT_WINDOW_MIN = cfg.window_minutes || 10;

// ── Date helpers ──────────────────────────────────────────────────────────────
function toDateStr(d)    { return d.toISOString().split('T')[0]; }
function toDateTimeStr(d){ return d.toISOString().replace('T', ' ').slice(0, 19); }
function addDays(d, n)   { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function addMinutes(d, n){ return new Date(d.getTime() + n * 60000); }

// ── MSSQL config for ESSL ─────────────────────────────────────────────────────
function buildMssqlCfg() {
  const c = {
    user:     cfg.essl.username,
    password: cfg.essl.password,
    server:   cfg.essl.host,
    database: cfg.essl.database,
    pool: { max: 5, min: 1, idleTimeoutMillis: 300000 },
    options: {
      instanceName:           cfg.essl.instance || undefined,
      encrypt:                false,
      trustServerCertificate: true,
      connectTimeout:         20000,
      requestTimeout:         600000,  // 10 min — large backfills scan many DeviceLogs tables
    },
  };
  if (!cfg.essl.instance) c.port = parseInt(cfg.essl.port) || 1433;
  return c;
}

// ── Persistent connection pool (reused across loop ticks) ─────────────────────
let pool = null;

async function getPool() {
  if (pool && pool.connected) return pool;
  if (pool) { try { await pool.close(); } catch (_) {} pool = null; }
  pool = await new sql.ConnectionPool(buildMssqlCfg()).connect();
  console.log('[ESSL Agent] SQL pool connected.');
  return pool;
}

// ── Discover monthly DeviceLogs tables ───────────────────────────────────────
function monthlyTables(from, to) {
  const tables = [];
  let cur = new Date(new Date(from).getFullYear(), new Date(from).getMonth(), 1);
  const end = new Date(to);
  while (cur <= end) {
    tables.push(`DeviceLogs_${cur.getMonth() + 1}_${cur.getFullYear()}`);
    cur.setMonth(cur.getMonth() + 1);
  }
  return tables;
}

async function existingTables(conn, tables) {
  const result = [];
  for (const t of tables) {
    try {
      await conn.request().query(`SELECT TOP 1 DeviceLogId FROM [${t}]`);
      result.push(t);
    } catch (_) {}
  }
  return result;
}

// ── Detect which direction column the ESSL DB uses ───────────────────────────
// ESSL etimetracklite versions differ: some use "Direction", some "IoType".
// Values: 0 = Entry/IN, 1 = Exit/OUT.
// Falls back to hour-of-day approximation only if neither column exists.
async function detectDirectionExpr(conn, table) {
  for (const col of ['Direction', 'IoType', 'InOutMode']) {
    try {
      await conn.request().query(`SELECT TOP 1 [${col}] FROM [${table}] WHERE 1=0`);
      return `CASE WHEN d.[${col}] = 0 THEN 'in' WHEN d.[${col}] = 1 THEN 'out' ELSE NULL END`;
    } catch (_) {}
  }
  // Fallback — hour-based approximation (inaccurate for shift workers)
  console.warn('[ESSL Agent] Warning: no Direction/IoType/InOutMode column found; using hour-based approximation.');
  return `CASE WHEN DATEPART(HOUR, d.LogDate) < 12 THEN 'in' ELSE 'out' END`;
}

// ── Pull swipe data from ESSL ─────────────────────────────────────────────────
async function pullSwipes(conn, tables, fromDT, toDT) {
  if (!tables.length) return [];

  // Detect direction column once using the first available table
  const dirExpr = await detectDirectionExpr(conn, tables[0]);

  const unionSQL = tables.map(t => `
    SELECT
      e.EmployeeCode                       AS emp_code,
      CONVERT(VARCHAR(23), d.LogDate, 121) AS swipe_time,
      ${dirExpr}                           AS direction
    FROM [${t}] d
    JOIN Employees e ON e.NumericCode = d.UserId
    WHERE d.LogDate BETWEEN @from AND @to
  `).join(' UNION ALL ');

  const r = await conn.request()
    .input('from', sql.VarChar, fromDT)
    .input('to',   sql.VarChar, toDT)
    .query(`${unionSQL} ORDER BY emp_code, swipe_time`);

  return r.recordset;
}

// ── Group swipes into daily attendance records ────────────────────────────────
function groupSwipes(rows) {
  const grouped = {};
  for (const row of rows) {
    const code = String(row.emp_code || '').trim();
    if (!code) continue;
    const dt   = new Date(row.swipe_time);
    const date = toDateStr(dt);
    const time = dt.toTimeString().slice(0, 8);
    const key  = `${code}|${date}`;
    if (!grouped[key]) grouped[key] = { emp_code: code, date, ins: [], outs: [] };
    if (row.direction === 'in') grouped[key].ins.push(time);
    else grouped[key].outs.push(time);
  }

  return Object.values(grouped).map(g => {
    g.ins.sort(); g.outs.sort();
    const in_time     = g.ins[0] || null;
    const out_time    = g.outs[g.outs.length - 1] || null;
    const punch_count = g.ins.length + g.outs.length;
    return { emp_code: g.emp_code, date: g.date, in_time, out_time, punch_count };
  });
}

// ── Push records to cloud ERP ─────────────────────────────────────────────────
function pushToERP(records, raw_swipes) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      api_key:    cfg.erp.api_key,
      company_id: cfg.erp.company_id,
      records,
      raw_swipes,
    });

    const url  = new URL(cfg.erp.push_url);
    const opts = {
      hostname: url.hostname,
      port:     url.port || (url.protocol === 'https:' ? 443 : 80),
      path:     url.pathname,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };

    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ raw: data }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Parse args ────────────────────────────────────────────────────────────────
const args       = process.argv.slice(2);
const loopMode   = args.includes('--loop');
const daysArg    = args.indexOf('--days');
const minutesArg = args.indexOf('--minutes');

// ── Single sync run ───────────────────────────────────────────────────────────
async function runSync({ fromDT, toDT, label }) {
  console.log(`\n[ESSL Agent] ${new Date().toLocaleString()}`);
  console.log(`[ESSL Agent] Syncing ${label}`);

  try {
    const conn = await getPool();

    const allTables = monthlyTables(fromDT, toDT);
    const tables    = await existingTables(conn, allTables);
    console.log(`[ESSL Agent] Tables found: ${tables.join(', ') || 'none'}`);

    if (!tables.length) { console.log('[ESSL Agent] No DeviceLogs tables for this range.'); return; }

    const rawSwipes = await pullSwipes(conn, tables, fromDT, toDT);
    console.log(`[ESSL Agent] Raw swipes: ${rawSwipes.length}`);

    const records = groupSwipes(rawSwipes);
    console.log(`[ESSL Agent] Attendance records: ${records.length}`);

    if (!records.length && !rawSwipes.length) { console.log('[ESSL Agent] Nothing to push.'); return; }

    console.log(`[ESSL Agent] Pushing to ERP...`);
    const result = await pushToERP(records, rawSwipes);
    console.log(`[ESSL Agent] Synced: ${result.synced || 0} | Skipped: ${result.skipped || 0} | Raw saved: ${result.raw_saved || 0}`);
    if (result.not_found?.length) console.log(`[ESSL Agent] Not found in ERP: ${result.not_found.join(', ')}`);
    if (result.errors?.length)    console.log('[ESSL Agent] Errors:', result.errors);

  } catch (err) {
    console.error('[ESSL Agent] ERROR:', err.message);
    // Force pool reconnect on next tick
    if (pool) { try { await pool.close(); } catch (_) {} pool = null; }
    if (!loopMode) process.exit(1);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (loopMode) {
    const windowMin = minutesArg >= 0 ? parseInt(args[minutesArg + 1]) || DEFAULT_WINDOW_MIN : DEFAULT_WINDOW_MIN;
    const intervalMin = cfg.loop_interval_minutes || 1;
    console.log(`[ESSL Agent] Loop mode started`);
    console.log(`[ESSL Agent]   Interval : every ${intervalMin} min`);
    console.log(`[ESSL Agent]   Window   : last ${windowMin} min`);
    console.log(`[ESSL Agent]   ERP      : ${cfg.erp.push_url}`);
    console.log(`[ESSL Agent]   ESSL     : ${cfg.essl.host}\\${cfg.essl.instance || 'default'}`);
    console.log('[ESSL Agent] Press Ctrl+C to stop.\n');

    // Use sequential setTimeout instead of setInterval to prevent overlapping ticks
    const tick = async () => {
      const now  = new Date();
      const from = addMinutes(now, -windowMin);
      await runSync({
        fromDT: toDateTimeStr(from),
        toDT:   toDateTimeStr(now),
        label:  `last ${windowMin} min`,
      });
      // Schedule next tick AFTER this one finishes
      setTimeout(tick, LOOP_INTERVAL_MS);
    };

    await tick();

  } else {
    let fromDT, toDT, label;

    if (minutesArg >= 0) {
      const windowMin = parseInt(args[minutesArg + 1]) || DEFAULT_WINDOW_MIN;
      const now  = new Date();
      const from = addMinutes(now, -windowMin);
      fromDT = toDateTimeStr(from);
      toDT   = toDateTimeStr(now);
      label  = `last ${windowMin} minutes`;

      await runSync({ fromDT, toDT, label });

    } else {
      const days      = daysArg >= 0 ? parseInt(args[daysArg + 1]) || 1 : cfg.sync_days || 1;
      const CHUNK     = 7; // process 7 days at a time to avoid SQL timeout

      if (days <= CHUNK) {
        toDT   = toDateStr(new Date()) + ' 23:59:59';
        fromDT = toDateStr(addDays(new Date(), -days)) + ' 00:00:00';
        label  = `${fromDT.slice(0, 10)} to ${toDT.slice(0, 10)}`;
        await runSync({ fromDT, toDT, label });
      } else {
        // Break into 7-day chunks, oldest first
        console.log(`[ESSL Agent] Backfill ${days} days in chunks of ${CHUNK}…`);
        const endDate  = new Date();
        for (let offset = days; offset > 0; offset -= CHUNK) {
          const chunkDays = Math.min(offset, CHUNK);
          const chunkEnd  = addDays(endDate, -(offset - chunkDays));
          const chunkStart= addDays(chunkEnd, -chunkDays);
          const cFromDT   = toDateStr(chunkStart) + ' 00:00:00';
          const cToDT     = toDateStr(chunkEnd)   + ' 23:59:59';
          await runSync({ fromDT: cFromDT, toDT: cToDT, label: `${cFromDT.slice(0,10)} → ${cToDT.slice(0,10)}` });
        }
        console.log(`[ESSL Agent] Backfill complete.`);
      }
    }

    // Close pool after one-shot
    if (pool) { try { await pool.close(); } catch (_) {} }
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[ESSL Agent] Shutting down...');
  if (pool) { try { await pool.close(); } catch (_) {} }
  process.exit(0);
});

main();
