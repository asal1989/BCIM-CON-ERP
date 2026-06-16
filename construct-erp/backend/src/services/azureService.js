// Azure/OneDrive integration service — uploads files to user's OneDrive
const { ClientSecretCredential } = require('@azure/identity');
const fetch = require('node-fetch');

const TENANT_ID = process.env.ONEDRIVE_TENANT_ID;
const CLIENT_ID = process.env.ONEDRIVE_CLIENT_ID;
const CLIENT_SECRET = process.env.ONEDRIVE_CLIENT_SECRET;
const USER_EMAIL = process.env.ONEDRIVE_USER_EMAIL;

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  // Return cached token if still valid
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  try {
    const credential = new ClientSecretCredential(TENANT_ID, CLIENT_ID, CLIENT_SECRET);
    const token = await credential.getToken('https://graph.microsoft.com/.default');
    cachedToken = token.token;
    tokenExpiry = token.expiresOnTimestamp * 1000 - 60000; // Refresh 1 min before expiry
    return cachedToken;
  } catch (e) {
    console.error('Azure token error:', e.message);
    throw new Error('Failed to get Azure access token: ' + e.message);
  }
}

async function uploadToSharePoint(fileName, fileBuffer, folderPath = 'Vendor Invoices') {
  try {
    console.log(`[OneDrive] Starting upload: ${fileName} to ${folderPath}`);
    const token = await getAccessToken();
    console.log(`[OneDrive] Got token, uploading to user: ${USER_EMAIL}`);

    const sanitizedFileName = String(fileName).replace(/[<>:"|?*]/g, '_').trim();
    const sanitizedFolder = String(folderPath).replace(/[<>:"|?*]/g, '_').trim();

    // Upload file to OneDrive (using /users/{email}/drive root)
    // Path: /users/{email}/drive/root:/{folderPath}/{fileName}:/content
    const uploadUrl = `https://graph.microsoft.com/v1.0/users/${USER_EMAIL}/drive/root:/${sanitizedFolder}/${sanitizedFileName}:/content`;
    console.log(`[OneDrive] Upload URL: ${uploadUrl}`);

    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
      },
      body: fileBuffer,
    });

    console.log(`[OneDrive] Response status: ${uploadRes.status}`);

    if (!uploadRes.ok) {
      const error = await uploadRes.text();
      console.error(`[OneDrive] Upload failed: ${uploadRes.status}`, error.slice(0, 200));
      throw new Error(`Upload failed: ${uploadRes.status} ${error.slice(0, 100)}`);
    }

    const driveItem = await uploadRes.json();
    console.log(`[OneDrive] Upload successful: ${driveItem.webUrl}`);

    return {
      id: driveItem.id,
      webUrl: driveItem.webUrl,
      downloadUrl: driveItem['@microsoft.graph.downloadUrl'],
    };
  } catch (e) {
    console.error('[OneDrive] Upload error:', e.message);
    throw e;
  }
}

module.exports = {
  uploadToSharePoint,
};
