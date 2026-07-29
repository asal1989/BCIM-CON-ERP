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

const LOOP_INTERVAL_MS   = (cfg.loop_interval_minutes || 0.5) * 60 * 1000; // default 30 seconds
const DEFAULT_WINDOW_MIN = cfg.window_minutes || 10;
const OVERLAP_SECONDS    = 30; // re-query last 30s of previous window to catch late-arriving rows

// Track exact timestamp of last successful sync so we only pull NEW swipes
let lastSyncAt = null;

// ── Date helpers ──────────────────────────────────────────────────────────────
// IMPORTANT: ESSL/ZKTeco devices write LogDate as a naive IST wall-clock
// timestamp (no timezone), so query bounds sent to SQL Server must be built
// in IST too. We do NOT rely on the host machine's OS timezone (it may be
// set to UTC, e.g. on a cloud/VPS-provisioned Windows box) — instead we
// apply the fixed +05:30 IST offset explicitly, so this is correct
// regardless of how the HRADMIN PC's system clock/timezone is configured.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
function pad(n) { return String(n).padStart(2, '0'); }
function toIST(d) { return new Date(d.getTime() + IST_OFFSET_MS); }
function toDateStr(d)    { const t = toIST(d); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; }
function toDateTimeStr(d){ const t = toIST(d); return `${toDateStr(d)} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`; }
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
let diagnosticsShown = false;
let deviceLogColumns = null; // reported via heartbeat so it can be checked remotely
let directionSource  = null; // which column (or fallback) detectDirectionExpr picked
let deviceStatusCandidates = null; // candidate device-status tables (name/columns/sample), for building an online/offline device panel
let directionSample = null; // Direction vs AttDirection sample rows, to figure out which column is the real in/out flag

async function getPool() {
  if (pool && pool.connected) return pool;
  if (pool) { try { await pool.close(); } catch (_) {} pool = null; }
  pool = await new sql.ConnectionPool(buildMssqlCfg()).connect();
  console.log('[ESSL Agent] SQL pool connected.');
  if (!diagnosticsShown) {
    diagnosticsShown = true;
    await logAvailableTables(pool);
  }
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
  const misses = [];
  for (const t of tables) {
    try {
      await conn.request().query(`SELECT TOP 1 DeviceLogId FROM [${t}]`);
      result.push(t);
    } catch (e) {
      misses.push(`${t} (${e.message.split('\n')[0]})`);
    }
  }
  if (misses.length) {
    console.log(`[ESSL Agent] Tables NOT found / not queryable: ${misses.join(', ')}`);
  }
  return result;
}

