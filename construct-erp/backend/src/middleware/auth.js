// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

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

module.exports = { authenticate, authorize, projectAccess };
