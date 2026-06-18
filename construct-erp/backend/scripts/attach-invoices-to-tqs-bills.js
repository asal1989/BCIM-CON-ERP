#!/usr/bin/env node
/**
 * Attach vendor invoice PDFs to their matching DQS/Bill-Tracker bills (tqs_bills),
 * matching by SERIAL NUMBER parsed from the filename ("02840 - SCP CONCRETE.pdf").
 *
 * Source files: the local originals (organised by vendor), NOT the DMS copies
 * (DMS files were wiped from Railway's ephemeral disk). The attach endpoint
 * persists each file to OneDrive automatically.
 *
 *   node attach-invoices-to-tqs-bills.js            # INSPECT: match-rate report, NO writes
 *   node attach-invoices-to-tqs-bills.js --attach   # ATTACH: upload files to matched bills
 *
 * Env:
 *   TOKEN     production sessionStorage accessToken (required)
 *   BASE_URL  default https://erp.bcim.in/api/v1
 *   SRC_DIR   default "D:\\BCIM SHARE\\Vendor invoices by folder"
 *   MATCH     which bill field the serial maps to: "sl" | "inv" | "auto"  (default auto)
 */
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const fetch = require('node-fetch');

const BASE_URL = (process.env.BASE_URL || 'https://erp.bcim.in/api/v1').replace(/\/+$/, '');
const TOKEN = process.env.TOKEN || '';
const SRC_DIR = process.env.SRC_DIR || 'D:\\BCIM SHARE\\Vendor invoices by folder';
const MATCH = (process.env.MATCH || 'auto').toLowerCase();
const DO_ATTACH = process.argv.includes('--attach');

if (!TOKEN) { console.error('ERROR: set TOKEN env to your production accessToken.'); process.exit(1); }

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const digits = s => String(s || '').replace(/[^0-9]/g, '').replace(/^0+/, '');

// "02840 - SCP CONCRETE.pdf" -> { serial: "02840", vendor: "SCP CONCRETE" }
function parseName(file) {
  const stem = file.replace(/\.pdf$/i, '');
  const idx = stem.indexOf(' - ');
  if (idx === -1) return { serial: stem.trim(), vendor: '' };
  return { serial: stem.slice(0, idx).trim(), vendor: stem.slice(idx + 3).trim() };
}

function collectFiles(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) out.push(...collectFiles(full));
    else if (name.toLowerCase().endsWith('.pdf')) out.push(full);
  }
  return out;
}

async function api(method, p, { form } = {}) {
  const headers = { Authorization: `Bearer ${TOKEN}` };
  const opts = { method, headers };
  if (form) opts.body = form;
  const res = await fetch(`${BASE_URL}${p}`, opts);
  const text = await res.text();
  let body; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) throw new Error(`${method} ${p}: ${res.status} ${typeof body === 'string' ? body.slice(0,160) : JSON.stringify(body).slice(0,240)}`);
  return body;
}

function buildIndex(bills, field) {
  const byNorm = new Map(), byDigits = new Map();
  for (const b of bills) {
    const v = b[field];
    if (!v) continue;
    const n = norm(v), d = digits(v);
    if (n && !byNorm.has(n)) byNorm.set(n, b);
    if (d && !byDigits.has(d)) byDigits.set(d, b);
  }
  return { byNorm, byDigits };
}

function matchRate(files, idx) {
  let hit = 0;
  for (const f of files) {
    const { serial } = parseName(path.basename(f));
    if (idx.byNorm.get(norm(serial)) || idx.byDigits.get(digits(serial))) hit++;
  }
  return hit;
}

(async () => {
  console.log(`BASE_URL: ${BASE_URL}`);
  console.log(`Source:   ${SRC_DIR}`);
  console.log(`Mode:     ${DO_ATTACH ? 'ATTACH' : 'INSPECT (dry run)'}\n`);

  if (!fs.existsSync(SRC_DIR)) { console.error(`ERROR: source dir not found: ${SRC_DIR}`); process.exit(1); }
  const files = collectFiles(SRC_DIR);
  console.log(`Local invoice PDFs: ${files.length}`);

  const billsRes = await api('GET', '/tqs/bills');
  const bills = billsRes.data || [];
  console.log(`Bills in tracker:   ${bills.length}\n`);

  const slIdx = buildIndex(bills, 'sl_number');
  const invIdx = buildIndex(bills, 'inv_number');
  const slHits = matchRate(files, slIdx);
  const invHits = matchRate(files, invIdx);
  console.log(`Match by sl_number:  ${slHits}/${files.length}`);
  console.log(`Match by inv_number: ${invHits}/${files.length}`);

  let field = MATCH === 'sl' ? 'sl_number' : MATCH === 'inv' ? 'inv_number'
            : (slHits >= invHits ? 'sl_number' : 'inv_number');
  let idx = field === 'sl_number' ? slIdx : invIdx;
  console.log(`\nUsing match field: ${field}\n`);

  const matched = [], unmatched = [];
  for (const f of files) {
    const base = path.basename(f);
    const { serial } = parseName(base);
    const bill = idx.byNorm.get(norm(serial)) || idx.byDigits.get(digits(serial));
    if (bill) matched.push({ f, base, serial, bill });
    else unmatched.push({ base, serial });
  }
  console.log(`Matched:   ${matched.length}`);
  console.log(`Unmatched: ${unmatched.length}`);
  if (unmatched.length) {
    console.log(`  e.g. ${unmatched.slice(0, 12).map(u => u.serial).join(', ')}${unmatched.length > 12 ? ' …' : ''}`);
  }
  console.log('\nSample matches:');
  matched.slice(0, 8).forEach(m => console.log(`  ${m.serial}  ->  bill ${m.bill[field]} (${m.bill.vendor_name || '?'})  id=${m.bill.id}`));

  if (!DO_ATTACH) {
    console.log(`\n(DRY RUN — nothing uploaded. Re-run with --attach once the match looks right.)`);
    return;
  }

  console.log(`\nAttaching ${matched.length} files…\n`);
  let ok = 0, skip = 0, err = 0;
  for (const m of matched) {
    try {
      // Dedup: skip if a file with the same name is already on the bill
      const detail = await api('GET', `/tqs/bills/${m.bill.id}`);
      const existing = (detail.data?.files || []).map(x => String(x.file_name || ''));
      if (existing.includes(m.base)) { skip++; process.stdout.write('-'); continue; }

      const fd = new FormData();
      fd.append('file', fs.createReadStream(m.f), m.base);
      await api('POST', `/tqs/bills/${m.bill.id}/files`, { form: fd });
      ok++; process.stdout.write('.');
    } catch (e) {
      err++; process.stdout.write('x');
      console.log(`\n  ❌ ${m.base} -> ${e.message}`);
    }
  }
  console.log(`\n\n✅ Attached ${ok}, skipped ${skip} (already present), failed ${err}.`);
})().catch(e => { console.error('\n❌ ' + e.message); process.exit(1); });
