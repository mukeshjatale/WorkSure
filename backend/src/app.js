// Builds the Express app (middleware order matters!). server.js starts it.
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);

const { env } = require('./config/env');
const { testConnection } = require('./config/db');
const csrf = require('./middleware/csrf');
const { apiLimiter } = require('./middleware/rateLimiters');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { UPLOAD_DIR } = require('./middleware/upload');
const routes = require('./routes');

const app = express();
const FRONTEND_DIR = path.join(__dirname, '..', '..', 'frontend');

// Behind a proxy (Render, Railway, Nginx) so secure cookies and rate limits see the real client.
if (env.trustProxy) app.set('trust proxy', 1);
app.disable('x-powered-by');

// ---- security headers ----
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com', 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://cdnjs.cloudflare.com', 'https://fonts.gstatic.com'],
      'img-src': ["'self'", 'data:', 'https:'],
      'connect-src': ["'self'"],
      'object-src': ["'none'"],
      'frame-ancestors': ["'none'"],
      'upgrade-insecure-requests': env.isProduction ? [] : null
    }
  }
}));

// ---- CORS: only our own site may call the API from a browser ----
app.use(cors({ origin: env.clientOrigin, credentials: true }));

app.use(express.json({ limit: '100kb' }));

// ---- sessions (stored in MySQL so they survive server restarts) ----
const sessionStore = new MySQLStore({
  host: env.db.host, port: env.db.port, user: env.db.user, password: env.db.password, database: env.db.database,
  createDatabaseTable: true,
  clearExpired: true,
  checkExpirationInterval: 15 * 60 * 1000,
  expiration: env.sessionHours * 3600 * 1000
});
sessionStore.on('error', (err) => console.error('[SESSION STORE]', err.message));

app.use(session({
  name: 'worksure.sid',
  secret: env.sessionSecret,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  rolling: true,                       // every request extends the session
  cookie: {
    httpOnly: true,                    // JavaScript in the page cannot read the cookie
    secure: env.isProduction,          // HTTPS only in production
    sameSite: 'lax',                   // not sent on cross-site POSTs
    maxAge: env.sessionHours * 3600 * 1000
  }
}));

// ---- API ----
app.get('/api/health', async (req, res) => {
  try {
    await testConnection();
    res.json({ success: true, data: { status: 'ok', database: 'connected' } });
  } catch (err) {
    res.status(503).json({ success: false, message: 'Database not reachable' });
  }
});
app.use('/api', apiLimiter, csrf, routes);
app.use('/api', notFound); // unknown /api/... paths -> JSON 404

// ---- protected HTML pages: logged-out users are sent to the login page ----
const PAGE_ROLES = {
  '/customer-dashboard.html': ['customer'],
  '/my-bookings.html': ['customer'],
  '/booking.html': ['customer'],
  '/worker-dashboard.html': ['worker'],
  '/admin-dashboard.html': ['admin'],
  '/profile.html': ['customer', 'worker', 'admin']
};
const HOME = { customer: '/customer-dashboard.html', worker: '/worker-dashboard.html', admin: '/admin-dashboard.html' };

app.use((req, res, next) => {
  const allowed = PAGE_ROLES[req.path.toLowerCase()];
  if (!allowed) return next();
  const user = req.session && req.session.user;
  if (!user) return res.redirect(`/login.html?next=${encodeURIComponent(req.originalUrl)}`);
  if (!allowed.includes(user.role)) return res.redirect(HOME[user.role] || '/');
  res.set('Cache-Control', 'no-store');
  next();
});

// ---- static files ----
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', index: false }));
app.use(express.static(FRONTEND_DIR, { extensions: ['html'] }));

app.use(errorHandler);

module.exports = app;
