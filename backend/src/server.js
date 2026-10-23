const { env, assertEnv } = require('./config/env');

async function start() {
  assertEnv();
  const { testConnection } = require('./config/db');
  try {
    await testConnection();
    console.log('✔ Connected to MySQL database "%s"', env.db.database);
  } catch (err) {
    console.error('✘ Could not connect to MySQL:', err.code || '', err.message);
    console.error('  Check DB_HOST, DB_USER, DB_PASSWORD, DB_NAME in backend/.env and that MySQL is running.');
    process.exit(1);
  }
  const app = require('./app');
  app.listen(env.port, () => {
    console.log('✔ WorkSure running at http://localhost:%d  (%s mode)', env.port, env.isProduction ? 'production' : 'development');
  });
}

start().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
