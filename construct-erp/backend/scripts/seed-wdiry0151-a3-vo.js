// seed-wdiry0151-a3-vo.js
// Records the client's Amendment Work Order WDIRY0151_A3 (dated 16-06-2026)
// into variation_orders and marks the WDIRY0151 variation statement as acknowledged.
// Run: node backend/scripts/seed-wdiry0151-a3-vo.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const q = (sql, p) => pool.query(sql, p);

// All line items from Amendment Work Order WDIRY0151_A3 (VO column quantities)
const VO_ITEMS = [
  // Existing items — amended quantities
  { item_code: '01.36.61.01.25.56.95',  description: 'Earth work excavation by mechanical means using JCB etc., in all type of soil including dense, weathered rock, soft rock including levelling, all leads and lifts for footing, raft, rc wall foundation, trenches, etc., including excavation for dressing the edges & levelling. Rate to include stacking or dispose the excavated earth within the site premises and spreading in layers to required level.', unit: 'Cum', quantity: 12948.46, rate: 375 },
  { item_code: '01.36.61.01.25.56.96',  description: 'Earth backfilling with bought out earth in foundations and the area whereever specified with approved good quality filling materials in plinths, area development etc. wherever specified in layers of not exceeding 300mm thick including breaking clods, storing, transportation, watering, compacting each layer with vibratory compactor/roller and at unaccessible places with wooden/steel rammers to achieve 90 to 95% proctor density at optimum moisture content.', unit: 'Cum', quantity: 4515.83, rate: 180 },
  { item_code: '01.36.61.01.25.56.97',  description: 'Providing and laying 100 thk P.C.C. 1:3:6 M10 of specified thick wherever specified using M.sand, 20mm and downsize metal including base preparation, Compaction, levelling, all leads and lifts, curing and shuttering if necessary etc., Complete - Below Foundation.', unit: 'Cum', quantity: 306.35, rate: 5750 },
  { item_code: '01.36.61.01.25.56.98',  description: 'Providing, batching, mixing, transporting through transit mixers, pumping and laying Reinforced Cement Concrete of specified grade at all levels - Retaining wall Raft - M30.', unit: 'Cum', quantity: 1074.55, rate: 7750 },
  { item_code: '01.36.61.01.25.56.99',  description: 'Concrete for Retaining wall and Columns - M30.', unit: 'Cum', quantity: 1386.53, rate: 7750 },
  { item_code: '01.36.61.01.25.56.100', description: 'Providing, fabricating and erecting form work at all levels - Retaining wall raft Shuttering.', unit: 'Sqm', quantity: 823.58, rate: 725 },
  { item_code: '01.36.61.01.25.56.101', description: 'Retaining walls shuttering.', unit: 'Sqm', quantity: 8895.72, rate: 725 },
  { item_code: '01.36.61.01.25.56.102', description: 'Reinforcement Steel Fe 550 D for Nailing Works — Supply, fabricating & fixing in position reinforcement for RCC work with high yield strength ribbed cold twisted for steel (HYSD) bar of various diameters and grade of steel at all levels conforming to IS specification including all lead & lift.', unit: 'MT', quantity: 270.00, rate: 72500 },
  { item_code: '01.36.61.01.25.56.103', description: 'Waterproofing Works — Supply and application of Penetron Whitetank© system, integrated water resistance cell in combination with catalytic effective hydrophilic mechanism for below Basements Retaining Walls & Walls for Water Retaining Structures / Swimming Pools & Liftpit etc. Approved make Penetron India.', unit: 'Cum', quantity: 2546.98, rate: 1000 },
  { item_code: '01.36.61.01.25.56.104', description: 'Providing and applying Penetron coating shake application — a barrier type Catalyst Crystaline waterproofing treatment to the footing sides. Approved make Penetron India.', unit: 'Sqm', quantity: 0.00, rate: 450 },
  { item_code: '01.36.61.01.25.56.107', description: 'Providing waterproofing by Surface method INTERNALLY — Floors.', unit: 'Sqm', quantity: 571.35, rate: 800 },
  { item_code: '01.36.61.01.25.56.108', description: 'Providing waterproofing by Surface method INTERNALLY — Walls.', unit: 'Sqm', quantity: 2026.04, rate: 900 },
  { item_code: '01.36.61.01.25.56.109', description: 'Tie rod Hole Treatment — Providing and treating of all Tierods considering as part of the entire below ground structure in combination with catalytic effective crystalline hydrophilic mechanism using Penetrate Mortar & required primer & providing finishing coat at all treated areas.', unit: 'Nos', quantity: 17530.00, rate: 75 },
  { item_code: '01.36.61.01.25.56.110', description: 'Construction Joint Treatment in Retaining Wall & Joint Places of Raft and Wall, Basement Collection Sumps, STPS, UG Sump, Roof Top Collection & Dewatering Sump — Providing and installing Construction Joints in all joints of the below ground structures using Penecrete Mortar & required primer & finishing coat.', unit: 'Rmt', quantity: 2075.59, rate: 1000 },
  // NT Items — new additions in A3
  { item_code: '01.36.61.01.25.56.231', description: 'Supply, fabrication, fixing, testing and commissioning of MS puddle flanged pipes of required sizes for inlet, outlet, vent and overflow pipes for all Water retaining structures. All puddle flanged pipes, plates and fittings shall be Hot dip galvanized after fabrication as per IS specifications. Size: 200mm x 200mm x 6mm.', unit: 'Nos', quantity: 7.00, rate: 5424 },
  { item_code: '01.36.61.01.25.56.232', description: 'Providing and fixing in position single component, self sealing water swelling bars at construction joints of retaining walls and water retaining structures like UG Sump, OHT & STP, etc., and wherever specified with proper overlaps at joints of approved makes as per consultants approval.', unit: 'Rmt', quantity: 2389.16, rate: 685 },
  { item_code: '01.36.61.01.25.56.233', description: 'Supply of Cement Bags.', unit: 'Bags', quantity: 100, rate: 220 },
  { item_code: '01.36.61.01.25.56.234', description: 'Deploying of Security Guard Supervisor.', unit: 'Month', quantity: 6, rate: 30750 },
  { item_code: '01.36.61.01.25.56.235', description: 'Deploying of Security Guard.', unit: 'Month', quantity: 18, rate: 27675 },
  { item_code: '01.36.61.01.25.56.236', description: 'Security Deposit to Labour Camp.', unit: 'LS', quantity: 1, rate: 1524600 },
  { item_code: '01.36.61.01.25.56.237', description: 'Rental Charges for Labour Camp.', unit: 'Month', quantity: 6, rate: 217800 },
  { item_code: '01.36.61.01.25.56.238', description: 'Supply of Steel to Client.', unit: 'MT', quantity: 3, rate: 48750 },
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

  // ── Step 1: Mark WDIRY0151 variation statement as acknowledged ─────────────
  const stmtR = await q(
    `SELECT id FROM variation_statements WHERE company_id=$1 AND wo_number='WDIRY0151'`,
    [company_id]
  );
  if (stmtR.rows.length) {
    await q(
      `UPDATE variation_statements
       SET status='acknowledged', submitted_at=NOW(),
           remarks=COALESCE(NULLIF(remarks,''), '') || ' | Acknowledged: Client released Amendment WO WDIRY0151_A3 dated 16-06-2026'
       WHERE id=$1`,
      [stmtR.rows[0].id]
    );
    console.log('✓ WDIRY0151 variation statement marked as acknowledged');
  } else {
    console.log('⚠ WDIRY0151 variation statement not found — skipping status update');
  }

  // ── Step 2: Create variation_orders entry for WDIRY0151_A3 ─────────────────
  const existing = await q(
    `SELECT id FROM variation_orders WHERE vo_number='WDIRY0151_A3' AND project_id=$1`,
    [project_id]
  );
  if (existing.rows.length) {
    console.log(`\nVariation Order WDIRY0151_A3 already exists (id: ${existing.rows[0].id}). Deleting and re-inserting…`);
    await q(`DELETE FROM variation_orders WHERE id=$1`, [existing.rows[0].id]);
  }

  const grossExclGst    = 66699575.50;
  const prevGrossExclGst = 42827877.90;
  const variationExclGst = grossExclGst - prevGrossExclGst;

  const voR = await q(
    `INSERT INTO variation_orders
       (project_id, vo_number, description, requested_by, status, total_variation_amount, remarks)
     VALUES ($1,$2,$3,$4,'approved',$5,$6) RETURNING id`,
    [
      project_id,
      'WDIRY0151_A3',
      'Civil Works for Retaining Wall and STP — Amendment WO A3',
      user_id,
      variationExclGst,
      'Client Amendment Work Order dated 16-06-2026. WO Ref: WRF 047, mail dt. 7th Oct 2025. Amendment 03: Qty Variation and addition of NT Items as per QS certification dt. 06.06.2026 for WDIRY0151 / 14.10.2025. New gross excl GST: ₹6,66,99,575.50. CGST+SGST (18%): ₹1,20,05,923.64. Net total incl GST: ₹7,87,05,499.14.',
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

  console.log(`\n✅ Done! WDIRY0151_A3 recorded successfully.`);
  console.log(`   Variation Order ID: ${vo_id}`);
  console.log(`   Gross excl GST:     ₹${grossExclGst.toLocaleString('en-IN', {maximumFractionDigits:2})}`);
  console.log(`   CGST 9%:            ₹${(6002961.82).toLocaleString('en-IN', {maximumFractionDigits:2})}`);
  console.log(`   SGST 9%:            ₹${(6002961.82).toLocaleString('en-IN', {maximumFractionDigits:2})}`);
  console.log(`   Net incl GST:       ₹${(78705499.14).toLocaleString('en-IN', {maximumFractionDigits:2})}`);
  console.log(`   Variation over prev WO (excl GST): ₹${variationExclGst.toLocaleString('en-IN', {maximumFractionDigits:2})}`);

  await pool.end();
}

run().catch(e => { console.error('ERROR:', e.message); pool.end(); process.exit(1); });
