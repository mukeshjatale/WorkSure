// Administrator endpoints. The router applies requireAuth + requireRole('admin') to ALL of them.
const { query, withTransaction } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/respond');
const bookingService = require('../services/bookingService');
const reviewService = require('../services/reviewService');

async function logAction(adminId, action, targetType, targetId, details = null, conn = null) {
  const sql = 'INSERT INTO admin_logs (admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)';
  const params = [adminId, action, targetType, targetId, details];
  if (conn) await conn.execute(sql, params); else await query(sql, params);
}

const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const pageInfo = (q, def = 20) => {
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || def, 1), 100);
  const page = Math.max(parseInt(q.page, 10) || 1, 1);
  return { limit, page, offset: (page - 1) * limit };
};
const idParam = (req) => {
  const id = parseInt(req.params.id, 10);
  if (!(id > 0)) throw new ApiError(400, 'Invalid id');
  return id;
};

// ---------- statistics ----------
exports.stats = asyncHandler(async (req, res) => {
  const users = await query(`SELECT role, COUNT(*) AS n, SUM(is_active = 0) AS inactive FROM users GROUP BY role`);
  const workers = await query(`SELECT verification_status AS status, COUNT(*) AS n FROM worker_profiles GROUP BY verification_status`);
  const bookings = await query(`SELECT status, COUNT(*) AS n FROM bookings GROUP BY status`);
  const money = await query(`SELECT COALESCE(SUM(agreed_price), 0) AS total, COUNT(*) AS jobs FROM bookings WHERE status = 'completed'`);
  const reviews = await query(`SELECT COUNT(*) AS total, SUM(is_hidden = 1) AS hidden FROM reviews`);
  const toMap = (rows, key) => rows.reduce((m, r) => ({ ...m, [r[key]]: Number(r.n) }), {});
  return ok(res, {
    users: toMap(users, 'role'),
    inactiveUsers: users.reduce((s, r) => s + Number(r.inactive || 0), 0),
    workersByVerification: toMap(workers, 'status'),
    bookingsByStatus: toMap(bookings, 'status'),
    completedBookingValue: money[0].total,
    completedBookings: money[0].jobs,
    reviews: { total: reviews[0].total, hidden: Number(reviews[0].hidden || 0) }
  });
});

exports.reports = asyncHandler(async (req, res) => {
  const byMonth = await query(
    `SELECT DATE_FORMAT(booking_date, '%Y-%m') AS month, COUNT(*) AS bookings,
            SUM(status = 'completed') AS completed,
            COALESCE(SUM(CASE WHEN status = 'completed' THEN agreed_price END), 0) AS completedValue
     FROM bookings WHERE booking_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 6 MONTH)
     GROUP BY month ORDER BY month`);
  const byCategory = await query(
    `SELECT sc.name AS category, COUNT(*) AS bookings,
            COALESCE(SUM(CASE WHEN b.status = 'completed' THEN b.agreed_price END), 0) AS completedValue
     FROM bookings b JOIN services s ON s.id = b.service_id JOIN service_categories sc ON sc.id = s.category_id
     GROUP BY sc.id, sc.name ORDER BY bookings DESC`);
  const topWorkers = await query(
    `SELECT wp.id, u.full_name AS fullName, COUNT(*) AS completedJobs, SUM(b.agreed_price) AS earned
     FROM bookings b JOIN worker_profiles wp ON wp.id = b.worker_id JOIN users u ON u.id = wp.user_id
     WHERE b.status = 'completed' GROUP BY wp.id, u.full_name ORDER BY earned DESC LIMIT 5`);
  return ok(res, {
    byMonth: byMonth.map((r) => ({ ...r, completed: Number(r.completed) })),
    byCategory, topWorkers,
    note: 'Values are the agreed prices of completed bookings. WorkSure does not process payments.'
  });
});

