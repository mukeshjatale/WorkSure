// Safe way to create the FIRST administrator:   npm run create-admin
// The admin cannot be created through the website. Run this once on your own computer/server.
// It reads ADMIN_NAME / ADMIN_EMAIL / ADMIN_PASSWORD from .env, or asks you in the terminal.
require('dotenv').config();
const readline = require('readline');
const bcrypt = require('bcrypt');
const { query, pool } = require('../src/config/db');
const rules = require('../src/validators/rules');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

(async () => {
  try {
    const name = process.env.ADMIN_NAME || (await ask('Admin full name: '));
    const email = (process.env.ADMIN_EMAIL || (await ask('Admin email: '))).trim().toLowerCase();
    const phone = process.env.ADMIN_PHONE || '0000000000';
    const password = process.env.ADMIN_PASSWORD || (await ask('Admin password (min 8 chars, letters + numbers): '));

    const problem = rules.text(name, 'Name', { min: 2, max: 100 }) || rules.email(email) || rules.password(password);
    if (problem) throw new Error(problem);

    const exists = await query('SELECT id FROM users WHERE email = ?', [email]);
    if (exists.length) throw new Error('A user with that email already exists.');

    const hash = await bcrypt.hash(password, 12);
    await query("INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, 'admin')",
      [name.trim(), email, phone, hash]);
    console.log('✔ Admin created. You can now log in at /login.html with', email);
    console.log('  Tip: remove ADMIN_PASSWORD from your .env file now.');
  } catch (err) {
    console.error('✘', err.message);
    process.exitCode = 1;
  } finally {
    rl.close();
    await pool.end();
  }
})();
