// Loads the .env file and checks that important settings exist.
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

const env = {
  isProduction,
  port: parseInt(process.env.PORT, 10) || 5000,
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'worksure'
  },
  sessionSecret: process.env.SESSION_SECRET || '',
  sessionHours: parseInt(process.env.SESSION_HOURS, 10) || 8,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5000',
  trustProxy: process.env.TRUST_PROXY === 'true'
};

// Called once when the server starts.
function assertEnv() {
  if (!env.sessionSecret || env.sessionSecret.length < 16 || env.sessionSecret.startsWith('replace_with')) {
    throw new Error(
      'SESSION_SECRET is missing or too short. Open backend/.env and set it to a long random string (see README).'
    );
  }
}

module.exports = { env, assertEnv };
