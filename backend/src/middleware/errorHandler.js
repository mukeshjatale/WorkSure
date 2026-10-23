const { env } = require('../config/env');

function notFound(req, res) {
  res.status(404).json({ success: false, message: 'Not found' });
}

// Last stop for every error. Never leaks SQL or stack traces to the browser.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Known problems we threw on purpose
  if (err.status && err.status < 500) {
    const body = { success: false, message: err.message };
    if (err.details) body.errors = err.details;
    return res.status(err.status).json(body);
  }
  // Upload problems (multer)
  if (err.name === 'MulterError') {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Image is too large (maximum 2 MB)' : 'Upload failed';
    return res.status(400).json({ success: false, message: msg });
  }
  // Bad JSON body
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Invalid JSON in request' });
  }
  // Database is down or unreachable
  if (['ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR'].includes(err.code)) {
    console.error('[DB ERROR]', err.code, err.message);
    return res.status(503).json({ success: false, message: 'Service temporarily unavailable. Please try again later.' });
  }
  // Anything else = our bug. Log full detail on the server only.
  console.error('[SERVER ERROR]', err);
  res.status(500).json({
    success: false,
    message: 'Something went wrong on our side',
    ...(env.isProduction ? {} : { debug: err.message })
  });
}

module.exports = { notFound, errorHandler };
