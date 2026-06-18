// Link MR-LANCHO-HYD-LH10-003 to POLANLH10005, POLANLH10004, POLANLH10003
// Run: railway run node link-mr-to-pos.js  (from backend/ directory)

const { query } = require('./src/config/database');

async function main() {
  const mrNumber = 'MR-LANCHO-HYD-LH10-003';
  const poNumbers = ['POLANLH10005', 'POLANLH10004', 'POLANLH10003'];

  // Find MR
  const mrRes = await query(
    `SELECT id, serial_no_formatted, mrs_number
     FROM material_requisitions
     WHERE serial_no_formatted = $1 OR mrs_number = $1`,
    [mrNumber]
  );
  if (!mrRes.rows.length) {
    console.error('MR not found:', mrNumber);
    process.exit(1);
  }
  const mrId = mrRes.rows[0].id;
  console.log('Found MR:', mrRes.rows[0].serial_no_formatted || mrRes.rows[0].mrs_number, '->', mrId);

  // Find POs
  for (const poNo of poNumbers) {
    const poRes = await query(
      `SELECT id, po_number, serial_no_formatted, po_ref_no, mrs_id, mrs_ids
       FROM purchase_orders
       WHERE po_number = $1 OR serial_no_formatted = $1 OR po_ref_no = $1`,
      [poNo]
    );
    if (!poRes.rows.length) {
      console.error('PO not found:', poNo);
      continue;
    }
    const po = poRes.rows[0];
    console.log('Found PO:', po.po_number || po.serial_no_formatted, '->', po.id);
    console.log('  Current mrs_id:', po.mrs_id, '| mrs_ids:', po.mrs_ids);

    // Build new mrs_ids array (append mrId if not already present)
    const existing = Array.isArray(po.mrs_ids) ? po.mrs_ids : (po.mrs_id ? [po.mrs_id] : []);
    const newList = existing.includes(mrId) ? existing : [...existing, mrId];
    const primaryId = newList[0];

    await query(
      `UPDATE purchase_orders SET mrs_id = $1, mrs_ids = $2 WHERE id = $3`,
      [primaryId, newList, po.id]
    );
    console.log('  Updated mrs_ids ->', newList);
  }

  console.log('\nDone. Backfill of po_items.mrs_item_id will run automatically on next server restart.');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
