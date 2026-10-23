// npm run seed-demo
// Creates DEMO workers, customers, past bookings and reviews so the site is not empty.
// All demo accounts use the password:  Demo@1234   (DEMO ONLY - delete before going live)
// Safe to run twice: it skips demo accounts that already exist.
require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool, withTransaction } = require('../src/config/db');
const { refreshWorkerRating } = require('../src/services/reviewService');

const PASSWORD = 'Demo@1234';

const workers = [
  { name: 'Ramesh Patil',   email: 'ramesh.plumber@demo.worksure.test',  phone: '9800000001', loc: 'Pune',   area: 'Kothrud, Baner, Aundh, Karve Nagar', exp: 12, headline: 'Expert plumber for leaks, drains and fittings', skills: 'Pipe fitting, leak repair, drain cleaning, bathroom fittings', bio: 'Licensed plumber with 12 years of experience in apartments and bungalows. Neat work and clear pricing.', offers: { 'Tap & pipe leak repair': 400, 'Drain unblocking': 550, 'Bathroom fitting installation': 900 } },
  { name: 'Sunita More',    email: 'sunita.clean@demo.worksure.test',    phone: '9800000002', loc: 'Pune',   area: 'Hinjewadi, Wakad, Baner, Pashan',    exp: 8,  headline: 'Reliable home cleaning with eco-friendly products', skills: 'Deep cleaning, kitchen cleaning, bathroom cleaning', bio: 'Our small team provides careful, thorough cleaning. We bring our own supplies on request.', offers: { 'Standard home cleaning': 1000, 'Deep cleaning (1-2 BHK)': 2700 } },
  { name: 'Imran Shaikh',   email: 'imran.electric@demo.worksure.test',  phone: '9800000003', loc: 'Pune',   area: 'Camp, Kondhwa, Hadapsar, Viman Nagar', exp: 10, headline: 'Certified electrician - safe and quick repairs', skills: 'Wiring, fan installation, switchboards, MCB, inverter', bio: 'Certified electrician. I focus on safety and explain the problem before starting work.', offers: { 'Fan & light installation': 350, 'Switchboard repair': 450, 'Home wiring safety check': 750 } },
  { name: 'Vijay Kulkarni', email: 'vijay.carpenter@demo.worksure.test', phone: '9800000004', loc: 'Pune',   area: 'Shivajinagar, Deccan, Kothrud',        exp: 15, headline: 'Skilled carpenter for repairs and custom woodwork', skills: 'Furniture repair, door fitting, modular kitchen touch-ups', bio: '15 years of woodworking. Repairs, polishing, door and lock fitting at fair rates.', offers: { 'Furniture repair': 500, 'Door & lock fitting': 650 } },
  { name: 'Anita Deshmukh', email: 'anita.painter@demo.worksure.test',   phone: '9800000005', loc: 'Mumbai', area: 'Andheri, Bandra, Powai, Goregaon',      exp: 7,  headline: 'Clean, tidy interior painting', skills: 'Interior painting, putty, waterproofing, touch-ups', bio: 'We protect your furniture and floors and leave the room clean after the job.', offers: { 'Single room painting': 3800, 'Wall touch-up': 1300 } },
  { name: 'Farhan Khan',    email: 'farhan.ac@demo.worksure.test',       phone: '9800000006', loc: 'Mumbai', area: 'Thane, Mulund, Ghatkopar, Chembur',     exp: 9,  headline: 'AC service, gas refill and installation', skills: 'Split AC, window AC, gas refill, installation', bio: 'Authorised-brand trained technician. Same-week appointments available.', offers: { 'AC general service': 650, 'AC gas refill': 2400, 'AC installation': 1600 } },
  { name: 'Prakash Jadhav', email: 'prakash.repair@demo.worksure.test',  phone: '9800000007', loc: 'Pune',   area: 'Pimpri, Chinchwad, Akurdi, Nigdi',      exp: 11, headline: 'Washing machine and fridge repair specialist', skills: 'Washing machine, refrigerator, microwave, water purifier', bio: 'I repair most home appliance brands and always quote the price before starting.', offers: { 'Washing machine repair': 500, 'Refrigerator repair': 550 } },
  { name: 'Mahesh Gaikwad', email: 'mahesh.helper@demo.worksure.test',   phone: '9800000008', loc: 'Pune',   area: 'Hadapsar, Magarpatta, Kharadi',         exp: 5,  headline: 'Shifting helpers and garden cleanup', skills: 'Packing, loading, unloading, gardening', bio: 'A hard-working crew for house shifting and outdoor cleanup, on time and careful.', offers: { 'Home shifting helper (per half day)': 1000, 'Garden & yard cleanup': 750 } },
  { name: 'Neha Joshi',     email: 'neha.pending@demo.worksure.test',    phone: '9800000009', loc: 'Pune',   area: 'Baner, Balewadi', exp: 2, headline: 'New plumber waiting for verification', skills: 'Basic plumbing', bio: 'DEMO: this worker is still PENDING so the admin can try the approval flow.', offers: { 'Tap & pipe leak repair': 380 }, pending: true }
];

