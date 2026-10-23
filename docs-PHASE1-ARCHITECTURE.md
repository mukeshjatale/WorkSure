# WorkSure - Phase 1: Requirements, Roles and Architecture

## 1. What WorkSure does
A web platform where customers book home-service professionals (plumbers, electricians,
cleaners, carpenters, painters, AC and appliance technicians, general labour).

## 2. User roles
| Role     | Can do                                                                          | Cannot do                                   |
|----------|----------------------------------------------------------------------------------|---------------------------------------------|
| Customer | Search workers, book, cancel eligible bookings, review completed bookings, edit own profile | See other customers' data, accept jobs |
| Worker   | Manage own profile, services, prices, weekly availability; accept/reject/start/complete own bookings; view own earnings and reviews | Verify themselves, see other workers' bookings |
| Admin    | Verify/reject workers, activate/deactivate accounts, manage categories and services, moderate reviews, view stats and reports | Created through public sign-up (only via `npm run create-admin`) |

Public (no login): home page, service list, worker search, worker profiles, reviews.

## 3. Booking lifecycle
```
pending --(worker accepts)--> accepted --(worker starts)--> in_progress --(worker completes)--> completed
pending --(worker rejects)--> rejected
pending/accepted --(customer or admin cancels)--> cancelled
```
- Customer may cancel `pending` any time, `accepted` only at least 24 hours before start.
- Every change is written to `booking_status_history` with the user and time.
- Price and duration are read from the database, never from the browser.
- Two bookings for one worker cannot overlap: the worker row is locked (`SELECT ... FOR UPDATE`)
  inside a transaction before the overlap check.
- Only completed bookings can be reviewed, one review per booking.

## 4. Database (MySQL 8, InnoDB, utf8mb4)
```
users 1---1 worker_profiles 1---* worker_services *---1 services *---1 service_categories
  |                  |   1---* worker_availability
  |                  +---* bookings *---1 services
  +---* bookings (customer)          bookings 1---* booking_status_history
  +---* reviews (customer)           bookings 1---1 reviews
users 1---* admin_logs
```
Tables: users, worker_profiles, service_categories, services, worker_services,
worker_availability, bookings, booking_status_history, reviews, admin_logs.
Money uses DECIMAL(10,2). Rating averages are cached on worker_profiles for fast sorting.

## 5. Architecture
- Browser (HTML/CSS/vanilla JS, Fetch API) -> Express REST API (`/api/...`) -> MySQL (mysql2 pool).
- Layers: routes -> middleware (auth, role, validation, rate limit, CSRF header) -> controllers
  -> services (booking/review rules) and models (SQL) -> database.
- Auth: server-side sessions stored in MySQL, httpOnly cookie, bcrypt (12 rounds),
  session regenerated on login, re-checked against the database on every request (so deactivation is immediate).
- Errors: one JSON shape `{ success, message, errors? }`; stack traces never sent to the browser in production.

## 6. Key decisions (defaults chosen)
| Decision | Choice | Why |
|---|---|---|
| Auth | Sessions in MySQL | Easy to revoke, no secret in the browser |
| Currency | INR, Asia/Kolkata for time checks | Demo data is Indian; change the offset in `bookingRules.js` if needed |
| Payments | Not implemented; earnings are "agreed price of completed jobs" | No gateway integrated |
| Verification | Workers start as `pending` and are hidden from search until verified | Trust |

## 7. Phase plan
1. Requirements and architecture (this document)
2. Folder structure and environment
3. Database schema, seed, connection test
4. Express server, config, error handling
5. Auth, registration, login, logout, role checks
6. Homepage, navigation, responsive CSS
7. Service listing, search, filters, worker profiles
8. Customer dashboard and profile
9. Worker dashboard, services, availability
10. Booking workflow and double-booking prevention
11. Reviews and ratings
12. Admin dashboard
13. Connect and verify every page against the API
14. Security review, tests, documentation
15. GitHub and deployment

## 8. Status of this delivery
- Done in code: database schema and demo seed, backend API (all endpoints listed above), validators,
  booking rules, admin tools, 38 automated unit tests for booking rules and validation.
- Done in code: the frontend, 14 HTML pages in `frontend/` with CSS in `css/` and vanilla JavaScript in
  `js/`. It covers the public pages, sign-in and sign-up, booking, and the customer, worker, admin and profile
  dashboards.
- Smoke-tested in headless Chromium: all 14 pages load at phone and desktop widths with no JavaScript
  errors and no horizontal scrolling. The API was not running, so this does not test real data flows.
- NOT yet done: end-to-end testing against a real MySQL server and in a real browser session (sign-up,
  booking, worker actions, review, admin actions), and a Postman collection.
- Not verified in this environment: MySQL was not available here and `npm install` could not
  complete (network limits), so the server has not been started against a real database.
  Run `npm install` and the steps in README.md before relying on it.
