// Booking logic that touches the database.
const { query, withTransaction } = require('../config/db');
const ApiError = require('../utils/ApiError');
const rules = require('./bookingRules');

const BOOKING_SELECT = `
  SELECT b.id, b.customer_id AS customerId, b.worker_id AS workerId, b.service_id AS serviceId,
         b.booking_date AS bookingDate, b.start_time AS startTime, b.end_time AS endTime,
         b.address, b.description, b.agreed_price AS agreedPrice, b.status,
         b.cancelled_by AS cancelledBy, b.cancel_reason AS cancelReason,
         b.completed_at AS completedAt, b.created_at AS createdAt, b.updated_at AS updatedAt,
         s.name AS serviceName, sc.name AS categoryName,
         cu.full_name AS customerName,
         wu.full_name AS workerName, wp.profile_photo AS workerPhoto,
         (r.id IS NOT NULL) AS hasReview
  FROM bookings b
  JOIN services s ON s.id = b.service_id
  JOIN service_categories sc ON sc.id = s.category_id
  JOIN users cu ON cu.id = b.customer_id
  JOIN worker_profiles wp ON wp.id = b.worker_id
  JOIN users wu ON wu.id = wp.user_id
  LEFT JOIN reviews r ON r.booking_id = b.id`;

// Adds yes/no hints (canCancel etc.) so the frontend only shows valid buttons.
// The server still re-checks every action; the hints are just for display.
function decorate(row, role) {
  if (!row) return row;
  const b = { ...row, hasReview: Boolean(row.hasReview) };
  if (role === 'customer') {
    b.canCancel = rules.customerCanCancel(b.status, b.bookingDate, b.startTime);
    b.canReview = b.status === 'completed' && !b.hasReview;
  }
  if (role === 'worker') {
    b.nextActions = rules.TRANSITIONS.worker[b.status] || [];
  }
  return b;
}

