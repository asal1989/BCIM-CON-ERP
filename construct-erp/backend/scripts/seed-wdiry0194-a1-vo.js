// seed-wdiry0194-a1-vo.js
// Records the client's Amendment Work Order WDIRY0194_A1 (dated 17-06-2026)
// into variation_orders and marks the WDIRY0194 variation statement as acknowledged.
// Run: node backend/scripts/seed-wdiry0194-a1-vo.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const q = (sql, p) => pool.query(sql, p);

// All line items from the Amendment Work Order WDIRY0194_A1 (VO column only)
const VO_ITEMS = [
  // Existing items — amended quantities
  { item_code: '01.36.61.01.25.56.141', description: 'Excavation in all types of soil except rocks not exceeding 1.5m depth including dressing for camber & disposing the excess earth & Spreading in layers of 250mm within the site to the required levels wherever specified', unit: 'Cum', quantity: 571.35, rate: 550 },
  { item_code: '01.36.61.01.25.56.142', description: 'Providing & Laying 250thk GSB consisting of morum, crushed Stone & gravel mixed in proportion as specified including preparation of subgrade after trimming to required level', unit: 'Cum', quantity: 180.24, rate: 3250 },
  { item_code: '01.36.61.01.25.56.143', description: 'WMM 150mm thick providing & laying of wet mixed macadam in 1 layer of 150mm thickness as per morth table 100-12', unit: 'Cum', quantity: 97.50, rate: 2400 },
  { item_code: '01.36.61.01.25.56.144', description: 'DBM 800 thk Providing and laying 80mm consolidating thickness dense bituminous macadam using 20mm and 12mm size metal mixed with 60/70 grade hot bitumen', unit: 'Sqm', quantity: 650.01, rate: 825 },
  { item_code: '01.36.61.01.25.56.145', description: 'Providing and laying 40mm compacted thick asphalt concrete over the prepared bituminous macadam with aggregates as per the MORTH Specifications', unit: 'Sqm', quantity: 725.56, rate: 400 },
  { item_code: '01.36.61.01.25.56.146', description: 'Storm Water Drain Outside Main Gate - Providing and Laying P.C.C 1:3:6 M10', unit: 'Cum', quantity: 10.71, rate: 6150 },
  { item_code: '01.36.61.01.25.56.147', description: 'Providing & Laying Storm Water Drain Raft, Wall Concrete - M25 Grade', unit: 'Cum', quantity: 67.31, rate: 7600 },
  { item_code: '01.36.61.01.25.56.148', description: 'Providing & Fixing Storm Water Drain Raft, Wall Shuttering', unit: 'Sqm', quantity: 583.34, rate: 895.50 },
  { item_code: '01.36.61.01.25.56.149', description: 'Providing, Supplying, Fabricating & Fixing in Position Reinforcement for RCC work with high yield Strength ribbed cold twisted Steel (HSD) bar', unit: 'MT', quantity: 10.10, rate: 73000 },
  // NT Items (new additions in VO)
  { item_code: '01.36.61.01.25.56.32.6',  description: 'Shifting of Existing Gate', unit: 'LS', quantity: 1, rate: 20000 },
  { item_code: '01.36.61.01.25.56.32.7',  description: 'Supply, Fabricating, Fixing of "MS C Channel" for Security Cabin. Size: 200mm x 75mm', unit: 'Kg', quantity: 545, rate: 122 },
  { item_code: '01.36.61.01.25.56.32.8',  description: 'Providing and fixing of Kerb stones of Size 600mm x 300mm x 100mm for Planter Walls Make: Shobha', unit: 'Rmt', quantity: 35, rate: 765 },
  { item_code: '01.36.61.01.25.56.32.9',  description: 'Supplying and fixing of Drain cover - Drain Cover without Perforation - 600x900x75mm', unit: 'Nos', quantity: 145, rate: 2846 },
  { item_code: '01.36.61.01.25.56.32.10', description: 'Supplying and fixing of Drain cover - Drain Cover with Perforation - 600x900x75mm', unit: 'Nos', quantity: 15, rate: 2846 },
  { item_code: '01.36.61.01.25.56.32.11', description: 'Fixing of 20mm thk. Antique finished Jet Black grey granite stone as Counter top (Granite Supply - DIPL Scope)', unit: 'Sqm', quantity: 3.92, rate: 1785 },
  { item_code: '01.36.61.01.25.56.32.12', description: 'Fixing of 20mm thk. Antique finished Jet Black granite stone as vertical face (Granite Supply - DIPL Scope)', unit: 'Sqm', quantity: 9.03, rate: 1890 },
  { item_code: '01.36.61.01.25.56.32.13', description: 'Fixing of 20mm thk. Antique finished Jet Black granite stone as flooring (Granite Supply - DIPL Scope)', unit: 'Sqm', quantity: 19.05, rate: 1418 },
  { item_code: '01.36.61.01.25.56.32.14', description: 'Fixing of 40mm thk, 100x100mm wide antique finished Midnight black (Granite Supply - DIPL Scope)', unit: 'Sqm', quantity: 64.26, rate: 1187 },
  { item_code: '01.36.61.01.25.56.32.15', description: 'Fixing of 40mm thk 600mm wide antique finished Midnight black as floor finish (Granite Supply - DIPL Scope)', unit: 'Sqm', quantity: 7.06, rate: 1187 },
  { item_code: '01.36.61.01.25.56.32.16', description: 'Fixing of 40mm thk 200mm wide antique finished Midnight BLACK as floor finish (Granite Supply - DIPL Scope)', unit: 'Sqm', quantity: 2.16, rate: 1187 },
  { item_code: '01.36.61.01.25.56.32.17', description: 'Supply and application of texture paint, outdoor emulsion paint in ACE/APEX series of Asian paints make', unit: 'Sqm', quantity: 37.42, rate: 399 },
  { item_code: '01.36.61.01.25.56.32.18', description: 'Supply and application of internal enamel paint, with a primer coat and 2 finish coats', unit: 'Sqm', quantity: 70.18, rate: 132 },
  { item_code: '01.36.61.01.25.56.32.19', description: 'Supply and installation of aluminium Door with 40x65mm section main frame, 25x50mm shutter, 6mm Saint Gobin clear glass, RAL7010 powder coating', unit: 'Sqm', quantity: 4.91, rate: 5109 },
  { item_code: '01.36.61.01.25.56.32.20', description: 'Front Sliding Window - aluminium, 6mm Saint Gobin clear glass, RAL7010 powder coating', unit: 'Sqm', quantity: 8.57, rate: 5109 },
  { item_code: '01.36.61.01.25.56.32.21', description: 'Ventilator V1 & V2 - aluminium, 6mm Saint Gobin clear glass, RAL7010 powder coating', unit: 'Sqm', quantity: 2.48, rate: 5369 },
  { item_code: '01.36.61.01.25.56.32.22', description: 'Supplying and applying Smartcare PU Magnum US High build elastomeric waterproofing coating 1.5mm DFT with geo textile fabric 120 GSM', unit: 'Sqm', quantity: 41.16, rate: 1134 },
  { item_code: '01.36.61.01.25.56.32.23', description: 'For Horizontal Surface: Laying an average of 75mm thick M20 grade concrete screed', unit: 'Sqm', quantity: 29.64, rate: 591 },
  { item_code: '01.36.61.01.25.56.32.24', description: 'For Vertical Surface: Laying 15mm thick polymeric waterproof plastering with CM 1:4 admixed with integral waterproofing compound', unit: 'Sqm', quantity: 7.68, rate: 351 },
  { item_code: '01.36.61.01.25.56.32.25', description: 'Providing and constructing 200mm thick Solid concrete block work in walls, piers and architectural features using Solid blocks in CM 1:6', unit: 'Sqm', quantity: 54.27, rate: 1331 },
  { item_code: '01.36.61.01.25.56.32.26', description: 'Prepare the surface and plaster all internal RCC/Masonry surface in cement mortar 1:6, 15mm thick with M Sand', unit: 'Sqm', quantity: 108.54, rate: 351 },
  { item_code: '01.36.61.01.25.56.32.27', description: 'Providing & Laying of Compound Wall Concrete - M30 Grade', unit: 'Cum', quantity: 13.72, rate: 7750 },
  { item_code: '01.36.61.01.25.56.32.28', description: 'Providing bituminous Tack coat with bituminous emulsion as per IS:8887 @0.25 to 0.30 Kg/sqm', unit: 'Sqm', quantity: 0, rate: 33 },
  { item_code: '01.36.61.01.25.56.32.29', description: 'Providing and laying Bituminous concrete 50mm Loose thickness as per MOST&H specification 509 using grading 1 with 5.5%VG-30 Bitumen', unit: 'Sqm', quantity: 0, rate: 420 },
  { item_code: '01.36.61.01.25.56.32.30', description: 'Shifting the MS Poles from Site to Meridian and Placing the Poles in the Designated Locations', unit: 'Nos', quantity: 36, rate: 970 },
  { item_code: '01.36.61.01.25.56.32.31', description: 'Earth Backfilling with bought out earth in foundations and area wherever specified in layers of not exceeding 300mm thick', unit: 'Cum', quantity: 0, rate: 180 },
];

