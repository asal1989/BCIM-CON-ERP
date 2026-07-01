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
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Happy Birthday!</title>
<style>
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
@keyframes glow{0%,100%{text-shadow:0 0 10px #fff,0 0 30px #a78bfa,0 0 60px #7c3aed,0 4px 8px rgba(0,0,0,.4)}50%{text-shadow:0 0 20px #fff,0 0 50px #c4b5fd,0 0 90px #8b5cf6,0 4px 8px rgba(0,0,0,.4)}}
@keyframes shimmer{0%{background-position:200% center}100%{background-position:-200% center}}
@keyframes balloon-bob{0%,100%{transform:translateY(0) rotate(-4deg)}50%{transform:translateY(-14px) rotate(4deg)}}
@keyframes sparkle{0%,100%{opacity:0;transform:scale(0) rotate(0deg)}40%,60%{opacity:1;transform:scale(1.2) rotate(180deg)}}
@keyframes confetti-a{0%{transform:translateY(-10px) rotate(0deg);opacity:1}100%{transform:translateY(160px) rotate(600deg);opacity:0}}
@keyframes confetti-b{0%{transform:translateY(-10px) rotate(0deg);opacity:1}100%{transform:translateY(140px) rotate(-480deg);opacity:0}}
@keyframes pulse-bg{0%,100%{opacity:.06}50%{opacity:.12}}
@keyframes card-breathe{0%,100%{box-shadow:0 30px 80px rgba(124,58,237,.45),0 0 120px rgba(139,92,246,.15)}50%{box-shadow:0 40px 100px rgba(124,58,237,.65),0 0 160px rgba(139,92,246,.25)}}
@keyframes badge-pop{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
@keyframes candle-flicker{0%,100%{transform:scaleY(1) scaleX(1);opacity:1;filter:brightness(1)}33%{transform:scaleY(1.3) scaleX(.8);opacity:.9;filter:brightness(1.2)}66%{transform:scaleY(.9) scaleX(1.1);opacity:.95;filter:brightness(.95)}}
body{margin:0;padding:0;background:#0b0720;font-family:'Segoe UI',Helvetica,Arial,sans-serif}
</style>
</head>
<body>
<div style="max-width:600px;margin:0 auto;padding:24px 12px 40px">

  <!-- Ambient stars layer -->
  <div style="text-align:center;font-size:11px;letter-spacing:20px;color:rgba(196,165,253,.4);margin-bottom:4px;animation:sparkle 4s ease-in-out infinite">✦ ✦ ✦ ✦ ✦</div>

  <!-- ═══ MAIN CARD ═══ -->
  <div style="border-radius:28px;overflow:hidden;animation:card-breathe 6s ease-in-out infinite;position:relative">

    <!-- ── HERO BANNER ── -->
    <div style="background:linear-gradient(145deg,#3b0764 0%,#6d28d9 35%,#7c3aed 60%,#a855f7 80%,#ec4899 100%);padding:52px 28px 44px;text-align:center;position:relative;overflow:hidden">

      <!-- Pulsing orbs behind content -->
      <div style="position:absolute;top:-40px;left:-40px;width:180px;height:180px;border-radius:50%;background:rgba(255,255,255,.04);animation:pulse-bg 4s ease-in-out infinite"></div>
      <div style="position:absolute;bottom:-30px;right:-30px;width:140px;height:140px;border-radius:50%;background:rgba(255,255,255,.04);animation:pulse-bg 4s ease-in-out infinite 2s"></div>
      <div style="position:absolute;top:60px;right:20px;width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,.03);animation:pulse-bg 3s ease-in-out infinite 1s"></div>

      <!-- Confetti ribbons (7 pieces) -->
      <div style="position:absolute;top:0;left:8%;width:7px;height:16px;background:#fbbf24;border-radius:3px;animation:confetti-a 2.8s ease-in infinite .1s"></div>
      <div style="position:absolute;top:0;left:22%;width:6px;height:6px;background:#34d399;border-radius:50%;animation:confetti-b 3.3s ease-in infinite .6s"></div>
      <div style="position:absolute;top:0;left:40%;width:7px;height:14px;background:#f472b6;border-radius:3px;animation:confetti-a 2.5s ease-in infinite 1s"></div>
      <div style="position:absolute;top:0;left:58%;width:6px;height:6px;background:#60a5fa;border-radius:1px;animation:confetti-b 3.6s ease-in infinite .3s"></div>
      <div style="position:absolute;top:0;left:72%;width:8px;height:8px;background:#fb923c;border-radius:50%;animation:confetti-a 3s ease-in infinite .8s"></div>
      <div style="position:absolute;top:0;left:83%;width:6px;height:14px;background:#e879f9;border-radius:3px;animation:confetti-b 2.7s ease-in infinite 1.4s"></div>
      <div style="position:absolute;top:0;left:93%;width:7px;height:7px;background:#a3e635;border-radius:2px;animation:confetti-a 3.9s ease-in infinite .5s"></div>

      <!-- Floating balloons row (top) -->
      <div style="margin-bottom:4px;font-size:26px;letter-spacing:6px">
        <span style="display:inline-block;animation:balloon-bob 2.2s ease-in-out infinite 0s">🎈</span>
        <span style="display:inline-block;animation:balloon-bob 2.2s ease-in-out infinite .35s">🎈</span>
        <span style="display:inline-block;animation:balloon-bob 2.2s ease-in-out infinite .7s">🎈</span>
        <span style="display:inline-block;animation:balloon-bob 2.2s ease-in-out infinite 1.05s">🎈</span>
        <span style="display:inline-block;animation:balloon-bob 2.2s ease-in-out infinite 1.4s">🎈</span>
      </div>

      <!-- 3-D Floating Cake -->
      <div style="margin:8px 0 6px;display:inline-block;animation:float 3s ease-in-out infinite;filter:drop-shadow(0 16px 32px rgba(0,0,0,.5)) drop-shadow(0 0 20px rgba(251,191,36,.3))">
        <div style="font-size:88px;line-height:1;display:block;transform:perspective(300px) rotateX(18deg) rotateY(-6deg)">🎂</div>
      </div>

      <!-- Sparkles flanking cake -->
      <div style="font-size:18px;margin:0 0 4px;animation:sparkle 2s ease-in-out infinite .4s">✨ ⭐ ✨</div>

      <!-- HAPPY BIRTHDAY title with glow -->
      <h1 style="margin:10px 0 4px;font-size:38px;font-weight:900;letter-spacing:3px;color:#fff;animation:glow 3s ease-in-out infinite;font-family:'Segoe UI',Arial,sans-serif;text-transform:uppercase">
        Happy Birthday!
      </h1>

      <!-- Company shimmer line -->
      <p style="margin:6px 0 0;font-size:14px;font-weight:700;letter-spacing:2px;background:linear-gradient(90deg,rgba(255,255,255,.5),#fff,rgba(196,165,253,.95),#fff,rgba(255,255,255,.5));background-size:300% auto;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:shimmer 3.5s linear infinite;text-transform:uppercase">
        ${companyName}
      </p>
    </div>

    <!-- ── BODY ── -->
    <div style="background:linear-gradient(180deg,#13002e 0%,#1a0d3d 60%,#0f1941 100%);padding:36px 28px 32px">

      <!-- Greeting -->
      <h2 style="margin:0 0 14px;font-size:26px;color:#e9d5ff;font-weight:800">Dear ${name}, 🌟</h2>

      <p style="font-size:15px;color:#c4b5fd;line-height:1.85;margin:0 0 14px">
        On behalf of the entire team at <strong style="color:#e9d5ff">${companyName}</strong>, we send you
        our warmest and most heartfelt birthday wishes on this truly special day! 🎉
      </p>

      <p style="font-size:15px;color:#c4b5fd;line-height:1.85;margin:0 0 24px">
        You are not just a valued colleague — you are a cherished part of our family.
        Your energy, dedication, and wonderful spirit make every day brighter for everyone around you.
      </p>

      <!-- ── 3-D Wishes Card ── -->
      <div style="margin:0 0 24px;border-radius:20px;border:1px solid rgba(167,139,250,.35);background:linear-gradient(135deg,#2e1065,#4c1d95 50%,#3730a3);padding:28px 24px;text-align:center;box-shadow:0 16px 48px rgba(109,40,217,.5),inset 0 1px 0 rgba(255,255,255,.08);transform:perspective(600px) rotateX(2deg)">
        <div style="font-size:32px;margin-bottom:10px;animation:float 2.5s ease-in-out infinite">🌟</div>
        <p style="font-size:16px;font-weight:700;color:#ede9fe;line-height:1.7;margin:0 0 12px;font-style:italic">
          "May this birthday mark the beginning of a wonderful year overflowing with success, joy, good health, and every dream your heart holds!"
        </p>
        <div style="font-size:22px;animation:balloon-bob 3s ease-in-out infinite">🎊 &nbsp;✨&nbsp; 🎊</div>
      </div>

      <!-- ── 3 Achievement Badges ── -->
      <table style="width:100%;border-collapse:separate;border-spacing:10px;margin:0 0 24px">
        <tr>
          <td style="background:linear-gradient(135deg,#7c2d12,#c2410c);border-radius:16px;padding:16px 10px;text-align:center;box-shadow:0 8px 24px rgba(194,65,12,.35);border:1px solid rgba(251,146,60,.3);animation:badge-pop 3s ease-in-out infinite 0s">
            <div style="font-size:26px;margin-bottom:4px">🎯</div>
            <div style="font-size:11px;font-weight:800;color:#fed7aa;letter-spacing:1px">VALUED</div>
            <div style="font-size:10px;color:#fdba74;margin-top:2px">Team Member</div>
          </td>
          <td style="background:linear-gradient(135deg,#1e3a5f,#1d4ed8);border-radius:16px;padding:16px 10px;text-align:center;box-shadow:0 8px 24px rgba(29,78,216,.35);border:1px solid rgba(96,165,250,.3);animation:badge-pop 3s ease-in-out infinite .6s">
            <div style="font-size:26px;margin-bottom:4px">⭐</div>
            <div style="font-size:11px;font-weight:800;color:#bfdbfe;letter-spacing:1px">STAR</div>
            <div style="font-size:10px;color:#93c5fd;margin-top:2px">Performer</div>
          </td>
          <td style="background:linear-gradient(135deg,#14532d,#16a34a);border-radius:16px;padding:16px 10px;text-align:center;box-shadow:0 8px 24px rgba(22,163,74,.35);border:1px solid rgba(74,222,128,.3);animation:badge-pop 3s ease-in-out infinite 1.2s">
            <div style="font-size:26px;margin-bottom:4px">💎</div>
            <div style="font-size:11px;font-weight:800;color:#bbf7d0;letter-spacing:1px">CHERISHED</div>
            <div style="font-size:10px;color:#86efac;margin-top:2px">Part of Family</div>
          </td>
        </tr>
      </table>

      <p style="font-size:15px;color:#c4b5fd;line-height:1.85;margin:0 0 8px">
        Take a moment today to celebrate yourself — because you deserve it more than anyone!
        May all your dreams come alive and this new year of life bring you endless reasons to smile. 🥂
      </p>

      <!-- Divider -->
      <div style="border-top:1px solid rgba(167,139,250,.2);margin:24px 0"></div>

      <!-- Signature -->
      <p style="font-size:15px;font-weight:700;color:#a5b4fc;margin:0 0 4px">With lots of love &amp; warm wishes,</p>
      <p style="font-size:17px;font-weight:900;color:#e9d5ff;margin:0">Team ${companyName} 🎈</p>
    </div>

    <!-- ── FOOTER ── -->
    <div style="background:#07031a;padding:18px 28px;text-align:center;border-top:1px solid rgba(109,40,217,.2)">
      <div style="font-size:20px;letter-spacing:6px;margin-bottom:8px;animation:sparkle 3s ease-in-out infinite">🎂 🎉 🎊 🎈 ⭐</div>
      <p style="font-size:11px;color:rgba(139,92,246,.6);margin:0;letter-spacing:.5px">
        Automated birthday greeting · ${companyName} ERP System
      </p>
    </div>
  </div>

  <div style="text-align:center;font-size:11px;letter-spacing:20px;color:rgba(196,165,253,.3);margin-top:8px;animation:sparkle 4s ease-in-out infinite .5s">✦ ✦ ✦ ✦ ✦</div>
</div>
</body>
</html>`;

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

module.exports = { initBirthdayAnniversary, runBirthdayAnniversary, getTodayCelebrations, birthdayEmailHtml, anniversaryEmailHtml, ORDINAL };
