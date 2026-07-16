-- Add missing UNIQUE constraint on sc_attendance to prevent duplicate daily wage entries
-- Without this, concurrent submissions for the same worker+date double the payroll SUM.
ALTER TABLE sc_attendance
  ADD CONSTRAINT IF NOT EXISTS sc_attendance_worker_date_unique
  UNIQUE (worker_id, attendance_date);
