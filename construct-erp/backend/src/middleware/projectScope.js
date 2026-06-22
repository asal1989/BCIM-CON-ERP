// src/middleware/projectScope.js
// Provides project-level access scoping helpers for non-global roles.

const { query } = require('../config/database');

// Roles that bypass project-level scoping (see everything in the company)
const GLOBAL_ROLES = ['super_admin', 'admin', 'managing_director', 'director', 'ceo', 'cfo', 'md'];

function isGlobalRole(role) {
  return GLOBAL_ROLES.includes(String(role || '').toLowerCase());
}

/**
 * Loads the list of project IDs the current user is allowed to access.
 * Attaches `req.allowedProjectIds` (array of UUID strings) and
 * `req.isGlobalRole` (boolean). For global roles, allowedProjectIds is null
 * (meaning "no restriction").
 */
async function loadProjectScope(req, res, next) {
  try {
    if (!req.user) return next();
    if (isGlobalRole(req.user.role)) {
      req.isGlobalRole = true;
      req.allowedProjectIds = null; // no restriction
      return next();
    }
    const r = await query(
      `SELECT DISTINCT p.id
         FROM projects p
        WHERE p.company_id = $1
          AND (
            p.project_manager_id = $2
            OR p.site_engineer_id = $2
            OR p.qs_engineer_id   = $2
            OR EXISTS (SELECT 1 FROM project_members pmx WHERE pmx.project_id = p.id AND pmx.user_id = $2)
          )`,
      [req.user.company_id, req.user.id]
    );
    req.isGlobalRole = false;
    req.allowedProjectIds = r.rows.map(x => x.id);
    return next();
  } catch (err) {
    next(err);
  }
}

/**
 * Verifies the given project_id is in the user's allowed set.
 * Returns true if allowed, false otherwise.
 */
function userCanAccessProject(req, projectId) {
  if (!projectId) return true; // global queries handled by caller via allowedProjectIds
  if (req.isGlobalRole) return true;
  return Array.isArray(req.allowedProjectIds) && req.allowedProjectIds.includes(projectId);
}

/**
 * Appends a project_id scope clause to a SQL string.
 * - For global roles: returns the SQL/params unchanged.
 * - For scoped users: appends `AND <alias>.project_id = ANY($N::uuid[])`
 *   using the user's allowed project IDs.
 * If the user has zero allowed projects, returns a clause that yields no rows.
 *
 * @param {object} req
 * @param {string} sql        existing SQL string (must already have a WHERE)
 * @param {Array}  params     existing params array
 * @param {string} alias      table alias whose column to scope (default 'p' but commonly 'mr', 'g', etc.)
 * @param {string} column     column name (default 'project_id')
 * @returns {{ sql: string, params: Array }}
 */
function appendProjectScope(req, sql, params, alias, column = 'project_id') {
  if (req.isGlobalRole) return { sql, params };
  const ids = req.allowedProjectIds || [];
  if (ids.length === 0) {
    // user has no project access — force empty result
    return { sql: sql + ' AND FALSE', params };
  }
  params = params.slice();
  params.push(ids);
  const idx = params.length;
  return { sql: sql + ` AND ${alias}.${column} = ANY($${idx}::uuid[])`, params };
}

module.exports = {
  GLOBAL_ROLES,
  isGlobalRole,
  loadProjectScope,
  userCanAccessProject,
  appendProjectScope,
};
