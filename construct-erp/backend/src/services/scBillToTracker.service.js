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
    const remarks = `Auto-added from Sub Con Bill ${bill.bill_number} on MD approval. `
      + `Net payable ₹${parseFloat(bill.net_payable || 0).toLocaleString('en-IN')} `
      + `(TDS ₹${parseFloat(bill.tds_amount || 0).toLocaleString('en-IN')}, `
      + `Retention ₹${parseFloat(bill.retention_amount || 0).toLocaleString('en-IN')}). `
      + `Payment is recorded in the Subcontractors module, not here.`;

    const r = await client.query(`
      INSERT INTO tqs_bills (
        company_id, project_id, sl_number, vendor_name,
        wo_number, inv_number, inv_date, bill_type, work_desc,
        basic_amount, gst_amount, cgst_amt, sgst_amt, igst_amt,
        total_amount, remarks, workflow_status, created_by, sc_bill_id
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,'wo',$8,
        $9,$10,$11,$12,$13,
        $14,$15,'stores',$16,$17
      ) RETURNING id
    `, [
      bill.company_id, bill.project_id, slNumber, scName,
      woNumber, bill.bill_number, bill.bill_date, bill.description || `Subcontractor RA Bill — ${woNumber}`,
      basicAmount, bill.gst_amount || 0, bill.cgst_amount || 0, bill.sgst_amount || 0, bill.igst_amount || 0,
      totalAmount, remarks, actorId, bill.id,
    ]);

    await client.query(
      `INSERT INTO tqs_bill_updates (bill_id, balance_to_pay) VALUES ($1, $2)`,
      [r.rows[0].id, totalAmount]
    );

    return r.rows[0].id;
  });
}

module.exports = { pushScBillToTracker };
