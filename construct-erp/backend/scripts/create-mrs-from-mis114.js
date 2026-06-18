#!/usr/bin/env node
/**
 * Create the MRS from "MIS 114 - BCIM.pdf" (page 2) into the DQS tower project.
 *
 * Two modes:
 *   node create-mrs-from-mis114.js                 # INSPECT: find project + show existing MRS/serials
 *   node create-mrs-from-mis114.js --create        # CREATE: actually POST the MRS (fires notifications)
 *
 * Env:
 *   TOKEN           production sessionStorage accessToken (required)
 *   BASE_URL        default https://erp.bcim.in/api/v1
 *   PROJECT_SEARCH  default "dqs"  (term to match the target project name)
 */
const BASE_URL = process.env.BASE_URL || 'https://erp.bcim.in/api/v1';
const TOKEN = process.env.TOKEN || '';
const PROJECT_SEARCH = (process.env.PROJECT_SEARCH || 'dqs').toLowerCase();
const DO_CREATE = process.argv.includes('--create');

// ── MRS data extracted from MIS 114 page 2 (original serial BCIM-TQS-BLR-MR-050) ──
const MRS_PAYLOAD = {
  department: 'Projects',
  required_by: '2026-06-15',
  priority: 'normal',
  remarks: 'Entered from MIS 114 (orig. serial BCIM-TQS-BLR-MR-050, dt 05-06-2026). Requested by P Pavithra; PM Ananthan N. Stock at site (MT): 8mm 0.72, 10mm 20.94, 12mm 1.92, 16mm 2.84, 20mm 7.94, 25mm 2.45.',
  items: [
    { material: 'Steel 8mm',  qty: 15, unit: 'MT' },
    { material: 'Steel 10mm', qty: 15, unit: 'MT' },
    { material: 'Steel 12mm', qty: 30, unit: 'MT' },
    { material: 'Steel 16mm', qty: 30, unit: 'MT' },
    { material: 'Steel 20mm', qty: 25, unit: 'MT' },
    { material: 'Steel 25mm', qty: 10, unit: 'MT' },
  ],
};

if (!TOKEN) { console.error('ERROR: set TOKEN env to your production accessToken.'); process.exit(1); }

async function api(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${typeof json === 'string' ? json.slice(0,200) : JSON.stringify(json).slice(0,300)}`);
  return json;
}

function nextSerialPreview(existing) {
  let max = 0;
  for (const m of existing) {
    const s = String(m.serial_no_formatted || '');
    const mm = s.match(/-(\d+)$/);
    if (mm) max = Math.max(max, parseInt(mm[1], 10));
  }
  return String(max + 1).padStart(3, '0');
}

(async () => {
  console.log(`BASE_URL: ${BASE_URL}`);
  console.log(`Mode: ${DO_CREATE ? 'CREATE' : 'INSPECT (dry run)'}\n`);

  // 1. Find the project
  const projRes = await api('GET', '/projects');
  const projects = projRes.data?.data || projRes.data || (Array.isArray(projRes) ? projRes : []);
  console.log(`Total projects: ${projects.length}`);
  const matches = projects.filter(p => String(p.name || '').toLowerCase().includes(PROJECT_SEARCH));
  if (!matches.length) {
    console.log(`\nNo project name contains "${PROJECT_SEARCH}". All projects:`);
    projects.forEach(p => console.log(`  - ${p.name}  (${p.id})  code=${p.project_code || '-'}  mrs_prefix=${p.mrs_prefix || '-'}`));
    process.exit(1);
  }
  if (matches.length > 1) {
    console.log(`\n"${PROJECT_SEARCH}" matched ${matches.length} projects — set PROJECT_SEARCH more specifically:`);
    matches.forEach(p => console.log(`  - ${p.name}  (${p.id})  code=${p.project_code || '-'}`));
    process.exit(1);
  }
  const proj = matches[0];
  console.log(`\nTarget project: "${proj.name}"  (${proj.id})`);
  console.log(`  project_code=${proj.project_code || '-'}  mrs_prefix=${proj.mrs_prefix || '-'}`);

  // 2. Existing MRS for this project
  const listRes = await api('GET', `/stores/mrs?project_id=${encodeURIComponent(proj.id)}`);
  const existing = listRes.data || [];
  console.log(`\nExisting MRS on this project: ${existing.length}`);
  existing.slice(0, 10).forEach(m => console.log(`  - ${m.serial_no_formatted || m.mrs_number}  [${m.status}]`));
  const seq = nextSerialPreview(existing);
  const predicted = proj.mrs_prefix
    ? `${proj.mrs_prefix}-${seq}`
    : `BCIM-${proj.project_code || 'PRJ'}-${(MRS_PAYLOAD.department || 'GEN').substring(0,3).toUpperCase()}-MR-${seq}`;
  console.log(`\nNext auto serial would be: ${predicted}  (ends -${seq})`);
  if (seq !== '001') {
    console.log(`⚠️  This project already has MRS — the API will NOT produce -001. Forcing -001 needs a direct DB write or empty project.`);
  }

  console.log(`\nPayload to submit:`);
  console.log(JSON.stringify({ project_id: proj.id, ...MRS_PAYLOAD }, null, 2));

  if (!DO_CREATE) {
    console.log(`\n(DRY RUN — nothing created. Re-run with --create to submit.)`);
    return;
  }

  // 3. Create
  const created = await api('POST', '/stores/mrs', { project_id: proj.id, ...MRS_PAYLOAD });
  const d = created.data || created;
  console.log(`\n✅ Created MRS: ${d.serial_no_formatted || d.mrs_number}  (id ${d.id})`);
  console.log(`   items: ${(d.items || []).length}`);
})().catch(e => { console.error('\n❌ ' + e.message); process.exit(1); });
