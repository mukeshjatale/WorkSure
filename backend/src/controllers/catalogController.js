// Public (no login) endpoints: categories, services, worker search, worker profiles, testimonials.
const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/respond');
const workerModel = require('../models/workerModel');

exports.categories = asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT sc.id, sc.name, sc.slug, sc.description, sc.icon, sc.image_url AS imageUrl,
            (SELECT COUNT(*) FROM services s WHERE s.category_id = sc.id AND s.is_active = 1) AS serviceCount
     FROM service_categories sc WHERE sc.is_active = 1 ORDER BY sc.name`);
  return ok(res, rows);
});

exports.services = asyncHandler(async (req, res) => {
  const params = [];
  let extra = '';
  const categoryId = parseInt(req.query.categoryId, 10);
  if (categoryId > 0) { extra = 'AND s.category_id = ?'; params.push(categoryId); }
  const rows = await query(
    `SELECT s.id, s.name, s.description, s.base_price AS basePrice, s.duration_minutes AS durationMinutes,
            sc.id AS categoryId, sc.name AS categoryName,
            (SELECT COUNT(*) FROM worker_services ws
               JOIN worker_profiles wp ON wp.id = ws.worker_id AND wp.verification_status = 'verified'
               JOIN users u ON u.id = wp.user_id AND u.is_active = 1
             WHERE ws.service_id = s.id AND ws.is_active = 1) AS workerCount,
            (SELECT MIN(ws.price) FROM worker_services ws
               JOIN worker_profiles wp ON wp.id = ws.worker_id AND wp.verification_status = 'verified'
             WHERE ws.service_id = s.id AND ws.is_active = 1) AS minPrice
     FROM services s JOIN service_categories sc ON sc.id = s.category_id
     WHERE s.is_active = 1 AND sc.is_active = 1 ${extra}
     ORDER BY sc.name, s.name`, params);
  return ok(res, rows);
});

exports.serviceById = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!(id > 0)) throw new ApiError(400, 'Invalid service id');
  const rows = await query(
    `SELECT s.id, s.name, s.description, s.base_price AS basePrice, s.duration_minutes AS durationMinutes,
            sc.id AS categoryId, sc.name AS categoryName
     FROM services s JOIN service_categories sc ON sc.id = s.category_id
     WHERE s.id = ? AND s.is_active = 1 AND sc.is_active = 1`, [id]);
  if (!rows[0]) throw new ApiError(404, 'Service not found');
  const workers = await workerModel.search({ serviceId: id, page: 1, limit: 50, sort: 'rating' });
  return ok(res, { ...rows[0], workers: workers.items });
});

function readSearch(q) {
  const num = (v) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? undefined : Number(v));
  const int = (v) => { const n = parseInt(v, 10); return n > 0 ? n : undefined; };
  const str = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 100) : undefined);
  let dayOfWeek;
  if (typeof q.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(q.date)) {
    const d = new Date(`${q.date}T00:00:00Z`);
    if (!Number.isNaN(d.getTime())) dayOfWeek = d.getUTCDay();
  }
  return {
    q: str(q.q), location: str(q.location),
    categoryId: int(q.categoryId), serviceId: int(q.serviceId),
    minPrice: num(q.minPrice), maxPrice: num(q.maxPrice), minRating: num(q.minRating),
    available: q.available === 'true' || q.available === '1',
    dayOfWeek,
    sort: typeof q.sort === 'string' ? q.sort : 'rating',
    page: int(q.page) || 1,
    limit: Math.min(int(q.limit) || 9, 50)
  };
}
exports.readSearch = readSearch;

exports.searchWorkers = asyncHandler(async (req, res) => {
  return ok(res, await workerModel.search(readSearch(req.query)));
});

exports.featuredWorkers = asyncHandler(async (req, res) => {
  const r = await workerModel.search({ page: 1, limit: 6, sort: 'rating' });
  return ok(res, r.items);
});

exports.workerById = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!(id > 0)) throw new ApiError(400, 'Invalid worker id');
  const profile = await workerModel.getPublicProfile(id);
  if (!profile) throw new ApiError(404, 'Worker not found');
  return ok(res, profile);
});

exports.workerReviews = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!(id > 0)) throw new ApiError(400, 'Invalid worker id');
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  return ok(res, await workerModel.listReviews(id, page, 10));
});

// Latest good reviews for the home-page testimonials section
exports.testimonials = asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT r.id, r.rating, r.comment, r.created_at AS createdAt, cu.full_name AS customerName,
            wu.full_name AS workerName, s.name AS serviceName
     FROM reviews r
     JOIN users cu ON cu.id = r.customer_id
     JOIN worker_profiles wp ON wp.id = r.worker_id
     JOIN users wu ON wu.id = wp.user_id AND wu.is_active = 1
     JOIN bookings b ON b.id = r.booking_id
     JOIN services s ON s.id = b.service_id
     WHERE r.is_hidden = 0 AND r.rating >= 4 AND r.comment IS NOT NULL AND r.comment <> ''
     ORDER BY r.created_at DESC LIMIT 3`);
  const safe = rows.map((i) => {
    const parts = String(i.customerName).trim().split(/\s+/);
    return { ...i, customerName: parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0] };
  });
  return ok(res, safe);
});

// Small numbers for the home page
exports.publicStats = asyncHandler(async (req, res) => {
  const w = await query(`SELECT COUNT(*) AS n FROM worker_profiles wp JOIN users u ON u.id = wp.user_id
                         WHERE wp.verification_status = 'verified' AND u.is_active = 1`);
  const b = await query("SELECT COUNT(*) AS n FROM bookings WHERE status = 'completed'");
  const c = await query('SELECT COUNT(*) AS n FROM service_categories WHERE is_active = 1');
  return ok(res, { verifiedWorkers: w[0].n, completedJobs: b[0].n, categories: c[0].n });
});
