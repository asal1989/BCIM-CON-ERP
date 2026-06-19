/**
 * inspect-stock-valuation.js
 *
 * Shows exactly which inventory rows make up the "Stock Value" that the Budget
 * page's Stock on Hand tab displays for a project. Use this when a project that
 * looks empty still shows a non-zero stock value — the culprit is almost always
 * stale `closing_stock` rows in the `inventory` table.
 *
 * Value formula mirrors the app: SUM(closing_stock * COALESCE(unit_rate, 0)).
 *
 * Connects through the app's own config/database.js, so it targets the SAME
 * database the running server uses (local construct_erp, or the cloud DB when
 * DATABASE_URL points at Neon/Render/etc.).
 *
 * Usage (from the backend/ directory):
 *   node scripts/inspect-stock-valuation.js                 # per-project totals (all projects)
 *   node scripts/inspect-stock-valuation.js "dqs"          # row detail for projects matching "dqs"
 */
const { pool, query } = require('../src/config/database');

const nameFilter = process.argv[2] || null;

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

(async () => {
  try {
    // 1) Per-project rollup (always shown)
    const roll = await query(`
      SELECT p.id, p.name,
             COUNT(*)::int                                            AS rows,
             SUM(i.closing_stock)::numeric                            AS total_qty,
             SUM(CASE WHEN i.closing_stock <> 0 THEN 1 ELSE 0 END)::int AS nonzero_rows,
             SUM(i.closing_stock * COALESCE(i.unit_rate, 0))::numeric AS stock_value
      FROM inventory i
      JOIN projects p ON p.id = i.project_id
      ${nameFilter ? 'WHERE p.name ILIKE $1' : ''}
      GROUP BY p.id, p.name
      ORDER BY stock_value DESC NULLS LAST
    `, nameFilter ? [`%${nameFilter}%`] : []);

    if (!roll.rows.length) {
      console.log(nameFilter ? `No projects match "${nameFilter}".` : 'No inventory data found.');
      return;
    }

    console.log('\n=== Stock value per project ===\n');
    for (const r of roll.rows) {
      console.log(`  ${r.name}`);
      console.log(`     rows=${r.rows}  nonzero_qty_rows=${r.nonzero_rows}  total_qty=${fmt(r.total_qty)}  STOCK VALUE=INR ${fmt(r.stock_value)}`);
    }

    // 2) Row-level detail only when a name filter narrows it down
    if (nameFilter) {
      const detail = await query(`
        SELECT p.name AS project_name, i.material_name, i.category,
               i.closing_stock, i.unit_rate,
               (i.closing_stock * COALESCE(i.unit_rate, 0))::numeric AS line_value,
               i.site_location, i.last_updated
        FROM inventory i
        JOIN projects p ON p.id = i.project_id
        WHERE p.name ILIKE $1 AND i.closing_stock <> 0
        ORDER BY line_value DESC NULLS LAST
      `, [`%${nameFilter}%`]);

      console.log(`\n=== Rows contributing value (closing_stock <> 0) — ${detail.rows.length} rows ===\n`);
      for (const r of detail.rows) {
        console.log(`  ${String(r.material_name || '(no name)').slice(0, 36).padEnd(36)} qty=${String(fmt(r.closing_stock)).padStart(12)} rate=${String(fmt(r.unit_rate)).padStart(10)} = INR ${fmt(r.line_value)}  [${r.site_location || '-'}]`);
      }
      if (!detail.rows.length) {
        console.log('  None — every inventory row for this project has closing_stock = 0, so stock value should be INR 0.');
      }
    } else {
      console.log('\nTip: pass a project name (e.g. node scripts/inspect-stock-valuation.js "dqs") to see the individual rows producing the value.');
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
