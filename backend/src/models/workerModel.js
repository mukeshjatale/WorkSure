// Data-access functions for workers (all SQL is parameterized with ?).
const { query } = require('../config/db');

const escapeLike = (s) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

const SORTS = {
  rating: 'wp.avg_rating DESC, wp.review_count DESC',
  price_asc: 'min_price ASC',
  price_desc: 'min_price DESC',
  experience: 'wp.experience_years DESC',
  newest: 'wp.id DESC'
};

// Public search used by the home page and the services page.
async function search(filters) {
  const where = ["u.is_active = 1", "wp.verification_status = 'verified'"];
  const params = [];

  if (filters.q) {
    const like = `%${escapeLike(filters.q)}%`;
    where.push('(u.full_name LIKE ? OR wp.headline LIKE ? OR wp.skills LIKE ? OR s.name LIKE ? OR sc.name LIKE ?)');
    params.push(like, like, like, like, like);
  }
  if (filters.location) {
    const like = `%${escapeLike(filters.location)}%`;
    where.push('(wp.location LIKE ? OR wp.service_area LIKE ?)');
    params.push(like, like);
  }
  if (filters.categoryId) { where.push('sc.id = ?'); params.push(filters.categoryId); }
  if (filters.serviceId) { where.push('s.id = ?'); params.push(filters.serviceId); }
  if (filters.minPrice !== undefined) { where.push('ws.price >= ?'); params.push(filters.minPrice); }
  if (filters.maxPrice !== undefined) { where.push('ws.price <= ?'); params.push(filters.maxPrice); }
  if (filters.minRating !== undefined) { where.push('wp.avg_rating >= ?'); params.push(filters.minRating); }
  if (filters.available) where.push('wp.is_available = 1');
  if (filters.dayOfWeek !== undefined) {
    where.push('EXISTS (SELECT 1 FROM worker_availability wa WHERE wa.worker_id = wp.id AND wa.day_of_week = ?)');
    params.push(filters.dayOfWeek);
  }

  const inner = `
    SELECT wp.id, u.full_name AS fullName, wp.headline, wp.location, wp.profile_photo AS profilePhoto,
           wp.avg_rating AS avgRating, wp.review_count AS reviewCount, wp.experience_years AS experienceYears,
           wp.is_available AS isAvailable, wp.verification_status AS verificationStatus,
           MIN(ws.price) AS min_price, MAX(ws.price) AS max_price,
           GROUP_CONCAT(DISTINCT sc.name ORDER BY sc.name SEPARATOR ', ') AS categories
    FROM worker_profiles wp
    JOIN users u ON u.id = wp.user_id
    JOIN worker_services ws ON ws.worker_id = wp.id AND ws.is_active = 1
    JOIN services s ON s.id = ws.service_id AND s.is_active = 1
    JOIN service_categories sc ON sc.id = s.category_id AND sc.is_active = 1
    WHERE ${where.join(' AND ')}
    GROUP BY wp.id, u.id`;

  const order = SORTS[filters.sort] || SORTS.rating;
  const limit = filters.limit;
  const offset = (filters.page - 1) * limit;

  const items = await query(`${inner} ORDER BY ${order}, wp.id ASC LIMIT ${limit} OFFSET ${offset}`, params);
  const countRows = await query(`SELECT COUNT(*) AS total FROM (${inner}) AS t`, params);
  return {
    items: items.map((w) => ({
      ...w, isAvailable: Boolean(w.isAvailable), minPrice: w.min_price, maxPrice: w.max_price,
      min_price: undefined, max_price: undefined
    })),
    total: countRows[0].total, page: filters.page, limit
  };
}

async function getPublicProfile(workerId) {
  const rows = await query(
    `SELECT wp.id, u.full_name AS fullName, wp.headline, wp.bio, wp.skills, wp.experience_years AS experienceYears,
            wp.location, wp.service_area AS serviceArea, wp.profile_photo AS profilePhoto,
            wp.verification_status AS verificationStatus, wp.is_available AS isAvailable,
            wp.avg_rating AS avgRating, wp.review_count AS reviewCount, wp.created_at AS memberSince
     FROM worker_profiles wp JOIN users u ON u.id = wp.user_id
     WHERE wp.id = ? AND u.is_active = 1 AND wp.verification_status = 'verified'`, [workerId]);
  if (!rows[0]) return null;
  const services = await query(
    `SELECT s.id AS serviceId, s.name, s.description, s.duration_minutes AS durationMinutes, sc.name AS categoryName, ws.price
     FROM worker_services ws JOIN services s ON s.id = ws.service_id
     JOIN service_categories sc ON sc.id = s.category_id
     WHERE ws.worker_id = ? AND ws.is_active = 1 AND s.is_active = 1 AND sc.is_active = 1
     ORDER BY sc.name, s.name`, [workerId]);
  const availability = await query(
    `SELECT day_of_week AS dayOfWeek, TIME_FORMAT(start_time, '%H:%i') AS startTime, TIME_FORMAT(end_time, '%H:%i') AS endTime
     FROM worker_availability WHERE worker_id = ? ORDER BY day_of_week`, [workerId]);
  return { ...rows[0], isAvailable: Boolean(rows[0].isAvailable), services, availability };
}

async function listReviews(workerId, page = 1, limit = 10) {
  const offset = (page - 1) * limit;
  const items = await query(
    `SELECT r.id, r.rating, r.comment, r.created_at AS createdAt, cu.full_name AS customerName, s.name AS serviceName
     FROM reviews r JOIN users cu ON cu.id = r.customer_id
     JOIN bookings b ON b.id = r.booking_id JOIN services s ON s.id = b.service_id
     WHERE r.worker_id = ? AND r.is_hidden = 0
     ORDER BY r.created_at DESC LIMIT ${limit} OFFSET ${offset}`, [workerId]);
  const c = await query('SELECT COUNT(*) AS total FROM reviews WHERE worker_id = ? AND is_hidden = 0', [workerId]);
  // Show only first name + initial for privacy
  const safe = items.map((i) => {
    const parts = String(i.customerName).trim().split(/\s+/);
    return { ...i, customerName: parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0] };
  });
  return { items: safe, total: c[0].total, page, limit };
}

async function findProfileByUserId(userId) {
  const rows = await query('SELECT * FROM worker_profiles WHERE user_id = ?', [userId]);
  return rows[0] || null;
}

module.exports = { search, getPublicProfile, listReviews, findProfileByUserId };