// ---------- users & workers ----------
exports.listUsers = asyncHandler(async (req, res) => {
  const { limit, page, offset } = pageInfo(req.query);
  const where = [];
  const params = [];
  if (['customer', 'worker', 'admin'].includes(req.query.role)) { where.push('u.role = ?'); params.push(req.query.role); }
  if (typeof req.query.q === 'string' && req.query.q.trim()) {
    const like = `%${req.query.q.trim().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    where.push('(u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)');
    params.push(like, like, like);
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  // password_hash is deliberately NOT selected
  const items = await query(
    `SELECT u.id, u.full_name AS fullName, u.email, u.phone, u.role, u.is_active AS isActive, u.created_at AS createdAt
     FROM users u ${w} ORDER BY u.id DESC LIMIT ${limit} OFFSET ${offset}`, params);
  const c = await query(`SELECT COUNT(*) AS total FROM users u ${w}`, params);
  return ok(res, { items: items.map((i) => ({ ...i, isActive: Boolean(i.isActive) })), total: c[0].total, page, limit });
});

exports.setUserActive = asyncHandler(async (req, res) => {
  const id = idParam(req);
  const { isActive } = req.valid;
  if (id === req.user.id) throw new ApiError(400, 'You cannot deactivate your own account');
  const r = await query('UPDATE users SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id]);
  if (r.affectedRows === 0) throw new ApiError(404, 'User not found');
  await logAction(req.user.id, isActive ? 'activate_user' : 'deactivate_user', 'user', id);
  return ok(res, null, isActive ? 'Account activated' : 'Account deactivated');
});

exports.listWorkers = asyncHandler(async (req, res) => {
  const { limit, page, offset } = pageInfo(req.query);
  const where = [];
  const params = [];
  if (['pending', 'verified', 'rejected'].includes(req.query.status)) { where.push('wp.verification_status = ?'); params.push(req.query.status); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const items = await query(
    `SELECT wp.id, u.id AS userId, u.full_name AS fullName, u.email, u.phone, u.is_active AS isActive,
            wp.headline, wp.location, wp.skills, wp.experience_years AS experienceYears,
            wp.verification_status AS verificationStatus, wp.avg_rating AS avgRating, wp.review_count AS reviewCount,
            (SELECT COUNT(*) FROM worker_services ws WHERE ws.worker_id = wp.id AND ws.is_active = 1) AS serviceCount
     FROM worker_profiles wp JOIN users u ON u.id = wp.user_id ${w}
     ORDER BY FIELD(wp.verification_status, 'pending', 'verified', 'rejected'), wp.id DESC
     LIMIT ${limit} OFFSET ${offset}`, params);
  const c = await query(`SELECT COUNT(*) AS total FROM worker_profiles wp ${w}`, params);
  return ok(res, { items: items.map((i) => ({ ...i, isActive: Boolean(i.isActive) })), total: c[0].total, page, limit });
});

exports.setVerification = asyncHandler(async (req, res) => {
  const id = idParam(req);
  const { status } = req.valid;
  const r = await query('UPDATE worker_profiles SET verification_status = ? WHERE id = ?', [status, id]);
  if (r.affectedRows === 0) throw new ApiError(404, 'Worker not found');
  await logAction(req.user.id, `worker_${status}`, 'worker', id);
  return ok(res, null, `Worker marked as ${status}`);
});

// ---------- categories ----------
exports.listCategories = asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT id, name, slug, description, icon, image_url AS imageUrl, is_active AS isActive FROM service_categories ORDER BY name`);
  return ok(res, rows.map((r) => ({ ...r, isActive: Boolean(r.isActive) })));
});

exports.createCategory = asyncHandler(async (req, res) => {
  const v = req.valid;
  const slug = slugify(v.name);
  if (!slug) throw new ApiError(400, 'Name must contain letters or numbers', { name: 'Invalid name' });
  try {
    const r = await query(
      'INSERT INTO service_categories (name, slug, description, icon, image_url) VALUES (?, ?, ?, ?, ?)',
      [v.name, slug, v.description, v.icon, v.imageUrl]);
    await logAction(req.user.id, 'create_category', 'category', r.insertId, v.name);
    return created(res, { id: r.insertId }, 'Category created');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new ApiError(409, 'A category with this name already exists', { name: 'Already exists' });
    throw err;
  }
});

exports.updateCategory = asyncHandler(async (req, res) => {
  const id = idParam(req);
  const v = req.valid;
  const slug = slugify(v.name);
  try {
    const r = await query(
      'UPDATE service_categories SET name = ?, slug = ?, description = ?, icon = ?, image_url = ? WHERE id = ?',
      [v.name, slug, v.description, v.icon, v.imageUrl, id]);
    if (r.affectedRows === 0) throw new ApiError(404, 'Category not found');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new ApiError(409, 'A category with this name already exists', { name: 'Already exists' });
    throw err;
  }
  await logAction(req.user.id, 'update_category', 'category', id, v.name);
  return ok(res, null, 'Category updated');
});

