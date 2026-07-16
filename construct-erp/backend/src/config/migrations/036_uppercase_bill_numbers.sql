-- Uppercase all invoice/bill numbers in tqs_bills and ra_bills
-- Run once; safe to re-run (UPPER of already-uppercase is a no-op)

UPDATE tqs_bills
SET inv_number = UPPER(TRIM(inv_number))
WHERE inv_number IS NOT NULL
  AND TRIM(inv_number) <> ''
  AND inv_number <> UPPER(TRIM(inv_number));

UPDATE ra_bills
SET bill_number = UPPER(TRIM(bill_number))
WHERE bill_number IS NOT NULL
  AND TRIM(bill_number) <> ''
  AND bill_number <> UPPER(TRIM(bill_number));
