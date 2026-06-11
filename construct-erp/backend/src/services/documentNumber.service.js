const DOC_NUMBER_TARGETS = {
  purchase_orders: { column: 'po_number', docType: 'PO', defaultSeries: 'DQS' },
  work_orders: { column: 'wo_number', docType: 'WO', defaultSeries: 'DQS' },
};

// Per-project numbering series, keyed by projects.project_code — overrides the default series.
const PROJECT_SERIES = {
  'LH-10':     'LANLH10',
  'WDIRY0151': 'DQS',      // Yelahanka — always PODQS / WODQS
  'DQSTWR001': 'DQS',      // DQS Towers — PODQS / WODQS series
};

async function getNextDqsNumber(client, targetName, projectCode) {
  const target = DOC_NUMBER_TARGETS[targetName];
  if (!target) throw new Error(`Unsupported document number target: ${targetName}`);

  const series = PROJECT_SERIES[projectCode] || target.defaultSeries;
  const prefix = `${target.docType}${series}`;

  await client.query(`LOCK TABLE ${targetName} IN SHARE ROW EXCLUSIVE MODE`);

  const result = await client.query(
    `SELECT COALESCE(MAX((substring(UPPER(TRIM(${target.column})) FROM $1))::int), 0) + 1 AS next_seq
     FROM ${targetName}
     WHERE UPPER(TRIM(${target.column})) ~ $2`,
    [`^${prefix}0*([0-9]+)$`, `^${prefix}0*[0-9]+$`]
  );

  const nextSeq = Number(result.rows[0]?.next_seq || 1);
  return `${prefix}${String(nextSeq).padStart(3, '0')}`;
}

module.exports = { getNextDqsNumber };
