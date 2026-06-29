const BOQ_COST_HEADS = [
  'Sub Con',
  'Supervision & Accommodation',
  'EPF, PT & Insurance',
  'Office Items & Camp Expenses',
  'Travel & Transport',
  'Concrete Material',
  'Steel',
  'Blocks',
  'Cement',
  'Sand',
  'Materials / Consumables',
  'Safety Items',
  'Testing',
  'Debris Disposal',
  'Equipment & Rentals',
  'Power & Water',
  'Overhead',
  'Petty Cash',
  'Profit',
  'Contingency',
];

// Legacy names kept so old DB records still resolve
const BOQ_COST_HEADS_ALL = [
  ...BOQ_COST_HEADS,
  'Supervision', // renamed to Supervision & Accommodation
];

// Keyword → cost head mapping for auto-classifying material/item names.
// Order matters — first match wins.
const ITEM_KW_COST_HEAD = [
  // Concrete materials (M-grade concrete, RMC) — must come before Cement & Blocks
  [/\bready.?mix\b|rmcc|\brmc\b|concrete.?material|\bm[\s-]?(?:10|15|20|25|30|35|40)\b/i, 'Concrete Material'],
  // Blocks — "Cement Concrete Blocks" must match here before Cement rule
  [/\bblocks?\b|fly.?ash.?brick|aac.?blocks?|paving.?blocks?/i,                             'Blocks'],
  // Cement (standalone bags/supply — not "cement concrete blocks")
  [/\bcement\b/i,                                                                            'Cement'],
  // Sand
  [/\bm[\s-]?sand\b|river.?sand|fine.?aggre|p[\s-]?sand/i,                                 'Sand'],
  [/\bsand\b/i,                                                                              'Sand'],
  // Steel — TMT bars only; exclude "cutting wheel", "binding wire", "nails"
  [/tmt|rebar|\bms.?bar\b|iron.?rod|fe[\s-]?(?:415|500|550)\b|\btmt.?bar|\bsteel\b.*\b(?:bar|rod|tmt|grade|mm)\b/i, 'Steel'],
  // Safety
  [/safety|helmet|glove|shoe|boot|jacket|vest|harness|\bppe\b|ear.?plug|nose.?mask|goggle|reflective/i, 'Safety Items'],
  // Testing
  [/\btest(?:ing)?\b|cube.?test|soil.?test|\bndt\b|trial.?mix/i,                           'Testing'],
  // Debris / demolition
  [/debris|demolish|rubble|disposal|waste.?remov/i,                                         'Debris Disposal'],
  // Equipment & rentals (machines, shuttering, scaffolding)
  [/\bdrilling.?machine\b|chipping.?machine|vibrator|shuttering|formwork|scaffolding|pump(?:ing)?\b|mixer\b|crane\b|\bjcb\b|excavat|plywood.*shutt|shutt.*plywood/i, 'Equipment & Rentals'],
  // Power & water — electrical fittings, lighting, hose pipes
  [/\bcable\b|socket\b|mcb\b|elcb\b|\bswitch\b|conduit|junction.?box|led\b.*light|tube.?light|flood.?light|\bbulb\b|electrical\b|curing.?hose|water.?pipe|\bhose.?pipe\b|water.?tank/i, 'Power & Water'],
  // Travel & transport
  [/transport(?:ation)?|freight|\bloading\b|\bunloading\b|cartage|vehicle.?hire|halting.?charge/i, 'Travel & Transport'],
  // Office / camp
  [/stationery|stationary|printing|\bpaper\b|\bpen\b|\bfile\b|\bregister\b|printer|photocopy/i, 'Office Items & Camp Expenses'],
  // Overhead
  [/broom|dustbin|cleaning|pantry|\btea\b|\bcoffee\b|\bsoap\b|\btissue\b/i,               'Overhead'],
];

/**
 * Auto-classify an item/material name to a BOQ cost head.
 * Returns the matched cost head string, or 'Materials / Consumables' as default.
 */
function classifyItemCostHead(itemName = '') {
  const s = (itemName || '').trim();
  for (const [re, head] of ITEM_KW_COST_HEAD) {
    if (re.test(s)) return head;
  }
  return 'Materials / Consumables';
}

// Heads that contribute to the Profit calculation (1–18, all except Profit and Contingency)
const PROFIT_BASE_HEADS = BOQ_COST_HEADS.filter(h => h !== 'Profit' && h !== 'Contingency');
const PROFIT_PCT = 0.10;

module.exports = { BOQ_COST_HEADS, BOQ_COST_HEADS_ALL, PROFIT_BASE_HEADS, PROFIT_PCT, classifyItemCostHead };
