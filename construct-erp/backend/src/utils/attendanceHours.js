// Single source of truth for how a labour worker's day is split between
// regular time and overtime.
//
// A contracted day is 8 hours. Everything a worker does beyond that on a
// given day is overtime, and the two are billed against different WO line
// items — regular hours roll up into man-days priced at the WO's Day rate,
// overtime hours are priced at the WO's Hours rate. Storing an 11-hour day
// as `hours_worked = 11, overtime_hours = 0` therefore mis-bills it twice
// over: it inflates man-days to 1.375 and drops the overtime line entirely.
//
// Every path that writes sc_attendance must run its hours through here, so
// the NMR and the bill raised from it agree no matter how attendance
// arrived — manual entry, bulk save, muster-sheet import or ESSL sync.
const STANDARD_DAY_HOURS = 8;

// Guards against a bad clock pairing (a missing out-punch, an overnight
// swipe) turning into an absurd overtime claim.
const MAX_DAY_HOURS = 24;

/**
 * Split a day's attendance into regular and overtime hours.
 *
 * Idempotent by design: it works on the *combined* total, so feeding it an
 * already-split record ({8, 3}) returns that same split rather than
 * re-splitting the regular portion. That means a re-import or a re-save of
 * existing data can never drift.
 *
 * @param {number|string} hoursWorked  Hours for the day — either the raw
 *   total, or the regular portion of an already-split record.
 * @param {number|string} [overtimeHours=0]  Overtime already split out.
 * @returns {{regular: number, overtime: number, total: number}}
 */
function splitDayHours(hoursWorked, overtimeHours = 0) {
  const raw = (parseFloat(hoursWorked) || 0) + (parseFloat(overtimeHours) || 0);
  const total = Math.max(0, Math.min(raw, MAX_DAY_HOURS));
  const regular = Math.min(total, STANDARD_DAY_HOURS);
  return {
    regular:  +regular.toFixed(2),
    overtime: +Math.max(0, total - STANDARD_DAY_HOURS).toFixed(2),
    total:    +total.toFixed(2),
  };
}

module.exports = { splitDayHours, STANDARD_DAY_HOURS, MAX_DAY_HOURS };
