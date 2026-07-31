// src/routes/copilot.routes.js
// AI Copilot (Bill Tracker + HR Admin). Read-only, tool-calling chat over
// vendor bill data and HR/employee data. Access is restricted server-side —
// the frontend trigger is hidden for other roles, but that's a convenience
// only; this middleware is the real access boundary. HR tools apply a
// further per-tool role check (see HR_ALLOWED_ROLES in copilot.service.js)
// since not every role allowed in here should see employee data.
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { loadProjectScope } = require('../middleware/projectScope');
const copilotService = require('../services/copilot.service');

const router = express.Router();

const ALLOWED_ROLES = ['super_admin', 'managing_director', 'finance_manager', 'accountant', 'procurement_manager',
  'hr', 'hr_admin', 'hr_manager'];

function requireCopilotAccess(req, res, next) {
  const role = String(req.user?.role || '').toLowerCase();
  if (ALLOWED_ROLES.includes(role)) return next();
  return res.status(403).json({ error: 'Copilot access is restricted to MD, Procurement, Finance/Accounts, HR, and Super Admin.' });
}

router.use(authenticate);
router.use(loadProjectScope);
router.use(requireCopilotAccess);

router.post('/chat', async (req, res) => {
  try {
    const { message, history, project_id } = req.body;
    const reply = await copilotService.chat({ req, message, history, projectId: project_id });
    res.json({ reply });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;
