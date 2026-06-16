// dms.routes.js — Document Management System
const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuid } = require('uuid');
const { authenticate, authorize } = require('../middleware/auth');
const { loadProjectScope, userCanAccessProject } = require('../middleware/projectScope');
const db = () => require('../config/database').pool;
const xlsx    = require('xlsx');
const mammoth = require('mammoth');

router.use(authenticate);
router.use(loadProjectScope);
const CID    = req => req.user.company_id;
const ADMINS = ['super_admin','admin'];

function applyDocumentScope(req, sqlParts, params, alias = 'd', requestedProjectId = null) {
  if (requestedProjectId && String(requestedProjectId).trim()) {
    if (!userCanAccessProject(req, requestedProjectId)) {
      const err = new Error('Access denied for this project.');
      err.statusCode = 403;
      throw err;
    }
    params.push(requestedProjectId);
    sqlParts.push(`${alias}.project_id = $${params.length}`);
    return;
  }
  if (req.isGlobalRole) return;
  const allowed = req.allowedProjectIds || [];
  if (!allowed.length) {
    sqlParts.push(`${alias}.project_id IS NULL`);
    return;
  }
  params.push(allowed);
  sqlParts.push(`(${alias}.project_id IS NULL OR ${alias}.project_id = ANY($${params.length}::uuid[]))`);
}

async function getAccessibleDocument(req, documentId) {
  const { rows } = await db().query(
    `SELECT id, company_id, project_id, file_name, file_type, local_url
     FROM documents
     WHERE id = $1 AND company_id = $2`,
    [documentId, CID(req)]
  );
  const doc = rows[0];
  if (!doc) {
    const err = new Error('Document not found');
    err.statusCode = 404;
    throw err;
  }
  if (!userCanAccessProject(req, doc.project_id)) {
    const err = new Error('Access denied for this project.');
    err.statusCode = 403;
    throw err;
  }
  return doc;
}

// ── Multer storage for DMS uploads ──────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/documents');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `${uuid()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

const uploadBase = path.resolve(__dirname, '../..');
const resolveLocalDocumentPath = (localUrl) => {
  if (!localUrl) return null;
  const relative = String(localUrl).replace(/^\/+/, '').replace(/[\\/]+/g, path.sep);
  const full = path.resolve(uploadBase, relative);
  if (!full.startsWith(uploadBase)) return null;
  return full;
};

const previewableExcel = new Set(['.xlsx', '.xls', '.xlsm']);