async function createBooking(customerId, input) {
  const { workerId, serviceId, bookingDate, startTime, address, description } = input;

  if (!rules.withinBookingWindow(bookingDate)) {
    throw new ApiError(400, 'Booking date must be from today up to 90 days ahead');
  }
  if (!rules.isInFuture(bookingDate, startTime)) {
    throw new ApiError(400, 'Please choose a time in the future');
  }

  return withTransaction(async (conn) => {
    // 1) LOCK the worker's row. Two customers booking the same worker at the same moment
    //    will now be handled one after the other, so the overlap check below is reliable.
    const [workers] = await conn.execute(
      `SELECT wp.id, wp.user_id, wp.verification_status, wp.is_available, u.is_active
       FROM worker_profiles wp JOIN users u ON u.id = wp.user_id
       WHERE wp.id = ? FOR UPDATE`, [workerId]);
    const worker = workers[0];
    if (!worker || !worker.is_active) throw new ApiError(404, 'Worker not found');
    if (worker.verification_status !== 'verified') throw new ApiError(400, 'This worker is not verified yet');
    if (!worker.is_available) throw new ApiError(400, 'This worker is not accepting bookings right now');
    if (worker.user_id === customerId) throw new ApiError(400, 'You cannot book yourself');

    // 2) Price and duration come from the DATABASE, never from the browser.
    const [offers] = await conn.execute(
      `SELECT ws.price, s.duration_minutes, s.is_active AS service_active, sc.is_active AS category_active
       FROM worker_services ws
       JOIN services s ON s.id = ws.service_id
       JOIN service_categories sc ON sc.id = s.category_id
       WHERE ws.worker_id = ? AND ws.service_id = ? AND ws.is_active = 1`, [workerId, serviceId]);
    const offer = offers[0];
    if (!offer || !offer.service_active || !offer.category_active) {
      throw new ApiError(400, 'This worker does not offer that service');
    }

    const endMinutes = rules.toMinutes(startTime) + offer.duration_minutes;
    if (endMinutes > 24 * 60) throw new ApiError(400, 'This service would run past midnight. Choose an earlier start time');
    const startStr = `${startTime}:00`;
    const endStr = rules.toTimeString(endMinutes);

    // 3) Must be inside the worker's weekly working hours.
    const [availability] = await conn.execute(
      'SELECT day_of_week, start_time, end_time FROM worker_availability WHERE worker_id = ?', [workerId]);
    if (!rules.fitsAvailability(availability, bookingDate, startStr, endStr)) {
      throw new ApiError(400, 'The worker is not available at that date and time');
    }

    // 4) No overlap with this worker's other active bookings that day.
    const [clash] = await conn.execute(
      `SELECT id FROM bookings
       WHERE worker_id = ? AND booking_date = ?
         AND status IN ('pending','accepted','in_progress')
         AND start_time < ? AND end_time > ?
       LIMIT 1`, [workerId, bookingDate, endStr, startStr]);
    if (clash.length > 0) throw new ApiError(409, 'That time slot is already booked. Please choose another time');

    // 5) Save.
    const [result] = await conn.execute(
      `INSERT INTO bookings (customer_id, worker_id, service_id, booking_date, start_time, end_time,
                             address, description, agreed_price, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [customerId, workerId, serviceId, bookingDate, startStr, endStr, address, description, offer.price]);
    await conn.execute(
      `INSERT INTO booking_status_history (booking_id, old_status, new_status, changed_by, note)
       VALUES (?, NULL, 'pending', ?, 'Booking created')`, [result.insertId, customerId]);
    return result.insertId;
  });
}

async function listForUser(user, { status, page = 1, limit = 20 } = {}) {
  const where = [];
  const params = [];
  if (user.role === 'customer') { where.push('b.customer_id = ?'); params.push(user.id); }
  else if (user.role === 'worker') { where.push('wp.user_id = ?'); params.push(user.id); }
  if (status) { where.push('b.status = ?'); params.push(status); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const off = (Math.max(parseInt(page, 10) || 1, 1) - 1) * lim;

  const rows = await query(
    `${BOOKING_SELECT} ${whereSql} ORDER BY b.booking_date DESC, b.start_time DESC LIMIT ${lim} OFFSET ${off}`, params);
  const countRows = await query(
    `SELECT COUNT(*) AS total FROM bookings b JOIN worker_profiles wp ON wp.id = b.worker_id ${whereSql}`, params);
  return { items: rows.map((r) => decorate(r, user.role)), total: countRows[0].total, page: Math.max(parseInt(page, 10) || 1, 1), limit: lim };
}

async function getForUser(user, bookingId) {
  const rows = await query(`${BOOKING_SELECT} WHERE b.id = ?`, [bookingId]);
  const row = rows[0];
  // Same "not found" for missing AND for someone else's booking, so IDs cannot be probed.
  if (!row) throw new ApiError(404, 'Booking not found');
  if (user.role === 'customer' && row.customerId !== user.id) throw new ApiError(404, 'Booking not found');
  if (user.role === 'worker') {
    const w = await query('SELECT id FROM worker_profiles WHERE user_id = ?', [user.id]);
    if (!w[0] || w[0].id !== row.workerId) throw new ApiError(404, 'Booking not found');
  }
  const history = await query(
    `SELECT h.old_status AS oldStatus, h.new_status AS newStatus, h.note, h.created_at AS createdAt, u.full_name AS changedBy
     FROM booking_status_history h LEFT JOIN users u ON u.id = h.changed_by
     WHERE h.booking_id = ? ORDER BY h.id`, [bookingId]);
  return { ...decorate(row, user.role), history };
}

async function changeStatus(user, bookingId, newStatus, reason) {
  await withTransaction(async (conn) => {
    const [rows] = await conn.execute(
      `SELECT b.id, b.customer_id, b.worker_id, b.status, b.booking_date, b.start_time, wp.user_id AS worker_user_id
       FROM bookings b JOIN worker_profiles wp ON wp.id = b.worker_id
       WHERE b.id = ? FOR UPDATE`, [bookingId]);
    const b = rows[0];
    if (!b) throw new ApiError(404, 'Booking not found');

    // Ownership: the customer who made it, the assigned worker, or an admin.
    if (user.role === 'customer' && b.customer_id !== user.id) throw new ApiError(404, 'Booking not found');
    if (user.role === 'worker' && b.worker_user_id !== user.id) throw new ApiError(404, 'Booking not found');

    if (!rules.canTransition(user.role, b.status, newStatus)) {
      throw new ApiError(400, `A ${b.status.replace('_', ' ')} booking cannot be changed to ${newStatus.replace('_', ' ')}`);
    }
    if (user.role === 'customer' && !rules.customerCanCancel(b.status, b.booking_date, b.start_time)) {
      throw new ApiError(400, `Accepted bookings can only be cancelled at least ${rules.CUSTOMER_CANCEL_HOURS} hours before the start time`);
    }

    const cancelling = newStatus === 'cancelled';
    await conn.execute(
      `UPDATE bookings SET status = ?, cancelled_by = ?, cancel_reason = ?, completed_at = ? WHERE id = ?`,
      [newStatus,
       cancelling ? user.role : null,
       cancelling || newStatus === 'rejected' ? reason : null,
       newStatus === 'completed' ? new Date() : null,
       bookingId]);
    await conn.execute(
      `INSERT INTO booking_status_history (booking_id, old_status, new_status, changed_by, note) VALUES (?, ?, ?, ?, ?)`,
      [bookingId, b.status, newStatus, user.id, reason]);
  });
  return getForUser(user, bookingId);
}

module.exports = { createBooking, listForUser, getForUser, changeStatus };
