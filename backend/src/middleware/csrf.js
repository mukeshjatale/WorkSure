const ApiError = require('../utils/ApiError');

// Simple CSRF protection for a cookie-session app:
// browsers will NOT let another website add this custom header to a request
// (without our permission via CORS), so only our own frontend can send it.
// Our SameSite cookie setting adds a second layer of protection.
module.exports = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With') !== 'WorkSure') {
    return next(new ApiError(403, 'Blocked: missing security header'));
  }
  next();
};
