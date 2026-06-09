-- ================================================================
-- Migration 034: SC P3 + P4 Enhancements
-- • sc_bills: add query_remarks, update status CHECK → add 'queried'
-- • sc_bill_approvals: update action CHECK → add 'queried'
-- • sc_mb_entries: add QA/QC clearance columns
-- • CREATE TABLE sc_ipcs (Interim Payment Certificates)
-- • sc_work_orders: add dlp_end_date (Defect Liability Period)
-- ================================================================

-- ── sc_work_orders: DLP (Defect Liability Period) ────────────────
ALTER TABLE sc_work_orders
  ADD COLUMN IF NOT EXISTS dlp_end_date DATE,
  ADD COLUMN IF NOT EXISTS dlp_months   SMALLINT DEFAULT 12;

COMMENT ON COLUMN sc_work_orders.dlp_end_date IS 'Defect Liability Period end date — retention held until this date';
COMMENT ON COLUMN sc_work_orders.dlp_months   IS 'DLP duration in months (default 12)';


-- ── sc_bills: query remarks column ───────────────────────────────
ALTER TABLE sc_bills
  ADD COLUMN IF NOT EXISTS query_remarks TEXT;

-- ── sc_bills: widen status CHECK to include 'queried' ────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_schema = current_schema()
      AND constraint_name   = 'sc_bills_status_check'
      AND check_clause LIKE '%queried%'
  ) THEN
    ALTER TABLE sc_bills DROP CONSTRAINT IF EXISTS sc_bills_status_check;
    ALTER TABLE sc_bills ADD CONSTRAINT sc_bills_status_check
      CHECK (status IN ('draft','submitted','under_review','queried','approved','rejected','paid'));
  END IF;
END $$;

-- ── sc_bill_approvals: widen action CHECK to include 'queried' ───
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_schema = current_schema()
      AND constraint_name   = 'sc_bill_approvals_action_check'
      AND check_clause LIKE '%queried%'
  ) THEN
    ALTER TABLE sc_bill_approvals DROP CONSTRAINT IF EXISTS sc_bill_approvals_action_check;
    ALTER TABLE sc_bill_approvals ADD CONSTRAINT sc_bill_approvals_action_check
      CHECK (action IN ('submitted','approved','rejected','revised','queried'));
  END IF;
END $$;

-- ── sc_mb_entries: QA/QC clearance ───────────────────────────────
ALTER TABLE sc_mb_entries
  ADD COLUMN IF NOT EXISTS qaqc_cleared      BOOLEAN   DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS qaqc_cleared_by   UUID      REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS qaqc_cleared_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS qaqc_remarks      TEXT;

-- ── sc_ipcs: Interim Payment Certificates ────────────────────────
CREATE TABLE IF NOT EXISTS sc_ipcs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id      UUID REFERENCES projects(id),
  wo_id           UUID NOT NULL REFERENCES sc_work_orders(id),
  sc_id           UUID NOT NULL REFERENCES sc_subcontractors(id),
  bill_id         UUID NOT NULL REFERENCES sc_bills(id) UNIQUE,

  ipc_number      VARCHAR(60) NOT NULL,       -- IPC-PROJCODE-001
  ipc_date        DATE NOT NULL DEFAULT CURRENT_DATE,

  gross_amount    NUMERIC(18,2) DEFAULT 0,
  net_payable     NUMERIC(18,2) DEFAULT 0,
  gst_amount      NUMERIC(18,2) DEFAULT 0,
  tds_amount      NUMERIC(18,2) DEFAULT 0,
  retention_amount NUMERIC(18,2) DEFAULT 0,

  notes           TEXT,
  status          VARCHAR(20) DEFAULT 'issued'
                    CHECK (status IN ('issued','payment_due','paid')),

  approved_by     UUID REFERENCES users(id),
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (company_id, ipc_number)
);

CREATE INDEX IF NOT EXISTS idx_sc_ipcs_wo      ON sc_ipcs(wo_id);
CREATE INDEX IF NOT EXISTS idx_sc_ipcs_bill    ON sc_ipcs(bill_id);
CREATE INDEX IF NOT EXISTS idx_sc_ipcs_project ON sc_ipcs(project_id);
CREATE INDEX IF NOT EXISTS idx_sc_ipcs_status  ON sc_ipcs(status);

COMMENT ON TABLE sc_ipcs IS 'Interim Payment Certificates — auto-generated when an RA bill is finally approved';
