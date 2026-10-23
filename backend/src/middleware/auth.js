const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// Must be logged in. We also re-check the database on every request so that
// an account the admin deactivated loses access immediately.
const requireAuth = asyncHandler(async (req, res, next) => {
  const sessionUser = req.session && req.session.user;
  if (!sessionUser) throw new ApiError(401, 'Please log in to continue');

  const rows = await query('SELECT id, full_name, email, role, is_active FROM users WHERE id = ?', [sessionUser.id]);
  const user = rows[0];
  if (!user || !user.is_active) {
    await new Promise((resolve) => req.session.destroy(resolve));
    throw new ApiError(401, 'Your session has ended. Please log in again');
  }
  req.user = { id: user.id, fullName: user.full_name, email: user.email, role: user.role };
  next();
});

// Role check. Always use AFTER requireAuth:  router.get('/x', requireAuth, requireRole('admin'), handler)
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(new ApiError(401, 'Please log in to continue'));
  if (!roles.includes(req.user.role)) return next(new ApiError(403, 'You do not have permission to do this'));
  next();
};

// Like requireAuth but does not fail for guests (used for public pages that may show extra info).
const optionalAuth = asyncHandler(async (req, res, next) => {
  const sessionUser = req.session && req.session.user;
  if (sessionUser) {
    const rows = await query('SELECT id, full_name, email, role, is_active FROM users WHERE id = ?', [sessionUser.id]);
    if (rows[0] && rows[0].is_active) {
      req.user = { id: rows[0].id, fullName: rows[0].full_name, email: rows[0].email, role: rows[0].role };
    }
  }
  next();
});

module.exports = { requireAuth, requireRole, optionalAuth };
