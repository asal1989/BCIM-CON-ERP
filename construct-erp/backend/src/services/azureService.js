// Azure/SharePoint integration — token fetched directly via node-fetch
// (avoids @azure/identity SDK which has network issues in some Railway regions)
// Files live in the "ConstructERP Documents" SharePoint site's document
// library, not a personal OneDrive drive — see SHAREPOINT_SITE_ID.
const fetch = require('node-fetch');

const TENANT_ID     = process.env.ONEDRIVE_TENANT_ID;
const CLIENT_ID     = process.env.ONEDRIVE_CLIENT_ID;
const CLIENT_SECRET = process.env.ONEDRIVE_CLIENT_SECRET;
const SITE_ID       = process.env.SHAREPOINT_SITE_ID;

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const url = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope:         'https://graph.microsoft.com/.default',
  });

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });

  const json = await res.json();
  if (!res.ok || json.error) {
    const msg = json.error_description || json.error || `HTTP ${res.status}`;
    console.error('[OneDrive] Token error:', msg);
    throw new Error('Azure token error: ' + msg);
  }

  cachedToken = json.access_token;
  tokenExpiry = Date.now() + (json.expires_in - 60) * 1000;
  console.log('[OneDrive] Token acquired, expires in', json.expires_in, 's');
  return cachedToken;
}

async function uploadToSharePoint(fileName, fileBuffer, folderPath = 'Vendor Invoices') {
  console.log(`[OneDrive] Upload: ${fileName} → ${folderPath}`);
  const token = await getAccessToken();

  const sanitizedFileName = String(fileName).replace(/[<>:"|?*]/g, '_').trim();
  const sanitizedFolder   = String(folderPath).replace(/[<>:"|?*]/g, '_').trim();

  const uploadUrl = `https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drive/root:/${sanitizedFolder}/${sanitizedFileName}:/content`;

  const uploadRes = await fetch(uploadUrl, {
    method:  'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/octet-stream',
    },
    body: fileBuffer,
  });

  console.log(`[OneDrive] Upload response: ${uploadRes.status}`);

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    console.error(`[OneDrive] Upload failed (${uploadRes.status}):`, err.slice(0, 200));
    throw new Error(`OneDrive upload failed: ${uploadRes.status} — ${err.slice(0, 120)}`);
  }

  const item = await uploadRes.json();
  console.log(`[OneDrive] Upload OK: ${item.webUrl}`);
  return { id: item.id, webUrl: item.webUrl, downloadUrl: item['@microsoft.graph.downloadUrl'] };
}

async function deleteFromOneDrive(itemId) {
  if (!itemId) throw new Error('No OneDrive item ID');
  const token = await getAccessToken();
  const url = `https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drive/items/${itemId}`;
  const res = await fetch(url, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
  if (!res.ok && res.status !== 404) {
    const err = await res.text();
    throw new Error(`OneDrive delete failed: ${res.status} — ${err.slice(0, 120)}`);
  }
  console.log(`[OneDrive] Deleted item ${itemId}`);
}

module.exports = { uploadToSharePoint, deleteFromOneDrive };
