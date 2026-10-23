const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/respond');
const reviewService = require('../services/reviewService');

exports.create = asyncHandler(async (req, res) => {
  const id = await reviewService.createReview(req.user.id, req.valid);
  return created(res, { id }, 'Thank you for your review!');
});

exports.mine = asyncHandler(async (req, res) => {
  return ok(res, await reviewService.listMine(req.user.id));
});
