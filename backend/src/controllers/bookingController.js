const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ok, created } = require('../utils/respond');
const bookingService = require('../services/bookingService');

const STATUSES = ['pending', 'accepted', 'rejected', 'in_progress', 'completed', 'cancelled'];

exports.create = asyncHandler(async (req, res) => {
  const id = await bookingService.createBooking(req.user.id, req.valid);
  const booking = await bookingService.getForUser(req.user, id);
  return created(res, booking, 'Booking request sent. The worker will confirm soon.');
});

exports.list = asyncHandler(async (req, res) => {
  const status = STATUSES.includes(req.query.status) ? req.query.status : undefined;
  const data = await bookingService.listForUser(req.user, { status, page: req.query.page, limit: req.query.limit });
  return ok(res, data);
});

exports.getOne = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!(id > 0)) throw new ApiError(400, 'Invalid booking id');
  return ok(res, await bookingService.getForUser(req.user, id));
});

exports.changeStatus = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!(id > 0)) throw new ApiError(400, 'Invalid booking id');
  const { status, reason } = req.valid;
  const booking = await bookingService.changeStatus(req.user, id, status, reason);
  return ok(res, booking, `Booking is now ${status.replace('_', ' ')}`);
});
