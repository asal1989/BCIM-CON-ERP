// SharePoint document library upload via Microsoft Graph API (app-only auth)
// Requires env vars: ONEDRIVE_CLIENT_ID, ONEDRIVE_CLIENT_SECRET, ONEDRIVE_TENANT_ID, SHAREPOINT_SITE_ID
// Files live in the "ConstructERP Documents" SharePoint site's default document
// library — not a personal OneDrive drive — so access isn't tied to one
// employee's mailbox, and links are org-scoped rather than anonymous.
const https  = require('https');
const logger = require('../utils/logger');
const fs    = require('fs');

const GRAPH = 'graph.microsoft.com';
const TENANT   = () => process.env.ONEDRIVE_TENANT_ID;
const CLIENT   = () => process.env.ONEDRIVE_CLIENT_ID;
const SECRET   = () => process.env.ONEDRIVE_CLIENT_SECRET;
const SITE_ID  = () => process.env.SHAREPOINT_SITE_ID;
const FOLDER   = () => process.env.ONEDRIVE_FOLDER || 'ConstructERP';

function isConfigured() {
  const conf = {
    tenant:  !!TENANT(),
    client:  !!CLIENT(),
    secret:  !!SECRET(),
    site_id: !!SITE_ID(),
  };
  if (!conf.tenant || !conf.client || !conf.secret || !conf.site_id) {
    logger.warn('⚠️ SharePoint not fully configured:', conf);
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

// Fetches a URL and buffers the full response body, following redirects
// (Graph's /content endpoint 302s to a pre-signed download URL that must
// NOT be sent the Graph bearer token — only the initial request needs auth).
function httpsGetBuffer(hostname, urlPath, headers, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path: urlPath, method: 'GET', headers }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectsLeft > 0) {
        res.resume();
        const next = new URL(res.headers.location);
        return httpsGetBuffer(next.hostname, next.pathname + next.search, {}, redirectsLeft - 1).then(resolve, reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, buffer: Buffer.concat(chunks), contentType: res.headers['content-type'] }));
    });
    req.on('error', reject);
    req.end();
  });
}

function httpsGetJson(hostname, urlPath, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path: urlPath, method: 'GET', headers }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
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
  const apiPath = `/v1.0/sites/${SITE_ID()}/drive/root:${encodedPath}:/content`;

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
 * Create a permanent, organization-scoped sharing link for a SharePoint item.
 * Only people signed into this Microsoft 365 tenant can open it — unlike the
 * old anonymous links, a stray URL leak doesn't expose the file to anyone.
 */
async function createSharingLink(itemId) {
  if (!isConfigured()) throw new Error('SharePoint not configured');
  const token = await getAccessToken();
  const res = await httpsPost(
    GRAPH,
    `/v1.0/sites/${SITE_ID()}/drive/items/${encodeURIComponent(itemId)}/createLink`,
    { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    JSON.stringify({ type: 'view', scope: 'organization' })
  );
  const link = res.body?.link?.webUrl;
  if (!link) throw new Error('createLink failed: ' + JSON.stringify(res.body));
  return link;
}

/**
 * Upload a file to OneDrive and return a permanent sharing link.
 * Falls back to null if OneDrive is not configured.
 */
async function uploadAndShare(localFilePath, originalName, module, projectName) {
  const result = await uploadToOneDrive(localFilePath, originalName, module, projectName);
  if (!result) return null;
  const shareUrl = await createSharingLink(result.onedrive_id);
  return { ...result, share_url: shareUrl };
}

/**
 * Download a file's bytes from OneDrive by item id. Used to serve thumbnails/
 * previews for documents whose local copy no longer exists (deleted after
 * upload, or wiped by Railway's ephemeral filesystem on redeploy) — the
 * `onedrive_url` captured at upload time is a short-lived pre-signed link
 * (~1hr), so it can't be reused later; a fresh token + request is needed
 * every time.
 */
async function downloadFromOneDrive(itemId) {
  if (!isConfigured()) throw new Error('SharePoint not configured');
  const token = await getAccessToken();
  const apiPath = `/v1.0/sites/${SITE_ID()}/drive/items/${encodeURIComponent(itemId)}/content`;
  const result = await httpsGetBuffer(GRAPH, apiPath, { Authorization: `Bearer ${token}` });
  if (result.status >= 400) throw new Error(`SharePoint download failed (${result.status})`);
  return { buffer: result.buffer, contentType: result.contentType || 'application/octet-stream' };
}

/**
 * Returns a fresh, short-lived (~1hr) pre-signed download URL for a file by
 * item id — used to proxy/stream a file inline without buffering the whole
 * thing through this server. The URL captured at upload time expires, so
 * callers must fetch a new one on every request rather than caching it.
 */
async function getFreshDownloadUrl(itemId) {
  if (!isConfigured()) throw new Error('SharePoint not configured');
  const token = await getAccessToken();
  const apiPath = `/v1.0/sites/${SITE_ID()}/drive/items/${encodeURIComponent(itemId)}?$select=id,@microsoft.graph.downloadUrl`;
  const res = await httpsGetJson(GRAPH, apiPath, { Authorization: `Bearer ${token}` });
  const url = res.body?.['@microsoft.graph.downloadUrl'];
  if (!url) throw new Error(`getFreshDownloadUrl failed (${res.status}): ${JSON.stringify(res.body)}`);
  return url;
}

module.exports = { uploadToOneDrive, uploadAndShare, createSharingLink, downloadFromOneDrive, getFreshDownloadUrl, isConfigured };
