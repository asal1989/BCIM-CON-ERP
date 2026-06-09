// OneDrive upload via Microsoft Graph API (app-only auth)
// Requires env vars: ONEDRIVE_CLIENT_ID, ONEDRIVE_CLIENT_SECRET, ONEDRIVE_TENANT_ID, ONEDRIVE_USER_EMAIL
const https  = require('https');
const logger = require('../utils/logger');
const fs    = require('fs');

const GRAPH = 'graph.microsoft.com';
const TENANT  = () => process.env.ONEDRIVE_TENANT_ID;
const CLIENT  = () => process.env.ONEDRIVE_CLIENT_ID;
const SECRET  = () => process.env.ONEDRIVE_CLIENT_SECRET;
const USER    = () => process.env.ONEDRIVE_USER_EMAIL;
const FOLDER  = () => process.env.ONEDRIVE_FOLDER || 'ConstructERP';

function isConfigured() {
  const conf = {
    tenant: !!TENANT(),
    client: !!CLIENT(),
    secret: !!SECRET(),
    user:   !!USER()
  };
  if (!conf.tenant || !conf.client || !conf.secret || !conf.user) {
    logger.warn('⚠️ OneDrive not fully configured:', conf);
    return false;
  }
  return true;
}

function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(body);
    const req = https.request({ hostname, path, method: 'POST', headers: { ...headers, 'Content-Length': buf.length } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

function httpsPut(path, token, fileBuffer, mimeType) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: GRAPH,
      path,
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': mimeType || 'application/octet-stream',
        'Content-Length': fileBuffer.length,
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(fileBuffer);
    req.end();
  });
}

async function getAccessToken() {
  const body = new URLSearchParams({
    client_id:     CLIENT(),
    client_secret: SECRET(),
    scope:         'https://graph.microsoft.com/.default',
    grant_type:    'client_credentials',
  }).toString();

  const res = await httpsPost(
    `login.microsoftonline.com`,
    `/${TENANT()}/oauth2/v2.0/token`,
    { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  );
  if (!res.body.access_token) throw new Error('OneDrive token error: ' + JSON.stringify(res.body));
  return res.body.access_token;
}

async function uploadToOneDrive(localFilePath, originalName, module, projectName) {
  if (!isConfigured()) return null;

  const token = await getAccessToken();
  const fileBuffer = fs.readFileSync(localFilePath);

  // Folder path: ConstructERP/ProjectName/Module/filename
  const safeName    = originalName.replace(/[/\\?%*:|"<>]/g, '-');
  const safeProject = (projectName || 'General').replace(/[/\\?%*:|"<>]/g, '-');
  const safeModule  = (module || 'Misc').replace(/[/\\?%*:|"<>]/g, '-');
  const remotePath  = `/${FOLDER()}/${safeProject}/${safeModule}/${safeName}`;

  const encodedPath = encodeURIComponent(remotePath).replace(/%2F/g, '/');
  const apiPath = `/v1.0/users/${encodeURIComponent(USER())}/drive/root:${encodedPath}:/content`;

  const ext = originalName.split('.').pop().toLowerCase();
  const mime = {
    pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }[ext] || 'application/octet-stream';

  const res = await httpsPut(apiPath, token, fileBuffer, mime);
  if (res.status !== 200 && res.status !== 201) {
    throw new Error('OneDrive upload failed: ' + JSON.stringify(res.body));
  }

  return {
    onedrive_id:      res.body.id,
    onedrive_url:     res.body['@microsoft.graph.downloadUrl'] || null,
    onedrive_web_url: res.body.webUrl || null,
  };
}

/**
 * Get a fresh pre-authenticated download URL for an already-uploaded file.
 * The @microsoft.graph.downloadUrl returned here is a short-lived (few hours)
 * anonymous download link — no Microsoft login required to open it.
 */
async function getFreshDownloadUrl(onedriveId) {
  if (!isConfigured()) throw new Error('OneDrive not configured');
  const token = await getAccessToken();
  return new Promise((resolve, reject) => {
    const req = require('https').request({
      hostname: GRAPH,
      path: `/v1.0/users/${encodeURIComponent(USER())}/drive/items/${encodeURIComponent(onedriveId)}?select=id,name,%40microsoft.graph.downloadUrl,webUrl`,
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const body = JSON.parse(data);
          const url = body['@microsoft.graph.downloadUrl'] || body.webUrl || null;
          if (!url) return reject(new Error('Could not get download URL from OneDrive'));
          resolve(url);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

module.exports = { uploadToOneDrive, getFreshDownloadUrl, isConfigured };
