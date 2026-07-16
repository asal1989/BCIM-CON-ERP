// src/routes/hr-import.routes.js
// CSV + Excel import — Employees & Attendance
const express  = require('express');
const multer   = require('multer');
const bcrypt   = require('bcryptjs');
const { parse } = require('csv-parse');
const XLSX     = require('xlsx');
const { query, pool } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
router.use(authorize('super_admin', 'admin', 'hr_admin'));

// ─── multer: memory storage, accept CSV + XLSX ───────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype === 'text/csv'
      || file.originalname.endsWith('.csv')
      || file.originalname.endsWith('.xlsx')
      || file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    ok ? cb(null, true) : cb(new Error('Only CSV or XLSX files are supported'));
  },
});

// ─── helper: parse CSV buffer → array of objects ─────────────────────────────
function parseCSV(buffer) {
  return new Promise((resolve, reject) => {
    parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    }, (err, records) => {
      if (err) reject(err);
      else resolve(records);
    });
  });
}

// ─── helper: parse XLSX buffer → array of objects ────────────────────────────
// Converts all cell values to strings to avoid float/scientific-notation issues
// with numeric fields like mobile, bank account, UAN, employee code.
// Auto-detects the real header row in case the file has a title row on top.
function parseXLSX(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];

  // Scan the first 10 rows to find the one containing recognisable headers
  const sheetRange = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
  const KNOWN_HEADERS = ['employee code', 'emp code', 'employee_code', 'name', 'employee name', 'employeecode'];
  let headerRow = sheetRange.s.r;

  outer:
  for (let r = sheetRange.s.r; r <= Math.min(sheetRange.s.r + 9, sheetRange.e.r); r++) {
    for (let c = sheetRange.s.c; c <= sheetRange.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && KNOWN_HEADERS.includes(String(cell.v || '').trim().toLowerCase())) {
        headerRow = r;
        break outer;
      }
    }
  }

  const rows = XLSX.utils.sheet_to_json(ws, {
    raw: false,
    dateNF: 'dd-mm-yyyy',
    defval: '',
    range: headerRow,
  });

  return rows.map(row => {
    const clean = {};
    for (const [k, v] of Object.entries(row)) {
      // Normalise key: trim + collapse internal whitespace (handles "Date of Birth  (as per Aadhaar)" etc.)
      const normKey = k.trim().replace(/\s+/g, ' ');
      clean[normKey] = typeof v === 'string' ? v.trim() : String(v === null || v === undefined ? '' : v).trim();
    }
    return clean;
  });
}

// ─── helper: detect file type and parse ──────────────────────────────────────
function parseFile(file) {
  if (file.originalname.endsWith('.xlsx')) return parseXLSX(file.buffer);
  return parseCSV(file.buffer);
}

