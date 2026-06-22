// Keyword-based suggestion of a BOQ_COST_HEADS sub-heading (and matching BOQ item)
// from a TQS bill line's item name / category. This only pre-fills an empty
// dropdown — it never overrides a value the user (or a WO auto-link) already set.
// Keyword style mirrors backend/src/routes/budget.routes.js DQS_ACTUALS_SQL
// (a different, unrelated 12-head vocabulary) — only the regex technique is reused.

const COST_HEAD_KEYWORDS = [
  ['Steel', /steel|tmt|rebar|reinforc|fe[0-9]|bar.?bend|bar.?cut/],
  ['Cement', /cement|opc|ppc/],
  ['Concrete Material', /concrete|rmc|ready.?mix|m.?sand|aggregate|crush|coarse/],
  ['Sand', /\bsand\b|river sand|m.?sand/],
  ['Blocks', /block|brick|aac block|fly ?ash brick/],
  ['Safety Items', /safety|ppe|helmet|glove|harness|vest|\bboot\b|goggle|barricad/],
  ['Testing', /testing|inspection|lab test|ndt|ndte/],
  ['Debris Disposal', /debris|disposal|demolition waste|muck/],
  ['Equipment & Rentals', /excavat|jcb|crane|tipper|dump(?:er)?|dozer|grader|roller|compactor|pump|poclain|transit mixer|hire|rental/],
  ['Power & Water', /\bdg\b|generator|diesel|electricity|water tanker|water supply/],
  ['Sub Con', /subcontract|sub.?con/],
  ['Supervision', /supervis/],
  ['Overhead', /overhead|site office|admin/],
  ['Materials / Consumables', /consumable|hardware|fastener|nail|wire mesh|binding wire/],
];

export function guessCostHead(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return null;
  for (const [head, re] of COST_HEAD_KEYWORDS) {
    if (re.test(t)) return head;
  }
  return null;
}

// Given a guessed cost head and the project's BOQ item list, return the single
// BOQ item whose chapter_name/description matches the same keyword pattern —
// only if exactly one matches (ambiguous matches are left for manual pick).
export function guessBoqItem(costHead, boqItems) {
  if (!costHead || !Array.isArray(boqItems) || !boqItems.length) return null;
  const entry = COST_HEAD_KEYWORDS.find(([head]) => head === costHead);
  if (!entry) return null;
  const [, re] = entry;
  const matches = boqItems.filter(b =>
    re.test(String(b.chapter_name || '').toLowerCase()) ||
    re.test(String(b.description || '').toLowerCase())
  );
  return matches.length === 1 ? matches[0] : null;
}
