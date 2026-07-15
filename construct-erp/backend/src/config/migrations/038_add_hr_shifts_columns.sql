-- Migration 038: Add break_minutes and is_night_shift to hr_shifts table
ALTER TABLE IF EXISTS hr_shifts
ADD COLUMN IF NOT EXISTS break_minutes INT DEFAULT 30,
ADD COLUMN IF NOT EXISTS is_night_shift BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ot_after_minutes INT DEFAULT 480;

-- Backfill existing shifts with defaults
UPDATE hr_shifts
SET break_minutes = 30, is_night_shift = FALSE, ot_after_minutes = 480
WHERE break_minutes IS NULL OR is_night_shift IS NULL OR ot_after_minutes IS NULL;
