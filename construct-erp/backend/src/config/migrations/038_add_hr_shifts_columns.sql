-- Migration 038: Add break_minutes and is_night_shift to hr_shifts table
ALTER TABLE IF EXISTS hr_shifts
ADD COLUMN IF NOT EXISTS break_minutes INT DEFAULT 30,
ADD COLUMN IF NOT EXISTS is_night_shift BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ot_after_minutes INT DEFAULT 480;

-- Ensure is_active is TRUE for all existing shifts (in case it got set to FALSE)
UPDATE hr_shifts
SET is_active = TRUE
WHERE is_active IS NULL OR is_active = FALSE;