// One-time startup diagnostic: list every table actually in the ESSL database
// so a table-name mismatch (the #1 cause of "runs but never syncs") is obvious
// immediately instead of silently producing zero rows forever.
async function logAvailableTables(conn) {
  try {
    const r = await conn.request().query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME`
    );
    const names = r.recordset.map(row => row.TABLE_NAME);
    const deviceLogTables = names.filter(n => /devicelog/i.test(n));
    console.log(`[ESSL Agent] Database has ${names.length} tables total.`);
    console.log(`[ESSL Agent] Tables matching "devicelog" (case-insensitive): ${deviceLogTables.join(', ') || 'NONE FOUND — check table naming!'}`);
    if (!names.includes('Employees')) {
      console.log(`[ESSL Agent] WARNING: no "Employees" table found — the EmployeeCode/NumericCode join in pullSwipes() will fail.`);
    }

    // Report the actual column list of a DeviceLogs table via heartbeat so it
    // can be inspected remotely — this machine's SQL Server isn't reachable
    // from the cloud/dev side, so this is the only way to see real column
    // names without asking someone to run a query on-site.
    if (deviceLogTables.length) {
      const cr = await conn.request().query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='${deviceLogTables[deviceLogTables.length - 1]}' ORDER BY ORDINAL_POSITION`
      );
      deviceLogColumns = cr.recordset.map(row => row.COLUMN_NAME);
      console.log(`[ESSL Agent] Columns in ${deviceLogTables[deviceLogTables.length - 1]}: ${deviceLogColumns.join(', ')}`);
    }

    // Look for a device-status table (online/offline, last-ping) — the ESSL
    // web dashboard shows this (DeviceSName, DeviceFName, Serial No, Location,
    // Last Ping, Status columns), but we've never read it. Search by COLUMN
    // NAME first — much more reliable than guessing table names, since the
    // master table isn't necessarily named "*Device*" itself — then fall back
    // to table-name matching and report both via heartbeat.
    let deviceMasterTables = [];
    try {
      const byCol = await conn.request().query(
        `SELECT DISTINCT TABLE_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE COLUMN_NAME IN ('DeviceSName','DeviceFName','LastPing','DeviceStatus')`
      );
      deviceMasterTables = byCol.recordset.map(row => row.TABLE_NAME);
      console.log(`[ESSL Agent] Tables with DeviceSName/DeviceFName/LastPing/DeviceStatus columns: ${deviceMasterTables.join(', ') || 'NONE FOUND'}`);
    } catch (e2) {
      console.log(`[ESSL Agent] Device-master column search failed: ${e2.message.split('\n')[0]}`);
    }

    const deviceStatusTables = [...new Set([
      ...deviceMasterTables,
      ...names.filter(n => /device/i.test(n) && !/devicelog/i.test(n)),
    ])];
    if (deviceStatusTables.length) {
      deviceStatusCandidates = [];
      for (const t of deviceStatusTables.slice(0, 10)) {
        try {
          const colsR = await conn.request().query(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='${t}' ORDER BY ORDINAL_POSITION`
          );
          const cols = colsR.recordset.map(row => row.COLUMN_NAME);
          const sampleR = await conn.request().query(`SELECT TOP 5 * FROM [${t}]`);
          deviceStatusCandidates.push({ table: t, columns: cols, sample: sampleR.recordset });
        } catch (e2) {
          deviceStatusCandidates.push({ table: t, error: e2.message.split('\n')[0] });
        }
      }
      console.log(`[ESSL Agent] Device-status table candidates: ${deviceStatusTables.join(', ')}`);
    } else {
      console.log(`[ESSL Agent] No device-status table found.`);
    }

    // Investigate Direction vs AttDirection — the sync picked "Direction" as
    // the in/out column, but two known punches (UserId 373/480, both marked
    // "Check-Out" on the ESSL device's own log viewer) came through as "in".
    // Sample both columns directly, including those two known users, so the
    // real 0/1 encoding for each column can be figured out remotely.
    if (deviceLogTables.length) {
      try {
        // Table names are "DeviceLogs_M_YYYY" (no zero-padding), so sorting
        // alphabetically is NOT chronological ("_9_2025" > "_7_2026" as a
        // string) — explicitly build the current month's table name instead
        // of trusting sort order, so we sample live data, not a stale table.
        const now = new Date();
        const curMonthTable = `DeviceLogs_${now.getMonth() + 1}_${now.getFullYear()}`;
        const table = deviceLogTables.includes(curMonthTable) ? curMonthTable : deviceLogTables[deviceLogTables.length - 1];
        const known = await conn.request().query(
          `SELECT TOP 20 UserId, LogDate, Direction, AttDirection FROM [${table}] WHERE UserId IN (373,480) ORDER BY LogDate DESC`
        );
        const recent = await conn.request().query(
          `SELECT TOP 20 UserId, LogDate, Direction, AttDirection FROM [${table}] ORDER BY LogDate DESC`
        );
        const distinctVals = await conn.request().query(
          `SELECT DISTINCT Direction, AttDirection, COUNT(*) AS n FROM [${table}] GROUP BY Direction, AttDirection`
        );
        directionSample = {
          table,
          known_users_373_480: known.recordset,
          recent_20: recent.recordset,
          distinct_value_combos: distinctVals.recordset,
        };
        console.log(`[ESSL Agent] Direction/AttDirection sample captured for ${table} (${known.recordset.length} rows for UserId 373/480, ${distinctVals.recordset.length} distinct value combos).`);
      } catch (e3) {
        console.log(`[ESSL Agent] Direction sample query failed: ${e3.message.split('\n')[0]}`);
      }
    }
  } catch (e) {
    console.log(`[ESSL Agent] Could not list tables for diagnostics: ${e.message}`);
  }
}

// ── Detect which direction column the ESSL DB uses (DIAGNOSTIC ONLY) ─────────
// ESSL etimetracklite versions differ: some use "Direction", some "IoType".
// Values: 0 = Entry/IN, 1 = Exit/OUT — in theory.
//
// CONFIRMED TWICE on this install (2026-07-15 and again 2026-07-29) that these
// columns cannot be trusted: Direction/AttDirection sit blank/NULL for the
// overwhelming majority of real device punches, and a single stray populated
// row (e.g. a manually-entered record) is enough to make the previous
// "at least 1 non-blank row" check wrongly trust the column. SQL Server then
// implicitly converts '' to 0 in the `= 0`/`= 1` comparison, so EVERY blank
// row silently becomes 'in' — that's why staff who genuinely punched OUT
// (confirmed on the ESSL device's own log viewer) showed up with no out_time
// at all: attendance.groupSwipes() below never received a single 'out'.
//
// This function is now diagnostic-only (reported via heartbeat so the real
// column population can be inspected remotely) — its result is NOT used to
// classify punches. See groupSwipes(): direction is derived purely
// chronologically (first punch of the day = in, last = out), which doesn't
// depend on any device column being populated at all.
async function detectDirectionExpr(conn, table) {
  for (const col of ['Direction', 'IoType', 'InOutMode']) {
    try {
      // Require BOTH a 0 and a 1 value to actually appear across a real sample —
      // not just one non-blank row — before even reporting a column as a candidate.
      const r = await conn.request().query(`
        SELECT
          SUM(CASE WHEN [${col}] = 0 THEN 1 ELSE 0 END) AS zeros,
          SUM(CASE WHEN [${col}] = 1 THEN 1 ELSE 0 END) AS ones,
          COUNT(*) AS total
        FROM (SELECT TOP 500 [${col}] FROM [${table}] ORDER BY LogDate DESC) x
      `);
      const { zeros, ones, total } = r.recordset[0] || {};
      if (!total || !zeros || !ones) {
        console.log(`[ESSL Agent] Column [${col}] not reliably populated (0s=${zeros||0}, 1s=${ones||0} of ${total||0} sampled) — not using for direction.`);
        continue;
      }
      directionSource = col;
      console.log(`[ESSL Agent] Column [${col}] looks populated (0s=${zeros}, 1s=${ones} of ${total}) — reported via heartbeat for reference only, still not used for classification.`);
      return;
    } catch (_) {}
  }
  directionSource = 'none_populated';
}

// ── Pull device online/offline status from the ESSL "Devices" master table ───
// LastPing is a native SQL Server DATETIME (naive IST wall-clock, no
// timezone) — the mssql/tedious driver hands it back as a JS Date whose
// UTC getters mirror the raw stored numerals 1:1, so we read it with
// getUTC* accessors (NOT the IST_OFFSET_MS shift used for locally-built
// dates) and send the naive string as-is; the backend tags it +05:30.
function naiveSqlDateStr(d) {
  if (!d) return null;
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}
async function pullDeviceStatus(conn) {
  try {
    const r = await conn.request().query(`
      SELECT DeviceId, DeviceFName, DeviceSName, SerialNumber, DeviceLocation, DeviceType, IpAddress, LastPing
      FROM Devices
    `);
    return r.recordset.map(d => ({
      device_id:     d.DeviceId,
      name:          d.DeviceFName || d.DeviceSName || `Device ${d.DeviceId}`,
      short_name:    d.DeviceSName || null,
      serial_number: d.SerialNumber || null,
      location:      d.DeviceLocation || null,
      device_type:   d.DeviceType || null,
      ip_address:    d.IpAddress || null,
      last_ping:     naiveSqlDateStr(d.LastPing),
    }));
  } catch (e) {
    console.log(`[ESSL Agent] Could not pull device status: ${e.message.split('\n')[0]}`);
    return [];
  }
}

// ── Pull swipe data from ESSL ─────────────────────────────────────────────────
// direction is NOT used for classification (see detectDirectionExpr above) —
// C1 is still selected and exported on raw swipes purely for audit/reference.
async function pullSwipes(conn, tables, fromDT, toDT) {
  if (!tables.length) return [];

  // Diagnostic only — populates `directionSource` for the heartbeat, doesn't affect grouping.
  await detectDirectionExpr(conn, tables[0]);

  const unionSQL = tables.map(t => `
    SELECT
      e.EmployeeCode                          AS emp_code,
      CONVERT(VARCHAR(23), d.LogDate, 121)    AS swipe_time,
      LOWER(LTRIM(RTRIM(COALESCE(d.C1, '')))) AS direction
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
// Direction flags from ESSL are unreliable on this install (confirmed twice —
// see detectDirectionExpr) — in/out is derived purely chronologically:
// first punch of the day = in_time, last punch = out_time (if more than one).
function groupSwipes(rows) {
  const grouped = {};
  for (const row of rows) {
    const code = String(row.emp_code || '').trim();
    if (!code) continue;
    const dt   = new Date(row.swipe_time);
    const date = toDateStr(dt);
    const time = dt.toTimeString().slice(0, 8);
    const key  = `${code}|${date}`;
    if (!grouped[key]) grouped[key] = { emp_code: code, date, all: [] };
    grouped[key].all.push(time);
  }

  return Object.values(grouped).map(g => {
    g.all.sort();
    const punch_count = g.all.length;
    const in_time      = g.all[0] || null;
    const out_time     = punch_count > 1 ? g.all[punch_count - 1] : null;
    return { emp_code: g.emp_code, date: g.date, in_time, out_time, punch_count };
  });
}

// ── Generic JSON POST to any ERP endpoint (derives host/port from push_url) ──
function postJSON(pathname, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const url  = new URL(cfg.erp.push_url);
    const opts = {
      hostname: url.hostname,
      port:     url.port || (url.protocol === 'https:' ? 443 : 80),
      path:     pathname,
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

// ── Heartbeat — called every tick regardless of whether there was data to
// push, so the ERP's Sync Health dashboard can tell "agent alive, just no
// new swipes" apart from "agent stopped running" (last_sync alone can't).
function sendHeartbeat(meta) {
  const heartbeatPath = cfg.erp.push_url.replace(/\/agent-push\/?$/, '/heartbeat');
  return postJSON(heartbeatPath, {
    api_key: cfg.erp.api_key,
    company_id: cfg.erp.company_id,
    ...meta,
  }).catch(err => console.log(`[ESSL Agent] Heartbeat failed (non-fatal): ${err.message}`));
}

// ── Push device online/offline status to cloud ERP ────────────────────────────
function pushDeviceStatus(devices) {
  if (!devices.length) return Promise.resolve();
  const devicesPath = cfg.erp.push_url.replace(/\/agent-push\/?$/, '/device-status');
  return postJSON(devicesPath, {
    api_key: cfg.erp.api_key,
    company_id: cfg.erp.company_id,
    devices,
  }).catch(err => console.log(`[ESSL Agent] Device-status push failed (non-fatal): ${err.message}`));
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

    // Fire-and-forget, every tick — device online/offline status is
    // independent of whether there are new swipes this window.
    pullDeviceStatus(conn).then(devices => pushDeviceStatus(devices));

    const allTables = monthlyTables(fromDT, toDT);
    const tables    = await existingTables(conn, allTables);
    console.log(`[ESSL Agent] Tables found: ${tables.join(', ') || 'none'}`);

    if (!tables.length) {
      console.log('[ESSL Agent] No DeviceLogs tables for this range.');
      sendHeartbeat({ tables_found: tables, raw_swipe_count: 0, device_log_columns: deviceLogColumns, direction_source: directionSource, device_status_candidates: deviceStatusCandidates, direction_sample: directionSample });
      return;
    }

    const rawSwipes = await pullSwipes(conn, tables, fromDT, toDT);
    console.log(`[ESSL Agent] Raw swipes: ${rawSwipes.length}`);
    // Fire-and-forget — never let a heartbeat failure slow down or break the sync tick
    sendHeartbeat({ tables_found: tables, raw_swipe_count: rawSwipes.length, device_log_columns: deviceLogColumns, direction_source: directionSource, device_status_candidates: deviceStatusCandidates, direction_sample: directionSample });

    const records = groupSwipes(rawSwipes);
    console.log(`[ESSL Agent] Attendance records: ${records.length}`);

    if (!records.length && !rawSwipes.length) { console.log('[ESSL Agent] Nothing to push.'); return; }

    console.log(`[ESSL Agent] Pushing ${records.length} records to ${cfg.erp.push_url} ...`);
    const result = await pushToERP(records, rawSwipes);
    if (result.synced === undefined && result.error === undefined) {
      // Unexpected shape — likely an HTML error page, auth failure, or wrong URL
      console.log('[ESSL Agent] UNEXPECTED response from ERP (not the expected JSON shape):');
      console.log(JSON.stringify(result).slice(0, 500));
    } else if (result.error) {
      console.log(`[ESSL Agent] ERP REJECTED the push: ${result.error}`);
    } else {
      console.log(`[ESSL Agent] Synced: ${result.synced || 0} | Skipped: ${result.skipped || 0} | Raw saved: ${result.raw_saved || 0}`);
      if (result.not_found?.length) console.log(`[ESSL Agent] Not found in ERP (employee_code mismatch): ${result.not_found.join(', ')}`);
      if (result.errors?.length)    console.log('[ESSL Agent] Errors:', result.errors);
    }

  } catch (err) {
    console.error('[ESSL Agent] ERROR:', err.message);
    // Force pool reconnect on next tick
    if (pool) { try { await pool.close(); } catch (_) {} pool = null; }
    if (!loopMode) process.exit(1);
    return false; // signal caller not to advance lastSyncAt
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
      // On first tick use configured window; after that query only since last sync
      // (with a small overlap to catch rows that arrive slightly late)
      const from = lastSyncAt
        ? new Date(lastSyncAt.getTime() - OVERLAP_SECONDS * 1000)
        : addMinutes(now, -windowMin);
      const syncResult = await runSync({
        fromDT: toDateTimeStr(from),
        toDT:   toDateTimeStr(now),
        label:  lastSyncAt ? `since ${toDateTimeStr(from)}` : `last ${windowMin} min`,
      });
      if (syncResult !== false) lastSyncAt = now; // update only on success
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
