const { query, pool } = require('../src/config/database');
const { sendMail } = require('../src/services/mail.service');

const SUBJECT = 'New Tools on ConstructERP — Send Drive & BCIM PDF Toolkit';

function buildMail() {
  const text = [
    'Dear Team,',
    '',
    'Two new tools are now available, accessible from floating buttons on the bottom-right of every ConstructERP screen.',
    '',
    '-- SEND DRIVE (green button) -- https://senddrive.bcim.in/',
    'For sending large files that do not fit in email, WhatsApp, or chat.',
    '  - No login needed - enter your email, upload your files, get a shareable link',
    '  - Optional password protection on any transfer',
    '  - Link stays valid for 7 days by default (extendable up to 30)',
    '  - Opening it from the ERP pre-fills your email automatically',
    '',
    '-- BCIM PDF TOOLKIT (red button) -- https://pdf.bcim.in/',
    'All-in-one PDF editor, 100% on-device -- your files never leave your computer.',
    '  Organize        : Merge, Split, Remove/Extract Pages, Rotate, Reorder, Crop, Compare',
    '  Convert to PDF  : Word, Excel, Image, HTML',
    '  Convert from PDF: Word, Excel, JPG, Text',
    '  Optimize        : Compress, Repair, OCR (scanned docs), Flatten',
    '  Security        : Password Protect, Sign, Redact',
    '  Edit            : Edit, Annotate, Fillable Forms, Links, Watermark, Page Numbers, Header/Footer',
    '  Max file size 100 MB, drag-and-drop, works best on Chrome/Edge',
    '',
    'Regards,',
    'BCIM ERP Administration',
  ].join('\n');

  const section = (title, color, rows) => `
    <div style="color:${color};font-size:15px;font-weight:700;margin:22px 0 10px">${title}</div>
    <ul style="margin:0;padding-left:20px;font-size:13px;color:#334155;line-height:1.7">
      ${rows.map(([k, v]) => `<li><strong>${k}</strong> — ${v}</li>`).join('')}
    </ul>`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#0f172a">
      <div style="background:#0a2057;padding:24px 32px;border-radius:8px 8px 0 0">
        <p style="color:#cbd5e1;font-size:12px;margin:0 0 4px;letter-spacing:0.05em;text-transform:uppercase">BCIM ConstructERP</p>
        <h2 style="color:#ffffff;margin:0;font-size:22px;font-weight:700">New Tools Available</h2>
      </div>
      <div style="background:#ffffff;padding:28px 32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
        <p style="margin-top:0">Dear Team,</p>
        <p style="color:#475569;line-height:1.6">
          Two new tools are now available, accessible from floating buttons on the bottom-right of every ConstructERP screen.
        </p>

        <div style="background:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px;padding:14px 18px;margin:18px 0 6px">
          <p style="margin:0;font-size:15px;font-weight:700;color:#15803d">Send Drive (green button)</p>
          <p style="margin:4px 0 0;font-size:13px;color:#475569">
            <a href="https://senddrive.bcim.in/" style="color:#15803d;text-decoration:none;font-weight:600">https://senddrive.bcim.in/</a>
            — for sending large files that don't fit in email, WhatsApp, or chat.
          </p>
        </div>
        <ul style="margin:6px 0 0;padding-left:20px;font-size:13px;color:#334155;line-height:1.7">
          <li>No login needed — enter your email, upload your files, get a shareable link</li>
          <li>Optional password protection on any transfer</li>
          <li>Link stays valid for 7 days by default (extendable up to 30)</li>
          <li>Opening it from the ERP pre-fills your email automatically</li>
        </ul>

        <div style="background:#fef2f2;border-left:4px solid #dc2626;border-radius:6px;padding:14px 18px;margin:24px 0 6px">
          <p style="margin:0;font-size:15px;font-weight:700;color:#b91c1c">BCIM PDF Toolkit (red button)</p>
          <p style="margin:4px 0 0;font-size:13px;color:#475569">
            <a href="https://pdf.bcim.in/" style="color:#b91c1c;text-decoration:none;font-weight:600">https://pdf.bcim.in/</a>
            — all-in-one PDF editor, 100% on-device. Your files never leave your computer.
          </p>
        </div>

        ${section('Organize', '#6d28d9', [
          ['Merge / Split', 'Combine PDFs or break one apart by page'],
          ['Remove / Extract Pages', 'Delete unwanted pages or save selected ones'],
          ['Rotate / Reorder / Crop', 'Fix orientation, rearrange, trim margins'],
          ['Compare', 'See text differences between two PDFs'],
        ])}
        ${section('Convert', '#0f766e', [
          ['To PDF', 'Word, Excel, Image (JPG/PNG/WebP), HTML'],
          ['From PDF', 'Word, Excel, JPG, Text'],
        ])}
        ${section('Optimize', '#059669', [
          ['Compress / Repair', 'Reduce size or fix corrupted files'],
          ['OCR', 'Make scanned PDFs searchable'],
          ['Flatten', 'Burn form fields and annotations into pages'],
        ])}
        ${section('Security & Edit', '#c2410c', [
          ['Protect / Sign / Redact', 'Password-protect, e-sign, or black out content'],
          ['Edit / Annotate', 'Add text, images, highlights, notes'],
          ['Watermark / Page Numbers / Header-Footer', 'Stamp and label your document'],
        ])}

        <p style="font-size:12px;color:#94a3b8;margin:22px 0 0">
          Max file size 100 MB · drag-and-drop supported · works best on Chrome or Microsoft Edge.
        </p>

        <hr style="border:none;border-top:1px solid #e2e8f0;margin:22px 0 14px">
        <p style="font-size:14px;color:#334155;margin:0">Regards,<br><strong>BCIM ERP Administration</strong></p>
      </div>
    </div>
  `;

  return { subject: SUBJECT, text, html };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const usersRes = await query(`
    SELECT id, name, email, company_id
    FROM users
    WHERE is_active = TRUE
      AND email IS NOT NULL
      AND BTRIM(email) <> ''
    ORDER BY name ASC
  `);
  const allUsers = usersRes.rows;
  // Users without a real company email (identified by an @hr.local placeholder
  // keyed to their employee code) can't receive mail, but still get the bell notification.
  const mailableUsers = allUsers.filter(u => !/@hr\.local$/i.test(u.email));

  if (dryRun) {
    console.log(`[dry-run] Would email ${mailableUsers.length} of ${allUsers.length} active users (excluding @hr.local placeholders):`);
    console.table(mailableUsers.map(u => ({ name: u.name, email: u.email })));
    return;
  }

  const mail = buildMail();
  const summary = [];
  for (const user of mailableUsers) {
    const result = await sendMail({ to: user.email, subject: mail.subject, html: mail.html, text: mail.text });
    summary.push({
      name: user.name,
      email: user.email,
      sent: result.sent,
      provider: result.results?.find(r => r.sent)?.provider || null,
      reason: result.reason || null,
    });
  }

  const companyIds = [...new Set(allUsers.map(u => u.company_id).filter(Boolean))];
  for (const companyId of companyIds) {
    await query(
      `INSERT INTO notifications (company_id, user_id, target_role, type, title, message, severity)
       VALUES ($1, NULL, NULL, 'announcement', $2, $3, 'info')`,
      [companyId, SUBJECT, "New Send Drive and BCIM PDF Toolkit tools are now available — see the floating buttons at the bottom-right of your screen."]
    );
  }

  console.table(summary);
  console.log(JSON.stringify({ attempted: summary.length, sent: summary.filter(r => r.sent).length, notifiedCompanies: companyIds.length }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
