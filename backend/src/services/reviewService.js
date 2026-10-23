const { query, withTransaction } = require('../config/db');
const ApiError = require('../utils/ApiError');

// Re-calculate a worker's average rating from visible reviews (inside the caller's transaction).
async function refreshWorkerRating(conn, workerId) {
  const [rows] = await conn.execute(
    `SELECT COALESCE(ROUND(AVG(rating), 2), 0) AS avg_rating, COUNT(*) AS cnt
     FROM reviews WHERE worker_id = ? AND is_hidden = 0`, [workerId]);
  await conn.execute('UPDATE worker_profiles SET avg_rating = ?, review_count = ? WHERE id = ?',
    [rows[0].avg_rating, rows[0].cnt, workerId]);
}

async function createReview(customerId, { bookingId, rating, comment }) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.execute(
      'SELECT id, customer_id, worker_id, status FROM bookings WHERE id = ? FOR UPDATE', [bookingId]);
    const b = rows[0];
    if (!b || b.customer_id !== customerId) throw new ApiError(404, 'Booking not found');
    if (b.status !== 'completed') throw new ApiError(400, 'You can review a booking only after it is completed');

    const [existing] = await conn.execute('SELECT id FROM reviews WHERE booking_id = ?', [bookingId]);
    if (existing.length) throw new ApiError(409, 'You have already reviewed this booking');

    const [result] = await conn.execute(
      'INSERT INTO reviews (booking_id, customer_id, worker_id, rating, comment) VALUES (?, ?, ?, ?, ?)',
      [bookingId, customerId, b.worker_id, rating, comment]);
    await refreshWorkerRating(conn, b.worker_id);
    return result.insertId;
  });
}

async function listMine(customerId) {
  return query(
    `SELECT r.id, r.booking_id AS bookingId, r.rating, r.comment, r.is_hidden AS isHidden, r.created_at AS createdAt,
            wu.full_name AS workerName, wp.id AS workerId, s.name AS serviceName
     FROM reviews r
     JOIN worker_profiles wp ON wp.id = r.worker_id
     JOIN users wu ON wu.id = wp.user_id
     JOIN bookings b ON b.id = r.booking_id
     JOIN services s ON s.id = b.service_id
     WHERE r.customer_id = ? ORDER BY r.created_at DESC`, [customerId]);
}

module.exports = { refreshWorkerRating, createReview, listMine };
