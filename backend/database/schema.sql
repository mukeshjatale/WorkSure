-- ============================================================
-- WorkSure database schema (MySQL 8.x)
-- Run:  mysql -u root -p < database/schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS worksure
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE worksure;

-- ------------------------------------------------------------
-- users: everybody who can log in (customer, worker, admin)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name     VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL,
  phone         VARCHAR(20)  NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  role          ENUM('customer','worker','admin') NOT NULL DEFAULT 'customer',
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- service_categories: Plumbing, Electrical, ...
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_categories (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(80)  NOT NULL,
  slug        VARCHAR(80)  NOT NULL,
  description VARCHAR(255) NULL,
  icon        VARCHAR(50)  NOT NULL DEFAULT 'fa-screwdriver-wrench',
  image_url   VARCHAR(255) NULL,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_name (name),
  UNIQUE KEY uq_categories_slug (slug)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- services: a job inside a category (e.g. "Tap & pipe leak repair")
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS services (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_id      INT UNSIGNED NOT NULL,
  name             VARCHAR(120) NOT NULL,
  description      VARCHAR(500) NULL,
  base_price       DECIMAL(10,2) NOT NULL,
  duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 120,
  is_active        TINYINT(1) NOT NULL DEFAULT 1,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_services_category_name (category_id, name),
  KEY idx_services_active (is_active),
  CONSTRAINT fk_services_category FOREIGN KEY (category_id)
    REFERENCES service_categories (id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- worker_profiles: extra data for users whose role is 'worker'
-- avg_rating / review_count are cached here for fast sorting.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS worker_profiles (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id             INT UNSIGNED NOT NULL,
  headline            VARCHAR(120) NULL,
  bio                 TEXT NULL,
  skills              VARCHAR(255) NULL,
  experience_years    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  location            VARCHAR(100) NULL,
  service_area        VARCHAR(255) NULL,
  profile_photo       VARCHAR(255) NULL,
  verification_status ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
  is_available        TINYINT(1) NOT NULL DEFAULT 1,
  avg_rating          DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  review_count        INT UNSIGNED NOT NULL DEFAULT 0,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_worker_user (user_id),
  KEY idx_worker_location (location),
  KEY idx_worker_status (verification_status),
  KEY idx_worker_rating (avg_rating),
  CONSTRAINT fk_worker_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- worker_services: which services a worker offers, at what price
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS worker_services (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  worker_id  INT UNSIGNED NOT NULL,
  service_id INT UNSIGNED NOT NULL,
  price      DECIMAL(10,2) NOT NULL,
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_worker_service (worker_id, service_id),
  KEY idx_ws_service (service_id),
  KEY idx_ws_price (price),
  CONSTRAINT fk_ws_worker  FOREIGN KEY (worker_id)  REFERENCES worker_profiles (id) ON DELETE CASCADE,
  CONSTRAINT fk_ws_service FOREIGN KEY (service_id) REFERENCES services (id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- worker_availability: weekly working hours (0 = Sunday ... 6 = Saturday)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS worker_availability (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  worker_id   INT UNSIGNED NOT NULL,
  day_of_week TINYINT UNSIGNED NOT NULL,
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_availability_day (worker_id, day_of_week),
  CONSTRAINT chk_availability_day  CHECK (day_of_week BETWEEN 0 AND 6),
  CONSTRAINT chk_availability_time CHECK (end_time > start_time),
  CONSTRAINT fk_avail_worker FOREIGN KEY (worker_id)
    REFERENCES worker_profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- bookings
-- end_time = start_time + service duration (calculated by the server).
-- Overlap checking happens inside a transaction (see bookingService.js).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookings (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id      INT UNSIGNED NOT NULL,
  worker_id        INT UNSIGNED NOT NULL,
  service_id       INT UNSIGNED NOT NULL,
  booking_date     DATE NOT NULL,
  start_time       TIME NOT NULL,
  end_time         TIME NOT NULL,
  address          VARCHAR(255) NOT NULL,
  description      VARCHAR(1000) NULL,
  agreed_price     DECIMAL(10,2) NOT NULL,
  status           ENUM('pending','accepted','rejected','in_progress','completed','cancelled')
                   NOT NULL DEFAULT 'pending',
  cancelled_by     ENUM('customer','worker','admin') NULL,
  cancel_reason    VARCHAR(255) NULL,
  completed_at     TIMESTAMP NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_bookings_customer (customer_id, status),
  KEY idx_bookings_worker_slot (worker_id, booking_date, start_time, end_time),
  KEY idx_bookings_status (status),
  CONSTRAINT chk_booking_time CHECK (end_time > start_time),
  CONSTRAINT fk_bookings_customer FOREIGN KEY (customer_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_bookings_worker   FOREIGN KEY (worker_id)   REFERENCES worker_profiles (id) ON DELETE RESTRICT,
  CONSTRAINT fk_bookings_service  FOREIGN KEY (service_id)  REFERENCES services (id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- booking_status_history: every status change (audit trail)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS booking_status_history (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_id INT UNSIGNED NOT NULL,
  old_status VARCHAR(20) NULL,
  new_status VARCHAR(20) NOT NULL,
  changed_by INT UNSIGNED NULL,
  note       VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_history_booking (booking_id),
  CONSTRAINT fk_history_booking FOREIGN KEY (booking_id) REFERENCES bookings (id) ON DELETE CASCADE,
  CONSTRAINT fk_history_user    FOREIGN KEY (changed_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- reviews: one review per completed booking
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reviews (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_id  INT UNSIGNED NOT NULL,
  customer_id INT UNSIGNED NOT NULL,
  worker_id   INT UNSIGNED NOT NULL,
  rating      TINYINT UNSIGNED NOT NULL,
  comment     VARCHAR(1000) NULL,
  is_hidden   TINYINT(1) NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_review_booking (booking_id),
  KEY idx_reviews_worker (worker_id, is_hidden),
  CONSTRAINT chk_review_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT fk_reviews_booking  FOREIGN KEY (booking_id)  REFERENCES bookings (id) ON DELETE CASCADE,
  CONSTRAINT fk_reviews_customer FOREIGN KEY (customer_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_reviews_worker   FOREIGN KEY (worker_id)   REFERENCES worker_profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- admin_logs: record of important administrator actions
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_logs (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_id    INT UNSIGNED NULL,
  action      VARCHAR(60)  NOT NULL,
  target_type VARCHAR(40)  NOT NULL,
  target_id   INT UNSIGNED NULL,
  details     VARCHAR(500) NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_adminlogs_created (created_at),
  CONSTRAINT fk_adminlogs_admin FOREIGN KEY (admin_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;
