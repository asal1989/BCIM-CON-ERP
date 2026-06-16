#!/usr/bin/env node

/**
 * Bulk upload vendor invoices from organized vendor folders to DMS
 *
 * Usage:
 *   node dms-bulk-upload-vendor-invoices-from-folders.js
 *
 * Prerequisites:
 * - Copy your erp.bcim.in session token from browser DevTools > Application > sessionStorage > token
 * - Set TOKEN env var or edit BASE_URL + TOKEN below
 * - Ensure you're logged in as an admin/finance user with DMS upload permission
 */

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const fetch = require('node-fetch');

// ═════════════════════════════════════════════════════════════════
// CONFIG — Edit these before running
// ═════════════════════════════════════════════════════════════════

const BASE_URL = 'https://erp.bcim.in/api/v1';    // Production URL
const TOKEN = process.env.TOKEN || '';            // Paste your sessionStorage token here

// Source directory (files organized by vendor in subfolders)
const SOURCE_DIR = 'D:\\BCIM SHARE\\Vendor invoices by folder';

// DMS configuration
const PROJECT_NAME = 'Residential Apartments - Yelahanka';  // Will search for this project (matches retaining wall & STP)
const PARENT_FOLDER_NAME = 'Vendor Invoices 2025-2026';
const DOC_TYPE = 'invoice';
const MODULE = 'finance';

// ═════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════