let schemaReady = false;
async function ensureDmsSchema() {
  if (schemaReady) return;
  await db().query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
  await db().query(`
    ALTER TABLE documents
      ADD COLUMN IF NOT EXISTS folder_id UUID,
      ADD COLUMN IF NOT EXISTS doc_type VARCHAR(50) DEFAULT 'general',
      ADD COLUMN IF NOT EXISTS doc_number VARCHAR(120),
      ADD COLUMN IF NOT EXISTS doc_title TEXT,
      ADD COLUMN IF NOT EXISTS discipline VARCHAR(80),
      ADD COLUMN IF NOT EXISTS description TEXT,
      ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT ARRAY[]::TEXT[],
      ADD COLUMN IF NOT EXISTS expiry_date DATE,
      ADD COLUMN IF NOT EXISTS access_level VARCHAR(30) DEFAULT 'internal',
      ADD COLUMN IF NOT EXISTS is_confidential BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS parent_doc_id UUID,
      ADD COLUMN IF NOT EXISTS revision VARCHAR(20) DEFAULT 'A',
      ADD COLUMN IF NOT EXISTS revision_no INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS approved_by UUID,
      ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS is_signed BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS signature_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS ocr_text TEXT,
      ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft',
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()
  `);
  await db().query(`
    CREATE TABLE IF NOT EXISTS document_folders (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
      parent_id UUID REFERENCES document_folders(id) ON DELETE CASCADE,
      folder_name TEXT NOT NULL,
      folder_type VARCHAR(30) DEFAULT 'general',
      project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
      path TEXT,
      description TEXT,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db().query(`
    CREATE TABLE IF NOT EXISTS document_versions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      version_no INTEGER NOT NULL,
      revision VARCHAR(20),
      file_name TEXT,
      file_url TEXT,
      onedrive_id TEXT,
      file_size BIGINT,
      change_summary TEXT,
      uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(document_id, version_no)
    )
  `);
  await db().query(`
    CREATE TABLE IF NOT EXISTS document_approvals (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      sequence_no INTEGER NOT NULL DEFAULT 1,
      approver_id UUID REFERENCES users(id) ON DELETE SET NULL,
      approval_type VARCHAR(30) DEFAULT 'review',
      status VARCHAR(20) DEFAULT 'pending',
      comments TEXT,
      actioned_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(document_id, sequence_no, approver_id)
    )
  `);
  await db().query(`
    CREATE TABLE IF NOT EXISTS document_access_logs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      action VARCHAR(30) NOT NULL,
      ip_address TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db().query(`
    CREATE TABLE IF NOT EXISTS document_shares (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      share_token TEXT UNIQUE NOT NULL,
      shared_by UUID REFERENCES users(id) ON DELETE SET NULL,
      recipient_email TEXT,
      recipient_name TEXT,
      purpose TEXT,
      permissions VARCHAR(20) DEFAULT 'view',
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db().query(`
    CREATE TABLE IF NOT EXISTS document_signatures (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      signer_id UUID REFERENCES users(id) ON DELETE SET NULL,
      signer_name TEXT,
      signer_role TEXT,
      signature_type VARCHAR(20) DEFAULT 'approval',
      signature_data TEXT,
      signature_method VARCHAR(20) DEFAULT 'typed',
      hash_value TEXT,
      is_valid BOOLEAN DEFAULT true,
      signed_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db().query(`CREATE INDEX IF NOT EXISTS idx_dms_documents_company ON documents(company_id, status)`);
  await db().query(`CREATE INDEX IF NOT EXISTS idx_dms_documents_folder ON documents(folder_id)`);
  await db().query(`CREATE INDEX IF NOT EXISTS idx_dms_folders_company ON document_folders(company_id)`);
  await db().query(`CREATE INDEX IF NOT EXISTS idx_dms_approvals_user ON document_approvals(approver_id, status)`);
  await db().query(`CREATE INDEX IF NOT EXISTS idx_dms_logs_document ON document_access_logs(document_id, created_at)`);
  await db().query(`DROP VIEW IF EXISTS document_register`);
  await db().query(`
    CREATE OR REPLACE VIEW document_register AS
    SELECT d.*, p.name AS project_name, u.name AS uploaded_by_name,
      (SELECT COUNT(*) FROM document_versions dv WHERE dv.document_id = d.id) AS version_count,
      (SELECT COUNT(*) FROM document_access_logs dal WHERE dal.document_id = d.id) AS access_count
    FROM documents d
    LEFT JOIN projects p ON p.id = d.project_id
    LEFT JOIN users u ON u.id = d.uploaded_by
  `);
  schemaReady = true;
}

router.use(async (req, res, next) => {
  try {
    await ensureDmsSchema();
    next();
  } catch (err) {
    next(err);
  }
});

// ══════════════════════════════════════════════════════════════════
// UPLOAD (single + bulk) with DMS metadata
// ══════════════════════════════════════════════════════════════════
router.post('/upload', upload.array('files', 20), async (req, res) => {
  try {
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files provided' });
    const { project_id, folder_id, doc_type, doc_number, doc_title, discipline,
            description, module, module_record_id, tags, expiry_date, access_level } = req.body;
    if (project_id && !userCanAccessProject(req, project_id)) {
      return res.status(403).json({ error: 'Access denied for this project.' });
    }
    const tagArr = tags ? (Array.isArray(tags) ? tags : String(tags).split(',').map(t=>t.trim()).filter(Boolean)) : [];

    const created = [];
    for (const file of req.files) {
      const localUrl = `/uploads/documents/${file.filename}`;
      const ext = path.extname(file.originalname).slice(1).toLowerCase();
      const r = await db().query(`
        INSERT INTO documents
          (company_id, project_id, folder_id, module, module_record_id,
           file_name, file_type, file_size, local_url,
           doc_type, doc_number, doc_title, discipline, description,
           tags, expiry_date, access_level, status, uploaded_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'draft',$18)
        RETURNING *`,
        [CID(req), project_id||null, folder_id||null, module||'general', module_record_id||null,
         file.originalname, ext, file.size, localUrl,
         doc_type||'general', doc_number||null,
         doc_title || file.originalname, discipline||null, description||null,
         tagArr, expiry_date||null, access_level||'internal', req.user.id]);
      await db().query(`INSERT INTO document_access_logs (document_id,user_id,action,ip_address) VALUES ($1,$2,'upload',$3)`,
        [r.rows[0].id, req.user.id, req.ip]);
      created.push(r.rows[0]);
    }
    res.status(201).json({ data: created, count: created.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// DOCUMENT REPOSITORY
// ══════════════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  try {
    const { project_id, doc_type, status, module, search, expiring_days } = req.query;
    const conditions = ['d.company_id=$1'];
    const params = [CID(req)];
    applyDocumentScope(req, conditions, params, 'd', project_id);
    let sql = `
      SELECT d.*, u.name AS uploaded_by_name, ua.name AS approved_by_name,
             p.name AS project_name,
             (SELECT COUNT(*) FROM document_versions dv WHERE dv.document_id=d.id) AS version_count
      FROM documents d
      LEFT JOIN users u  ON u.id  = d.uploaded_by
      LEFT JOIN users ua ON ua.id = d.approved_by
      LEFT JOIN projects p ON p.id = d.project_id
      WHERE ${conditions.join(' AND ')}`;
    let i = params.length + 1;
    if (doc_type)     { sql += ` AND d.doc_type=$${i++}`;     params.push(doc_type); }
    if (status)       { sql += ` AND d.status=$${i++}`;       params.push(status); }
    if (module)       { sql += ` AND d.module=$${i++}`;       params.push(module); }
    if (expiring_days){ sql += ` AND d.expiry_date IS NOT NULL AND d.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE+$${i++}::int`; params.push(expiring_days); }
    if (search)       { sql += ` AND (d.doc_title ILIKE $${i} OR d.doc_number ILIKE $${i} OR d.file_name ILIKE $${i++})`; params.push(`%${search}%`); }
    sql += ' ORDER BY d.created_at DESC';
    res.json({ data: (await db().query(sql, params)).rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/dashboard', async (req, res) => {
  try {
    const cid = CID(req);
    const scope = ['d.company_id=$1'];
    const scopeParams = [cid];
    applyDocumentScope(req, scope, scopeParams, 'd', req.query.project_id || null);
    const scopedWhere = scope.join(' AND ');
    const [stats, expiring, pendingApprovals, recentUploads, byType, byStatus, recentActivity] = await Promise.all([
      db().query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status='approved') AS approved,
          COUNT(*) FILTER (WHERE status='under_review') AS under_review,
          COUNT(*) FILTER (WHERE status='draft') AS draft,
          COUNT(*) FILTER (WHERE status='rejected') AS rejected,
          COUNT(*) FILTER (WHERE status='archived') AS archived,
          COUNT(*) FILTER (WHERE is_signed=true) AS signed,
          COUNT(DISTINCT doc_type) AS doc_types,
          COUNT(DISTINCT project_id) AS projects,
          COALESCE(SUM(file_size),0) AS total_size_bytes,
          COUNT(*) FILTER (WHERE expiry_date IS NOT NULL AND expiry_date <= CURRENT_DATE+30) AS expiring_soon
        FROM documents d WHERE ${scopedWhere}`, scopeParams),
      db().query(`
        SELECT d.id, d.doc_number, d.doc_title, d.doc_type, d.expiry_date, p.name AS project_name,
               d.expiry_date - CURRENT_DATE AS days_until
        FROM documents d LEFT JOIN projects p ON p.id=d.project_id
        WHERE ${scopedWhere} AND d.expiry_date IS NOT NULL
          AND d.expiry_date BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE+60
        ORDER BY d.expiry_date LIMIT 15`, scopeParams),
      db().query(`
        SELECT da.*, d.doc_number, d.doc_title, d.doc_type, u.name AS approver_name
        FROM document_approvals da
        JOIN documents d ON d.id=da.document_id
        LEFT JOIN users u ON u.id=da.approver_id
        WHERE ${scopedWhere} AND da.status='pending'
          AND da.approver_id=$${scopeParams.length + 1}
        ORDER BY da.created_at LIMIT 10`, [...scopeParams, req.user.id]),
      db().query(`
        SELECT d.id, d.doc_number, d.doc_title, d.doc_type, d.file_name, d.status, d.revision,
               u.name AS uploaded_by_name, d.created_at
        FROM documents d LEFT JOIN users u ON u.id=d.uploaded_by
        WHERE ${scopedWhere}
        ORDER BY d.created_at DESC LIMIT 10`, scopeParams),
      db().query(`
        SELECT doc_type, COUNT(*) AS c, COALESCE(SUM(file_size),0) AS size
        FROM documents d WHERE ${scopedWhere} GROUP BY doc_type ORDER BY c DESC`, scopeParams),
      db().query(`
        SELECT status, COUNT(*) AS c FROM documents d WHERE ${scopedWhere} GROUP BY status`, scopeParams),
      db().query(`
        SELECT dal.action, dal.created_at, u.name AS user_name,
               d.doc_number, d.doc_title
        FROM document_access_logs dal
        JOIN documents d ON d.id=dal.document_id
        LEFT JOIN users u ON u.id=dal.user_id
        WHERE ${scopedWhere}
        ORDER BY dal.created_at DESC LIMIT 15`, scopeParams),
    ]);
    res.json({ data: {
      stats: stats.rows[0],
      expiring_docs: expiring.rows,
      pending_approvals: pendingApprovals.rows,
      recent_uploads: recentUploads.rows,
      by_type: byType.rows,
      by_status: byStatus.rows,
      recent_activity: recentActivity.rows,
    }});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// FOLDERS (virtual folder structure)
// ══════════════════════════════════════════════════════════════════
router.get('/folders', async (req, res) => {
  try {
    const conditions = ['f.company_id=$1'];
    const params = [CID(req)];
    applyDocumentScope(req, conditions, params, 'f', req.query.project_id || null);
    const r = await db().query(`
      SELECT f.*, p.name AS project_name,
        (SELECT COUNT(*) FROM documents d WHERE d.folder_id=f.id) AS doc_count,
        (SELECT COUNT(*) FROM document_folders c WHERE c.parent_id=f.id) AS child_count
      FROM document_folders f
      LEFT JOIN projects p ON p.id=f.project_id
      WHERE ${conditions.join(' AND ')} ORDER BY f.folder_type, f.folder_name`, params);
    res.json({ data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/folders', async (req, res) => {
  try {
    const { parent_id, folder_name, folder_type, project_id, description } = req.body;
    if (!folder_name) return res.status(400).json({ error: 'folder_name required' });
    if (project_id && !userCanAccessProject(req, project_id)) {
      return res.status(403).json({ error: 'Access denied for this project.' });
    }
    let path = `/${folder_name}`;
    if (parent_id) {
      const p = await db().query('SELECT path FROM document_folders WHERE id=$1', [parent_id]);
      if (p.rows.length) path = `${p.rows[0].path}/${folder_name}`;
    }
    const r = await db().query(`
      INSERT INTO document_folders (company_id,parent_id,folder_name,folder_type,project_id,path,description,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [CID(req), parent_id||null, folder_name, folder_type||'general', project_id||null, path, description||null, req.user.id]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/folders/:fid', authorize(...ADMINS), async (req, res) => {
  try {
    await db().query('DELETE FROM document_folders WHERE id=$1 AND company_id=$2', [req.params.fid, CID(req)]);
    res.json({ message: 'Folder deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// FULL-TEXT / ADVANCED SEARCH
// ══════════════════════════════════════════════════════════════════
router.get('/search', async (req, res) => {
  try {
    const { q, project_id, doc_type, status, discipline, tag, from_date, to_date } = req.query;
    const scope = ['d.company_id=$1'];
    const params = [CID(req), q || ''];
    applyDocumentScope(req, scope, params, 'd', project_id);
    let sql = `
      SELECT d.*, u.name AS uploaded_by_name, p.name AS project_name,
        ts_rank(to_tsvector('english', COALESCE(d.doc_title,'') || ' ' || COALESCE(d.description,'') || ' ' || COALESCE(d.ocr_text,'')),
          plainto_tsquery('english', $2)) AS rank
      FROM documents d
      LEFT JOIN users u ON u.id=d.uploaded_by
      LEFT JOIN projects p ON p.id=d.project_id
      WHERE ${scope.join(' AND ')}`;
    let i = params.length + 1;
    if (q) {
      sql += ` AND (to_tsvector('english', COALESCE(d.doc_title,'') || ' ' || COALESCE(d.description,'') || ' ' || COALESCE(d.ocr_text,'')) @@ plainto_tsquery('english', $2)
               OR d.doc_title ILIKE $${i} OR d.doc_number ILIKE $${i} OR d.file_name ILIKE $${i})`;
      params.push(`%${q}%`); i++;
    }
    if (doc_type)   { sql += ` AND d.doc_type=$${i++}`;   params.push(doc_type); }
    if (status)     { sql += ` AND d.status=$${i++}`;     params.push(status); }
    if (discipline) { sql += ` AND d.discipline ILIKE $${i++}`; params.push(`%${discipline}%`); }
    if (tag)        { sql += ` AND $${i++} = ANY(d.tags)`; params.push(tag); }
    if (from_date)  { sql += ` AND d.created_at >= $${i++}`; params.push(from_date); }
    if (to_date)    { sql += ` AND d.created_at <= $${i++}`; params.push(to_date); }
    sql += q ? ' ORDER BY rank DESC, d.created_at DESC LIMIT 100' : ' ORDER BY d.created_at DESC LIMIT 100';
    res.json({ data: (await db().query(sql, params)).rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// REPORTS
// ══════════════════════════════════════════════════════════════════
router.get('/reports/register', async (req, res) => {
  try {
    const { project_id, doc_type } = req.query;
    let sql = `SELECT * FROM document_register d WHERE company_id=$1`;
    const params = [CID(req)];
    const scope = [];
    applyDocumentScope(req, scope, params, 'd', project_id);
    let i = params.length + 1;
    if (scope.length) sql += scope.map(c => ` AND ${c}`).join('');
    if (doc_type)   { sql += ` AND doc_type=$${i++}`;   params.push(doc_type); }
    sql += ' ORDER BY created_at DESC';
    res.json({ data: (await db().query(sql, params)).rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/reports/revision', async (req, res) => {
  try {
    const conditions = ['d.company_id=$1', 'd.revision_no > 0'];
    const params = [CID(req)];
    applyDocumentScope(req, conditions, params, 'd', req.query.project_id || null);
    const r = await db().query(`
      SELECT d.id, d.doc_number, d.doc_title, d.doc_type, d.revision, d.revision_no,
             d.status, p.name AS project_name,
             (SELECT COUNT(*) FROM document_versions dv WHERE dv.document_id=d.id) AS total_revisions,
             (SELECT MAX(dv.created_at) FROM document_versions dv WHERE dv.document_id=d.id) AS last_revised
      FROM documents d LEFT JOIN projects p ON p.id=d.project_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY d.revision_no DESC`, params);
    res.json({ data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/reports/approval', async (req, res) => {
  try {
    const conditions = ['d.company_id=$1', "d.status IN ('under_review','approved','rejected')"];
    const params = [CID(req)];
    applyDocumentScope(req, conditions, params, 'd', req.query.project_id || null);
    const r = await db().query(`
      SELECT d.id, d.doc_number, d.doc_title, d.doc_type, d.status,
             p.name AS project_name, u.name AS approved_by_name, d.approved_at,
             (SELECT COUNT(*) FROM document_approvals da WHERE da.document_id=d.id) AS total_approvers,
             (SELECT COUNT(*) FROM document_approvals da WHERE da.document_id=d.id AND da.status='approved') AS approved_count,
             (SELECT COUNT(*) FROM document_approvals da WHERE da.document_id=d.id AND da.status='pending') AS pending_count
      FROM documents d
      LEFT JOIN projects p ON p.id=d.project_id
      LEFT JOIN users u ON u.id=d.approved_by
      WHERE ${conditions.join(' AND ')}
      ORDER BY d.updated_at DESC`, params);
    res.json({ data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/reports/audit', async (req, res) => {
  try {
    const { from_date, to_date, action, user_id } = req.query;
    const conditions = ['d.company_id=$1'];
    const params = [CID(req)];
    applyDocumentScope(req, conditions, params, 'd', req.query.project_id || null);
    let sql = `
      SELECT dal.*, u.name AS user_name, d.doc_number, d.doc_title, d.doc_type
      FROM document_access_logs dal
      JOIN documents d ON d.id=dal.document_id
      LEFT JOIN users u ON u.id=dal.user_id
      WHERE ${conditions.join(' AND ')}`;
    let i = params.length + 1;
    if (from_date) { sql += ` AND dal.created_at >= $${i++}`; params.push(from_date); }
    if (to_date)   { sql += ` AND dal.created_at <= $${i++}`; params.push(to_date); }
    if (action)    { sql += ` AND dal.action=$${i++}`; params.push(action); }
    if (user_id)   { sql += ` AND dal.user_id=$${i++}`; params.push(user_id); }
    sql += ' ORDER BY dal.created_at DESC LIMIT 500';
    res.json({ data: (await db().query(sql, params)).rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/reports/user-activity', async (req, res) => {
  try {
    const conditions = ['d.company_id=$1'];
    const params = [CID(req)];
    applyDocumentScope(req, conditions, params, 'd', req.query.project_id || null);
    const r = await db().query(`
      SELECT u.name AS user_name, u.role,
        COUNT(*) FILTER (WHERE dal.action='upload') AS uploads,
        COUNT(*) FILTER (WHERE dal.action='view') AS views,
        COUNT(*) FILTER (WHERE dal.action='download') AS downloads,
        COUNT(*) FILTER (WHERE dal.action='approve') AS approvals,
        COUNT(*) FILTER (WHERE dal.action='share') AS shares,
        COUNT(*) AS total_actions,
        MAX(dal.created_at) AS last_activity
      FROM document_access_logs dal
      JOIN documents d ON d.id=dal.document_id
      LEFT JOIN users u ON u.id=dal.user_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY u.name, u.role
      ORDER BY total_actions DESC`, params);
    res.json({ data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id([0-9a-fA-F-]{36})', async (req, res) => {
  try {
    await getAccessibleDocument(req, req.params.id);
    const r = await db().query(`
      SELECT d.*, u.name AS uploaded_by_name, ua.name AS approved_by_name,
        p.name AS project_name,
        (SELECT json_agg(dv ORDER BY dv.version_no DESC) FROM document_versions dv WHERE dv.document_id=d.id) AS versions,
        (SELECT json_agg(da ORDER BY da.sequence_no) FROM document_approvals da WHERE da.document_id=d.id) AS approvals,
        (SELECT json_agg(sg ORDER BY sg.signed_at) FROM document_signatures sg WHERE sg.document_id=d.id) AS signatures
      FROM documents d
      LEFT JOIN users u  ON u.id=d.uploaded_by
      LEFT JOIN users ua ON ua.id=d.approved_by
      LEFT JOIN projects p ON p.id=d.project_id
      WHERE d.id=$1 AND d.company_id=$2`, [req.params.id, CID(req)]);
    if (!r.rows.length) return res.status(404).json({ error: 'Document not found' });
    // Log view
    await db().query(`INSERT INTO document_access_logs (document_id,user_id,action,ip_address) VALUES ($1,$2,'view',$3)`,
      [req.params.id, req.user.id, req.ip]);
    res.json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id([0-9a-fA-F-]{36})/file', async (req, res) => {
  try {
    const doc = await getAccessibleDocument(req, req.params.id);
    const { rows } = await db().query(`SELECT onedrive_url FROM documents WHERE id=$1`, [req.params.id]);
    const localPath = resolveLocalDocumentPath(doc.local_url);
    if (!localPath || !fs.existsSync(localPath)) {
      if (rows[0]?.onedrive_url) return res.redirect(rows[0].onedrive_url);
      return res.status(404).json({ error: 'Document file not found on server' });
    }
    // Set proper Content-Type for PDF so browser renders inline
    const ext = path.extname(doc.file_name || '').toLowerCase();
    if (ext === '.pdf') res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${String(doc.file_name || 'document').replace(/"/g, '')}"`);
    // Log access
    db().query(`INSERT INTO document_access_logs (document_id,user_id,action,ip_address) VALUES ($1,$2,'view',$3)`,
      [req.params.id, req.user.id, req.ip]).catch(()=>{});
    res.sendFile(localPath);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id([0-9a-fA-F-]{36})/preview', async (req, res) => {
  try {
    await getAccessibleDocument(req, req.params.id);
    const r = await db().query(
      `SELECT id, file_name, file_type, local_url
       FROM documents
       WHERE id=$1 AND company_id=$2`,
      [req.params.id, CID(req)]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Document not found' });
    const doc = r.rows[0];
    const localPath = resolveLocalDocumentPath(doc.local_url);
    if (!localPath || !fs.existsSync(localPath)) return res.status(404).json({ error: 'Document file not found on server' });

    const ext = path.extname(doc.file_name || doc.local_url || '').toLowerCase();
    if (!previewableExcel.has(ext)) {
      return res.json({
        data: {
          kind: ext === '.pdf' ? 'pdf' : ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext) ? 'image' : 'download',
          file_name: doc.file_name,
          file_type: doc.file_type,
          message: 'Use the file endpoint for inline preview or download.',
        },
      });
    }

    const workbook = xlsx.readFile(localPath, { cellDates: true });
    const sheetName = req.query.sheet && workbook.SheetNames.includes(req.query.sheet)
      ? req.query.sheet
      : workbook.SheetNames[0];
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      blankrows: false,
      defval: '',
      raw: false,
    }).slice(0, 80);
    await db().query(`INSERT INTO document_access_logs (document_id,user_id,action,ip_address,metadata) VALUES ($1,$2,'view',$3,$4)`,
      [req.params.id, req.user.id, req.ip, JSON.stringify({ preview: 'excel', sheet: sheetName })]);
    res.json({
      data: {
        kind: 'excel',
        file_name: doc.file_name,
        file_type: doc.file_type,
        sheets: workbook.SheetNames,
        sheet: sheetName,
        rows,
      },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DOCX → HTML preview using mammoth
router.get('/:id([0-9a-fA-F-]{36})/docx-preview', async (req, res) => {
  try {
    await getAccessibleDocument(req, req.params.id);
    const r = await db().query(
      `SELECT id, file_name, file_type, local_url FROM documents WHERE id=$1 AND company_id=$2`,
      [req.params.id, CID(req)]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Document not found' });
    const doc = r.rows[0];
    const ext = path.extname(doc.file_name || '').toLowerCase();
    if (!['.docx','.doc'].includes(ext)) {
      return res.status(400).json({ error: 'Not a Word document' });
    }
    const localPath = resolveLocalDocumentPath(doc.local_url);
    if (!localPath || !fs.existsSync(localPath)) {
      return res.status(404).json({ error: 'File not found on server' });
    }
    // Convert DOCX → HTML using mammoth
    const result = await mammoth.convertToHtml({ path: localPath }, {
      styleMap: [
        "p[style-name='Heading 1'] => h2:fresh",
        "p[style-name='Heading 2'] => h3:fresh",
        "p[style-name='Heading 3'] => h4:fresh",
        "table => table",
        "tr    => tr",
        "td    => td",
        "th    => th",
      ]
    });
    await db().query(
      `INSERT INTO document_access_logs (document_id,user_id,action,ip_address) VALUES ($1,$2,'view',$3)`,
      [req.params.id, req.user.id, req.ip]
    );
    // Wrap in styled HTML page
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${doc.file_name}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; line-height: 1.6; color: #1a1a1a; background: #fff; padding: 32px 48px; max-width: 860px; margin: 0 auto; }
  h1,h2,h3,h4 { color: #1e293b; margin-top: 20px; margin-bottom: 8px; }
  h2 { font-size: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
  h3 { font-size: 14px; }
  p  { margin: 6px 0; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 12px; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 10px; text-align: left; }
  th { background: #f1f5f9; font-weight: 600; }
  tr:nth-child(even) td { background: #f8fafc; }
  strong, b { font-weight: 700; }
  ul, ol { margin: 6px 0 6px 20px; }
  li { margin: 3px 0; }
  .warning { display: none; }
</style>
</head>
<body>
${result.value}
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update metadata
router.patch('/:id([0-9a-fA-F-]{36})/metadata', async (req, res) => {
  try {
    await getAccessibleDocument(req, req.params.id);
    const { doc_title, doc_type, doc_number, discipline, description, expiry_date,
            is_confidential, access_level, status, tags, metadata } = req.body;
    const fields = { doc_title, doc_type, doc_number, discipline, description,
                     expiry_date, is_confidential, access_level, status, metadata };
    const sets = []; const vals = [];
    Object.entries(fields).forEach(([k,v]) => {
      if (v !== undefined) { sets.push(`${k}=$${vals.length+1}`); vals.push(v); }
    });
    if (tags !== undefined) { sets.push(`tags=$${vals.length+1}`); vals.push(tags); }
    vals.push(req.params.id, CID(req));
    const r = await db().query(
      `UPDATE documents SET ${sets.join(',')}, updated_at=NOW() WHERE id=$${vals.length-1} AND company_id=$${vals.length} RETURNING *`,
      vals);
    res.json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// VERSION CONTROL
// ══════════════════════════════════════════════════════════════════
router.get('/:id([0-9a-fA-F-]{36})/versions', async (req, res) => {
  try {
    await getAccessibleDocument(req, req.params.id);
    const r = await db().query(`
      SELECT dv.*, u.name AS uploaded_by_name
      FROM document_versions dv LEFT JOIN users u ON u.id=dv.uploaded_by
      WHERE dv.document_id=$1 ORDER BY dv.version_no DESC`, [req.params.id]);
    res.json({ data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id([0-9a-fA-F-]{36})/versions', upload.single('file'), async (req, res) => {
  try {
    await getAccessibleDocument(req, req.params.id);
    const { file_name, file_url, onedrive_id, file_size, revision, change_summary } = req.body;
    const uploaded = req.file;
    const nextFileName = uploaded ? uploaded.originalname : file_name;
    const nextFileUrl = uploaded ? `/uploads/documents/${uploaded.filename}` : (file_url || null);
    const nextFileSize = uploaded ? uploaded.size : (file_size || null);
    if (!nextFileName) return res.status(400).json({ error: 'Revision file or file name is required' });
    // Get next version number
    const maxVer = (await db().query(`SELECT COALESCE(MAX(version_no),0) AS v FROM document_versions WHERE document_id=$1`, [req.params.id])).rows[0].v;
    const r = await db().query(`
      INSERT INTO document_versions (document_id,version_no,revision,file_name,file_url,onedrive_id,file_size,change_summary,uploaded_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.params.id, maxVer+1, revision||null, nextFileName, nextFileUrl, onedrive_id||null, nextFileSize, change_summary||null, req.user.id]);
    // Update parent doc with latest file info
    await db().query(`UPDATE documents SET file_name=$1, local_url=COALESCE($2, local_url), file_size=COALESCE($3, file_size), revision=$4, revision_no=$5, status='draft', updated_at=NOW() WHERE id=$6`,
      [nextFileName, nextFileUrl, nextFileSize, revision||null, maxVer+1, req.params.id]);
    // Log
    await db().query(`INSERT INTO document_access_logs (document_id,user_id,action) VALUES ($1,$2,'upload')`, [req.params.id, req.user.id]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// APPROVAL WORKFLOW
// ══════════════════════════════════════════════════════════════════
router.post('/:id([0-9a-fA-F-]{36})/submit-for-review', async (req, res) => {
  try {
    await getAccessibleDocument(req, req.params.id);
    const { approvers } = req.body; // [{user_id, approval_type, sequence_no}]
    await db().query(`UPDATE documents SET status='under_review', updated_at=NOW() WHERE id=$1`, [req.params.id]);
    if (Array.isArray(approvers) && approvers.length) {
      for (const ap of approvers) {
        await db().query(`
          INSERT INTO document_approvals (document_id,sequence_no,approver_id,approval_type)
          VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
          [req.params.id, ap.sequence_no||1, ap.user_id, ap.approval_type||'review']);
      }
    }
    await db().query(`INSERT INTO document_access_logs (document_id,user_id,action) VALUES ($1,$2,'edit')`, [req.params.id, req.user.id]);
    res.json({ message: 'Submitted for review' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/approvals/:approvalId', async (req, res) => {
  try {
    const { status, comments } = req.body;
    // Verify this user is the approver
    const ap = await db().query(`SELECT * FROM document_approvals WHERE id=$1`, [req.params.approvalId]);
    if (!ap.rows.length) return res.status(404).json({ error: 'Approval not found' });
    if (ap.rows[0].approver_id !== req.user.id && !['super_admin','admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Not authorized to action this approval' });
    }
    await db().query(`
      UPDATE document_approvals SET status=$1, comments=$2, actioned_at=NOW()
      WHERE id=$3`, [status, comments||null, req.params.approvalId]);

    const docId = ap.rows[0].document_id;
    await getAccessibleDocument(req, docId);
    // If approved, check if all approvals are done
    if (status === 'approved') {
      const pending = await db().query(`SELECT COUNT(*) FROM document_approvals WHERE document_id=$1 AND status='pending'`, [docId]);
      if (parseInt(pending.rows[0].count) === 0) {
        await db().query(`UPDATE documents SET status='approved', approved_by=$1, approved_at=NOW() WHERE id=$2`, [req.user.id, docId]);
      }
    } else if (status === 'rejected') {
      await db().query(`UPDATE documents SET status='rejected', updated_at=NOW() WHERE id=$1`, [docId]);
    }
    await db().query(`INSERT INTO document_access_logs (document_id,user_id,action,metadata) VALUES ($1,$2,$3,$4)`,
      [docId, req.user.id, status==='approved'?'approve':'reject', JSON.stringify({ comments })]);
    res.json({ message: `Document ${status}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// My pending approvals
router.get('/my-approvals', async (req, res) => {
  try {
    const r = await db().query(`
      SELECT da.*, d.doc_number, d.doc_title, d.doc_type, d.file_name,
             u.name AS uploaded_by_name, p.name AS project_name
      FROM document_approvals da
      JOIN documents d ON d.id=da.document_id
      LEFT JOIN users u ON u.id=d.uploaded_by
      LEFT JOIN projects p ON p.id=d.project_id
      WHERE da.approver_id=$1 AND da.status='pending' AND d.company_id=$2
      ORDER BY da.created_at`, [req.user.id, CID(req)]);
    res.json({ data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// DOCUMENT SHARING
// ══════════════════════════════════════════════════════════════════
router.post('/:id([0-9a-fA-F-]{36})/share', async (req, res) => {
  try {
    await getAccessibleDocument(req, req.params.id);
    const { recipient_email, recipient_name, purpose, permissions, expires_hours } = req.body;
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + parseInt(expires_hours || 72));
    const r = await db().query(`
      INSERT INTO document_shares (document_id,share_token,shared_by,recipient_email,recipient_name,purpose,permissions,expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.params.id, token, req.user.id, recipient_email||null, recipient_name||null,
       purpose||null, permissions||'view', expiresAt]);
    await db().query(`INSERT INTO document_access_logs (document_id,user_id,action,metadata) VALUES ($1,$2,'share',$3)`,
      [req.params.id, req.user.id, JSON.stringify({ recipient_email })]);
    const shareUrl = `${process.env.FRONTEND_URL || ''}/shared-doc/${token}`;
    res.status(201).json({ data: r.rows[0], share_url: shareUrl });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Access shared document (public, no auth)
router.get('/shared/:token', async (req, res) => {
  try {
    const r = await db().query(`
      SELECT ds.*, d.doc_title, d.doc_number, d.doc_type, d.file_name,
             d.local_url, d.onedrive_url, d.onedrive_web_url
      FROM document_shares ds
      JOIN documents d ON d.id=ds.document_id
      WHERE ds.share_token=$1 AND ds.is_active=true
        AND (ds.expires_at IS NULL OR ds.expires_at > NOW())`, [req.params.token]);
    if (!r.rows.length) return res.status(404).json({ error: 'Share link not found or expired' });
    // Increment access count
    await db().query(`UPDATE document_shares SET access_count=access_count+1, last_accessed=NOW() WHERE share_token=$1`, [req.params.token]);
    res.json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// AUDIT LOGS
// ══════════════════════════════════════════════════════════════════
router.get('/:id([0-9a-fA-F-]{36})/logs', async (req, res) => {
  try {
    await getAccessibleDocument(req, req.params.id);
    const r = await db().query(`
      SELECT dal.*, u.name AS user_name
      FROM document_access_logs dal LEFT JOIN users u ON u.id=dal.user_id
      WHERE dal.document_id=$1 ORDER BY dal.created_at DESC LIMIT 100`, [req.params.id]);
    res.json({ data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// DIGITAL SIGNATURES
// ══════════════════════════════════════════════════════════════════
router.get('/:id([0-9a-fA-F-]{36})/signatures', async (req, res) => {
  try {
    await getAccessibleDocument(req, req.params.id);
    const r = await db().query(`
      SELECT sg.*, u.name AS signer_user_name
      FROM document_signatures sg LEFT JOIN users u ON u.id=sg.signer_id
      WHERE sg.document_id=$1 ORDER BY sg.signed_at`, [req.params.id]);
    res.json({ data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id([0-9a-fA-F-]{36})/sign', async (req, res) => {
  try {
    await getAccessibleDocument(req, req.params.id);
    const { signature_type, signature_data, signature_method, comments } = req.body;
    // Compute integrity hash
    const doc = await db().query('SELECT file_name, revision, updated_at FROM documents WHERE id=$1', [req.params.id]);
    if (!doc.rows.length) return res.status(404).json({ error: 'Document not found' });
    const hashInput = `${req.params.id}|${doc.rows[0].file_name}|${doc.rows[0].revision}|${req.user.id}|${Date.now()}`;
    const hash = crypto.createHash('sha256').update(hashInput).digest('hex');

    const r = await db().query(`
      INSERT INTO document_signatures (document_id,signer_id,signer_name,signer_role,signature_type,
        signature_data,signature_method,ip_address,hash_value,comments)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.params.id, req.user.id, req.user.name, req.user.role,
       signature_type||'approval', signature_data||req.user.name, signature_method||'typed',
       req.ip, hash, comments||null]);

    // Update doc signature count
    await db().query(`UPDATE documents SET is_signed=true, signature_count=signature_count+1, updated_at=NOW() WHERE id=$1`, [req.params.id]);
    await db().query(`INSERT INTO document_access_logs (document_id,user_id,action,metadata) VALUES ($1,$2,'approve',$3)`,
      [req.params.id, req.user.id, JSON.stringify({ signed: true, type: signature_type })]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Verify signature integrity
router.get('/:id([0-9a-fA-F-]{36})/verify-signatures', async (req, res) => {
  try {
    await getAccessibleDocument(req, req.params.id);
    const r = await db().query(`
      SELECT sg.*, u.name AS signer_user_name
      FROM document_signatures sg LEFT JOIN users u ON u.id=sg.signer_id
      WHERE sg.document_id=$1 ORDER BY sg.signed_at`, [req.params.id]);
    res.json({ data: r.rows, all_valid: r.rows.every(s => s.is_valid) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// DOCUMENT LINKING (link to module records)
// ══════════════════════════════════════════════════════════════════
router.patch('/:id([0-9a-fA-F-]{36})/link', async (req, res) => {
  try {
    await getAccessibleDocument(req, req.params.id);
    const { module, module_record_id, project_id, folder_id } = req.body;
    if (project_id && !userCanAccessProject(req, project_id)) {
      return res.status(403).json({ error: 'Access denied for this project.' });
    }
    const r = await db().query(`
      UPDATE documents SET
        module=COALESCE($1,module), module_record_id=COALESCE($2,module_record_id),
        project_id=COALESCE($3,project_id), folder_id=COALESCE($4,folder_id), updated_at=NOW()
      WHERE id=$5 AND company_id=$6 RETURNING *`,
      [module||null, module_record_id||null, project_id||null, folder_id||null, req.params.id, CID(req)]);
    res.json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Log download (called by frontend before download)
router.post('/:id([0-9a-fA-F-]{36})/log-download', async (req, res) => {
  try {
    await getAccessibleDocument(req, req.params.id);
    await db().query(`INSERT INTO document_access_logs (document_id,user_id,action,ip_address) VALUES ($1,$2,'download',$3)`,
      [req.params.id, req.user.id, req.ip]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Save OCR text (for full-text search)
router.patch('/:id([0-9a-fA-F-]{36})/ocr', async (req, res) => {
  try {
    await getAccessibleDocument(req, req.params.id);
    const { ocr_text } = req.body;
    await db().query(`UPDATE documents SET ocr_text=$1, updated_at=NOW() WHERE id=$2 AND company_id=$3`,
      [ocr_text||null, req.params.id, CID(req)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// DELETE
// ══════════════════════════════════════════════════════════════════
router.delete('/:id([0-9a-fA-F-]{36})', authorize(...ADMINS), async (req, res) => {
  try {
    await getAccessibleDocument(req, req.params.id);
    await db().query(`INSERT INTO document_access_logs (document_id,user_id,action) VALUES ($1,$2,'delete')`, [req.params.id, req.user.id]);
    await db().query(`UPDATE documents SET status='archived', updated_at=NOW() WHERE id=$1 AND company_id=$2`, [req.params.id, CID(req)]);
    res.json({ message: 'Archived' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
