// src/routes/hr-essl.routes.js
// Sync attendance from ESSL Biometric → Microsoft SQL Server → hr_attendance
const express = require('express');
const sql     = require('mssql');
const { query, pool } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { runSchemaInit } = require('../utils/schemaInit');
const { splitDayHours } = require('../utils/attendanceHours');

const router = express.Router();

/* ═══════════════════════════════════════════════════════════
   POST /hr-admin/essl/agent-push  (NO auth middleware — uses API key)
   Receives attendance data pushed from the local Windows agent.
   Body: { api_key, company_id, records: [{ emp_code, date, in_time, out_time, punch_count }] }
══════════════════════════════════════════════════════════════ */
router.post('/agent-push', async (req, res) => {
  const { api_key, company_id, records = [], raw_swipes = [] } = req.body;
  if (!api_key || !company_id) return res.status(400).json({ error: 'api_key and company_id required' });

  try {
    const cfgRow = await query(
      `SELECT * FROM hr_essl_config WHERE company_id=$1 AND push_api_key=$2`,
      [company_id, api_key]
    );
    if (!cfgRow.rows.length) return res.status(401).json({ error: 'Invalid API key' });

    const erpEmps = await query(
      `SELECT u.id, u.employee_code FROM users u
       JOIN employee_profiles ep ON ep.user_id = u.id
       WHERE u.company_id=$1 AND u.is_active=true`,
      [company_id]
    );
    const empMap = {};
    erpEmps.rows.forEach(r => { empMap[String(r.employee_code).trim().toLowerCase()] = r.id; });

    // Also load SC workers so their swipes go to sc_attendance.
    // worker_code (WKR-0001) is an internal ERP id and never matches ESSL's own
    // numeric employee codes — match on essl_emp_code first, worker_code as fallback.
    const scWorkers = await query(
      `SELECT id, worker_code, essl_emp_code, sc_id, project_id, wo_id FROM sc_workers
       WHERE company_id=$1 AND status='active'`,
      [company_id]
    );
    const scMap = {};
    scWorkers.rows.forEach(r => {
      if (r.essl_emp_code) scMap[String(r.essl_emp_code).trim().toLowerCase()] = r;
      if (r.worker_code)    scMap[String(r.worker_code).trim().toLowerCase()] ??= r;
    });

    // Per-employee late cutoff from their assigned shift (site / head office etc.)
    const cutoffMap = await buildShiftCutoffMap(company_id);

    const results = { synced: 0, skipped: 0, not_found: [], errors: [] };

    // Build every row's values in memory first (pure/in-memory work — no DB
    // calls), then insert each table in ONE multi-row statement instead of
    // one round-trip per record. The agent pushes every ~30s, but during a
    // shift-start rush (dozens of punches in a few minutes) the old
    // one-row-at-a-time loop could take several seconds per push, which
    // serialized against the agent's next tick and made "near-real-time"
    // sync visibly lag. Batching collapses that to a handful of round-trips
    // regardless of batch size.
    const hrRows = new Map();  // key: `${userId}|${date}` — last one wins, same as sequential upserts did
    const scRows = new Map();  // key: `${workerId}|${date}`

    for (const rec of records) {
      const code   = String(rec.emp_code || '').trim().toLowerCase();
      const userId = empMap[code];
      const scWorker = !userId ? scMap[code] : null;

      if (!userId && !scWorker) { results.not_found.push(rec.emp_code); results.skipped++; continue; }

      const inTime  = rec.in_time  || null;
      const outTime = rec.out_time || null;
      const hasIn   = !!inTime;
      const hasOut  = !!outTime && outTime !== inTime;
      const status  = resolveStatus(hasIn, hasOut);

      if (userId) {
        const lateMin = lateMinutesFor(inTime, cutoffMap[userId] ?? DEFAULT_CUTOFF_MINS);
        hrRows.set(`${userId}|${rec.date}`, [userId, company_id, rec.date, status, inTime, outTime, lateMin]);
      } else {
        let hoursWorked = 8;
        if (inTime && outTime && outTime !== inTime) {
          const [ih, im] = inTime.split(':').map(Number);
          const [oh, om] = outTime.split(':').map(Number);
          const diff = (oh * 60 + om) - (ih * 60 + im);
          if (diff > 0) hoursWorked = Math.min(parseFloat((diff / 60).toFixed(2)), 12);
        }
        // Split into regular (<=8h) + overtime so the NMR/bill price this
        // day against the right WO line items.
        const h = splitDayHours(hoursWorked);
        scRows.set(`${scWorker.id}|${rec.date}`, [
          company_id, scWorker.project_id, scWorker.sc_id, scWorker.wo_id, scWorker.id,
          rec.date, status, h.regular, h.overtime, inTime || null, (hasOut ? outTime : null),
        ]);
      }
    }

    if (hrRows.size) {
      try {
        await bulkUpsertHrAttendance([...hrRows.values()]);
        results.synced += hrRows.size;
      } catch (e2) {
        // Fall back to the slower one-row-at-a-time path so a single bad row
        // (or a rare cross-row conflict) can't drop an entire good batch.
        for (const row of hrRows.values()) {
          try { await bulkUpsertHrAttendance([row]); results.synced++; }
          catch (e3) { results.errors.push({ emp: row[0], date: row[2], error: e3.message }); }
        }
      }
    }

    if (scRows.size) {
      try {
        await bulkUpsertScAttendance([...scRows.values()]);
        results.synced += scRows.size;
      } catch (e2) {
        for (const row of scRows.values()) {
          try { await bulkUpsertScAttendance([row]); results.synced++; }
          catch (e3) { results.errors.push({ worker: row[4], date: row[5], error: e3.message }); }
        }
      }
    }

    // ── Save raw swipes to essl_device_logs ───────────────────────────────
    // The agent sends swipe_time as a naive IST wall-clock string (e.g.
    // "2026-07-26 07:20:59"). This backend runs in UTC (Railway), so we must
    // tag the string with the explicit +05:30 offset before it hits a
    // TIMESTAMPTZ column — otherwise Postgres/pg silently interprets it as
    // UTC and every swipe is stored ~5.5 hours later than it actually happened.
    if (raw_swipes.length) {
      const swipeRows = new Map(); // dedupe: agent re-sends the last ~30s of the previous window every tick
      for (const s of raw_swipes) {
        const swipeTimeIST = /[Z+-]\d{2}:?\d{2}$|Z$/.test(String(s.swipe_time).trim())
          ? s.swipe_time
          : `${String(s.swipe_time).trim()}+05:30`;
        const empCode = String(s.emp_code).trim();
        swipeRows.set(`${empCode}|${swipeTimeIST}`, [company_id, empCode, swipeTimeIST, s.direction || null]);
      }
      try {
        await bulkUpsertDeviceLogs([...swipeRows.values()]);
      } catch (_) {
        // Best-effort, same as before — raw log is diagnostic, never blocks the real sync.
        for (const row of swipeRows.values()) await bulkUpsertDeviceLogs([row]).catch(() => {});
      }
    }

    await query(`UPDATE hr_essl_config SET last_sync=NOW() WHERE company_id=$1`, [company_id]);
    res.json({ success: true, ...results, raw_saved: raw_swipes.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════════
   POST /hr-admin/essl/heartbeat  (NO auth middleware — uses API key)
   Called by the local agent on EVERY tick, whether or not there was
   data to push. This is the only reliable "agent is alive right now"
   signal — last_sync only moves when there are swipes, so it goes
   quiet for hours overnight even when the agent is perfectly healthy.
   Body: { api_key, company_id, tables_found, raw_swipe_count }
══════════════════════════════════════════════════════════════ */
router.post('/heartbeat', async (req, res) => {
  const { api_key, company_id, tables_found, raw_swipe_count, device_log_columns, direction_source, device_status_candidates, direction_sample } = req.body;
  if (!api_key || !company_id) return res.status(400).json({ error: 'api_key and company_id required' });
  try {
    const cfgRow = await query(
      `SELECT id FROM hr_essl_config WHERE company_id=$1 AND push_api_key=$2`,
      [company_id, api_key]
    );
    if (!cfgRow.rows.length) return res.status(401).json({ error: 'Invalid API key' });

    await query(
      `UPDATE hr_essl_config SET last_heartbeat=NOW(), last_heartbeat_meta=$2 WHERE company_id=$1`,
      [company_id, JSON.stringify({
        tables_found: tables_found || [],
        raw_swipe_count: raw_swipe_count ?? null,
        device_log_columns: device_log_columns || undefined,
        direction_source: direction_source || undefined,
        device_status_candidates: device_status_candidates || undefined,
        direction_sample: direction_sample || undefined,
      })]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════════
   POST /hr-admin/essl/device-status  (NO auth middleware — uses API key)
   Receives the ESSL "Devices" master-table snapshot pushed every tick by
   the local agent — mirrors the ESSL web dashboard's own online/offline
   device list. Body: { api_key, company_id, devices: [{ device_id, name,
   short_name, serial_number, location, device_type, ip_address, last_ping }] }
══════════════════════════════════════════════════════════════ */
router.post('/device-status', async (req, res) => {
  const { api_key, company_id, devices = [] } = req.body;
  if (!api_key || !company_id) return res.status(400).json({ error: 'api_key and company_id required' });
  try {
    const cfgRow = await query(
      `SELECT id FROM hr_essl_config WHERE company_id=$1 AND push_api_key=$2`,
      [company_id, api_key]
    );
    if (!cfgRow.rows.length) return res.status(401).json({ error: 'Invalid API key' });

    for (const d of devices) {
      // last_ping is a naive IST wall-clock string from the agent — tag with
      // the explicit offset before it hits a TIMESTAMPTZ column (same fix as
      // essl_device_logs.swipe_time: this backend runs in UTC on Railway).
      const lastPingIST = d.last_ping && !/[Z+-]\d{2}:?\d{2}$|Z$/.test(String(d.last_ping).trim())
        ? `${String(d.last_ping).trim()}+05:30`
        : d.last_ping || null;
      await query(
        `INSERT INTO essl_device_status (company_id, device_id, name, short_name, serial_number, location, device_type, ip_address, last_ping, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
         ON CONFLICT (company_id, device_id)
         DO UPDATE SET name=$3, short_name=$4, serial_number=$5, location=$6, device_type=$7, ip_address=$8, last_ping=$9, updated_at=NOW()`,
        [company_id, d.device_id, d.name || null, d.short_name || null, d.serial_number || null,
         d.location || null, d.device_type || null, d.ip_address || null, lastPingIST]
      ).catch(() => {});
    }
    res.json({ success: true, updated: devices.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── All routes below require JWT authentication ───────────────────────────────
router.use(authenticate);
router.use(authorize('super_admin', 'admin', 'hr_admin', 'hr', 'hr_manager',
  'managing_director', 'director', 'ceo', 'cfo', 'md'));

// ─── Auto-create settings table to persist MSSQL config per company ──────────
async function initTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS hr_essl_config (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id  UUID REFERENCES companies(id) UNIQUE,
      host        TEXT NOT NULL,
      port        INT  DEFAULT 1433,
      database    TEXT NOT NULL,
      username    TEXT NOT NULL,
      password    TEXT NOT NULL,
      instance    TEXT,
      domain      TEXT,
      last_sync   TIMESTAMPTZ,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Add push_api_key column for local agent authentication
  await query(`ALTER TABLE hr_essl_config ADD COLUMN IF NOT EXISTS push_api_key TEXT`);

  // Raw biometric punch log — one row per swipe from the ESSL device
  await query(`
    CREATE TABLE IF NOT EXISTS essl_device_logs (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id  UUID NOT NULL,
      emp_code    TEXT NOT NULL,
      swipe_time  TIMESTAMPTZ NOT NULL,
      direction   TEXT,
      source      TEXT DEFAULT 'agent',
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (company_id, emp_code, swipe_time)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_essl_logs_emp ON essl_device_logs(company_id, emp_code, swipe_time DESC)`);
}
runSchemaInit('hr-essl', initTable);

// last_heartbeat is updated on EVERY agent tick (even empty ones) so "is the
// agent alive right now" doesn't depend on there being new swipes to push —
// last_sync only moves when there's actual data, which goes quiet overnight
// and would otherwise look identical to the agent having crashed.
// Separately keyed from 'hr-essl' above — that migration name was already
// marked applied on production before these columns existed, and
// runSchemaInit never re-runs a name it has already recorded.
runSchemaInit('hr-essl-heartbeat-cols', async () => {
  await query(`ALTER TABLE hr_essl_config ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ`);
  await query(`ALTER TABLE hr_essl_config ADD COLUMN IF NOT EXISTS last_heartbeat_meta JSONB`);
});

// Mirrors the ESSL web dashboard's own device list (DeviceSName, DeviceFName,
// Serial No, Location, Last Ping) — one row per biometric device, upserted by
// the agent every tick from the ESSL SQL Server's "Devices" master table.
runSchemaInit('hr-essl-device-status', async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS essl_device_status (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id    UUID NOT NULL,
      device_id     INT NOT NULL,
      name          TEXT,
      short_name    TEXT,
      serial_number TEXT,
      location      TEXT,
      device_type   TEXT,
      ip_address    TEXT,
      last_ping     TIMESTAMPTZ,
      updated_at    TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (company_id, device_id)
    )
  `);
});

// ─── Build mssql config from saved row ───────────────────────────────────────
function buildMssqlConfig(cfg) {
  let server       = cfg.host  || '';
  let instanceName = cfg.instance || undefined;

  // Support "HOSTNAME\INSTANCE" entered directly in the host field
  if (server.includes('\\')) {
    const parts = server.split('\\');
    server       = parts[0].trim();
    instanceName = parts[1].trim() || instanceName;
  }

  const config = {
    user:     cfg.username,
    password: cfg.password,
    server,
    database: cfg.database,
    options: {
      instanceName,                    // named instance → SQL Browser resolves port
      domain:                cfg.domain || undefined,
      encrypt:               false,    // on-premise ESSL servers rarely use TLS
      trustServerCertificate: true,
      connectTimeout:        20000,
      requestTimeout:        30000,
    },
  };

  // Named instances use dynamic ports — do NOT set port when instanceName is present
  // (SQL Server Browser on UDP 1434 resolves it automatically)
  if (!instanceName) {
    config.port = parseInt(cfg.port) || 1433;
  }

  return config;
}

// ─── Status resolver ──────────────────────────────────────────────────────────
// Single punch (in only OR out only) = present.
// ── Bulk upsert helpers for POST /agent-push ─────────────────────────────────
// Each takes an array of already-computed row-value arrays (same column order
// as the old per-row INSERT) and does the whole batch in one round-trip via a
// multi-row VALUES list, instead of one query per row.
function buildValuesList(rows, colsPerRow) {
  const placeholders = [];
  const params = [];
  let p = 1;
  for (const row of rows) {
    const ph = [];
    for (let i = 0; i < colsPerRow; i++) ph.push(`$${p++}`);
    placeholders.push(`(${ph.join(',')})`);
    params.push(...row);
  }
  return { placeholdersSql: placeholders.join(','), params };
}

async function bulkUpsertHrAttendance(rows) {
  if (!rows.length) return;
  const { placeholdersSql, params } = buildValuesList(rows, 7);
  await query(
    `INSERT INTO hr_attendance (user_id, company_id, attendance_date, status, in_time, out_time, late_minutes, source)
     SELECT v.user_id::uuid, v.company_id::uuid, v.attendance_date::date, v.status::text,
            v.in_time::time, v.out_time::time, v.late_minutes::int, 'essl_agent'
     FROM (VALUES ${placeholdersSql}) AS v(user_id, company_id, attendance_date, status, in_time, out_time, late_minutes)
     ON CONFLICT (user_id, attendance_date) DO UPDATE
       SET status=EXCLUDED.status,
           in_time=COALESCE(EXCLUDED.in_time, hr_attendance.in_time),
           out_time=COALESCE(EXCLUDED.out_time, hr_attendance.out_time),
           late_minutes=EXCLUDED.late_minutes, source='essl_agent'
     WHERE hr_attendance.leave_request_id IS NULL
       AND hr_attendance.source NOT IN ('regularization','manual')`,
    params
  );
}

async function bulkUpsertScAttendance(rows) {
  if (!rows.length) return;
  const { placeholdersSql, params } = buildValuesList(rows, 11);
  await query(
    `INSERT INTO sc_attendance (company_id, project_id, sc_id, wo_id, worker_id, attendance_date, status, hours_worked, overtime_hours, in_time, out_time, remarks)
     SELECT v.company_id::uuid, v.project_id::uuid, v.sc_id::uuid, v.wo_id::uuid, v.worker_id::uuid,
            v.attendance_date::date, v.status::text, v.hours_worked::numeric, v.overtime_hours::numeric,
            v.in_time::time, v.out_time::time, 'essl_agent'
     FROM (VALUES ${placeholdersSql}) AS v(company_id, project_id, sc_id, wo_id, worker_id, attendance_date, status, hours_worked, overtime_hours, in_time, out_time)
     ON CONFLICT (worker_id, attendance_date) DO UPDATE
       SET status=EXCLUDED.status, hours_worked=EXCLUDED.hours_worked, overtime_hours=EXCLUDED.overtime_hours,
           in_time=EXCLUDED.in_time, out_time=EXCLUDED.out_time, remarks='essl_agent'`,
    params
  );
}

async function bulkUpsertDeviceLogs(rows) {
  if (!rows.length) return;
  const { placeholdersSql, params } = buildValuesList(rows, 4);
  await query(
    `INSERT INTO essl_device_logs (company_id, emp_code, swipe_time, direction, source)
     SELECT v.company_id::uuid, v.emp_code::text, v.swipe_time::timestamptz, v.direction::text, 'agent'
     FROM (VALUES ${placeholdersSql}) AS v(company_id, emp_code, swipe_time, direction)
     ON CONFLICT (company_id, emp_code, swipe_time)
     DO UPDATE SET direction=EXCLUDED.direction, source='agent'`,
    params
  );
}

// SP is flagged in the frontend by checking present + null out_time.
// No punches at all = absent.
function resolveStatus(hasIn, hasOut) {
  if (hasIn && hasOut) return 'present';
  if (hasIn || hasOut) return 'present'; // single punch — missed out-punch, still worked
  return 'absent';
}

// Default "on-time by" cutoff in minutes-since-midnight when an employee has no
// shift assigned (09:30, matching the historical hardcoded behaviour).
const DEFAULT_CUTOFF_MINS = 9 * 60 + 30;

// Build { userId: cutoffMinutes } for a company from each employee's currently
// effective shift assignment. cutoff = shift start_time exactly — no grace
// period, by policy — so site and head-office staff are judged late against
// their OWN configured shift start time (set in Shift Management) instead of
// a single company-wide 09:30. Employees with no shift assignment fall back
// to DEFAULT_CUTOFF_MINS.
async function buildShiftCutoffMap(companyId) {
  const map = {};
  try {
    const { rows } = await query(`
      SELECT DISTINCT ON (es.employee_id)
             es.employee_id,
             hs.start_time
      FROM hr_employee_shifts es
      JOIN hr_shifts hs ON hs.id = es.shift_id
      WHERE es.company_id = $1
        AND es.effective_from <= CURRENT_DATE
        AND (es.effective_to IS NULL OR es.effective_to >= CURRENT_DATE)
      ORDER BY es.employee_id, es.effective_from DESC
    `, [companyId]);
    for (const r of rows) {
      if (!r.start_time) continue;
      const [h, m] = String(r.start_time).split(':').map(Number);
      map[r.employee_id] = h * 60 + m;
    }
  } catch (_) { /* no shift tables / assignments — everyone uses the default */ }
  return map;
}

// Late minutes for an arrival "HH:MM[:SS]" against the employee's cutoff.
function lateMinutesFor(inTime, cutoffMins) {
  if (!inTime) return 0;
  const [h, m] = String(inTime).split(':').map(Number);
  const arr = h * 60 + m;
  return arr > cutoffMins ? arr - cutoffMins : 0;
}

// ─── Build list of DeviceLogs_M_YYYY table names for a date range ─────────────
function monthlyTables(from, to) {
  const tables = [];
  const end = new Date(to);
  let cur = new Date(new Date(from).getFullYear(), new Date(from).getMonth(), 1);
  while (cur <= end) {
    tables.push(`DeviceLogs_${cur.getMonth() + 1}_${cur.getFullYear()}`);
    cur.setMonth(cur.getMonth() + 1);
  }
  return tables;
}

// ─── Check which tables actually exist in the ESSL DB ────────────────────────
async function existingTables(conn, tables) {
  const result = [];
  for (const t of tables) {
    try {
      await conn.request().query(`SELECT TOP 1 DeviceLogId FROM [${t}]`);
      result.push(t);
    } catch (_) { /* table not present for that month */ }
  }
  return result;
}

// ─── Build UNION ALL swipe query across monthly tables ───────────────────────
// erpCodes: array of employee code strings to filter (only registered employees)
function buildSwipeSQL(tables, erpCodes) {
  const codeList   = erpCodes.map(c => `'${c.replace(/'/g, "''")}'`).join(',');
  const codeFilter = codeList ? `AND e.EmployeeCode IN (${codeList})` : '';

  return tables.map(t => `
    SELECT e.EmployeeCode AS emp_code,
           e.EmployeeName AS emp_name,
           CONVERT(VARCHAR(19), d.LogDate, 120) AS swipe_time,
           -- Derive direction from hour: before 12:00 = in, 12:00 onwards = out
           CASE WHEN DATEPART(HOUR, d.LogDate) < 12 THEN 'in' ELSE 'out' END AS direction
    FROM [${t}] d
    JOIN Employees e ON e.NumericCode = d.UserId
    WHERE CONVERT(VARCHAR(19), d.LogDate, 120) BETWEEN @from AND @to
    ${codeFilter}`
  ).join('\n    UNION ALL');
}

/* ═══════════════════════════════════════════════════════════
   GET /hr-admin/essl/config
   Returns saved MSSQL connection config (password masked)
══════════════════════════════════════════════════════════════ */
router.get('/config', async (req, res) => {
  try {
    const r = await query(
      `SELECT id, host, port, database, username, '••••••' AS password,
              instance, domain, last_sync
       FROM hr_essl_config WHERE company_id=$1`,
      [req.user.company_id]
    );
    res.json({ data: r.rows[0] || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   POST /hr-admin/essl/config
   Save / update MSSQL connection settings
══════════════════════════════════════════════════════════════ */
router.post('/config', async (req, res) => {
  const { host, port = 1433, database, username, password, instance, domain } = req.body;
  if (!host || !database || !username || !password)
    return res.status(400).json({ error: 'host, database, username, password are required' });

  try {
    await query(
      `INSERT INTO hr_essl_config (company_id, host, port, database, username, password, instance, domain)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (company_id) DO UPDATE
         SET host=$2, port=$3, database=$4, username=$5,
             password=$6, instance=$7, domain=$8, updated_at=NOW()`,
      [req.user.company_id, host, port, database, username, password,
       instance||null, domain||null]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   POST /hr-admin/essl/test-connection
   Try connecting to ESSL SQL Server and return DB info + table list
══════════════════════════════════════════════════════════════ */
router.post('/test-connection', async (req, res) => {
  const { host, port = 1433, database, username, password, instance, domain } = req.body;
  if (!host || !database || !username || !password)
    return res.status(400).json({ error: 'host, database, username, password are required' });

  let conn;
  try {
    conn = await sql.connect(buildMssqlConfig({ host, port, database, username, password, instance, domain }));

    // Count employees
    const empCount = await conn.request().query(`SELECT COUNT(*) AS n FROM Employees WHERE Status='Working'`);

    // Find DeviceLogs tables for current year
    const now   = new Date();
    const month = now.getMonth() + 1;
    const year  = now.getFullYear();
    const recentTables = [];
    for (let m = Math.max(1, month - 2); m <= month; m++) {
      recentTables.push(`DeviceLogs_${m}_${year}`);
    }
    const found = await existingTables(conn, recentTables);

    // Count today's swipes from latest table
    let todaySwipes = 0;
    if (found.length > 0) {
      try {
        const r = await conn.request().query(
          `SELECT COUNT(*) AS n FROM [${found[found.length - 1]}]
           WHERE CAST(LogDate AS DATE) = CAST(GETDATE() AS DATE)`
        );
        todaySwipes = r.recordset[0].n;
      } catch (_) {}
    }

    res.json({
      success:      true,
      server:       host,
      database,
      employees:    empCount.recordset[0].n,
      tables_found: found,
      today_swipes: todaySwipes,
    });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  } finally {
    if (conn) await conn.close().catch(() => {});
  }
});

/* ═══════════════════════════════════════════════════════════
   GET /hr-admin/essl/preview?from=YYYY-MM-DD&to=YYYY-MM-DD
   Fetch raw swipe logs from ESSL (no import, just show)
══════════════════════════════════════════════════════════════ */
router.get('/preview', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to dates required' });

  try {
    const cfgRow = await query(
      `SELECT * FROM hr_essl_config WHERE company_id=$1`, [req.user.company_id]
    );
    if (!cfgRow.rows.length)
      return res.status(400).json({ error: 'ESSL connection not configured.' });

    const cfg  = cfgRow.rows[0];
    const conn = await sql.connect(buildMssqlConfig(cfg));

    // Load registered ERP employee codes for this company
    const erpEmps = await query(
      `SELECT employee_code FROM users WHERE company_id=$1 AND is_active=true AND employee_code IS NOT NULL`,
      [req.user.company_id]
    );
    const erpCodesArr = erpEmps.rows.map(r => String(r.employee_code).trim());

    if (erpCodesArr.length === 0) {
      await conn.close().catch(() => {});
      return res.json({ data: [], total: 0, message: 'No registered employees found in ERP' });
    }

    const tables = await existingTables(conn, monthlyTables(from, to));
    if (tables.length === 0) {
      await conn.close().catch(() => {});
      return res.json({ data: [], total: 0, message: 'No DeviceLogs tables found for this date range' });
    }

    // Pass erpCodes into SQL — filters inside DB, no TOP wasted on unregistered workers
    const unionSQL = buildSwipeSQL(tables, erpCodesArr);
    const r = await conn.request()
      .input('from', sql.VarChar, from + ' 00:00:00')
      .input('to',   sql.VarChar, to   + ' 23:59:59')
      .query(`${unionSQL} ORDER BY emp_code, swipe_time ASC`);

    await conn.close().catch(() => {});

    res.json({ data: r.recordset, total: r.recordset.length, tables_queried: tables });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   POST /hr-admin/essl/sync
   Pull attendance from ESSL for a date range → hr_attendance
   Algorithm:
     1. Pull all CHECKINOUT rows for date range
     2. Group by (emp_code, date)
     3. First swipe = in_time, Last swipe = out_time
     4. Determine status: both → present, one → half_day
     5. Upsert into hr_attendance (source='essl')
══════════════════════════════════════════════════════════════ */
router.post('/sync', async (req, res) => {
  const { from, to } = req.body;
  if (!from || !to) return res.status(400).json({ error: 'from and to dates required' });

  try {
    const cfgRow = await query(
      `SELECT * FROM hr_essl_config WHERE company_id=$1`, [req.user.company_id]
    );
    if (!cfgRow.rows.length)
      return res.status(400).json({ error: 'ESSL connection not configured.' });

    const cfg       = cfgRow.rows[0];
    const companyId = req.user.company_id;

    // ── Load ERP employee map: emp_code → user_id ──────────────────────────
    const erpEmps = await query(
      `SELECT u.id, u.employee_code FROM users u
       JOIN employee_profiles ep ON ep.user_id = u.id
       WHERE u.company_id=$1 AND u.is_active=true`,
      [companyId]
    );
    const empMap     = {};
    const erpCodesArr = [];
    erpEmps.rows.forEach(r => {
      const code = String(r.employee_code).trim();
      empMap[code.toLowerCase()] = r.id;
      erpCodesArr.push(code);
    });

    // Per-employee late cutoff from their assigned shift (site / head office etc.)
    const cutoffMap = await buildShiftCutoffMap(companyId);

    // ── Connect to ESSL MSSQL ──────────────────────────────────────────────
    const conn   = await sql.connect(buildMssqlConfig(cfg));
    const tables = await existingTables(conn, monthlyTables(from, to));

    if (tables.length === 0) {
      await conn.close().catch(() => {});
      return res.json({ success: true, message: 'No DeviceLogs tables found for this date range', synced: 0, skipped: 0 });
    }

    // Filter inside SQL — only registered ERP employees
    const unionSQL = buildSwipeSQL(tables, erpCodesArr);
    const r = await conn.request()
      .input('from', sql.VarChar, from + ' 00:00:00')
      .input('to',   sql.VarChar, to   + ' 23:59:59')
      .query(`${unionSQL} ORDER BY emp_code, swipe_time`);

    const rawRows   = r.recordset;
    const tableUsed = tables.join(', ');
    await conn.close().catch(() => {});

    // ── Group swipes by (emp_code, date) ──────────────────────────────────
    const grouped = {};
    for (const row of rawRows) {
      const code = String(row.emp_code || '').trim().toLowerCase();
      if (!code) continue;

      const swipeDate = new Date(row.swipe_time);
      const dateStr   = swipeDate.toISOString().split('T')[0];
      const timeStr   = swipeDate.toTimeString().split(' ')[0]; // HH:MM:SS
      const key       = `${code}|${dateStr}`;

      if (!grouped[key]) {
        grouped[key] = { emp_code: code, date: dateStr, swipes: [] };
      }
      // direction: 'in' | 'out' (eTimeTrackLite C1 column)
      const dir = String(row.direction || '').trim().toLowerCase();
      grouped[key].swipes.push({ time: timeStr, type: dir });
    }

    // ── Upsert into hr_attendance ──────────────────────────────────────────
    const results = { synced: 0, skipped: 0, not_found: [], errors: [] };

    for (const [key, g] of Object.entries(grouped)) {
      const userId = empMap[g.emp_code];
      if (!userId) {
        if (!results.not_found.includes(g.emp_code)) results.not_found.push(g.emp_code);
        results.skipped++;
        continue;
      }

      // Sort swipes by time
      g.swipes.sort((a, b) => a.time.localeCompare(b.time));

      // direction derived from hour in SQL: before 12:00 = 'in', 12:00+ = 'out'
      const inSwipes  = g.swipes.filter(s => s.type === 'in');
      const outSwipes = g.swipes.filter(s => s.type === 'out');

      // First IN swipe of day; if no morning swipe, use first swipe overall
      const inTime  = inSwipes.length  ? inSwipes[0].time : g.swipes[0]?.time || null;
      // Last OUT swipe of day; if no afternoon swipe, use last swipe (if > 1 swipe)
      const outTime = outSwipes.length ? outSwipes[outSwipes.length - 1].time
                                       : (g.swipes.length > 1 ? g.swipes[g.swipes.length - 1].time : null);

      const hasIn  = !!inTime;
      const hasOut = !!outTime && outTime !== inTime;

      // Late minutes against the employee's assigned shift cutoff (falls back to
      // 09:30 when no shift is assigned) — see buildShiftCutoffMap.
      const lateMin = lateMinutesFor(inTime, cutoffMap[userId] ?? DEFAULT_CUTOFF_MINS);

      const status = resolveStatus(hasIn, hasOut);

      try {
        await query(
          `INSERT INTO hr_attendance
             (user_id, company_id, attendance_date, status,
              in_time, out_time, late_minutes, source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'essl')
           ON CONFLICT (user_id, attendance_date) DO UPDATE
             SET status=$4,
                 in_time=COALESCE($5, hr_attendance.in_time),
                 out_time=COALESCE($6, hr_attendance.out_time),
                 late_minutes=$7,
                 source='essl'`,
          [userId, companyId, g.date, status,
           inTime||null, outTime||null, lateMin]
        );
        results.synced++;
      } catch (e2) {
        results.errors.push({ emp: g.emp_code, date: g.date, error: e2.message });
      }
    }

    // ── Save raw swipes to essl_device_logs ───────────────────────────────
    // row.swipe_time comes straight from SQL Server as a naive IST wall-clock
    // string (CONVERT(...,120)). Tag it with +05:30 before any Date parsing —
    // this Node process runs in UTC (Railway), so an untagged string would be
    // silently misread as UTC, shifting every swipe ~5.5 hours later.
    for (const row of rawRows) {
      const swipeTimeIST = /[Z+-]\d{2}:?\d{2}$|Z$/.test(String(row.swipe_time).trim())
        ? row.swipe_time
        : `${String(row.swipe_time).trim()}+05:30`;
      await query(
        `INSERT INTO essl_device_logs (company_id, emp_code, swipe_time, direction, source)
         VALUES ($1,$2,$3,$4,'manual_sync')
         ON CONFLICT (company_id, emp_code, swipe_time) DO NOTHING`,
        [companyId, String(row.emp_code).trim(), swipeTimeIST, row.direction || null]
      ).catch(() => {});
    }

    // ── Update last_sync timestamp ─────────────────────────────────────────
    await query(
      `UPDATE hr_essl_config SET last_sync=NOW() WHERE company_id=$1`,
      [companyId]
    );

    res.json({
      success: true,
      table_used: tableUsed,
      raw_swipes: rawRows.length,
      employee_days: Object.keys(grouped).length,
      ...results,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   GET /hr-admin/essl/devices
   Biometric device online/offline list — mirrors the ESSL web dashboard.
   A device is "online" if the agent saw a LastPing within the last 5
   minutes (ESSL devices ping roughly every ~1 min when reachable).
══════════════════════════════════════════════════════════════ */
router.get('/devices', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT device_id, name, short_name, serial_number, location, device_type, ip_address, last_ping,
              (last_ping IS NOT NULL AND last_ping >= NOW() - INTERVAL '5 minutes') AS online
       FROM essl_device_status
       WHERE company_id=$1
       ORDER BY online DESC, name`,
      [req.user.company_id]
    );
    res.json({
      data: rows,
      total: rows.length,
      online: rows.filter(r => r.online).length,
      offline: rows.filter(r => !r.online).length,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════════
   GET /hr-admin/essl/unmatched
   List ESSL employee codes that have no matching ERP employee
══════════════════════════════════════════════════════════════ */
router.get('/unmatched', async (req, res) => {
  try {
    const cfgRow = await query(
      `SELECT * FROM hr_essl_config WHERE company_id=$1`, [req.user.company_id]
    );
    if (!cfgRow.rows.length)
      return res.status(400).json({ error: 'ESSL connection not configured.' });

    const cfg  = cfgRow.rows[0];
    const conn = await sql.connect(buildMssqlConfig(cfg));

    // eTimeTrackLite uses Employees table
    const r = await conn.request().query(`
      SELECT EmployeeCode AS emp_code, EmployeeName AS emp_name
      FROM Employees
      WHERE Status = 'Working'
      ORDER BY EmployeeName
    `);
    const esslEmps = r.recordset;
    await conn.close().catch(() => {});

    // Compare against ERP employee codes
    const erpEmps = await query(
      `SELECT employee_code FROM users WHERE company_id=$1 AND is_active=true`,
      [req.user.company_id]
    );
    const erpCodes = new Set(erpEmps.rows.map(r => r.employee_code.trim().toLowerCase()));

    const unmatched = esslEmps.filter(e =>
      !erpCodes.has(String(e.emp_code || '').trim().toLowerCase())
    );

    res.json({ data: unmatched, total: unmatched.length, essl_total: esslEmps.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   GET /hr-admin/essl/agent-key
   Generate / return the push API key for the local sync agent
══════════════════════════════════════════════════════════════ */
router.get('/agent-key', async (req, res) => {
  try {
    // Auto-create a minimal config row if one doesn't exist yet (use placeholder values for NOT NULL cols)
    await query(
      `INSERT INTO hr_essl_config (company_id, host, database, username, password)
       VALUES ($1,'pending','pending','pending','pending')
       ON CONFLICT (company_id) DO NOTHING`,
      [req.user.company_id]
    );
    const r = await query(`SELECT push_api_key FROM hr_essl_config WHERE company_id=$1`, [req.user.company_id]);
    let key = r.rows[0]?.push_api_key;
    if (!key) {
      key = require('crypto').randomBytes(32).toString('hex');
      await query(`UPDATE hr_essl_config SET push_api_key=$1 WHERE company_id=$2`, [key, req.user.company_id]);
    }
    res.json({ data: { api_key: key, company_id: req.user.company_id,
      push_url: `${process.env.API_BASE_URL || 'https://erp.bcim.in'}/api/v1/hr-admin/essl/agent-push` } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── Ensure unique constraints exist for ON CONFLICT upserts ─────────────── */
(async () => {
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS hr_attendance_user_date_uidx
      ON hr_attendance(user_id, attendance_date)
  `).catch(() => {});
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS sc_attendance_worker_date_uidx
      ON sc_attendance(worker_id, attendance_date)
  `).catch(() => {});
})();

/* ── device logs table — raw individual swipes from ESSL ────────────────── */
(async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS essl_device_logs (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id   UUID REFERENCES companies(id),
      emp_code     TEXT NOT NULL,
      swipe_time   TIMESTAMPTZ NOT NULL,
      direction    TEXT,
      source       TEXT DEFAULT 'agent',
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (company_id, emp_code, swipe_time)
    )
  `).catch(() => {});
  await query(`CREATE INDEX IF NOT EXISTS essl_device_logs_company_time_idx ON essl_device_logs(company_id, swipe_time DESC)`).catch(() => {});
  await query(`CREATE INDEX IF NOT EXISTS essl_device_logs_emp_idx ON essl_device_logs(company_id, emp_code, swipe_time DESC)`).catch(() => {});
})();

/* ── sync log table ──────────────────────────────────────────────────────── */
(async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS hr_essl_sync_log (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id    UUID REFERENCES companies(id),
      synced_at     TIMESTAMPTZ DEFAULT NOW(),
      from_date     DATE, to_date DATE,
      records_count INT DEFAULT 0,
      source        TEXT DEFAULT 'manual',
      status        TEXT DEFAULT 'success',
      error_msg     TEXT
    )
  `).catch(() => {});
})();

/* GET /hr-admin/essl/sync-history */
router.get('/sync-history', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit||20), 100);
    const r = await query(`SELECT id,synced_at,from_date,to_date,records_count,source,status,error_msg FROM hr_essl_sync_log WHERE company_id=$1 ORDER BY synced_at DESC LIMIT $2`, [req.user.company_id, limit]);
    const rows = r.rows;
    if (!rows.length) {
      const cfg = await query(`SELECT last_sync FROM hr_essl_config WHERE company_id=$1`, [req.user.company_id]);
      if (cfg.rows[0]?.last_sync) rows.push({ synced_at: cfg.rows[0].last_sync, source: 'essl_agent', status: 'success' });
    }
    res.json({ data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════════
   GET /hr-admin/essl/health
   Sync agent health for the "ESSL Sync Health" dashboard page —
   is the local agent alive right now, when did real data last
   arrive, how much volume in the last 24h, and recent errors.
══════════════════════════════════════════════════════════════ */
router.get('/health', async (req, res) => {
  try {
    const cid = req.user.company_id;
    const cfgRes = await query(
      `SELECT last_sync, last_heartbeat, last_heartbeat_meta FROM hr_essl_config WHERE company_id=$1`,
      [cid]
    );
    const cfg = cfgRes.rows[0] || {};

    const now = Date.now();
    const heartbeatAgeSec = cfg.last_heartbeat ? Math.round((now - new Date(cfg.last_heartbeat).getTime()) / 1000) : null;
    const lastSyncAgeSec  = cfg.last_sync      ? Math.round((now - new Date(cfg.last_sync).getTime()) / 1000)      : null;

    // Alive = a heartbeat arrived within the last 3 minutes (loop tick is ~1 min).
    // Stale = we've heard from it before but not recently. Never = no heartbeat ever recorded.
    let status = 'never';
    if (heartbeatAgeSec !== null) status = heartbeatAgeSec <= 180 ? 'alive' : 'stale';

    const [swipes24h, swipesToday, lastSwipe, recentErrors, recentNotFound] = await Promise.all([
      query(`SELECT COUNT(*)::int AS n FROM essl_device_logs WHERE company_id=$1 AND swipe_time >= NOW() - INTERVAL '24 hours'`, [cid]),
      query(`SELECT COUNT(*)::int AS n FROM essl_device_logs WHERE company_id=$1 AND swipe_time::date = CURRENT_DATE`, [cid]),
      query(`SELECT MAX(swipe_time) AS t FROM essl_device_logs WHERE company_id=$1`, [cid]),
      query(`SELECT synced_at, from_date, to_date, records_count, status, error_msg FROM hr_essl_sync_log
             WHERE company_id=$1 AND status='error' ORDER BY synced_at DESC LIMIT 10`, [cid]).catch(() => ({ rows: [] })),
      query(`SELECT dl.emp_code, COUNT(*)::int AS n, MAX(dl.swipe_time) AS last_seen
             FROM essl_device_logs dl
             LEFT JOIN users u ON LOWER(TRIM(u.employee_code))=LOWER(TRIM(dl.emp_code)) AND u.company_id=dl.company_id
             LEFT JOIN sc_workers w ON (LOWER(TRIM(w.essl_emp_code))=LOWER(TRIM(dl.emp_code)) OR LOWER(TRIM(w.worker_code))=LOWER(TRIM(dl.emp_code)))
                                    AND w.company_id=dl.company_id
             WHERE dl.company_id=$1 AND u.id IS NULL AND w.id IS NULL AND dl.swipe_time >= NOW() - INTERVAL '7 days'
             GROUP BY dl.emp_code ORDER BY n DESC LIMIT 15`, [cid]),
    ]);

    res.json({
      status,
      last_heartbeat: cfg.last_heartbeat,
      heartbeat_age_sec: heartbeatAgeSec,
      last_heartbeat_meta: cfg.last_heartbeat_meta,
      last_sync: cfg.last_sync,
      last_sync_age_sec: lastSyncAgeSec,
      last_swipe_time: lastSwipe.rows[0]?.t || null,
      swipes_today: swipesToday.rows[0]?.n || 0,
      swipes_24h: swipes24h.rows[0]?.n || 0,
      recent_errors: recentErrors.rows,
      unmatched_codes_7d: recentNotFound.rows,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* POST /hr-admin/essl/trigger-sync */
router.post('/trigger-sync', async (req, res) => {
  const today = new Date().toISOString().slice(0,10);
  const from  = req.body.from || today;
  const to    = req.body.to   || today;
  try {
    const cfgRow = await query(`SELECT * FROM hr_essl_config WHERE company_id=$1`, [req.user.company_id]);
    if (!cfgRow.rows.length) return res.status(400).json({ error: 'ESSL not configured' });
    const cfg  = cfgRow.rows[0];
    const conn = await sql.connect(buildMssqlConfig(cfg));
    const r = await conn.request().input('from',sql.Date,new Date(from)).input('to',sql.Date,new Date(to))
      .query(`SELECT l.EmployeeCode,l.LogDate,l.Direction FROM DeviceLogs l WHERE CAST(l.LogDate AS DATE) BETWEEN @from AND @to ORDER BY l.EmployeeCode,l.LogDate`);
    const logs = r.recordset;
    await conn.close().catch(()=>{});
    const byKey = {};
    for (const row of logs) {
      const key = `${String(row.EmployeeCode||'').trim()}|${new Date(row.LogDate).toISOString().slice(0,10)}`;
      if (!byKey[key]) byKey[key] = { empCode: String(row.EmployeeCode||'').trim(), date: new Date(row.LogDate).toISOString().slice(0,10), times: [] };
      byKey[key].times.push(new Date(row.LogDate));
    }
    let count = 0;
    for (const { empCode, date, times } of Object.values(byKey)) {
      const emp = await query(`SELECT id FROM users WHERE company_id=$1 AND employee_code=$2 AND is_active=true LIMIT 1`, [req.user.company_id, empCode]);
      if (!emp.rows.length) continue;
      times.sort((a,b)=>a-b);
      const checkIn  = times[0].toTimeString().slice(0,5);
      const checkOut = times.length>1 ? times[times.length-1].toTimeString().slice(0,5) : null;
      await query(`INSERT INTO hr_attendance (user_id,company_id,attendance_date,check_in,check_out,status,source) VALUES ($1,$2,$3,$4,$5,'present','essl') ON CONFLICT (user_id,attendance_date) DO UPDATE SET check_in=EXCLUDED.check_in,check_out=EXCLUDED.check_out,status='present',source='essl'`, [emp.rows[0].id, req.user.company_id, date, checkIn, checkOut]);
      count++;
    }
    await query(`INSERT INTO hr_essl_sync_log (company_id,from_date,to_date,records_count,source,status) VALUES ($1,$2,$3,$4,'manual','success')`, [req.user.company_id, from, to, count]);
    await query(`UPDATE hr_essl_config SET last_sync=NOW() WHERE company_id=$1`, [req.user.company_id]);
    res.json({ success: true, synced: count, from, to });
  } catch (e) {
    await query(`INSERT INTO hr_essl_sync_log (company_id,from_date,to_date,records_count,source,status,error_msg) VALUES ($1,$2,$3,0,'manual','error',$4)`, [req.user.company_id, from, to, e.message]).catch(()=>{});
    res.status(500).json({ error: e.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   GET /hr-admin/essl/device-logs
   Query raw swipes from Postgres essl_device_logs
   ?from=YYYY-MM-DD&to=YYYY-MM-DD&emp_code=XXX&search=&limit=500&page=1
══════════════════════════════════════════════════════════════ */
router.get('/device-logs', async (req, res) => {
  try {
    const { from, to, emp_code, search, limit = 500, page = 1 } = req.query;
    const cid    = req.user.company_id;
    const lim    = Math.min(Number(limit), 5000);
    const offset = (Math.max(Number(page), 1) - 1) * lim;
    const params = [cid];
    let idx = 2;

    let sql2 = `
      SELECT
        dl.emp_code,
        dl.swipe_time,
        dl.direction,
        dl.source,
        u.name            AS employee_name,
        u.id              AS user_id,
        ep.department_id,
        dep.name          AS department_name,
        COALESCE(des.name, u.designation) AS designation
      FROM essl_device_logs dl
      LEFT JOIN users u
        ON u.company_id = dl.company_id
       AND LOWER(TRIM(u.employee_code)) = LOWER(TRIM(dl.emp_code))
      LEFT JOIN employee_profiles ep ON ep.user_id = u.id
      LEFT JOIN hr_departments dep   ON dep.id = ep.department_id
      LEFT JOIN hr_designations des  ON des.id = ep.designation_id
      WHERE dl.company_id = $1`;

    if (from)     { sql2 += ` AND dl.swipe_time >= $${idx}`; params.push(from + ' 00:00:00'); idx++; }
    if (to)       { sql2 += ` AND dl.swipe_time <= $${idx}`; params.push(to   + ' 23:59:59'); idx++; }
    if (emp_code) { sql2 += ` AND LOWER(TRIM(dl.emp_code)) = LOWER($${idx})`; params.push(String(emp_code).trim()); idx++; }
    if (search)   { sql2 += ` AND (u.name ILIKE $${idx} OR dl.emp_code ILIKE $${idx})`; params.push(`%${search}%`); idx++; }

    sql2 += ` ORDER BY dl.swipe_time DESC LIMIT $${idx} OFFSET $${idx+1}`;
    params.push(lim, offset);

    const r = await query(sql2, params);
    res.json({ data: r.rows, total: r.rows.length, page: Number(page), limit: lim });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════════
   GET /hr-admin/essl/preview-sc
   Dry-run: show what ESSL swipes would be pulled for SC workers
══════════════════════════════════════════════════════════════ */
router.get('/preview-sc', async (req, res) => {
  const { from, to, sc_id } = req.query;
  if (!from) return res.status(400).json({ error: 'from date required' });
  const toDate = to || from;

  try {
    const cfgRow = await query(`SELECT * FROM hr_essl_config WHERE company_id=$1`, [req.user.company_id]);
    if (!cfgRow.rows.length)
      return res.status(400).json({ error: 'ESSL connection not configured. Go to HR → ESSL Settings.' });
    const cfg = cfgRow.rows[0];
    const companyId = req.user.company_id;

    let workerSql = `SELECT id, worker_code, essl_emp_code, worker_name, daily_rate, sc_id, project_id, wo_id
      FROM sc_workers WHERE company_id=$1 AND status='active'
      AND (COALESCE(essl_emp_code,'') != '' OR COALESCE(worker_code,'') != '')`;
    const params = [companyId];
    if (sc_id) { workerSql += ` AND sc_id=$2`; params.push(sc_id); }
    const scWorkers = await query(workerSql, params);

    const workerMap = {};
    const workerCodes = [];
    scWorkers.rows.forEach(w => {
      if (w.essl_emp_code) { workerMap[String(w.essl_emp_code).trim().toLowerCase()] = w; workerCodes.push(String(w.essl_emp_code).trim()); }
      if (w.worker_code)    { workerMap[String(w.worker_code).trim().toLowerCase()]    ??= w; workerCodes.push(String(w.worker_code).trim()); }
    });

    const conn = await sql.connect(buildMssqlConfig(cfg));
    const tables = await existingTables(conn, monthlyTables(from, toDate));
    if (!tables.length) {
      await conn.close().catch(() => {});
      return res.json({ data: { schema: 'etimetracklite', total: 0, mapped: 0, workers: scWorkers.rows.length, preview: [] } });
    }

    const unionSQL = buildSwipeSQL(tables, workerCodes);
    const r = await conn.request()
      .input('from', sql.VarChar, from + ' 00:00:00')
      .input('to',   sql.VarChar, toDate + ' 23:59:59')
      .query(`${unionSQL} ORDER BY emp_code, swipe_time`);
    await conn.close().catch(() => {});

    // Group swipes by (emp_code, date)
    const grouped = {};
    for (const row of r.recordset) {
      const code = String(row.emp_code || '').trim().toLowerCase();
      if (!code) continue;
      const swipeDate = new Date(row.swipe_time);
      const dateStr   = swipeDate.toISOString().split('T')[0];
      const timeStr   = swipeDate.toTimeString().split(' ')[0];
      const key = `${code}|${dateStr}`;
      if (!grouped[key]) grouped[key] = { emp_code: code, date: dateStr, swipes: [] };
      grouped[key].swipes.push({ time: timeStr, type: String(row.direction || '').toLowerCase(), raw: row.swipe_time });
    }

    let mapped = 0;
    const preview = [];
    for (const g of Object.values(grouped)) {
      const worker = workerMap[g.emp_code];
      g.swipes.sort((a, b) => a.time.localeCompare(b.time));
      const inSwipes  = g.swipes.filter(s => s.type === 'in');
      const outSwipes = g.swipes.filter(s => s.type === 'out');
      const inTime  = inSwipes.length  ? inSwipes[0].time  : g.swipes[0]?.time  || null;
      const outTime = outSwipes.length ? outSwipes[outSwipes.length - 1].time
                                       : (g.swipes.length > 1 ? g.swipes[g.swipes.length - 1].time : null);
      const hasIn   = !!inTime;
      const hasOut  = !!outTime && outTime !== inTime;
      const status  = resolveStatus(hasIn, hasOut);

      let hoursWorked = 8;
      if (inTime && outTime && outTime > inTime) {
        const [ih, im] = inTime.split(':').map(Number);
        const [oh, om] = outTime.split(':').map(Number);
        hoursWorked = parseFloat(((oh * 60 + om - ih * 60 - im) / 60).toFixed(2));
      }
      const wage = parseFloat(worker?.daily_rate || 0) * (status === 'half_day' ? 0.5 : 1.0);
      if (worker) mapped++;
      preview.push({
        emp_code: g.emp_code,
        worker_name: worker ? worker.worker_name : null,
        mapped: !!worker,
        date: g.date,
        first_punch: inSwipes[0]?.raw || g.swipes[0]?.raw || null,
        last_punch: outSwipes.length > 0 ? outSwipes[outSwipes.length - 1].raw
                                         : (g.swipes.length > 1 ? g.swipes[g.swipes.length - 1].raw : null),
        hours_worked: hoursWorked,
        status,
        wage: worker ? wage : 0,
        punch_count: g.swipes.length,
      });
    }
    preview.sort((a, b) => (a.emp_code + a.date).localeCompare(b.emp_code + b.date));

    res.json({ data: { schema: 'etimetracklite', total: preview.length, mapped, workers: scWorkers.rows.length, preview } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   POST /hr-admin/essl/sync-sc
   Pull SC worker attendance from ESSL MSSQL → sc_attendance
══════════════════════════════════════════════════════════════ */
router.post('/sync-sc', async (req, res) => {
  const { from, to, sc_id, overwrite } = req.body;
  if (!from) return res.status(400).json({ error: 'from date required' });
  const toDate = to || from;

  try {
    const cfgRow = await query(`SELECT * FROM hr_essl_config WHERE company_id=$1`, [req.user.company_id]);
    if (!cfgRow.rows.length)
      return res.status(400).json({ error: 'ESSL connection not configured. Go to HR → ESSL Settings.' });
    const cfg = cfgRow.rows[0];
    const companyId = req.user.company_id;

    let workerSql = `SELECT id, worker_code, essl_emp_code, worker_name, daily_rate, sc_id, project_id, wo_id
      FROM sc_workers WHERE company_id=$1 AND status='active'
      AND (COALESCE(essl_emp_code,'') != '' OR COALESCE(worker_code,'') != '')`;
    const params = [companyId];
    if (sc_id) { workerSql += ` AND sc_id=$2`; params.push(sc_id); }
    const scWorkers = await query(workerSql, params);

    if (!scWorkers.rows.length)
      return res.status(400).json({ error: 'No active SC workers with a Biometric Code set. Set it in the Workers Registry.' });

    const workerMap = {};
    const workerCodes = [];
    scWorkers.rows.forEach(w => {
      if (w.essl_emp_code) { workerMap[String(w.essl_emp_code).trim().toLowerCase()] = w; workerCodes.push(String(w.essl_emp_code).trim()); }
      if (w.worker_code)    { workerMap[String(w.worker_code).trim().toLowerCase()]    ??= w; workerCodes.push(String(w.worker_code).trim()); }
    });

    const conn = await sql.connect(buildMssqlConfig(cfg));
    const tables = await existingTables(conn, monthlyTables(from, toDate));
    if (!tables.length) {
      await conn.close().catch(() => {});
      return res.json({
        data: { essl_records_found: 0, workers_mapped: scWorkers.rows.length, created: 0, updated: 0, skipped: 0, errors: [] },
        message: 'No DeviceLogs tables found for this date range.',
      });
    }

    const unionSQL = buildSwipeSQL(tables, workerCodes);
    const r = await conn.request()
      .input('from', sql.VarChar, from + ' 00:00:00')
      .input('to',   sql.VarChar, toDate + ' 23:59:59')
      .query(`${unionSQL} ORDER BY emp_code, swipe_time`);
    await conn.close().catch(() => {});

    // Group swipes by (emp_code, date)
    const grouped = {};
    for (const row of r.recordset) {
      const code = String(row.emp_code || '').trim().toLowerCase();
      if (!code) continue;
      const swipeDate = new Date(row.swipe_time);
      const dateStr   = swipeDate.toISOString().split('T')[0];
      const timeStr   = swipeDate.toTimeString().split(' ')[0];
      const key = `${code}|${dateStr}`;
      if (!grouped[key]) grouped[key] = { emp_code: code, date: dateStr, swipes: [] };
      grouped[key].swipes.push({ time: timeStr, type: String(row.direction || '').toLowerCase() });
    }

    let created = 0, updated = 0, skipped = 0;
    const errors = [];

    for (const g of Object.values(grouped)) {
      const worker = workerMap[g.emp_code];
      if (!worker) { skipped++; continue; }

      g.swipes.sort((a, b) => a.time.localeCompare(b.time));
      const inSwipes  = g.swipes.filter(s => s.type === 'in');
      const outSwipes = g.swipes.filter(s => s.type === 'out');
      const inTime  = inSwipes.length  ? inSwipes[0].time  : g.swipes[0]?.time  || null;
      const outTime = outSwipes.length ? outSwipes[outSwipes.length - 1].time
                                       : (g.swipes.length > 1 ? g.swipes[g.swipes.length - 1].time : null);
      const hasIn  = !!inTime;
      const hasOut = !!outTime && outTime !== inTime;
      const status = resolveStatus(hasIn, hasOut);

      let hoursWorked = 8;
      if (inTime && outTime && outTime > inTime) {
        const [ih, im] = inTime.split(':').map(Number);
        const [oh, om] = outTime.split(':').map(Number);
        hoursWorked = parseFloat(((oh * 60 + om - ih * 60 - im) / 60).toFixed(2));
      }
      const wage = parseFloat(worker.daily_rate || 0) * (status === 'half_day' ? 0.5 : 1.0);

      try {
        const existing = await query(
          `SELECT id FROM sc_attendance WHERE worker_id=$1 AND attendance_date=$2 AND company_id=$3`,
          [worker.id, g.date, companyId]
        );

        if (existing.rows.length && !overwrite) { skipped++; continue; }

        const h = splitDayHours(hoursWorked);
        if (existing.rows.length) {
          await query(
            `UPDATE sc_attendance SET status=$1, hours_worked=$2, wage_amount=$3,
             overtime_hours=$6, remarks=$4 WHERE id=$5`,
            [status, h.regular, wage,
             `ESSL sync: ${g.swipes.length} punch(es) [etimetracklite]`,
             existing.rows[0].id, h.overtime]
          );
          updated++;
        } else {
          await query(
            `INSERT INTO sc_attendance (company_id, project_id, sc_id, wo_id, worker_id,
               attendance_date, status, hours_worked, overtime_hours, wage_amount, remarks, marked_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$12,$9,$10,$11)`,
            [companyId, worker.project_id, worker.sc_id, worker.wo_id || null, worker.id,
             g.date, status, h.regular, wage,
             `ESSL sync: ${g.swipes.length} punch(es) [etimetracklite]`,
             req.user.id, h.overtime]
          );
          created++;
        }
      } catch (e2) {
        errors.push({ emp_code: g.emp_code, date: g.date, error: e2.message });
      }
    }

    res.json({
      data: { essl_records_found: r.recordset.length, workers_mapped: scWorkers.rows.length, created, updated, skipped, errors },
      message: `ESSL sync complete: ${created} new, ${updated} updated, ${skipped} skipped`,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

