// Batch 2: sends the Send Drive / PDF Toolkit announcement to an arbitrary
// recipient list passed at runtime (not hardcoded, to avoid persisting
// employee PII in source control). Pass RECIPIENTS_JSON as an env var,
// e.g. RECIPIENTS_JSON='[{"name":"...","email":"..."}]' node scripts/announce-senddrive-pdftools-batch2.js
const { pool } = require('../src/config/database');
const { sendMail } = require('../src/services/mail.service');
const { buildMail } = require('./announce-senddrive-pdftools');

function loadRecipients() {
  const raw = process.env.RECIPIENTS_JSON;
  if (!raw) {
    throw new Error('RECIPIENTS_JSON env var is required, e.g. RECIPIENTS_JSON=\'[{"name":"...","email":"..."}]\'');
  }
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.length) throw new Error('RECIPIENTS_JSON must be a non-empty array');
  return parsed;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const recipients = loadRecipients();

  if (dryRun) {
    console.log(`[dry-run] Would email ${recipients.length} users:`);
    console.table(recipients);
    return;
  }

  const mail = buildMail();
  const summary = [];
  for (const r of recipients) {
    const result = await sendMail({ to: r.email, subject: mail.subject, html: mail.html, text: mail.text });
    summary.push({
      name: r.name,
      email: r.email,
      sent: result.sent,
      provider: result.results?.find(x => x.sent)?.provider || null,
      reason: result.reason || null,
    });
  }

  console.table(summary);
  console.log(JSON.stringify({ attempted: summary.length, sent: summary.filter(r => r.sent).length }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