async function run() {
  console.log('Connecting to database…');

  // Get company
  const compR = await q(`SELECT id FROM companies LIMIT 1`);
  if (!compR.rows.length) throw new Error('No company found');
  const company_id = compR.rows[0].id;

  // Find project
  const projR = await q(
    `SELECT id, name FROM projects WHERE company_id=$1
     AND (LOWER(name) LIKE '%yelahanka%' OR LOWER(name) LIKE '%residential%')
     ORDER BY created_at DESC LIMIT 1`,
    [company_id]
  );
  if (!projR.rows.length) throw new Error('Project not found');
  const project_id = projR.rows[0].id;
  console.log('Project:', projR.rows[0].name, '→', project_id);

  // Get a user
  const userR = await q(`SELECT id FROM users WHERE company_id=$1 ORDER BY created_at LIMIT 1`, [company_id]);
  const user_id = userR.rows[0]?.id || null;

  // ── Step 1: Mark WDIRY0194 variation statement as acknowledged ─────────────
  const stmtR = await q(
    `SELECT id FROM variation_statements WHERE company_id=$1 AND wo_number='WDIRY0194'`,
    [company_id]
  );
  if (stmtR.rows.length) {
    await q(
      `UPDATE variation_statements
       SET status='acknowledged', submitted_at=NOW(),
           remarks=COALESCE(NULLIF(remarks,''), '') || ' | Acknowledged: Client released Amendment WO WDIRY0194_A1 dated 17-06-2026'
       WHERE id=$1`,
      [stmtR.rows[0].id]
    );
    console.log('✓ WDIRY0194 variation statement marked as acknowledged');
  } else {
    console.log('⚠ WDIRY0194 variation statement not found — skipping status update');
  }

  // ── Step 2: Create variation_orders entry for WDIRY0194_A1 ─────────────────
  const existing = await q(
    `SELECT id FROM variation_orders WHERE vo_number='WDIRY0194_A1' AND project_id=$1`,
    [project_id]
  );
  if (existing.rows.length) {
    console.log(`\nVariation Order WDIRY0194_A1 already exists (id: ${existing.rows[0].id}). Deleting and re-inserting…`);
    await q(`DELETE FROM variation_orders WHERE id=$1`, [existing.rows[0].id]);
  }

  const grossExclGst = 4929099.50;
  const variationExclGst = grossExclGst - 2819263.70;

  const voR = await q(
    `INSERT INTO variation_orders
       (project_id, vo_number, description, requested_by, status, total_variation_amount, remarks)
     VALUES ($1,$2,$3,$4,'approved',$5,$6) RETURNING id`,
    [
      project_id,
      'WDIRY0194_A1',
      'Main Entry Gate Road Work & Storm Water Drain Civil Work — Amendment WO',
      user_id,
      variationExclGst,
      'Client Amendment Work Order dated 17-06-2026. WO Ref: WRF 092 dtd 28.11.2025. New gross excl GST: ₹49,29,099.50. CGST+SGST (18%): ₹8,87,237.90. Net total incl GST: ₹58,16,337.40. QS certification: 06.06.2026 / 23.01.2026.',
    ]
  );
  const vo_id = voR.rows[0].id;
  console.log('\nVariation Order created:', vo_id);

  // ── Step 3: Insert VO line items ───────────────────────────────────────────
  for (let i = 0; i < VO_ITEMS.length; i++) {
    const it = VO_ITEMS[i];
    await q(
      `INSERT INTO variation_items (vo_id, new_item_description, unit, quantity, rate, reason)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [vo_id, `[${it.item_code}] ${it.description}`, it.unit, it.quantity, it.rate, it.item_code]
    );
  }
  console.log(`✓ ${VO_ITEMS.length} VO line items inserted`);

  // Summary
  const total = VO_ITEMS.reduce((s, it) => s + it.quantity * it.rate, 0);
  console.log(`\n✅ Done! WDIRY0194_A1 recorded successfully.`);
  console.log(`   Variation Order ID: ${vo_id}`);
  console.log(`   Gross excl GST:     ₹${(4929099.50).toLocaleString('en-IN', {maximumFractionDigits:2})}`);
  console.log(`   CGST 9%:            ₹${(443618.95).toLocaleString('en-IN', {maximumFractionDigits:2})}`);
  console.log(`   SGST 9%:            ₹${(443618.95).toLocaleString('en-IN', {maximumFractionDigits:2})}`);
  console.log(`   Net incl GST:       ₹${(5816337.40).toLocaleString('en-IN', {maximumFractionDigits:2})}`);
  console.log(`   Variation over prev WO (excl GST): ₹${variationExclGst.toLocaleString('en-IN', {maximumFractionDigits:2})}`);

  await pool.end();
}

run().catch(e => { console.error('ERROR:', e.message); pool.end(); process.exit(1); });
