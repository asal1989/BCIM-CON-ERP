// src/routes/upload.routes.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuid } = require('uuid');
const { authenticate } = require('../middleware/auth');
const { uploadToSharePoint } = require('../services/azureService');
const router = express.Router();
router.use(authenticate);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuid()}${ext}`);
  }
});

const ALLOWED_EXT  = new Set(['.jpg','.jpeg','.png','.pdf','.xlsx','.docx','.dwg','.dxf']);
const ALLOWED_MIME = new Set([
  'image/jpeg','image/png','application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream', // dwg/dxf have no standard MIME; browsers send this
]);

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return cb(new Error('File type not allowed'), false);
  if (!ALLOWED_MIME.has(file.mimetype)) return cb(new Error('File MIME type not allowed'), false);
  cb(null, true);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB

// ── Standard local-disk upload ──────────────────────────────────────────────
router.post('/', upload.array('files', 10), (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: 'No files uploaded' });
  const urls = req.files.map(f => `/uploads/${f.filename}`);
  res.json({ urls, count: urls.length, message: `${urls.length} file(s) uploaded` });
});

router.post('/single', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `/uploads/${req.file.filename}`, filename: req.file.filename });
});

// ── OneDrive upload — stores file in Microsoft OneDrive via Graph API ────────
// Query param `folder` controls the OneDrive subfolder (default: 'Uploads').
// Falls back to local-disk URL if OneDrive credentials are not configured.
router.post('/onedrive', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const localUrl = `/uploads/${req.file.filename}`;
  const folder = req.body.folder || req.query.folder || 'Uploads';

  // Prefix filename with timestamp to avoid collisions in the same folder
  const ts = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const safeName = `${ts}_${req.file.originalname.replace(/[<>:"|?*]/g, '_')}`;

  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    const result = await uploadToSharePoint(safeName, fileBuffer, folder);

    res.json({
      url:          result.webUrl,       // OneDrive shareable link
      downloadUrl:  result.downloadUrl,  // Direct download URL
      localUrl,                          // Local fallback (still saved to disk)
      filename:     req.file.originalname,
      onedrive:     true,
    });
  } catch (e) {
    console.warn(`[OneDrive upload] Failed for ${req.file.originalname}: ${e.message} — returning local URL`);
    // Return local URL so the UI still works even if OneDrive is down
    res.json({
      url:      localUrl,
      localUrl,
      filename: req.file.originalname,
      onedrive: false,
      warning:  'Saved locally — OneDrive upload failed: ' + e.message,
    });
  }
});

module.exports = router;
