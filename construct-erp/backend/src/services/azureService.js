// Azure/SharePoint integration service
const { ClientSecretCredential } = require('@azure/identity');
const { Client } = require('@microsoft/microsoft-graph-client');
const { TokenCredentialAuthenticationProvider } = require('@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials');

const TENANT_ID = process.env.ONEDRIVE_TENANT_ID;
const CLIENT_ID = process.env.ONEDRIVE_CLIENT_ID;
const CLIENT_SECRET = process.env.ONEDRIVE_CLIENT_SECRET;
const USER_EMAIL = process.env.ONEDRIVE_USER_EMAIL;

let graphClient = null;

async function initGraphClient() {
  if (graphClient) return graphClient;

  const credential = new ClientSecretCredential(TENANT_ID, CLIENT_ID, CLIENT_SECRET);
  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default'],
  });

  graphClient = Client.initWithMiddleware({ authProvider });
  return graphClient;
}

async function uploadToSharePoint(fileName, fileBuffer, folderPath = 'Vendor Invoices') {
  try {
    const client = await initGraphClient();

    // Get user's OneDrive root
    const user = await client.api(`/users/${USER_EMAIL}`).get();

    // Create folder path if it doesn't exist
    const sanitizedFolder = String(folderPath).replace(/[<>:"|?*]/g, '_').trim();
    const driveItemPath = `/users/${USER_EMAIL}/drive/root:/${sanitizedFolder}`;

    // Upload file to SharePoint
    const uploadPath = `${driveItemPath}/${fileName}`;
    const driveItem = await client
      .api(uploadPath)
      .put(fileBuffer);

    // Return the shareable link
    const sharingLink = await client
      .api(`/users/${USER_EMAIL}/drive/items/${driveItem.id}/createLink`)
      .post({
        type: 'view',
        scope: 'organization',
      });

    return {
      id: driveItem.id,
      webUrl: driveItem.webUrl,
      downloadUrl: driveItem['@microsoft.graph.downloadUrl'],
      sharingLink: sharingLink.link?.webUrl,
    };
  } catch (e) {
    console.error('SharePoint upload error:', e.message);
    throw new Error(`Failed to upload to SharePoint: ${e.message}`);
  }
}

async function createFolderInSharePoint(folderName, parentPath = '') {
  try {
    const client = await initGraphClient();
    const sanitizedFolder = String(folderName).replace(/[<>:"|?*]/g, '_').trim();

    let parentId = 'root';
    if (parentPath) {
      const parent = await client
        .api(`/users/${USER_EMAIL}/drive/root:/${parentPath}`)
        .get();
      parentId = parent.id;
    }

    const folder = await client
      .api(`/users/${USER_EMAIL}/drive/items/${parentId}/children`)
      .post({
        name: sanitizedFolder,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'rename',
      });

    return {
      id: folder.id,
      name: folder.name,
      webUrl: folder.webUrl,
    };
  } catch (e) {
    console.error('SharePoint folder creation error:', e.message);
    throw new Error(`Failed to create folder: ${e.message}`);
  }
}

module.exports = {
  initGraphClient,
  uploadToSharePoint,
  createFolderInSharePoint,
};
