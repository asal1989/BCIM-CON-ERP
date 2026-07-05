// src/routes/upload.routes.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuid } = require('uuid');
const { authenticate } = require('../middleware/auth');
const { uploadAndShare, isConfigured: onedriveConfigured } = require('../services/onedrive.service');
const router = express.Router();
router.use(authenticate);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuid()}${ext}`);
  }
});

const ALLOWED_EXT  = new Set([
  '.jpg','.jpeg','.png','.gif','.webp',
  '.pdf','.xlsx','.xls','.docx','.doc','.pptx','.ppt','.txt','.csv',
  '.dwg','.dxf','.ifc',
  '.mp4','.mov','.avi','.mkv','.wmv',
  '.zip','.rar','.7z',
]);
const ALLOWED_MIME = new Set([
  'image/jpeg','image/png','image/gif','image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'text/plain','text/csv',
  'video/mp4','video/quicktime','video/x-msvideo','video/x-matroska','video/x-ms-wmv',
  'application/zip','application/x-rar-compressed','application/x-7z-compressed',
  'application/octet-stream', // dwg/dxf/ifc and unknown binary; browsers send this
]);

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return cb(new Error(`File type ${ext} not allowed`), false);
  if (!ALLOWED_MIME.has(file.mimetype)) return cb(new Error('File MIME type not allowed'), false);
  cb(null, true);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB

router.post('/', upload.array('files', 10), (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: 'No files uploaded' });
  const urls = req.files.map(f => `/uploads/${f.filename}`);
  res.json({ urls, count: urls.length, message: `${urls.length} file(s) uploaded` });
});

router.post('/single', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const localUrl  = `/uploads/${req.file.filename}`;
  const localPath = req.file.path;
  const origName  = req.file.originalname;
  const module    = req.body.module || 'Attachments';
  const project   = req.body.project || '';

  // Try OneDrive first — permanent sharing link, survives server restarts
  if (onedriveConfigured()) {
    try {
      const od = await uploadAndShare(localPath, origName, module, project);
      if (od?.share_url) {
        // Remove the local copy — it's now on OneDrive
        fs.unlink(localPath, () => {});
        return res.json({ url: od.share_url, filename: origName, provider: 'onedrive' });
      }
    } catch (e) {
      console.error('[upload] OneDrive failed, falling back to local:', e.message);
    }
  }

  // Fallback: local disk (works in dev; ephemeral on Railway without a volume)
  res.json({ url: localUrl, filename: req.file.filename, provider: 'local' });
});

module.exports = router;
