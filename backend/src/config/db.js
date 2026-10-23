// MySQL connection pool (mysql2 with promises).
const mysql = require('mysql2/promise');
const { env } = require('./env');

const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,       // return DECIMAL columns as numbers, not strings
  dateStrings: true,          // return DATE/TIME/TIMESTAMP as plain strings
  charset: 'utf8mb4'
});

// Run a SELECT / UPDATE with ? placeholders (parameterized = safe from SQL injection).
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

// Run several statements as ONE all-or-nothing transaction.
// Usage: await withTransaction(async (conn) => { await conn.execute(...); });
async function withTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function testConnection() {
  const rows = await query('SELECT 1 AS ok');
  return rows[0].ok === 1;
}

module.exports = { pool, query, withTransaction, testConnection };
