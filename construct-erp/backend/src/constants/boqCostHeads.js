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

module.exports = { BOQ_COST_HEADS, BOQ_COST_HEADS_ALL };
