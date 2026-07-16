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

// ── Teams Online Meetings ─────────────────────────────────────────────────────
// Requires the Azure AD app to have Application permission:
//   OnlineMeetings.ReadWrite.All  (admin consent in Azure portal)
// The organizer is looked up by UPN/email in Azure AD.
async function createTeamsMeeting(subject, startDateTime, endDateTime, organizerEmail, attendeeEmails = []) {
  const token = await getAccessToken();

  // Resolve organizer's Azure AD object ID from their email/UPN
  const userRes = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(organizerEmail)}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  if (!userRes.ok) {
    const errBody = await userRes.text();
    console.error('[Teams] User lookup failed:', userRes.status, errBody.slice(0, 200));
    throw new Error(`Organizer "${organizerEmail}" not found in Azure AD (status ${userRes.status}). Check TEAMS_ORGANIZER_EMAIL env var.`);
  }
  const { id: userId } = await userRes.json();

  // Create the online meeting
  const body = { subject, startDateTime, endDateTime };
  if (attendeeEmails.length > 0) {
    body.participants = {
      attendees: attendeeEmails.map(email => ({
        upn: email, role: 'attendee',
        identity: { user: { displayName: email } },
      })),
    };
  }

  const meetRes = await fetch(
    `https://graph.microsoft.com/v1.0/users/${userId}/onlineMeetings`,
    {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (!meetRes.ok) {
    const errBody = await meetRes.json().catch(() => ({}));
    const msg = errBody?.error?.message || `HTTP ${meetRes.status}`;
    console.error('[Teams] Meeting creation failed:', msg);
    throw new Error(`Teams meeting creation failed: ${msg}`);
  }

  const m = await meetRes.json();
  console.log('[Teams] Meeting created:', m.id, m.joinUrl?.slice(0, 60));
  return {
    id:            m.id,
    subject:       m.subject,
    joinUrl:       m.joinUrl || m.joinWebUrl,
    startDateTime: m.startDateTime,
    endDateTime:   m.endDateTime,
  };
}

module.exports = { uploadToSharePoint, deleteFromOneDrive, createTeamsMeeting };
