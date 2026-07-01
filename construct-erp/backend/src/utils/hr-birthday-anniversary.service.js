// hr-birthday-anniversary.service.js
// Daily 8:30 AM IST: sends birthday & work-anniversary greetings via email + WhatsApp
// Also notifies HR admin with a summary of the day's celebrations.

const cron      = require('node-cron');
const { query } = require('../config/database');
const { sendMail }    = require('../services/mail.service');
const { sendWhatsApp, sendToMany, isConfigured: waConfigured } = require('../services/whatsapp.service');

const logger = { info: (...a) => console.log('[hr-celebrate]', ...a), error: (...a) => console.error('[hr-celebrate]', ...a) };

const ORDINAL = (n) => {
  const s = ['th','st','nd','rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ── WhatsApp helpers ──────────────────────────────────────────────────────────
const formatPhone = (phone) => {
  if (!phone) return null;
  const d = String(phone).replace(/\D/g, '');
  if (d.length === 10) return `whatsapp:+91${d}`;
  if (d.length === 12 && d.startsWith('91')) return `whatsapp:+${d}`;
  if (d.length > 10) return `whatsapp:+${d}`;
  return null;
};

const getAdminNumbers = () => {
  const raw = process.env.WHATSAPP_ADMIN_NUMBERS || '';
  return raw.split(',').map(n => n.trim()).filter(Boolean).map(formatPhone).filter(Boolean);
};

// ── Email templates ───────────────────────────────────────────────────────────
const birthdayEmailHtml = (name, companyName) => `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; background: #f5f6fa; }
  .wrap { max-width: 560px; margin: 32px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
  .banner { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 40px 32px; text-align: center; }
  .emoji-big { font-size: 64px; display: block; margin-bottom: 8px; }
  .banner h1 { color: #fff; font-size: 28px; font-weight: 800; }
  .banner p  { color: rgba(255,255,255,.85); font-size: 14px; margin-top: 6px; }
  .body { padding: 32px; }
  .body h2 { font-size: 22px; color: #1e293b; margin-bottom: 12px; }
  .body p  { font-size: 15px; color: #475569; line-height: 1.7; margin-bottom: 12px; }
  .wishes { background: linear-gradient(135deg, #fef3c7, #fde68a); border-radius: 12px; padding: 20px 24px; margin: 20px 0; text-align: center; }
  .wishes p { color: #92400e; font-size: 16px; font-weight: 600; margin: 0; }
  .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 32px; text-align: center; }
  .footer p { font-size: 12px; color: #94a3b8; }
</style></head><body>
<div class="wrap">
  <div class="banner">
    <span class="emoji-big">🎂</span>
    <h1>Happy Birthday!</h1>
    <p>${companyName}</p>
  </div>
  <div class="body">
    <h2>Dear ${name},</h2>
    <p>On behalf of the entire team at <strong>${companyName}</strong>, we wish you a very <strong>Happy Birthday!</strong> 🎉</p>
    <p>Today is your special day — we hope it's filled with joy, laughter, and everything you love. You are a valued member of our family and we're grateful to have you with us.</p>
    <div class="wishes">
      <p>🌟 May this year bring you great success, good health, and happiness! 🌟</p>
    </div>
    <p>Have a wonderful celebration!</p>
    <p style="margin-top:20px; font-weight:600; color:#6366f1;">With warm wishes,<br>Team ${companyName} 🎈</p>
  </div>
  <div class="footer"><p>This is an automated birthday greeting from ${companyName} ERP</p></div>
</div>
</body></html>`;

const anniversaryEmailHtml = (name, years, companyName) => `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; background: #f5f6fa; }
  .wrap { max-width: 560px; margin: 32px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
  .banner { background: linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%); padding: 40px 32px; text-align: center; }
  .emoji-big { font-size: 64px; display: block; margin-bottom: 8px; }
  .banner h1 { color: #fff; font-size: 26px; font-weight: 800; }
  .banner .years { display: inline-block; background: rgba(255,255,255,.2); color: #fff; font-size: 14px; font-weight: 700; padding: 4px 16px; border-radius: 20px; margin-top: 8px; }
  .banner p  { color: rgba(255,255,255,.85); font-size: 14px; margin-top: 8px; }
  .body { padding: 32px; }
  .body h2 { font-size: 22px; color: #1e293b; margin-bottom: 12px; }
  .body p  { font-size: 15px; color: #475569; line-height: 1.7; margin-bottom: 12px; }
  .milestone { background: linear-gradient(135deg, #dbeafe, #ede9fe); border-radius: 12px; padding: 20px 24px; margin: 20px 0; text-align: center; border: 2px solid #c7d2fe; }
  .milestone .num { font-size: 48px; font-weight: 900; color: #4f46e5; line-height: 1; }
  .milestone .lbl { font-size: 14px; color: #6366f1; font-weight: 600; margin-top: 4px; }
  .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 32px; text-align: center; }
  .footer p { font-size: 12px; color: #94a3b8; }
</style></head><body>
<div class="wrap">
  <div class="banner">
    <span class="emoji-big">🏆</span>
    <h1>Work Anniversary!</h1>
    <div class="years">${ORDINAL(years)} Year with ${companyName}</div>
    <p>Congratulations on this milestone!</p>
  </div>
  <div class="body">
    <h2>Dear ${name},</h2>
    <p>Today marks <strong>${years} incredible year${years > 1 ? 's' : ''}</strong> of your journey with <strong>${companyName}</strong>! 🎊</p>
    <p>Your dedication, hard work, and commitment have been a tremendous asset to our team. We are truly grateful for everything you bring to the organization every single day.</p>
    <div class="milestone">
      <div class="num">${years}</div>
      <div class="lbl">Year${years > 1 ? 's' : ''} of Excellence 🌟</div>
    </div>
    <p>Here's to many more years of growth, success, and achievement together. Thank you for being such an important part of our journey!</p>
    <p style="margin-top:20px; font-weight:600; color:#4f46e5;">With appreciation & gratitude,<br>Team ${companyName} 🙏</p>
  </div>
  <div class="footer"><p>This is an automated work anniversary greeting from ${companyName} ERP</p></div>
</div>
</body></html>`;

const hrSummaryEmailHtml = (birthdays, anniversaries, date, companyName) => {
  const bdRows = birthdays.map(e => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-weight:600;color:#1e293b">${e.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#64748b">${e.emp_code || '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#64748b">${e.department || '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#7c3aed">🎂 Birthday</td>
    </tr>`).join('');
  const annRows = anniversaries.map(e => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-weight:600;color:#1e293b">${e.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#64748b">${e.emp_code || '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#64748b">${e.department || '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#0ea5e9">🏆 ${ORDINAL(e.years)} Anniversary</td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body { font-family: Arial,sans-serif; background:#f5f6fa; margin:0; padding:0; }
  .wrap { max-width:620px; margin:24px auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,.08); }
  .header { background:linear-gradient(135deg,#4f46e5,#7c3aed); padding:24px 28px; }
  .header h1 { color:#fff; font-size:20px; margin:0; }
  .header p  { color:rgba(255,255,255,.8); font-size:13px; margin:4px 0 0; }
  .body { padding:24px 28px; }
  .section-title { font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#94a3b8; margin:20px 0 8px; }
  table { width:100%; border-collapse:collapse; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; }
  thead th { background:#f8fafc; padding:8px 12px; text-align:left; font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; }
  .empty { padding:16px; text-align:center; color:#94a3b8; font-size:13px; }
  .footer { background:#f8fafc; border-top:1px solid #e2e8f0; padding:16px 28px; }
  .footer p { font-size:11px; color:#94a3b8; margin:0; }
</style></head><body>
<div class="wrap">
  <div class="header">
    <h1>🎉 Today's HR Celebrations — ${date}</h1>
    <p>${companyName} · Automated daily summary</p>
  </div>
  <div class="body">
    <div class="section-title">🎂 Birthdays Today (${birthdays.length})</div>
    ${birthdays.length ? `<table><thead><tr><th>Name</th><th>ID</th><th>Department</th><th>Type</th></tr></thead><tbody>${bdRows}</tbody></table>` : '<p class="empty">No birthdays today</p>'}
    <div class="section-title">🏆 Work Anniversaries Today (${anniversaries.length})</div>
    ${anniversaries.length ? `<table><thead><tr><th>Name</th><th>ID</th><th>Department</th><th>Milestone</th></tr></thead><tbody>${annRows}</tbody></table>` : '<p class="empty">No anniversaries today</p>'}
  </div>
  <div class="footer"><p>Sent automatically each morning from ${companyName} ERP · Do not reply</p></div>
</div>
</body></html>`;
};

// ── Core runner ───────────────────────────────────────────────────────────────
async function runBirthdayAnniversary() {
  const today = new Date();
  const todayM = today.getMonth() + 1;
  const todayD = today.getDate();
  const todayY = today.getFullYear();
  const dateLabel = `${todayD} ${MONTH_NAMES[todayM - 1]} ${todayY}`;

  logger.info(`Running birthday/anniversary check for ${dateLabel}`);

  // Fetch all companies
  const companies = await query(`SELECT id, name, email FROM companies WHERE is_active = true`);

  for (const company of companies.rows) {
    try {
      const cid = company.id;
      const companyName = company.name || 'BCIM Construction';

      // ── Birthdays today ──
      const bdRes = await query(`
        SELECT u.name, u.email, ep.phone, ep.date_of_birth,
               u.employee_code AS emp_code,
               dep.name AS department
        FROM employee_profiles ep
        JOIN users u ON u.id = ep.user_id
        LEFT JOIN hr_departments dep ON dep.id = ep.department_id
        WHERE ep.company_id = $1
          AND ep.date_of_birth IS NOT NULL
          AND EXTRACT(MONTH FROM ep.date_of_birth) = $2
          AND EXTRACT(DAY   FROM ep.date_of_birth) = $3
          AND (ep.employment_status IS NULL OR ep.employment_status = 'active')
      `, [cid, todayM, todayD]);

      // ── Work anniversaries today (must be at least 1 year) ──
      const annRes = await query(`
        SELECT u.name, u.email, ep.phone, ep.date_of_joining,
               u.employee_code AS emp_code,
               dep.name AS department,
               (${todayY} - EXTRACT(YEAR FROM ep.date_of_joining)::int) AS years
        FROM employee_profiles ep
        JOIN users u ON u.id = ep.user_id
        LEFT JOIN hr_departments dep ON dep.id = ep.department_id
        WHERE ep.company_id = $1
          AND ep.date_of_joining IS NOT NULL
          AND EXTRACT(MONTH FROM ep.date_of_joining) = $2
          AND EXTRACT(DAY   FROM ep.date_of_joining) = $3
          AND EXTRACT(YEAR  FROM ep.date_of_joining) < $4
          AND (ep.employment_status IS NULL OR ep.employment_status = 'active')
      `, [cid, todayM, todayD, todayY]);

      const birthdays    = bdRes.rows;
      const anniversaries = annRes.rows;

      if (birthdays.length === 0 && anniversaries.length === 0) {
        logger.info(`[${companyName}] No celebrations today`);
        continue;
      }

      logger.info(`[${companyName}] 🎂 ${birthdays.length} birthdays, 🏆 ${anniversaries.length} anniversaries`);

      // ── Send individual birthday greetings ──
      for (const emp of birthdays) {
        // Email
        if (emp.email) {
          await sendMail({
            to:      emp.email,
            subject: `🎂 Happy Birthday, ${emp.name}! — ${companyName}`,
            html:    birthdayEmailHtml(emp.name, companyName),
          }).catch(e => logger.error(`Birthday email failed for ${emp.name}: ${e.message}`));
        }
        // WhatsApp
        const waPhone = formatPhone(emp.phone);
        if (waPhone) {
          const msg = `🎂 *Happy Birthday, ${emp.name}!* 🎉\n\nWishing you a wonderful day filled with joy and happiness! 🎈\n\nMany happy returns of the day from all of us at *${companyName}*! 🙏`;
          await sendWhatsApp(waPhone, msg).catch(e => logger.error(`Birthday WA failed for ${emp.name}: ${e.message}`));
        }
      }

      // ── Send individual anniversary greetings ──
      for (const emp of anniversaries) {
        const years = parseInt(emp.years);
        // Email
        if (emp.email) {
          await sendMail({
            to:      emp.email,
            subject: `🏆 Happy ${ORDINAL(years)} Work Anniversary, ${emp.name}! — ${companyName}`,
            html:    anniversaryEmailHtml(emp.name, years, companyName),
          }).catch(e => logger.error(`Anniversary email failed for ${emp.name}: ${e.message}`));
        }
        // WhatsApp
        const waPhone = formatPhone(emp.phone);
        if (waPhone) {
          const msg = `🏆 *Happy ${ORDINAL(years)} Work Anniversary, ${emp.name}!* 🎊\n\nCongratulations on completing *${years} year${years > 1 ? 's' : ''}* with *${companyName}*! 🌟\n\nYour dedication and hard work are truly valued. Thank you for being part of our team! 🙏`;
          await sendWhatsApp(waPhone, msg).catch(e => logger.error(`Anniversary WA failed for ${emp.name}: ${e.message}`));
        }
      }

      // ── Send HR Admin summary ──
      // Find HR admin emails
      const hrAdmins = await query(`
        SELECT DISTINCT u.email FROM users u
        WHERE u.company_id = $1 AND u.is_active = true
          AND (u.role IN ('admin','hr_admin') OR u.email = $2)
      `, [cid, company.email]);

      const hrEmails = hrAdmins.rows.map(r => r.email).filter(Boolean);
      if (hrEmails.length) {
        await sendMail({
          to:      hrEmails,
          subject: `🎉 HR Celebrations Today — ${dateLabel} (${birthdays.length} birthdays, ${anniversaries.length} anniversaries)`,
          html:    hrSummaryEmailHtml(birthdays, anniversaries, dateLabel, companyName),
        }).catch(e => logger.error(`HR summary email failed: ${e.message}`));
      }

      // ── WhatsApp to HR admin numbers ──
      const adminNums = getAdminNumbers();
      if (adminNums.length && (birthdays.length || anniversaries.length)) {
        const lines = [`🎉 *HR Celebrations — ${dateLabel}*`, `Company: ${companyName}`, ''];
        if (birthdays.length) {
          lines.push(`🎂 *Birthdays Today (${birthdays.length})*`);
          birthdays.forEach(e => lines.push(`  • ${e.name}${e.department ? ` (${e.department})` : ''}`));
        }
        if (anniversaries.length) {
          lines.push('');
          lines.push(`🏆 *Work Anniversaries (${anniversaries.length})*`);
          anniversaries.forEach(e => lines.push(`  • ${e.name} — ${ORDINAL(parseInt(e.years))} year${parseInt(e.years) > 1 ? 's' : ''}${e.department ? ` (${e.department})` : ''}`));
        }
        await sendToMany(adminNums, lines.join('\n')).catch(e => logger.error(`Admin WA summary failed: ${e.message}`));
      }

      logger.info(`[${companyName}] Done`);
    } catch (err) {
      logger.error(`Company ${company.id} failed: ${err.message}`);
    }
  }
}

// ── API helper: today's celebrations for any company ─────────────────────────
async function getTodayCelebrations(companyId) {
  const today = new Date();
  const todayM = today.getMonth() + 1;
  const todayD = today.getDate();
  const todayY = today.getFullYear();

  const [bdRes, annRes] = await Promise.all([
    query(`
      SELECT u.name, u.employee_code AS emp_code, ep.date_of_birth,
             dep.name AS department, des.name AS designation,
             ep.employment_status
      FROM employee_profiles ep
      JOIN users u ON u.id = ep.user_id
      LEFT JOIN hr_departments dep ON dep.id = ep.department_id
      LEFT JOIN hr_designations des ON des.id = ep.designation_id
      WHERE ep.company_id = $1
        AND ep.date_of_birth IS NOT NULL
        AND EXTRACT(MONTH FROM ep.date_of_birth) = $2
        AND EXTRACT(DAY   FROM ep.date_of_birth) = $3
        AND (ep.employment_status IS NULL OR ep.employment_status = 'active')
      ORDER BY u.name
    `, [companyId, todayM, todayD]),

    query(`
      SELECT u.name, u.employee_code AS emp_code, ep.date_of_joining,
             dep.name AS department, des.name AS designation,
             (${todayY} - EXTRACT(YEAR FROM ep.date_of_joining)::int) AS years
      FROM employee_profiles ep
      JOIN users u ON u.id = ep.user_id
      LEFT JOIN hr_departments dep ON dep.id = ep.department_id
      LEFT JOIN hr_designations des ON des.id = ep.designation_id
      WHERE ep.company_id = $1
        AND ep.date_of_joining IS NOT NULL
        AND EXTRACT(MONTH FROM ep.date_of_joining) = $2
        AND EXTRACT(DAY   FROM ep.date_of_joining) = $3
        AND EXTRACT(YEAR  FROM ep.date_of_joining) < $4
        AND (ep.employment_status IS NULL OR ep.employment_status = 'active')
      ORDER BY years DESC, u.name
    `, [companyId, todayM, todayD, todayY]),
  ]);

  return {
    birthdays:    bdRes.rows,
    anniversaries: annRes.rows.map(r => ({ ...r, years: parseInt(r.years) })),
    date:         today.toISOString().slice(0, 10),
  };
}

// ── Scheduler ─────────────────────────────────────────────────────────────────
function initBirthdayAnniversary() {
  const schedule = process.env.BIRTHDAY_CRON || '30 8 * * *'; // 8:30 AM daily
  const tz       = process.env.TZ || 'Asia/Kolkata';
  cron.schedule(schedule, () => {
    logger.info('Cron triggered');
    runBirthdayAnniversary().catch(err => logger.error(`Run failed: ${err.message}`));
  }, { timezone: tz });
  logger.info(`Initialized — cron: "${schedule}" tz: ${tz}`);
}

module.exports = { initBirthdayAnniversary, runBirthdayAnniversary, getTodayCelebrations };
