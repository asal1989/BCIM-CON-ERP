-- ================================================================
-- Migration 033: RA Bill Enhancements
-- Adds GST split (CGST/SGST/IGST), Labour Cess, and Section E
-- credits/releases to sc_bills for complete RA bill compliance.
-- ================================================================

ALTER TABLE sc_bills
  -- Inter-state flag: TRUE = IGST, FALSE = CGST + SGST (intra-state)
  ADD COLUMN IF NOT EXISTS is_igst                  BOOLEAN       DEFAULT FALSE,

  -- GST split columns (computed from gst_amount based on is_igst flag)
  ADD COLUMN IF NOT EXISTS cgst_amount              NUMERIC(18,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_amount              NUMERIC(18,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_amount              NUMERIC(18,2) DEFAULT 0,

  -- Labour Welfare Cess under Building & Other Construction Workers Act
  -- Typically 1% of gross (applicable on contracts above ₹50 lakhs)
  ADD COLUMN IF NOT EXISTS labour_cess_amount       NUMERIC(18,2) DEFAULT 0,

  -- Section E: Credits that INCREASE net payable
  -- retention_release_amount: retention held in prior bills now being released
  ADD COLUMN IF NOT EXISTS retention_release_amount NUMERIC(18,2) DEFAULT 0,

  -- credit_note_amount: contra deductions (SC credit note reduces payable)
  ADD COLUMN IF NOT EXISTS credit_note_amount       NUMERIC(18,2) DEFAULT 0;

-- Back-fill existing intra-state records: split gst_amount into CGST + SGST
UPDATE sc_bills
   SET cgst_amount = ROUND(gst_amount / 2, 2),
       sgst_amount = gst_amount - ROUND(gst_amount / 2, 2)
 WHERE is_igst = FALSE AND gst_amount > 0 AND cgst_amount = 0;

-- Column documentation
COMMENT ON COLUMN sc_bills.is_igst
  IS 'TRUE = inter-state supply (IGST applies), FALSE = intra-state (CGST + SGST)';
COMMENT ON COLUMN sc_bills.cgst_amount
  IS 'Central GST component (= gst_amount/2 when is_igst = FALSE)';
COMMENT ON COLUMN sc_bills.sgst_amount
  IS 'State GST component (= gst_amount/2 when is_igst = FALSE)';
COMMENT ON COLUMN sc_bills.igst_amount
  IS 'Integrated GST (= gst_amount when is_igst = TRUE)';
COMMENT ON COLUMN sc_bills.labour_cess_amount
  IS '1% Labour Welfare Cess under BOCW Act (applicable on contracts > ₹50L)';
COMMENT ON COLUMN sc_bills.retention_release_amount
  IS 'Section E: amount of previously-held retention money released on this bill (increases net payable)';
COMMENT ON COLUMN sc_bills.credit_note_amount
  IS 'Section E: SC-issued credit note or contra adjustment (reduces net payable)';