exports.setCategoryActive = asyncHandler(async (req, res) => {
  const id = idParam(req);
  const { isActive } = req.valid;
  const r = await query('UPDATE service_categories SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id]);
  if (r.affectedRows === 0) throw new ApiError(404, 'Category not found');
  await logAction(req.user.id, isActive ? 'activate_category' : 'deactivate_category', 'category', id);
  return ok(res, null, isActive ? 'Category activated' : 'Category hidden');
});

// ---------- services ----------
exports.listServices = asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT s.id, s.name, s.description, s.base_price AS basePrice, s.duration_minutes AS durationMinutes,
            s.is_active AS isActive, sc.id AS categoryId, sc.name AS categoryName
     FROM services s JOIN service_categories sc ON sc.id = s.category_id ORDER BY sc.name, s.name`);
  return ok(res, rows.map((r) => ({ ...r, isActive: Boolean(r.isActive) })));
});

exports.createService = asyncHandler(async (req, res) => {
  const v = req.valid;
  const cat = await query('SELECT id FROM service_categories WHERE id = ?', [v.categoryId]);
  if (!cat[0]) throw new ApiError(400, 'Category not found', { categoryId: 'Choose a valid category' });
  try {
    const r = await query(
      'INSERT INTO services (category_id, name, description, base_price, duration_minutes) VALUES (?, ?, ?, ?, ?)',
      [v.categoryId, v.name, v.description, v.basePrice, v.durationMinutes]);
    await logAction(req.user.id, 'create_service', 'service', r.insertId, v.name);
    return created(res, { id: r.insertId }, 'Service created');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new ApiError(409, 'This category already has a service with that name', { name: 'Already exists' });
    throw err;
  }
});

exports.updateService = asyncHandler(async (req, res) => {
  const id = idParam(req);
  const v = req.valid;
  const cat = await query('SELECT id FROM service_categories WHERE id = ?', [v.categoryId]);
  if (!cat[0]) throw new ApiError(400, 'Category not found', { categoryId: 'Choose a valid category' });
  try {
    const r = await query(
      'UPDATE services SET category_id = ?, name = ?, description = ?, base_price = ?, duration_minutes = ? WHERE id = ?',
      [v.categoryId, v.name, v.description, v.basePrice, v.durationMinutes, id]);
    if (r.affectedRows === 0) throw new ApiError(404, 'Service not found');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new ApiError(409, 'This category already has a service with that name', { name: 'Already exists' });
    throw err;
  }
  await logAction(req.user.id, 'update_service', 'service', id, v.name);
  return ok(res, null, 'Service updated');
});

exports.setServiceActive = asyncHandler(async (req, res) => {
  const id = idParam(req);
  const { isActive } = req.valid;
  const r = await query('UPDATE services SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id]);
  if (r.affectedRows === 0) throw new ApiError(404, 'Service not found');
  await logAction(req.user.id, isActive ? 'activate_service' : 'deactivate_service', 'service', id);
  return ok(res, null, isActive ? 'Service activated' : 'Service hidden');
});

// ---------- bookings ----------
exports.listBookings = asyncHandler(async (req, res) => {
  const STATUSES = ['pending', 'accepted', 'rejected', 'in_progress', 'completed', 'cancelled'];
  const status = STATUSES.includes(req.query.status) ? req.query.status : undefined;
  return ok(res, await bookingService.listForUser(req.user, { status, page: req.query.page, limit: req.query.limit }));
});

// ---------- reviews ----------
exports.listReviews = asyncHandler(async (req, res) => {
  const { limit, page, offset } = pageInfo(req.query);
  const where = req.query.hidden === 'true' ? 'WHERE r.is_hidden = 1' : '';
  const items = await query(
    `SELECT r.id, r.rating, r.comment, r.is_hidden AS isHidden, r.created_at AS createdAt,
            cu.full_name AS customerName, wu.full_name AS workerName, wp.id AS workerId
     FROM reviews r JOIN users cu ON cu.id = r.customer_id
     JOIN worker_profiles wp ON wp.id = r.worker_id JOIN users wu ON wu.id = wp.user_id
     ${where} ORDER BY r.id DESC LIMIT ${limit} OFFSET ${offset}`);
  const c = await query(`SELECT COUNT(*) AS total FROM reviews r ${where}`);
  return ok(res, { items: items.map((i) => ({ ...i, isHidden: Boolean(i.isHidden) })), total: c[0].total, page, limit });
});

exports.moderateReview = asyncHandler(async (req, res) => {
  const id = idParam(req);
  const { isHidden } = req.valid;
  await withTransaction(async (conn) => {
    const [rows] = await conn.execute('SELECT id, worker_id FROM reviews WHERE id = ? FOR UPDATE', [id]);
    if (!rows[0]) throw new ApiError(404, 'Review not found');
    await conn.execute('UPDATE reviews SET is_hidden = ? WHERE id = ?', [isHidden ? 1 : 0, id]);
    await reviewService.refreshWorkerRating(conn, rows[0].worker_id);
    await logAction(req.user.id, isHidden ? 'hide_review' : 'show_review', 'review', id, null, conn);
  });
  return ok(res, null, isHidden ? 'Review hidden' : 'Review visible again');
});

// ---------- audit log ----------
exports.logs = asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT l.id, l.action, l.target_type AS targetType, l.target_id AS targetId, l.details, l.created_at AS createdAt,
            u.full_name AS adminName
     FROM admin_logs l LEFT JOIN users u ON u.id = l.admin_id ORDER BY l.id DESC LIMIT 50`);
  return ok(res, rows);
});
