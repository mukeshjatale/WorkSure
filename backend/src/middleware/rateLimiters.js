const rateLimit = require('express-rate-limit');

const json = (message) => (req, res) => res.status(429).json({ success: false, message });

// Strict limit for login/register (slows down password guessing)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json('Too many attempts. Please try again in 15 minutes.')
});

// General limit for every API call
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json('Too many requests. Please slow down.')
});

module.exports = { authLimiter, apiLimiter };
