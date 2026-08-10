// Probation Tracking (Onboarding menu) — same real data/actions as the HR
// Reports "Employee Confirmation Report" page (probation-end dates,
// confirmation status, Confirm action). Re-exported rather than duplicated:
// splitting probation tracking into a second system risks desyncing from
// employee_profiles.date_of_confirmation, the field every other report and
// KPI in the app already reads.
export { default } from '../HRConfirmationReportPage';