// ─── helper: normalise date strings DD-MM-YYYY / DD/MM/YYYY / YYYY-MM-DD ────
function normaliseDate(val) {
  if (!val || val.trim() === '') return null;
  const v = val.trim();
  // DD-MM-YYYY or DD/MM/YYYY
  const dmy = v.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`;
  // YYYY-MM-DD already
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return null;
}

// ─── helper: normalise time HH:MM:SS / HH:MM ─────────────────────────────────
function normaliseTime(val) {
  if (!val || val.trim() === '') return null;
  const v = val.trim();
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(v)) return v;
  return null;
}

// ─── helper: map attendance status codes ─────────────────────────────────────
function mapAttendanceStatus(raw) {
  if (!raw) return 'absent';
  const s = raw.trim().toUpperCase();
  const MAP = {
    'P': 'present', 'PRESENT': 'present',
    'A': 'absent',  'ABSENT': 'absent',
    'H': 'half_day','HALF DAY': 'half_day', 'HD': 'half_day',
    'L': 'leave',   'LEAVE': 'leave', 'PL': 'leave', 'CL': 'leave', 'SL': 'leave', 'EL': 'leave',
    'WO': 'week_off','WEEK OFF': 'week_off', 'WEEKOFF': 'week_off',
    'HO': 'holiday', 'HOLIDAY': 'holiday',
    'LWP': 'absent', 'LOP': 'absent',
  };
  return MAP[s] || 'absent';
}

// ─── helper: pick first truthy key from row ───────────────────────────────────
function pick(row, ...keys) {
  for (const k of keys) {
    const val = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()];
    if (val !== undefined && val !== null && String(val).trim() !== '') return String(val).trim();
  }
  return '';
}

/* ════════════════════════════════════════════════════════════════════════════
   POST /hr-admin/import/preview-employees
   Upload CSV → return first 5 rows + detected columns (no DB write)
═══════════════════════════════════════════════════════════════════════════════ */
router.post('/preview-employees', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const records = await parseFile(req.file);
    res.json({
      total: records.length,
      columns: Object.keys(records[0] || {}),
      preview: records.slice(0, 5),
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* ════════════════════════════════════════════════════════════════════════════
   POST /hr-admin/import/preview-attendance
   Upload CSV → return first 5 rows + detected columns (no DB write)
═══════════════════════════════════════════════════════════════════════════════ */
router.post('/preview-attendance', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const records = await parseFile(req.file);
    res.json({
      total: records.length,
      columns: Object.keys(records[0] || {}),
      preview: records.slice(0, 5),
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* ════════════════════════════════════════════════════════════════════════════
   POST /hr-admin/import/employees
   Import employees from CSV.
   Supports two modes:
     mode=create  → create new users + employee_profiles (skips existing emp codes)
     mode=update  → only update employee_profiles for existing users
═══════════════════════════════════════════════════════════════════════════════ */
router.post('/employees', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const companyId = req.user.company_id;
    const mode = req.body.mode || 'create'; // 'create' | 'update'
    const records = await parseFile(req.file);

    // Pre-load departments & designations for name→id lookup
    const deptRows = await query(`SELECT id, LOWER(name) as name FROM hr_departments WHERE company_id=$1`, [companyId]);
    const desigRows = await query(`SELECT id, LOWER(name) as name FROM hr_designations WHERE company_id=$1`, [companyId]);
    const deptMap  = Object.fromEntries(deptRows.rows.map(r => [r.name, r.id]));
    const desigMap = Object.fromEntries(desigRows.rows.map(r => [r.name, r.id]));

    const results = { created: 0, updated: 0, skipped: 0, errors: [] };
    // Debug: capture what the first row looks like after parsing
    const debugFirstRow = records[0] ? {
      keys: Object.keys(records[0]),
      empCode: pick(records[0], 'Employee Code', 'EmployeeCode', 'Emp Code', 'EmpCode', 'employee_code', 'Emp. Code', 'Staff Code'),
      name: pick(records[0], 'Employee Name', 'EmployeeName', 'Name', 'Full Name',
                 'Full Name (as per Aadhaar)', 'Full Name (As per Aadhaar)', 'Staff Name', 'Employee Full Name'),
      dept: pick(records[0], 'Department', 'department_name', 'Department / Function', 'Department/Function', 'Dept'),
    } : null;

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const rowNum = i + 2; // 1-indexed + header row

      try {
        // ── Map columns (handles various column name formats) ──
        const empCode  = pick(row, 'Employee Code', 'EmployeeCode', 'Emp Code', 'EmpCode', 'employee_code', 'Emp. Code', 'Staff Code');
        const name     = pick(row, 'Employee Name', 'EmployeeName', 'Name', 'Full Name',
                               'Full Name (as per Aadhaar)', 'Full Name (As per Aadhaar)', 'Staff Name', 'Employee Full Name');
        const email    = pick(row, 'Email', 'Email ID', 'Official Email', 'Work Email', 'email',
                               'Official Email ID', 'Official Email Id', 'Personal Email Details', 'Email Address');
        const phone    = pick(row, 'Mobile', 'Mobile No', 'Phone', 'Contact No', 'mobile_number',
                               'Personal Mobile Number', 'Mobile Number', 'Contact Number');
        const dept     = pick(row, 'Department', 'department_name', 'Department / Function', 'Department/Function',
                               'Dept', 'Function - Current', 'Department - Current', 'Department');
        const desig    = pick(row, 'Designation', 'designation_name', 'Designation - Current',
                               'Designation HR Record', 'Designation As per KYE', 'Job Title', 'Position');
        const doj      = normaliseDate(pick(row, 'Date of Joining', 'DOJ', 'Joining Date', 'date_of_joining', 'Date Of Joining'));
        const dob      = normaliseDate(pick(row, 'Date of Birth', 'DOB', 'Birth Date', 'date_of_birth',
                                            'Date of Birth (as per Aadhaar)', 'Date of Birth (As per Aadhaar)'));
        const gender   = pick(row, 'Gender', 'Sex').toLowerCase();
        const fatherName  = pick(row, "Father's Name", 'Father Name', "Father's Name");
        const marital  = pick(row, 'Marital Status').toLowerCase();
        const blood    = pick(row, 'Blood Group');
        const pan      = pick(row, 'PAN', 'PAN Number', 'PAN No', 'Pan Number');
        const aadhaar  = pick(row, 'Aadhaar', 'Aadhaar Number', 'Aadhaar No', 'Aadhar', 'Aadhaar Card Number');
        const uan      = pick(row, 'UAN', 'UAN Number', 'UAN No');
        const pf       = pick(row, 'PF Account No', 'PF Number', 'PF Account Number');
        const esi      = pick(row, 'ESI Number', 'ESIC No', 'ESI No');
        const bankAcc  = pick(row, 'Bank Account No', 'Account Number', 'Bank Account Number');
        const ifsc     = pick(row, 'IFSC Code', 'IFSC', 'Bank IFSC');
        const bankName = pick(row, 'Bank Name');
        const empType  = pick(row, 'Employment Type', 'Employee Type').toLowerCase() || 'permanent';
        const statusRaw = pick(row, 'Status', 'Employment Status').toLowerCase();
        const empStatus = ['active','resigned','terminated'].includes(statusRaw) ? statusRaw : 'active';
        const address  = pick(row, 'Permanent Address', 'Address', 'Current Address');
        const noticeDays = parseInt(pick(row, 'Notice Period', 'Notice Period (Days)')) || 30;
        const ctcRaw   = pick(row, 'CTC', 'Annual CTC', 'CTC Annual', 'CTC Current_PA', 'CTC-p.m.', 'CTC Before Last Appraisal');
        const ctc      = parseFloat(ctcRaw.replace(/[^0-9.]/g, '')) || null;
        const categoryRaw = pick(row, 'Employee Category', 'Category', 'Staff Type', 'Category-Proposed').toLowerCase();
        const empCategory = categoryRaw.includes('work') ? 'workman' : 'staff';
        const workLocation = pick(row, 'Project', 'Project Location', 'Site', 'Location', 'work_location');

        if (!empCode && !name) {
          results.errors.push({ row: rowNum, error: 'Missing Employee Code and Name' });
          results.skipped++;
          continue;
        }

        const deptId  = deptMap[dept.toLowerCase()]  || null;
        const desigId = desigMap[desig.toLowerCase()] || null;

        // Check if user already exists
        const existing = await query(
          `SELECT id FROM users WHERE employee_code=$1 AND company_id=$2`,
          [empCode, companyId]
        );

        if (existing.rows.length > 0) {
          // ── SKIP if create_only mode ──
          if (mode === 'create_only') {
            results.skipped++;
            continue;
          }
          // ── UPDATE mode: refresh users table + profile fields ──
          const userId = existing.rows[0].id;

          // Update users table (name, phone, designation, department, status)
          await query(
            `UPDATE users SET
               name        = COALESCE(NULLIF($1,''), name),
               phone       = COALESCE(NULLIF($2,''), phone),
               designation = COALESCE(NULLIF($3,''), designation),
               department  = COALESCE(NULLIF($4,''), department),
               is_active   = ($5 = 'active'),
               updated_at  = NOW()
             WHERE id = $6`,
            [name||null, phone||null, desig||null, dept||null, empStatus, userId]
          );

          await query(
            `INSERT INTO employee_profiles
               (user_id, company_id, department_id, designation_id,
                date_of_joining, date_of_birth, gender, father_name, marital_status,
                blood_group, pan_number, aadhaar_number, uan_number, pf_account_number,
                esi_number, bank_account_number, bank_ifsc, bank_name,
                employment_type, employee_category, employment_status, permanent_address, notice_period_days,
                work_location, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,NOW())
             ON CONFLICT (user_id) DO UPDATE SET
               department_id=EXCLUDED.department_id,
               designation_id=EXCLUDED.designation_id,
               date_of_joining=COALESCE(EXCLUDED.date_of_joining, employee_profiles.date_of_joining),
               date_of_birth=COALESCE(EXCLUDED.date_of_birth, employee_profiles.date_of_birth),
               gender=COALESCE(NULLIF(EXCLUDED.gender,''), employee_profiles.gender),
               father_name=COALESCE(NULLIF(EXCLUDED.father_name,''), employee_profiles.father_name),
               marital_status=COALESCE(NULLIF(EXCLUDED.marital_status,''), employee_profiles.marital_status),
               blood_group=COALESCE(NULLIF(EXCLUDED.blood_group,''), employee_profiles.blood_group),
               pan_number=COALESCE(NULLIF(EXCLUDED.pan_number,''), employee_profiles.pan_number),
               aadhaar_number=COALESCE(NULLIF(EXCLUDED.aadhaar_number,''), employee_profiles.aadhaar_number),
               uan_number=COALESCE(NULLIF(EXCLUDED.uan_number,''), employee_profiles.uan_number),
               pf_account_number=COALESCE(NULLIF(EXCLUDED.pf_account_number,''), employee_profiles.pf_account_number),
               esi_number=COALESCE(NULLIF(EXCLUDED.esi_number,''), employee_profiles.esi_number),
               bank_account_number=COALESCE(NULLIF(EXCLUDED.bank_account_number,''), employee_profiles.bank_account_number),
               bank_ifsc=COALESCE(NULLIF(EXCLUDED.bank_ifsc,''), employee_profiles.bank_ifsc),
               bank_name=COALESCE(NULLIF(EXCLUDED.bank_name,''), employee_profiles.bank_name),
               employment_type=COALESCE(NULLIF(EXCLUDED.employment_type,''), employee_profiles.employment_type),
               employee_category=EXCLUDED.employee_category,
               employment_status=COALESCE(NULLIF(EXCLUDED.employment_status,''), employee_profiles.employment_status),
               permanent_address=COALESCE(NULLIF(EXCLUDED.permanent_address,''), employee_profiles.permanent_address),
               notice_period_days=EXCLUDED.notice_period_days,
               work_location=COALESCE(NULLIF(EXCLUDED.work_location,''), employee_profiles.work_location),
               updated_at=NOW()`,
            [userId, companyId, deptId, desigId,
             doj, dob, gender||null, fatherName||null, marital||null,
             blood||null, pan||null, aadhaar||null, uan||null, pf||null,
             esi||null, bankAcc||null, ifsc||null, bankName||null,
             empType||'permanent', empCategory, empStatus, address||null, noticeDays,
             workLocation||null]
          );
          results.updated++;
        } else {
          if (mode === 'update') {
            results.skipped++;
            continue;
          }
          // ── CREATE / CREATE_ONLY mode: new user + profile ──
          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            const defaultPwd = await bcrypt.hash(empCode, 8); // cost 8 — fast for bulk import
            // Use placeholder email if none provided (users.email is NOT NULL UNIQUE)
            const userEmail = email || `${empCode.toLowerCase().replace(/\s+/g,'.')}@hr.local`;

            // Try to insert; if email already exists, reuse that user's id
            const userRes = await client.query(
              `INSERT INTO users (company_id, employee_code, name, email, phone, role,
                                  designation, department, is_active, password_hash)
               VALUES ($1,$2,$3,$4,$5,'employee',$6,$7,true,$8)
               ON CONFLICT (email) DO UPDATE
                 SET employee_code = EXCLUDED.employee_code,
                     name          = EXCLUDED.name,
                     phone         = COALESCE(EXCLUDED.phone, users.phone),
                     designation   = COALESCE(EXCLUDED.designation, users.designation),
                     department    = COALESCE(EXCLUDED.department, users.department),
                     updated_at    = NOW()
               RETURNING id`,
              [companyId, empCode, name, userEmail, phone||null,
               desig||null, dept||null, defaultPwd]
            );
            const userId = userRes.rows[0].id;
            await client.query(
              `INSERT INTO employee_profiles
                 (user_id, company_id, department_id, designation_id,
                  date_of_joining, date_of_birth, gender, father_name, marital_status,
                  blood_group, pan_number, aadhaar_number, uan_number, pf_account_number,
                  esi_number, bank_account_number, bank_ifsc, bank_name,
                  employment_type, employee_category, employment_status, permanent_address, notice_period_days,
                  work_location)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
              [userId, companyId, deptId, desigId,
               doj, dob, gender||null, fatherName||null, marital||null,
               blood||null, pan||null, aadhaar||null, uan||null, pf||null,
               esi||null, bankAcc||null, ifsc||null, bankName||null,
               empType||'permanent', empCategory, empStatus, address||null, noticeDays,
               workLocation||null]
            );

            // Auto-assign salary if CTC present
            if (ctc) {
              const basic = Math.round(ctc / 12 * 0.40);
              const hra   = Math.round(basic * 0.40);
              const conv  = 1600;
              const gross = Math.round(ctc / 12);
              await client.query(
                `INSERT INTO hr_employee_salaries
                   (user_id, ctc_annual, basic, hra, conveyance, gross_monthly, effective_from)
                 VALUES ($1,$2,$3,$4,$5,$6,CURRENT_DATE)
                 ON CONFLICT DO NOTHING`,
                [userId, ctc, basic, hra, conv, gross]
              );
            }

            await client.query('COMMIT');
            results.created++;
          } catch (e2) {
            await client.query('ROLLBACK');
            throw e2;
          } finally {
            client.release();
          }
        }
      } catch (rowErr) {
        results.errors.push({ row: rowNum, error: rowErr.message });
        results.skipped++;
      }
    }

    res.json({ success: true, total: records.length, ...results, debug: debugFirstRow });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ════════════════════════════════════════════════════════════════════════════
   POST /hr-admin/import/attendance
   Import monthly attendance from CSV.
   Supports two attendance CSV formats:
     Format A (wide): columns = Emp Code | Emp Name | 01 | 02 | 03 ... 31
     Format B (long): columns = Emp Code | Date | Status | In Time | Out Time
   We auto-detect the format.
