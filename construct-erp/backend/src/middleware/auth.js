// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

// "MD" and "Managing Director" are the same role typed differently by different
// admins over time. Canonicalize to 'managing_director' here, once, so every
// downstream role check (whether it lists 'md', 'managing_director', or both)
// agrees — instead of relying on every route file's allowlist staying in sync.
const ROLE_ALIASES = {
  md: 'managing_director',
  'managing director': 'managing_director',
  managingdirector: 'managing_director',
};
const canonicalizeRole = (role) => {
  const key = String(role || '').trim().toLowerCase();
  return ROLE_ALIASES[key] || role;
};

// Verify JWT token
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch fresh user data
    const result = await query(
      'SELECT id, company_id, name, email, role, is_active, vendor_id FROM users WHERE id = $1',
      [decoded.id]
    );

    if (!result.rows[0]) return res.status(401).json({ error: 'User not found.' });
    if (!result.rows[0].is_active) return res.status(401).json({ error: 'Account deactivated.' });

    req.user = result.rows[0];
    req.user.role = canonicalizeRole(req.user.role);

    // Derive privilege flags server-side so they never leak into the frontend bundle.
    // Any email-based executive access is validated here, not in client JS.
    const MD_EXEC_EMAILS = (process.env.MD_EXEC_EMAILS || 'stephen@bcim.in')
      .split(',').map(e => e.trim().toLowerCase());
    const role = req.user.role.toLowerCase();
    req.user.can_access_executive_dashboard =
      ['md', 'managing_director', 'ceo', 'director', 'admin', 'super_admin'].includes(role)
      || MD_EXEC_EMAILS.includes((req.user.email || '').toLowerCase());
    const BUDGET_EMAILS = (process.env.BUDGET_BREAKDOWN_EMAILS || 'stephen@bcim.in')
      .split(',').map(e => e.trim().toLowerCase());
    req.user.can_access_budget_breakdown =
      ['super_admin', 'procurement_manager', 'purchase_executive'].includes(role)
      || BUDGET_EMAILS.includes((req.user.email || '').toLowerCase());
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired. Please login again.' });
    }
    res.status(401).json({ error: 'Invalid token.' });
  }
};

// Role-based access control.
// super_admin is a universal bypass — it is the highest role and must never be
// locked out of a route just because the route's author forgot to list it.
const authorize = (...roles) => {
  // Role values are stored free-text and may differ in case (e.g. "Procurement_manager"),
  // so compare case-insensitively.
  const allowed = roles.map(r => String(r).toLowerCase());
  return (req, res, next) => {
    const userRole = String(req.user.role || '').toLowerCase();
    if (userRole === 'super_admin') return next();
    if (!allowed.includes(userRole)) {
      return res.status(403).json({
        error: `Access denied. Required roles: ${roles.join(', ')}. Your role: ${req.user.role}`
      });
    }
    next();
  };
};

// Check project access (user must be assigned to project or be admin)
const projectAccess = async (req, res, next) => {
  try {
    const projectId = req.params.projectId || req.body.project_id;
    if (!projectId) return next();

    const adminRoles = ['super_admin', 'admin'];
    if (adminRoles.includes(req.user.role)) return next();

    const result = await query(
      `SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2
       UNION
       SELECT 1 FROM projects WHERE id = $1 AND (
         project_manager_id = $2 OR site_engineer_id = $2 OR qs_engineer_id = $2
       )`,
      [projectId, req.user.id]
    );

    if (!result.rows[0]) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { authenticate, authorize, projectAccess, canonicalizeRole };
