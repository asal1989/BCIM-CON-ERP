// services/scBillToTracker.service.js — pushes an MD-approved Sub Con (SC)
// bill into Bill Tracker (tqs_bills) automatically, so Accounts can see it
// listed alongside every other WO/PO bill instead of it staying invisible
// inside the SC module.
//
// This is a VISIBILITY copy, not the payment system of record — payment for
// SC bills keeps happening in the Sub Con module (sc_bills.paid_amount /
// payment_date / payment_ref), per explicit instruction. The Bill Tracker
// row starts at the same 'stores' stage any other WO-type bill starts at
// (bill_type='wo' already defaults there in tqs-bills.routes.js POST /), so
// it behaves identically to a normal Bill Tracker entry from here on.
const { query, withTransaction } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');
const { nextSlNumber } = require('../routes/tqs-bills.routes');

runSchemaInit('tqs_bills_sc_bill_id', async () => {
  await query(`
    ALTER TABLE tqs_bills
      ADD COLUMN IF NOT EXISTS sc_bill_id UUID REFERENCES sc_bills(id)
  `);
});

async function pushScBillToTracker(billId, actorId) {
  const existing = await query(`SELECT id FROM tqs_bills WHERE sc_bill_id=$1`, [billId]);
  if (existing.rows.length) return existing.rows[0].id;

  const r0 = await query(`
    SELECT b.*, wo.wo_number, sc.name AS sc_name
    FROM sc_bills b
    JOIN sc_work_orders wo ON wo.id = b.wo_id
    JOIN sc_subcontractors sc ON sc.id = b.sc_id
    WHERE b.id = $1
  `, [billId]);
  if (!r0.rows.length) return null;
  const bill = r0.rows[0];
  const { wo_number: woNumber, sc_name: scName } = bill;

  const basicAmount = parseFloat(bill.gross_amount || 0) - parseFloat(bill.gst_amount || 0);
  const totalAmount = parseFloat(bill.gross_amount || 0);

  return withTransaction(async (client) => {
    const slNumber = await nextSlNumber('wo', bill.company_id);
    const remarks = `Auto-added from Sub Con Bill ${bill.bill_number}. `
      + `Net payable ₹${parseFloat(bill.net_payable || 0).toLocaleString('en-IN')} `
      + `(TDS ₹${parseFloat(bill.tds_amount || 0).toLocaleString('en-IN')}, `
      + `Retention ₹${parseFloat(bill.retention_amount || 0).toLocaleString('en-IN')}). `
      + `Payment is recorded in the Subcontractors module, not here.`;

    const r = await client.query(`
      INSERT INTO tqs_bills (
        company_id, project_id, sl_number, vendor_name,
        wo_number, po_number, inv_number, inv_date, bill_type, work_desc,
        basic_amount, gst_amount, cgst_amt, sgst_amt, igst_amt,
        total_amount, remarks, workflow_status, created_by, sc_bill_id
      ) VALUES (
        $1,$2,$3,$4,$5,$5,$6,$7,'wo',$8,
        $9,$10,$11,$12,$13,
        $14,$15,'pending',$16,$17
      ) RETURNING id
    `, [
      bill.company_id, bill.project_id, slNumber, scName,
      woNumber, bill.invoice_number || bill.bill_number, bill.bill_date, bill.description || `Subcontractor RA Bill — ${woNumber}`,
      basicAmount, bill.gst_amount || 0, bill.cgst_amount || 0, bill.sgst_amount || 0, bill.igst_amount || 0,
      totalAmount, remarks, actorId, bill.id,
    ]);

    const tqsBillId = r.rows[0].id;

    await client.query(
      `INSERT INTO tqs_bill_updates (bill_id, balance_to_pay) VALUES ($1, $2)`,
      [tqsBillId, totalAmount]
    );

    // Copy sc_bill_items → tqs_bill_line_items so QS cert summary sheet populates
    await copyScItemsToLineItems(client, billId, tqsBillId, bill);

    return tqsBillId;
  });
}

async function copyScItemsToLineItems(client, scBillId, tqsBillId, bill) {
  const items = await client.query(`
    SELECT description, unit, curr_qty, rate, COALESCE(amount, curr_qty * rate) AS basic_amount, sequence_no
    FROM sc_bill_items
    WHERE bill_id = $1 AND curr_qty > 0
    ORDER BY sequence_no
  `, [scBillId]);
  if (!items.rows.length) return;

  const gstPct = parseFloat(bill.gst_pct || 0);
  for (const it of items.rows) {
    const basic = parseFloat(it.basic_amount || 0);
    const gstAmt = Math.round(basic * gstPct) / 100;
    await client.query(`
      INSERT INTO tqs_bill_line_items
        (bill_id, item_name, unit, quantity, rate, basic_amount, gst_pct, gst_amount, total_amount, sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `, [tqsBillId, it.description, it.unit, it.curr_qty, it.rate, basic, gstPct, gstAmt, basic + gstAmt, it.sequence_no]);
  }
}

// One-time fix: copy wo_number → po_number for SC bills already in tracker
runSchemaInit('fix_sc_tracker_po_number_2026_07', async () => {
  const result = await query(`
    UPDATE tqs_bills
    SET po_number = wo_number
    WHERE sc_bill_id IS NOT NULL AND po_number IS NULL AND wo_number IS NOT NULL
  `);
  console.log(`[fix] Set po_number from wo_number for ${result.rowCount} SC tracker rows`);
});

// One-time backfill: copy sc_bill_items into tqs_bill_line_items for SC bills already in tracker
runSchemaInit('backfill_sc_bill_line_items_2026_07', async () => {
  const res = await query(`
    SELECT tb.id AS tqs_bill_id, tb.sc_bill_id, sb.gst_pct
    FROM tqs_bills tb
    JOIN sc_bills sb ON sb.id = tb.sc_bill_id
    WHERE tb.sc_bill_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM tqs_bill_line_items WHERE bill_id = tb.id)
  `);
  console.log(`[backfill] Found ${res.rows.length} SC tracker bills missing line items`);
  for (const row of res.rows) {
    try {
      await withTransaction(async (client) => {
        const billMock = { gst_pct: row.gst_pct };
        await copyScItemsToLineItems(client, row.sc_bill_id, row.tqs_bill_id, billMock);
      });
    } catch (e) {
      console.error(`[backfill] Line items failed for tqs_bill ${row.tqs_bill_id}:`, e.message);
    }
  }
  console.log('[backfill] SC bill line items backfill complete');
});

// One-time backfill: push all existing SC bills not yet in Bill Tracker
runSchemaInit('backfill_sc_bills_to_tracker_2026_07', async () => {
  const res = await query(`
    SELECT id, created_by FROM sc_bills
    WHERE id NOT IN (SELECT sc_bill_id FROM tqs_bills WHERE sc_bill_id IS NOT NULL)
    ORDER BY created_at ASC
  `);
  console.log(`[backfill] Found ${res.rows.length} SC bills to push to Bill Tracker`);
  for (const row of res.rows) {
    try {
      await pushScBillToTracker(row.id, row.created_by);
    } catch (e) {
      console.error(`[backfill] Failed to push sc_bill ${row.id}:`, e.message);
    }
  }
  console.log('[backfill] SC bills backfill complete');
});

module.exports = { pushScBillToTracker };
