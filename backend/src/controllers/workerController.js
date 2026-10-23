// Endpoints for a logged-in WORKER managing their OWN data.
// The worker is always found from the session (req.user.id) - never from an ID sent by the browser.
const { query, withTransaction } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/respond');
const { looksLikeImage, removeFile } = require('../middleware/upload');
const workerModel = require('../models/workerModel');

async function myProfileRow(userId) {
  const p = await workerModel.findProfileByUserId(userId);
  if (!p) throw new ApiError(404, 'Worker profile not found');
  return p;
}

exports.getProfile = asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT wp.id, u.full_name AS fullName, u.email, u.phone, wp.headline, wp.bio, wp.skills,
            wp.experience_years AS experienceYears, wp.location, wp.service_area AS serviceArea,
            wp.profile_photo AS profilePhoto, wp.verification_status AS verificationStatus,
            wp.is_available AS isAvailable, wp.avg_rating AS avgRating, wp.review_count AS reviewCount
     FROM worker_profiles wp JOIN users u ON u.id = wp.user_id WHERE wp.user_id = ?`, [req.user.id]);
  if (!rows[0]) throw new ApiError(404, 'Worker profile not found');
  return ok(res, { ...rows[0], isAvailable: Boolean(rows[0].isAvailable) });
});

exports.updateProfile = asyncHandler(async (req, res) => {
  const v = req.valid;
  const p = await myProfileRow(req.user.id);
  // Only whitelisted fields are updated. verification_status can NOT be changed here.
  await query(
    `UPDATE worker_profiles SET headline = ?, bio = ?, skills = ?, experience_years = ?, location = ?,
            service_area = ?, is_available = ? WHERE id = ?`,
    [v.headline, v.bio, v.skills, v.experienceYears, v.location, v.serviceArea, v.isAvailable ? 1 : 0, p.id]);
  return ok(res, null, 'Profile saved');
});

exports.uploadPhoto = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Please choose an image');
  if (!looksLikeImage(req.file.path)) {
    removeFile(req.file.filename);
    throw new ApiError(400, 'That file is not a valid image');
  }
  const p = await myProfileRow(req.user.id);
  if (p.profile_photo) removeFile(p.profile_photo.replace('/uploads/', ''));
  const url = `/uploads/${req.file.filename}`;
  await query('UPDATE worker_profiles SET profile_photo = ? WHERE id = ?', [url, p.id]);
  return ok(res, { profilePhoto: url }, 'Photo updated');
});

// ---- services this worker offers ----
exports.listServices = asyncHandler(async (req, res) => {
  const p = await myProfileRow(req.user.id);
  const rows = await query(
    `SELECT ws.service_id AS serviceId, s.name, sc.name AS categoryName, s.base_price AS basePrice,
            s.duration_minutes AS durationMinutes, ws.price, ws.is_active AS isActive
     FROM worker_services ws JOIN services s ON s.id = ws.service_id
     JOIN service_categories sc ON sc.id = s.category_id
     WHERE ws.worker_id = ? ORDER BY sc.name, s.name`, [p.id]);
  return ok(res, rows.map((r) => ({ ...r, isActive: Boolean(r.isActive) })));
});

exports.addService = asyncHandler(async (req, res) => {
  const { serviceId, price } = req.valid;
  const p = await myProfileRow(req.user.id);
  const svc = await query(
    `SELECT s.id FROM services s JOIN service_categories sc ON sc.id = s.category_id
     WHERE s.id = ? AND s.is_active = 1 AND sc.is_active = 1`, [serviceId]);
  if (!svc[0]) throw new ApiError(404, 'Service not found');
  try {
    await query('INSERT INTO worker_services (worker_id, service_id, price) VALUES (?, ?, ?)', [p.id, serviceId, price]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new ApiError(409, 'You already offer this service');
    throw err;
  }
  return created(res, null, 'Service added');
});

exports.updateService = asyncHandler(async (req, res) => {
  const serviceId = parseInt(req.params.serviceId, 10);
  if (!(serviceId > 0)) throw new ApiError(400, 'Invalid service id');
  const { price, isActive } = req.valid;
  const p = await myProfileRow(req.user.id);
  const r = await query('UPDATE worker_services SET price = ?, is_active = ? WHERE worker_id = ? AND service_id = ?',
    [price, isActive ? 1 : 0, p.id, serviceId]);
  if (r.affectedRows === 0) throw new ApiError(404, 'You do not offer this service');
  return ok(res, null, 'Service updated');
});

exports.removeService = asyncHandler(async (req, res) => {
  const serviceId = parseInt(req.params.serviceId, 10);
  if (!(serviceId > 0)) throw new ApiError(400, 'Invalid service id');
  const p = await myProfileRow(req.user.id);
  const r = await query('DELETE FROM worker_services WHERE worker_id = ? AND service_id = ?', [p.id, serviceId]);
  if (r.affectedRows === 0) throw new ApiError(404, 'You do not offer this service');
  return ok(res, null, 'Service removed');
});

// ---- weekly availability ----
exports.getAvailability = asyncHandler(async (req, res) => {
  const p = await myProfileRow(req.user.id);
  const rows = await query(
    `SELECT day_of_week AS dayOfWeek, TIME_FORMAT(start_time, '%H:%i') AS startTime, TIME_FORMAT(end_time, '%H:%i') AS endTime
     FROM worker_availability WHERE worker_id = ? ORDER BY day_of_week`, [p.id]);
  return ok(res, rows);
});

exports.setAvailability = asyncHandler(async (req, res) => {
  const { slots } = req.valid;
  const p = await myProfileRow(req.user.id);
  await withTransaction(async (conn) => {
    await conn.execute('DELETE FROM worker_availability WHERE worker_id = ?', [p.id]);
    for (const s of slots) {
      await conn.execute(
        'INSERT INTO worker_availability (worker_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?)',
        [p.id, s.dayOfWeek, `${s.startTime}:00`, `${s.endTime}:00`]);
    }
  });
  return ok(res, null, 'Availability saved');
});

// ---- earnings (based on COMPLETED bookings; WorkSure does not process payments) ----
exports.earnings = asyncHandler(async (req, res) => {
  const p = await myProfileRow(req.user.id);
  const total = await query(
    `SELECT COALESCE(SUM(agreed_price), 0) AS total, COUNT(*) AS jobs FROM bookings
     WHERE worker_id = ? AND status = 'completed'`, [p.id]);
  const month = await query(
    `SELECT COALESCE(SUM(agreed_price), 0) AS total, COUNT(*) AS jobs FROM bookings
     WHERE worker_id = ? AND status = 'completed'
       AND YEAR(completed_at) = YEAR(CURRENT_DATE()) AND MONTH(completed_at) = MONTH(CURRENT_DATE())`, [p.id]);
  const upcoming = await query(
    `SELECT COALESCE(SUM(agreed_price), 0) AS total, COUNT(*) AS jobs FROM bookings
     WHERE worker_id = ? AND status IN ('accepted','in_progress')`, [p.id]);
  const pending = await query(
    "SELECT COUNT(*) AS n FROM bookings WHERE worker_id = ? AND status = 'pending'", [p.id]);
  const recent = await query(
    `SELECT b.id, b.booking_date AS bookingDate, b.agreed_price AS agreedPrice, s.name AS serviceName
     FROM bookings b JOIN services s ON s.id = b.service_id
     WHERE b.worker_id = ? AND b.status = 'completed' ORDER BY b.completed_at DESC LIMIT 10`, [p.id]);
  return ok(res, {
    totalEarned: total[0].total, completedJobs: total[0].jobs,
    thisMonthEarned: month[0].total, thisMonthJobs: month[0].jobs,
    upcomingValue: upcoming[0].total, upcomingJobs: upcoming[0].jobs,
    pendingRequests: pending[0].n, recent,
    note: 'Based on agreed prices of completed bookings. Payments are made directly between customer and worker; WorkSure does not process payments.'
  });
});

exports.myReviews = asyncHandler(async (req, res) => {
  const p = await myProfileRow(req.user.id);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const data = await workerModel.listReviews(p.id, page, 10);
  return ok(res, { ...data, avgRating: p.avg_rating, reviewCount: p.review_count });
});
