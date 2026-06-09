-- ================================================================
-- Migration 035: SC P5 Enhancements
-- • sc_work_orders: add WO closure columns (closed_by, closed_at, closure_remarks)
-- Note: boq_item_id FK on sc_wo_items already exists from migration 027
-- ================================================================

ALTER TABLE sc_work_orders
  ADD COLUMN IF NOT EXISTS closed_by       UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS closed_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closure_remarks TEXT;

COMMENT ON COLUMN sc_work_orders.closed_by       IS 'User who closed/completed this WO (final account sign-off)';
COMMENT ON COLUMN sc_work_orders.closed_at       IS 'Timestamp when WO was formally closed';
COMMENT ON COLUMN sc_work_orders.closure_remarks IS 'Remarks at WO closure / final account note';
