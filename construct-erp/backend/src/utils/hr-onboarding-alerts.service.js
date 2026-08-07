// hr-onboarding-alerts.service.js
// Daily cron: flags overdue onboarding tasks and probation reviews ending
// soon. Dedupe-guarded so the same overdue item doesn't alert every morning
// forever — checks for an existing un-expired notification of the same
// type/related_type/related_id before inserting a new one.
const cron = require('node-cron');
const { query } = require('../config/database');
const notif = require('../services/notif.helper');

const logger = { info: (...a) => console.log('[hr-onboarding-alerts]', ...a), error: (...a) => console.error('[hr-onboarding-alerts]', ...a) };

// A fresh alert for the same item is suppressed if one was already sent
// within this window (24h — matches the daily cron cadence).
const DEDUPE_HOURS = 20;

async function alreadyNotified(type, relatedType, relatedId) {
  const { rows } = await query(
    `SELECT 1 FROM notifications
     WHERE type = $1 AND related_type = $2 AND related_id = $3
       AND created_at > NOW() - INTERVAL '${DEDUPE_HOURS} hours'
     LIMIT 1`,
    [type, relatedType, relatedId]
  );
  return rows.length > 0;
}

async function runOnboardingAlerts() {
  logger.info('Running onboarding alert sweep');
  const companies = await query(`SELECT id FROM companies WHERE is_active = true`);

  for (const company of companies.rows) {
    const companyId = company.id;
    try {
      // Overdue onboarding tasks
      const overdue = await query(
        `SELECT lc.id as lifecycle_id, lc.title, u.id as user_id, u.name
         FROM employee_lifecycle_checklist lc
         JOIN users u ON u.id = lc.user_id
         JOIN employee_profiles ep ON ep.user_id = u.id
         WHERE lc.company_id = $1 AND lc.stage = 'onboarding' AND lc.status <> 'done'
           AND lc.due_date IS NOT NULL AND lc.due_date < CURRENT_DATE
           AND COALESCE(ep.employment_status, 'active') = 'active'`,
        [companyId]
      );
      for (const row of overdue.rows) {
        if (await alreadyNotified('onboarding_task_overdue', 'lifecycle_item', row.user_id)) continue;
        notif.notifyOnboardingTaskOverdue(companyId, { id: row.user_id, name: row.name }, row.title);
      }

      // Probation ending within 7 days, not yet confirmed
      const probation = await query(
        `SELECT u.id as user_id, u.name, (ep.probation_end_date - CURRENT_DATE)::int AS days_left
         FROM employee_profiles ep
         JOIN users u ON u.id = ep.user_id
         WHERE ep.company_id = $1 AND COALESCE(ep.employment_status, 'active') = 'active'
           AND ep.probation_end_date IS NOT NULL AND ep.date_of_confirmation IS NULL
           AND ep.probation_end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7`,
        [companyId]
      );
      for (const row of probation.rows) {
        if (await alreadyNotified('probation_ending_soon', 'onboarding', row.user_id)) continue;
        notif.notifyProbationEndingSoon(companyId, { id: row.user_id, name: row.name }, row.days_left);
      }

      logger.info(`[${companyId}] ${overdue.rows.length} overdue task alert(s), ${probation.rows.length} probation alert(s)`);
    } catch (err) {
      logger.error(`Company ${companyId} failed: ${err.message}`);
    }
  }
}

function initOnboardingAlerts() {
  const schedule = process.env.ONBOARDING_ALERTS_CRON || '0 9 * * *'; // 9:00 AM daily
  const tz = process.env.TZ || 'Asia/Kolkata';
  cron.schedule(schedule, () => {
    logger.info('Cron triggered');
    runOnboardingAlerts().catch(err => logger.error(`Run failed: ${err.message}`));
  }, { timezone: tz });
  logger.info(`Initialized — cron: "${schedule}" tz: ${tz}`);
}

module.exports = { initOnboardingAlerts, runOnboardingAlerts };
