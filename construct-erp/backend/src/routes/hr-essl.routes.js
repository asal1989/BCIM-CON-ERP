// src/routes/hr-essl.routes.js
// Sync attendance from ESSL Biometric → Microsoft SQL Server → hr_attendance
const express = require('express');
const sql     = require('mssql');
const { query, pool } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { runSchemaInit } = require('../utils/schemaInit');

const router = express.Router();

/* ═══════════════════════════════════════════════════════════
   POST /hr-admin/essl/agent-push  (NO auth middleware — uses API key)
   Receives attendance data pushed from the local Windows agent.
   Body: { api_key, company_id, records: [{ emp_code, date, in_time, out_time, punch_count }] }
══════════════════════════════════════════════════════════════ */
router.post('/agent-push', async (req, res) => {
  const { api_key, company_id, records = [] } = req.body;
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

    const results = { synced: 0, skipped: 0, not_found: [], errors: [] };

    for (const rec of records) {
      const code   = String(rec.emp_code || '').trim().toLowerCase();
      const userId = empMap[code];
      if (!userId) { results.not_found.push(rec.emp_code); results.skipped++; continue; }

      const inTime  = rec.in_time  || null;
      const outTime = rec.out_time || null;
      const hasIn   = !!inTime;
      const hasOut  = !!outTime && outTime !== inTime;
      const status  = resolveStatus(hasIn, hasOut);

      let lateMin = 0;
      if (inTime) {
        const [h, m] = inTime.split(':').map(Number);
        const arrMins = h * 60 + m;
        if (arrMins > 9 * 60 + 30) lateMin = arrMins - (9 * 60 + 30);
      }

      try {
        await query(
          `INSERT INTO hr_attendance
             (user_id, company_id, attendance_date, status, in_time, out_time, late_minutes, source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'essl_agent')
           ON CONFLICT (user_id, attendance_date) DO UPDATE
             SET status=$4,
                 in_time=COALESCE($5, hr_attendance.in_time),
                 out_time=COALESCE($6, hr_attendance.out_time),
                 late_minutes=$7, source='essl_agent'`,
          [userId, company_id, rec.date, status, inTime, outTime, lateMin]
        );
        results.synced++;
      } catch (e2) { results.errors.push({ emp: rec.emp_code, date: rec.date, error: e2.message }); }
    }

    await query(`UPDATE hr_essl_config SET last_sync=NOW() WHERE company_id=$1`, [company_id]);
    res.json({ success: true, ...results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── All routes below require JWT authentication ───────────────────────────────
router.use(authenticate);
router.use(authorize('super_admin', 'admin', 'hr_admin'));

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
}
runSchemaInit('hr-essl', initTable);

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
function resolveStatus(hasIn, hasOut) {
  if (hasIn && hasOut) return 'present';
  if (hasIn || hasOut) return 'half_day';
  return 'absent';
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

      // Compute late minutes (if in_time > 09:30 → late)
      let lateMin = 0;
      if (inTime) {
        const [h, m] = inTime.split(':').map(Number);
        const arrivalMins = h * 60 + m;
        const standardMins = 9 * 60 + 30; // 09:30 standard
        if (arrivalMins > standardMins) lateMin = arrivalMins - standardMins;
      }

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

/* GET /hr-admin/essl/devices */
router.get('/devices', async (req, res) => {
  try {
    const r = await query(`SELECT id,host,port,database,instance,last_sync FROM hr_essl_config WHERE company_id=$1`, [req.user.company_id]);
    if (!r.rows.length) return res.json({ data: [] });
    const cfg = r.rows[0];
    let online = false;
    try { const c = await sql.connect({ ...buildMssqlConfig(cfg), connectionTimeout: 4000 }); await c.close().catch(()=>{}); online = true; } catch(_) {}
    res.json({ data: [{ id: cfg.id, name: `ESSL (${cfg.host})`, ip: cfg.host, port: cfg.port||1433, online, last_sync: cfg.last_sync }] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

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

module.exports = router;

