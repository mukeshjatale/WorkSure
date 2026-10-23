const bcrypt = require('bcrypt');
const { query, withTransaction } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/respond');

const BCRYPT_ROUNDS = 12;
const DASHBOARDS = {
  customer: 'customer-dashboard.html',
  worker: 'worker-dashboard.html',
  admin: 'admin-dashboard.html'
};

// Used when the email does not exist, so the response time looks the same (hides which emails are registered).
let dummyHash = null;
const getDummyHash = () => dummyHash || (dummyHash = bcrypt.hashSync('not-a-real-password-1', BCRYPT_ROUNDS));

const publicUser = (u) => ({
  id: u.id, fullName: u.full_name, email: u.email, phone: u.phone, role: u.role,
  createdAt: u.created_at, redirect: DASHBOARDS[u.role]
});

// Start a fresh session (prevents "session fixation") and remember who logged in.
function startSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.user = { id: user.id, role: user.role };
      req.session.save((err2) => (err2 ? reject(err2) : resolve()));
    });
  });
}

exports.register = asyncHandler(async (req, res) => {
  const { fullName, email, phone, password, role } = req.valid;

  const existing = await query('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length) throw new ApiError(409, 'An account with this email already exists', { email: 'Email already registered' });

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  let userId;
  try {
    userId = await withTransaction(async (conn) => {
      const [r] = await conn.execute(
        'INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
        [fullName, email, phone, hash, role]);
      if (role === 'worker') {
        // Every worker gets an (unverified) profile row; the admin verifies it later.
        await conn.execute('INSERT INTO worker_profiles (user_id) VALUES (?)', [r.insertId]);
      }
      return r.insertId;
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new ApiError(409, 'An account with this email already exists', { email: 'Email already registered' });
    throw err;
  }

  const rows = await query('SELECT * FROM users WHERE id = ?', [userId]);
  await startSession(req, rows[0]);
  return created(res, publicUser(rows[0]), 'Account created successfully');
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.valid;
  const rows = await query('SELECT * FROM users WHERE email = ?', [email]);
  const user = rows[0];

  const match = await bcrypt.compare(password, user ? user.password_hash : getDummyHash());
  if (!user || !match) throw new ApiError(401, 'Incorrect email or password');
  if (!user.is_active) throw new ApiError(403, 'This account has been deactivated. Please contact support');

  await startSession(req, user);
  return ok(res, publicUser(user), 'Logged in successfully');
});

exports.logout = asyncHandler(async (req, res) => {
  await new Promise((resolve) => req.session.destroy(resolve));
  res.clearCookie('worksure.sid');
  return ok(res, null, 'Logged out');
});

exports.me = asyncHandler(async (req, res) => {
  const rows = await query('SELECT * FROM users WHERE id = ?', [req.user.id]);
  return ok(res, publicUser(rows[0]));
});

exports.updateMe = asyncHandler(async (req, res) => {
  const { fullName, phone } = req.valid; // email and role are NOT editable here (prevents mass assignment)
  await query('UPDATE users SET full_name = ?, phone = ? WHERE id = ?', [fullName, phone, req.user.id]);
  const rows = await query('SELECT * FROM users WHERE id = ?', [req.user.id]);
  return ok(res, publicUser(rows[0]), 'Profile updated');
});

exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.valid;
  const rows = await query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  const match = await bcrypt.compare(currentPassword, rows[0].password_hash);
  if (!match) throw new ApiError(400, 'Current password is incorrect', { currentPassword: 'Incorrect password' });
  const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
  return ok(res, null, 'Password changed');
});

exports.DASHBOARDS = DASHBOARDS;