═══════════════════════════════════════════════════════════════════════════════ */
router.post('/attendance', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const companyId = req.user.company_id;
    const records   = await parseFile(req.file);
    if (!records.length) return res.status(400).json({ error: 'File is empty' });

    // ── Build employee code → user_id map ─────────────────────────────────
    const empRows = await query(
      `SELECT u.id, u.employee_code FROM users u
       JOIN employee_profiles ep ON ep.user_id = u.id
       WHERE u.company_id=$1`,
      [companyId]
    );
    const empMap = Object.fromEntries(empRows.rows.map(r => [r.employee_code.trim().toLowerCase(), r.id]));

    const cols = Object.keys(records[0]);

    // ── Detect format: wide (day columns = numbers 1-31) or long ──────────
    const dayColCount = cols.filter(c => /^(0?[1-9]|[12]\d|3[01])$/.test(c.trim())).length;
    const isWide = dayColCount >= 20; // wide format has 28-31 day columns

    const results = { inserted: 0, updated: 0, skipped: 0, errors: [] };

    if (isWide) {
      // ─── FORMAT A: Wide (one row per employee, columns = days) ───────────
      // Required: detect the month & year from request body or from data
      const month = parseInt(req.body.month || new Date().getMonth() + 1);
      const year  = parseInt(req.body.year  || new Date().getFullYear());

      for (let i = 0; i < records.length; i++) {
        const row    = records[i];
        const empCode = pick(row, 'Employee Code', 'EmployeeCode', 'Emp Code', 'EmpCode', 'employee_code');
        if (!empCode) continue;

        const userId = empMap[empCode.toLowerCase()];
        if (!userId) {
          results.errors.push({ row: i + 2, error: `Employee code "${empCode}" not found` });
          results.skipped++;
          continue;
        }

        // iterate day columns 01..31
        for (let d = 1; d <= 31; d++) {
          const dayStr   = String(d).padStart(2, '0');
          const dayStr1  = String(d);
          const rawStatus = row[dayStr] || row[dayStr1] || '';
          if (!rawStatus.trim()) continue;

          // validate date exists in that month
          const dateObj = new Date(year, month - 1, d);
          if (dateObj.getMonth() !== month - 1) continue; // e.g. Feb 30

          const dateStr = `${year}-${String(month).padStart(2,'0')}-${dayStr}`;
          const status  = mapAttendanceStatus(rawStatus);

          try {
            const r = await query(
              `INSERT INTO hr_attendance (user_id, company_id, attendance_date, status, source)
               VALUES ($1,$2,$3,$4,'csv_import')
               ON CONFLICT (user_id, attendance_date) DO UPDATE
                 SET status=$4, source='csv_import'
               RETURNING xmax`,
              [userId, companyId, dateStr, status]
            );
            r.rows[0].xmax === '0' ? results.inserted++ : results.updated++;
          } catch (e2) {
            results.errors.push({ row: i + 2, error: `Day ${d}: ${e2.message}` });
          }
        }
      }
    } else {
      // ─── FORMAT B: Long (one row per employee per date) ──────────────────
      for (let i = 0; i < records.length; i++) {
        const row     = records[i];
        const empCode = pick(row, 'Employee Code', 'EmployeeCode', 'Emp Code', 'EmpCode');
        const rawDate = pick(row, 'Date', 'Attendance Date', 'attendance_date');
        const rawStat = pick(row, 'Status', 'Attendance Status', 'Day Status');
        const inTime  = normaliseTime(pick(row, 'In Time', 'InTime', 'First In'));
        const outTime = normaliseTime(pick(row, 'Out Time', 'OutTime', 'Last Out'));
        const lateMin = parseInt(pick(row, 'Late Minutes', 'Late Min', 'Late')) || 0;

        if (!empCode || !rawDate) {
          results.skipped++;
          continue;
        }

        const userId  = empMap[empCode.toLowerCase()];
        const dateStr = normaliseDate(rawDate);

        if (!userId) {
          results.errors.push({ row: i + 2, error: `Employee code "${empCode}" not found` });
          results.skipped++;
          continue;
        }
        if (!dateStr) {
          results.errors.push({ row: i + 2, error: `Invalid date "${rawDate}"` });
          results.skipped++;
          continue;
        }

        const status = mapAttendanceStatus(rawStat);

        try {
          const r = await query(
            `INSERT INTO hr_attendance
               (user_id, company_id, attendance_date, status, in_time, out_time, late_minutes, source)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'csv_import')
             ON CONFLICT (user_id, attendance_date) DO UPDATE
               SET status=$4, in_time=COALESCE($5, hr_attendance.in_time),
                   out_time=COALESCE($6, hr_attendance.out_time),
                   late_minutes=$7, source='csv_import'
             RETURNING xmax`,
            [userId, companyId, dateStr, status, inTime||null, outTime||null, lateMin]
          );
          r.rows[0].xmax === '0' ? results.inserted++ : results.updated++;
        } catch (e2) {
          results.errors.push({ row: i + 2, error: e2.message });
          results.skipped++;
        }
      }
    }

    res.json({
      success: true,
      format: isWide ? 'wide (monthly grid)' : 'long (daily rows)',
      total: records.length,
      ...results,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /dedup-preview  — show duplicate employees (same name, different code) ─
router.get('/dedup-preview', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        u.id, u.name, u.email, u.designation, u.department,
        ep.employee_code,
        (CASE WHEN u.email    IS NOT NULL AND u.email    <> '' THEN 1 ELSE 0 END +
         CASE WHEN ep.employee_code IS NOT NULL               THEN 1 ELSE 0 END +
         CASE WHEN u.designation IS NOT NULL AND u.designation <> '' THEN 1 ELSE 0 END +
         CASE WHEN u.department  IS NOT NULL AND u.department  <> '' THEN 1 ELSE 0 END) AS score
      FROM users u
      LEFT JOIN employee_profiles ep ON ep.user_id = u.id
      WHERE u.role = 'employee'
      ORDER BY LOWER(TRIM(u.name)), score DESC
    `);

    // Group by normalised name
    const groups = {};
    for (const r of rows) {
      const key = (r.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }

    const duplicates = Object.values(groups).filter(g => g.length > 1);
    res.json({ duplicates });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /dedup-execute — delete lower-scored duplicates, keep best record ────
router.post('/dedup-execute', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        u.id, u.name, u.email, u.designation, u.department,
        ep.employee_code,
        (CASE WHEN u.email    IS NOT NULL AND u.email    <> '' THEN 1 ELSE 0 END +
         CASE WHEN ep.employee_code IS NOT NULL               THEN 1 ELSE 0 END +
         CASE WHEN u.designation IS NOT NULL AND u.designation <> '' THEN 1 ELSE 0 END +
         CASE WHEN u.department  IS NOT NULL AND u.department  <> '' THEN 1 ELSE 0 END) AS score
      FROM users u
      LEFT JOIN employee_profiles ep ON ep.user_id = u.id
      WHERE u.role = 'employee' AND u.company_id = $1
      ORDER BY LOWER(TRIM(u.name)), score DESC
    `, [req.user.company_id]);

    const groups = {};
    for (const r of rows) {
      const key = (r.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }

    const deleted = [];
    for (const group of Object.values(groups)) {
      if (group.length < 2) continue;
      // First entry has highest score (keep it), delete the rest
      const toDelete = group.slice(1);
      for (const emp of toDelete) {
        await pool.query('DELETE FROM employee_profiles WHERE user_id = $1', [emp.id]);
        await pool.query('DELETE FROM users WHERE id = $1', [emp.id]);
        deleted.push({ id: emp.id, name: emp.name, employee_code: emp.employee_code });
      }
    }

    res.json({ success: true, deleted, count: deleted.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
