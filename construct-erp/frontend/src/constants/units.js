// Comprehensive construction industry unit list — shared across all modules
export const CONSTRUCTION_UNITS = [
  // Count / General
  'Nos', 'Pcs', 'Each', 'Set', 'Pairs', 'Lot', 'LS',

  // Length
  'MTR', 'RMT', 'RFT', 'Feet', 'Inch', 'CM', 'MM', 'KM', 'Yard',

  // Area
  'SQM', 'SQFT', 'SQY',

  // Volume
  'CUM', 'CFT', 'Brass',

  // Weight
  'KG', 'Grams', 'MT', 'Ton', 'QTL',

  // Liquid / Chemical
  'Ltr', 'ML', 'KL', 'Gallon',

  // Packaging / Forms
  'Bags', 'Bundle', 'Roll', 'Coil', 'Drum', 'Box', 'Packet', 'Sheet',
  'Sack', 'Can', 'Tube',

  // Time-based
  'Day', 'Week', 'Month',

  // Site / Work-specific
  'Point', 'Trip', 'Load', 'Joint',
];

// Common unit aliases → canonical CONSTRUCTION_UNITS value. Keys are normalised
// (lower-cased, dots/spaces stripped) so "Cu.M", "cu m", "m3", "M³" all map to CUM.
const UNIT_ALIASES = {
  cum: 'CUM', cubm: 'CUM', m3: 'CUM', cubicmeter: 'CUM', cubicmetre: 'CUM',
  cft: 'CFT', cubicfeet: 'CFT', cuft: 'CFT',
  sqm: 'SQM', m2: 'SQM', squaremeter: 'SQM', squaremetre: 'SQM',
  sqft: 'SQFT', ft2: 'SQFT', squarefeet: 'SQFT',
  sqy: 'SQY', sqyd: 'SQY', squareyard: 'SQY',
  mtr: 'MTR', m: 'MTR', meter: 'MTR', metre: 'MTR', mts: 'MTR',
  rmt: 'RMT', rm: 'RMT', runningmeter: 'RMT', runningmetre: 'RMT',
  rft: 'RFT', runningfeet: 'RFT',
  ft: 'Feet', feet: 'Feet',
  kg: 'KG', kgs: 'KG', kilogram: 'KG', kilograms: 'KG',
  mt: 'MT', tonne: 'MT', tonnes: 'MT', metricton: 'MT',
  ton: 'Ton', tons: 'Ton',
  qtl: 'QTL', quintal: 'QTL',
  nos: 'Nos', no: 'Nos', number: 'Nos', unit: 'Nos', units: 'Nos',
  pcs: 'Pcs', pc: 'Pcs', piece: 'Pcs', pieces: 'Pcs',
  each: 'Each', ea: 'Each',
  ltr: 'Ltr', lit: 'Ltr', litre: 'Ltr', liter: 'Ltr', l: 'Ltr', litres: 'Ltr', liters: 'Ltr',
  ml: 'ML', kl: 'KL',
  bag: 'Bags', bags: 'Bags',
  bundle: 'Bundle', bdl: 'Bundle',
  box: 'Box', boxes: 'Box',
  roll: 'Roll', rolls: 'Roll',
  drum: 'Drum', drums: 'Drum',
  sheet: 'Sheet', sheets: 'Sheet',
  ls: 'LS', lumpsum: 'LS', lot: 'Lot',
};

// Maps any free-form unit string to its canonical CONSTRUCTION_UNITS entry so it
// matches a dropdown <option>. Falls back to the trimmed original when unknown.
export function normalizeUnit(raw) {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  // Exact match (already canonical)
  if (CONSTRUCTION_UNITS.includes(trimmed)) return trimmed;
  const key = trimmed.toLowerCase().replace(/[\s.\-_/]/g, '').replace(/[³]/g, '3').replace(/[²]/g, '2');
  if (UNIT_ALIASES[key]) return UNIT_ALIASES[key];
  // Case-insensitive match against canonical list (e.g. "cum" → "CUM", "bags" → "Bags")
  const ci = CONSTRUCTION_UNITS.find(u => u.toLowerCase() === trimmed.toLowerCase());
  return ci || trimmed;
}