const customers = [
  { name: 'Aarav Mehta',  email: 'aarav@demo.worksure.test',  phone: '9810000001' },
  { name: 'Priya Nair',   email: 'priya@demo.worksure.test',  phone: '9810000002' },
  { name: 'Rohan Sharma', email: 'rohan@demo.worksure.test',  phone: '9810000003' }
];

const comments = [
  'Arrived on time and finished the job neatly. Highly recommended.',
  'Very professional and explained everything clearly. Fair price.',
  'Great work! Problem solved quickly. Will book again.',
  'Polite, punctual and tidy. Exactly what I needed.',
  'Good service. A little late, but the quality of work was excellent.'
];

(async () => {
  const hash = await bcrypt.hash(PASSWORD, 10);
  try {
    const [catCheck] = await pool.execute('SELECT COUNT(*) AS n FROM services');
    if (catCheck[0].n === 0) throw new Error('No services found. Import database/seed.sql first.');

    const custIds = [];
    for (const c of customers) {
      const [ex] = await pool.execute('SELECT id FROM users WHERE email = ?', [c.email]);
      if (ex[0]) { custIds.push(ex[0].id); continue; }
      const [r] = await pool.execute(
        "INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, 'customer')",
        [c.name, c.email, c.phone, hash]);
      custIds.push(r.insertId);
    }

    let n = 0;
    for (const w of workers) {
      const [ex] = await pool.execute('SELECT id FROM users WHERE email = ?', [w.email]);
      if (ex[0]) continue;
      await withTransaction(async (conn) => {
        const [u] = await conn.execute(
          "INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, 'worker')",
          [w.name, w.email, w.phone, hash]);
        const [p] = await conn.execute(
          `INSERT INTO worker_profiles (user_id, headline, bio, skills, experience_years, location, service_area, verification_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [u.insertId, w.headline, w.bio, w.skills, w.exp, w.loc, w.area, w.pending ? 'pending' : 'verified']);
        const workerId = p.insertId;

        // Mon-Sat 09:00-18:00
        for (let d = 1; d <= 6; d++) {
          await conn.execute('INSERT INTO worker_availability (worker_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?)',
            [workerId, d, '09:00:00', '18:00:00']);
        }

        const serviceIds = [];
        for (const [serviceName, price] of Object.entries(w.offers)) {
          const [s] = await conn.execute('SELECT id, duration_minutes FROM services WHERE name = ?', [serviceName]);
          if (!s[0]) continue;
          await conn.execute('INSERT INTO worker_services (worker_id, service_id, price) VALUES (?, ?, ?)', [workerId, s[0].id, price]);
          serviceIds.push({ id: s[0].id, price, minutes: s[0].duration_minutes });
        }

        // 3 past completed bookings with reviews for verified workers
        if (!w.pending) {
          for (let i = 0; i < 3; i++) {
            const svc = serviceIds[i % serviceIds.length];
            const day = new Date(Date.now() - (10 + i * 9) * 86400000);
            while (day.getUTCDay() === 0) day.setUTCDate(day.getUTCDate() - 1); // not Sunday
            const date = day.toISOString().slice(0, 10);
            const startMin = 10 * 60 + i * 60;
            const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
            const cust = custIds[i % custIds.length];
            const [b] = await conn.execute(
              `INSERT INTO bookings (customer_id, worker_id, service_id, booking_date, start_time, end_time, address,
                                     description, agreed_price, status, completed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'DEMO booking', ?, 'completed', ?)`,
              [cust, workerId, svc.id, date, fmt(startMin), fmt(startMin + svc.minutes),
               'Demo address, Flat 12, Sample Society, ' + w.loc, svc.price, `${date} 18:00:00`]);
            await conn.execute(
              "INSERT INTO booking_status_history (booking_id, old_status, new_status, changed_by, note) VALUES (?, NULL, 'pending', ?, 'DEMO')",
              [b.insertId, cust]);
            await conn.execute(
              "INSERT INTO booking_status_history (booking_id, old_status, new_status, changed_by, note) VALUES (?, 'in_progress', 'completed', ?, 'DEMO')",
              [b.insertId, u.insertId]);
            const rating = i === 2 && (n % 3 === 0) ? 4 : 5;
            await conn.execute('INSERT INTO reviews (booking_id, customer_id, worker_id, rating, comment) VALUES (?, ?, ?, ?, ?)',
              [b.insertId, cust, workerId, rating, comments[(n + i) % comments.length]]);
          }
          await refreshWorkerRating(conn, workerId);
        }
      });
      n++;
    }
    console.log('✔ Demo data ready. Demo password for every demo account: %s', PASSWORD);
    console.log('  Customer login: aarav@demo.worksure.test');
    console.log('  Worker login:   ramesh.plumber@demo.worksure.test');
    console.log('  Create the admin with:  npm run create-admin');
  } catch (err) {
    console.error('✘ Demo seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
