#!/usr/bin/env node
/**
 * Bulk-upload vendor invoice PDFs into the DMS module under a "Vendor Invoices" folder.
 *
 * Usage (PowerShell):
 *   $env:DMS_TOKEN = "<accessToken from browser sessionStorage>"
 *   node scripts/dms-bulk-upload-vendor-invoices.js
 *
 * Optional env:
 *   DMS_BASE   API base (default https://erp.bcim.in/api/v1)
 *   DMS_DIR    Folder of PDFs (default C:\Users\BCIMIT\Downloads\bcim-pdf-files)
 *   DMS_FOLDER Folder name in DMS (default "Vendor Invoices 2025-2026")
 *   DMS_CONCURRENCY    parallel uploads (default 4)
 *   DMS_PROJECT_ID     project UUID to scope the docs to (skips name lookup if set)
 *   DMS_PROJECT_NAME   project name search term to resolve the UUID (default "yelahanka")
 *
 * Requires Node 18+ (global fetch / FormData / Blob). Tested on Node 24.
 */
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.DMS_TOKEN;
const BASE = (process.env.DMS_BASE || 'https://erp.bcim.in/api/v1').replace(/\/+$/, '');
const DIR = process.env.DMS_DIR || 'C:\\Users\\BCIMIT\\Downloads\\bcim-pdf-files';
const FOLDER_NAME = process.env.DMS_FOLDER || 'Vendor Invoices 2025-2026';
const CONCURRENCY = parseInt(process.env.DMS_CONCURRENCY || '4', 10);
let PROJECT_ID = process.env.DMS_PROJECT_ID || '';
const PROJECT_NAME = process.env.DMS_PROJECT_NAME || 'yelahanka';

if (!TOKEN) {
  console.error('ERROR: set DMS_TOKEN to your accessToken (browser sessionStorage "accessToken").');
  process.exit(1);
}

const authHeaders = { Authorization: `Bearer ${TOKEN}` };

async function api(method, urlPath, { json, form } = {}) {
  const opts = { method, headers: { ...authHeaders } };
  if (json) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(json); }
  if (form) { opts.body = form; }
  const res = await fetch(`${BASE}${urlPath}`, opts);
  const text = await res.text();
  let body; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const msg = (body && body.error) ? body.error : `HTTP ${res.status}`;
    const err = new Error(msg); err.status = res.status; err.body = body; throw err;
  }
  return body;
}

// "02840 - SCP CONCRETE.pdf" -> { docNumber: "02840", vendor: "SCP CONCRETE" }
function parseName(file) {
  const stem = file.replace(/\.pdf$/i, '');
  const idx = stem.indexOf(' - ');
  if (idx === -1) return { docNumber: stem.trim(), vendor: '' };
  return { docNumber: stem.slice(0, idx).trim(), vendor: stem.slice(idx + 3).trim() };
}

async function resolveProject() {
  if (PROJECT_ID) { console.log(`Using project_id ${PROJECT_ID} (from DMS_PROJECT_ID).`); return; }
  const list = await api('GET', '/projects');
  const projects = (list && list.data) || (Array.isArray(list) ? list : []);
  const term = PROJECT_NAME.toLowerCase();
  const matches = projects.filter(p => String(p.name || '').toLowerCase().includes(term));
  if (matches.length === 0) {
    console.error(`ERROR: no project name contains "${PROJECT_NAME}". Available projects:`);
    projects.forEach(p => console.error(`  - ${p.name}  (${p.id})`));
    console.error('Set DMS_PROJECT_ID=<uuid> or DMS_PROJECT_NAME=<term> and re-run.');
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error(`ERROR: "${PROJECT_NAME}" matched ${matches.length} projects — be more specific:`);
    matches.forEach(p => console.error(`  - ${p.name}  (${p.id})`));
    console.error('Set DMS_PROJECT_ID=<uuid> to pick one, then re-run.');
    process.exit(1);
  }
  PROJECT_ID = matches[0].id;
  console.log(`Resolved project: "${matches[0].name}"  (${PROJECT_ID})`);
}

