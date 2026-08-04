// src/routes/inventoryAsset.routes.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { query } = require('../config/database');

router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const { project_id } = req.query;
    let sql = `SELECT i.*, p.name AS project_name
               FROM inventory i
               JOIN projects p ON i.project_id = p.id
               WHERE p.company_id = $1`;
    const params = [req.user.company_id];
    let idx = 2;
    if (project_id) { sql += ` AND i.project_id = $${idx++}`; params.push(project_id); }
    sql += ' ORDER BY i.material_name';
    res.json({ data: (await query(sql, params)).rows });
  } catch (err) {
    console.error('inventoryAsset GET /:', err.message);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

router.post('/issue', async (req, res) => {
  try {
    const { inventory_id, quantity, issued_to, project_id, remarks } = req.body;
    if (!inventory_id || !quantity || !project_id) {
      return res.status(400).json({ error: 'inventory_id, quantity and project_id are required' });
    }
    const inv = await query('SELECT * FROM inventory WHERE id = $1', [inventory_id]);
    if (!inv.rows[0]) return res.status(404).json({ error: 'Inventory item not found' });
    if (parseFloat(inv.rows[0].closing_stock) < parseFloat(quantity)) {
      return res.status(400).json({ error: `Insufficient stock. Available: ${inv.rows[0].closing_stock}` });
    }
    const newStock = parseFloat(inv.rows[0].closing_stock) - parseFloat(quantity);
    await query('UPDATE inventory SET closing_stock = $1, last_updated = NOW() WHERE id = $2', [newStock, inventory_id]);
    const tx = await query(
      `INSERT INTO stock_transactions
         (project_id, inventory_id, transaction_type, quantity, issued_to, remarks, transacted_by)
       VALUES ($1, $2, 'issue', $3, $4, $5, $6) RETURNING *`,
      [project_id, inventory_id, quantity, issued_to, remarks, req.user.id]
    );
    res.json({ message: 'Material issued', new_stock: newStock, transaction: tx.rows[0] });
  } catch (err) {
    console.error('inventoryAsset POST /issue:', err.message);
    res.status(500).json({ error: 'Failed to issue material' });
  }
});

router.post('/transfer', async (req, res) => {
  try {
    const { material_name, quantity, from_project_id, to_project_id, unit } = req.body;
    if (!material_name || !quantity || !from_project_id || !to_project_id) {
      return res.status(400).json({ error: 'material_name, quantity, from_project_id and to_project_id are required' });
    }
    await query(
      `UPDATE inventory SET closing_stock = closing_stock - $1, last_updated = NOW()
       WHERE project_id = $2 AND material_name = $3`,
      [quantity, from_project_id, material_name]
    );
    await query(
      `INSERT INTO inventory (project_id, material_name, unit, site_location, opening_stock, closing_stock)
       VALUES ($1, $2, $3, 'main', 0, $4)
       ON CONFLICT (project_id, material_name, site_location)
       DO UPDATE SET closing_stock = inventory.closing_stock + $4, last_updated = NOW()`,
      [to_project_id, material_name, unit || 'Nos', quantity]
    );
    res.json({ message: `Transferred ${quantity} ${unit} of ${material_name}` });
  } catch (err) {
    console.error('inventoryAsset POST /transfer:', err.message);
    res.status(500).json({ error: 'Failed to transfer material' });
  }
});

module.exports = router;
