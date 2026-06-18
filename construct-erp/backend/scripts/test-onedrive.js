// Quick test: does OneDrive upload actually work with the .env credentials?
require('dotenv').config();
const { ClientSecretCredential } = require('@azure/identity');
const fetch = require('node-fetch');

const TENANT_ID = process.env.ONEDRIVE_TENANT_ID;
const CLIENT_ID = process.env.ONEDRIVE_CLIENT_ID;
const CLIENT_SECRET = process.env.ONEDRIVE_CLIENT_SECRET;
const USER_EMAIL = process.env.ONEDRIVE_USER_EMAIL;

(async () => {
  console.log('Tenant:', TENANT_ID);
  console.log('Client:', CLIENT_ID);
  console.log('User:  ', USER_EMAIL);
  console.log('Secret set:', !!CLIENT_SECRET);

  // 1. Get token
  let token;
  try {
    const cred = new ClientSecretCredential(TENANT_ID, CLIENT_ID, CLIENT_SECRET);
    const t = await cred.getToken('https://graph.microsoft.com/.default');
    token = t.token;
    console.log('\n✅ Token acquired');
  } catch (e) {
    console.error('\n❌ TOKEN FAILED:', e.message);
    process.exit(1);
  }

  // 2. Can we see the user's drive?
  try {
    const r = await fetch(`https://graph.microsoft.com/v1.0/users/${USER_EMAIL}/drive`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await r.text();
    console.log(`\nDrive lookup: ${r.status}`);
    if (!r.ok) console.log('  ', body.slice(0, 400));
    else {
      const d = JSON.parse(body);
      console.log('   driveType:', d.driveType, '| id:', d.id);
    }
  } catch (e) {
    console.error('❌ Drive lookup error:', e.message);
  }

  // 3. Try a tiny upload
  try {
    const url = `https://graph.microsoft.com/v1.0/users/${USER_EMAIL}/drive/root:/Vendor Invoices/__test__.txt:/content`;
    const r = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
      body: Buffer.from('hello from construct-erp test ' + new Date().toISOString()),
    });
    const body = await r.text();
    console.log(`\nUpload test: ${r.status}`);
    if (!r.ok) console.log('  ', body.slice(0, 600));
    else {
      const d = JSON.parse(body);
      console.log('   ✅ Uploaded. webUrl:', d.webUrl);
    }
  } catch (e) {
    console.error('❌ Upload error:', e.message);
  }
})();