async function findOrCreateFolder() {
  const list = await api('GET', `/dms/folders?project_id=${encodeURIComponent(PROJECT_ID)}`);
  const folders = (list && list.data) || [];
  const existing = folders.find(f => String(f.folder_name).trim().toLowerCase() === FOLDER_NAME.toLowerCase()
    && String(f.project_id || '') === String(PROJECT_ID));
  if (existing) {
    console.log(`Reusing folder "${existing.folder_name}" (${existing.id}) — ${existing.doc_count} docs already inside.`);
    return existing.id;
  }
  const created = await api('POST', '/dms/folders', {
    json: { folder_name: FOLDER_NAME, folder_type: 'vendor', project_id: PROJECT_ID,
            description: 'Vendor invoice PDFs (bulk uploaded 2025-2026)' },
  });
  const f = created.data;
  console.log(`Created folder "${f.folder_name}" (${f.id}).`);
  return f.id;
}

async function uploadOne(parentFolderId, file) {
  const full = path.join(DIR, file);
  const buf = fs.readFileSync(full);
  const { docNumber, vendor } = parseName(file);
  const fd = new FormData();
  fd.append('files', new Blob([buf], { type: 'application/pdf' }), file);
  // Nest each invoice into a per-vendor subfolder under the dated parent folder.
  fd.append('parent_folder_id', parentFolderId);
  if (vendor) fd.append('vendor', vendor);
  fd.append('auto_folder', 'true');
  fd.append('doc_type', 'invoice');
  fd.append('module', 'finance');
  fd.append('doc_title', file.replace(/\.pdf$/i, ''));
  if (docNumber) fd.append('doc_number', docNumber);
  const tags = ['vendor-invoice'];
  if (vendor) tags.push(vendor);
  fd.append('tags', tags.join(','));
  if (PROJECT_ID) fd.append('project_id', PROJECT_ID);
  return api('POST', '/dms/upload', { form: fd });
}

async function run() {
  if (!fs.existsSync(DIR)) { console.error(`ERROR: directory not found: ${DIR}`); process.exit(1); }
  const files = fs.readdirSync(DIR).filter(f => f.toLowerCase().endsWith('.pdf')).sort();
  console.log(`Found ${files.length} PDF(s) in ${DIR}`);
  console.log(`Target: ${BASE}/dms/upload  (folder "${FOLDER_NAME}")\n`);

  await resolveProject();
  const parentFolderId = await findOrCreateFolder();
  console.log(`Each invoice will be auto-filed into a per-vendor subfolder under "${FOLDER_NAME}".\n`);

  const results = [];
  let done = 0;
  let cursor = 0;
  async function worker() {
    while (cursor < files.length) {
      const i = cursor++;
      const file = files[i];
      let lastErr;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await uploadOne(parentFolderId, file);
          results.push({ file, ok: true });
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          if (e.status === 401 || e.status === 403) throw e; // auth problems: stop everything
          await new Promise(r => setTimeout(r, 400 * attempt));
        }
      }
      if (lastErr) results.push({ file, ok: false, error: lastErr.message });
      done++;
      const tag = lastErr ? 'FAIL' : ' OK ';
      process.stdout.write(`[${String(done).padStart(3)}/${files.length}] ${tag}  ${file}${lastErr ? `  -> ${lastErr.message}` : ''}\n`);
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));
  } catch (e) {
    console.error(`\nABORTED: ${e.message}`);
    if (e.status === 401) console.error('Token is invalid or expired — grab a fresh accessToken and re-run.');
    process.exit(1);
  }

  const ok = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok);
  console.log(`\nDone. Uploaded ${ok}/${files.length}.`);
  if (failed.length) {
    console.log(`Failed (${failed.length}):`);
    failed.forEach(f => console.log(`  - ${f.file}: ${f.error}`));
    const logPath = path.join(__dirname, 'dms-bulk-upload-failures.json');
    fs.writeFileSync(logPath, JSON.stringify(failed, null, 2));
    console.log(`Failure details written to ${logPath}`);
    process.exit(2);
  }
}

run().catch(e => { console.error(e); process.exit(1); });