const api = async (method, endpoint, options = {}) => {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  };

  // Only merge additional headers if they don't override Authorization
  if (options.headers && !options.headers['Authorization']) {
    Object.assign(headers, options.headers);
  }

  const config = {
    method,
    headers,
  };

  // Add body or form data if provided (but not headers/method which are already set)
  if (options.body) config.body = options.body;
  if (options.form) {
    config.headers = { 'Authorization': `Bearer ${TOKEN}` }; // FormData sets Content-Type
    config.body = options.form;
  }

  const res = await fetch(url, config);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${endpoint}: ${res.status} ${text.slice(0, 200)}`);
  }
  return res;
};

// ═════════════════════════════════════════════════════════════════
// MAIN LOGIC
// ═════════════════════════════════════════════════════════════════

async function resolveProject() {
  console.log(`\n🔍 Resolving project: "${PROJECT_NAME}"...`);
  const res = await api('GET', '/projects');
  const projects = await res.json();

  // Handle different response formats
  const projectList = projects.data?.data || projects.data || projects || [];
  console.log(`   Found ${projectList.length} projects`);

  if (projectList.length > 0) {
    console.log(`   Available projects: ${projectList.slice(0, 5).map(p => p.name || p.project_name).join(', ')}...`);
  }

  const proj = projectList.find(p => {
    const projName = (p.name || p.project_name || '').toLowerCase();
    return projName.includes(PROJECT_NAME.toLowerCase());
  });

  if (!proj) {
    const available = projectList.map(p => p.name || p.project_name).join(', ');
    throw new Error(`Project "${PROJECT_NAME}" not found. Available: ${available || 'none'}`);
  }

  const projId = proj.id || proj.project_id;
  if (!projId) throw new Error(`Project ${PROJECT_NAME} has no ID`);

  console.log(`✅ Found project: ${proj.name || proj.project_name} (${projId})`);
  return projId;
}

async function findOrCreateFolder(projectId, folderName) {
  console.log(`📁 Checking for folder: "${folderName}"...`);

  // Try to find existing folder
  const listRes = await api('GET', `/dms/folders?project_id=${projectId}`);
  const folders = await listRes.json();
  const existing = (folders.data?.data || []).find(f => f.folder_name === folderName);

  if (existing) {
    console.log(`✅ Found existing folder (${existing.id})`);
    return existing.id;
  }

  // Create new folder
  console.log(`   Creating new folder...`);
  const createRes = await api('POST', '/dms/folders', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      folder_name: folderName,
      folder_type: 'general',  // Valid enum value
    }),
  });
  const folder = await createRes.json();
  const folderId = folder.data?.id || folder.data?.data?.id;

  if (!folderId) throw new Error(`Failed to create folder: ${JSON.stringify(folder)}`);
  console.log(`✅ Created folder (${folderId})`);
  return folderId;
}

async function uploadFile(projectId, parentFolderId, vendorName, filePath) {
  const fileName = path.basename(filePath);
  const fileBuffer = fs.readFileSync(filePath);

  const fd = new FormData();
  fd.append('files', fileBuffer, fileName);
  fd.append('project_id', projectId);
  fd.append('parent_folder_id', parentFolderId);
  fd.append('vendor', vendorName);
  fd.append('auto_folder', 'true');  // Backend will create vendor subfolder
  fd.append('doc_type', DOC_TYPE);
  fd.append('module', MODULE);
  fd.append('doc_title', fileName.replace(/\.pdf$/i, ''));
  fd.append('tags', 'vendor-invoice,' + vendorName);  // Comma-separated string, not JSON

  const res = await api('POST', '/dms/upload', {
    form: fd,  // Use 'form' property which our api function handles
  });

  const result = await res.json();
  // Check both response formats: {data: [{...}]} and {data: {data: [{...}]}}
  const uploads = result.data?.data || (Array.isArray(result.data) ? result.data : []);
  if (uploads && uploads.length > 0) {
    return { ok: true, id: uploads[0].id };
  }
  throw new Error(`Upload returned: ${JSON.stringify(result)}`);
}

async function processVendorFolder(projectId, parentFolderId, vendorFolderPath, vendorName) {
  const files = fs.readdirSync(vendorFolderPath).filter(f => f.toLowerCase().endsWith('.pdf'));

  if (!files.length) {
    console.log(`   ⚠️  No PDFs in ${vendorName}`);
    return { ok: 0, errors: 0 };
  }

  console.log(`\n📦 ${vendorName}: ${files.length} file(s)`);

  let ok = 0, errors = 0;

  for (const file of files) {
    const filePath = path.join(vendorFolderPath, file);
    try {
      await uploadFile(projectId, parentFolderId, vendorName, filePath);
      ok++;
      process.stdout.write('.');
    } catch (e) {
      errors++;
      process.stdout.write('✗');
      console.log(`\n   ❌ Error uploading ${file}: ${e.message}`);
    }
  }

  console.log(`\n   ✅ ${ok} uploaded, ❌ ${errors} failed`);
  return { ok, errors };
}

async function main() {
  if (!TOKEN) {
    console.error('\n❌ ERROR: TOKEN not set.');
    console.error('\nUsage:');
    console.error('  1. Go to https://erp.bcim.in');
    console.error('  2. Open DevTools (F12) → Application → sessionStorage');
    console.error('  3. Copy the "token" value');
    console.error('  4. Run: TOKEN=<paste-token> node dms-bulk-upload-vendor-invoices-from-folders.js\n');
    process.exit(1);
  }

  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  DMS Bulk Upload: Vendor Invoices from Folders');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Source: ${SOURCE_DIR}`);
    console.log(`Target Project: ${PROJECT_NAME}`);
    console.log(`Parent Folder: ${PARENT_FOLDER_NAME}`);

    // Resolve project
    const projectId = await resolveProject();

    // Find or create parent folder
    const parentFolderId = await findOrCreateFolder(projectId, PARENT_FOLDER_NAME);

    // Process all vendor folders
    const vendorDirs = fs.readdirSync(SOURCE_DIR)
      .map(name => path.join(SOURCE_DIR, name))
      .filter(p => fs.statSync(p).isDirectory());

    console.log(`\n📂 Found ${vendorDirs.length} vendor folder(s)\n`);

    let totalOk = 0, totalErrors = 0;
    for (const vendorPath of vendorDirs) {
      const vendorName = path.basename(vendorPath);
      try {
        const result = await processVendorFolder(projectId, parentFolderId, vendorPath, vendorName);
        totalOk += result.ok;
        totalErrors += result.errors;
      } catch (e) {
        console.log(`\n❌ Error processing ${vendorName}: ${e.message}`);
        totalErrors++;
      }
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log(`  ✅ DONE: ${totalOk} files uploaded, ❌ ${totalErrors} errors`);
    console.log('═══════════════════════════════════════════════════════\n');

    if (totalErrors > 0) process.exit(1);
  } catch (e) {
    console.error(`\n❌ FATAL ERROR: ${e.message}\n`);
    process.exit(1);
  }
}

main();
