// src/routes/project.routes.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/project.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');

// Add new columns introduced in Project Master redesign
runSchemaInit('projects_extra_columns', async () => {
  await query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS category       VARCHAR(100)`);
  await query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS currency       VARCHAR(10)  DEFAULT 'INR'`);
  await query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS award_date     DATE`);
  await query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS business_unit  VARCHAR(100)`);
  await query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS gst_applicable VARCHAR(10)  DEFAULT 'yes'`);
  await query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS notes          TEXT`);
});

// company_name was added to the block above after 'projects_extra_columns'
// had already run in production — runSchemaInit keys execute exactly once
// ever, so that ALTER never actually applied and every project edit failed
// with "column company_name does not exist". Separate, new key so it runs
// regardless of the old one's already-applied state.
runSchemaInit('projects_company_name_col', async () => {
  await query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS company_name VARCHAR(200)`);
});

router.use(authenticate);
router.get('/', ctrl.getProjects);
router.post('/', authorize('super_admin','admin'), ctrl.createProject);
router.get('/:id', ctrl.getProject);
router.get('/:id/dashboard', ctrl.getProjectDashboard);
router.put('/:id', authorize('super_admin','admin','project_manager'), ctrl.updateProject);
router.delete('/:id', authorize('super_admin','admin'), ctrl.deleteProject);

module.exports = router;
