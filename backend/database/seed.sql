-- ============================================================
-- WorkSure seed data  *** DEMO DATA - safe to delete ***
-- Run AFTER schema.sql:  mysql -u root -p worksure < database/seed.sql
--
-- This file loads categories and services only.
-- Demo workers/customers (with properly hashed passwords) are created by:
--     npm run seed-demo
-- ============================================================

USE worksure;

-- DEMO: service categories
INSERT INTO service_categories (name, slug, description, icon, image_url) VALUES
 ('Plumbing',            'plumbing',        'Leaks, taps, pipes, drains and bathroom fittings.',        'fa-faucet-drip',      'https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?w=600'),
 ('Electrical',          'electrical',      'Wiring, switches, fans, lights and safety checks.',        'fa-bolt',             'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=600'),
 ('House Cleaning',      'house-cleaning',  'Regular and deep cleaning for homes and flats.',           'fa-broom',            'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=600'),
 ('Carpentry',           'carpentry',       'Furniture repair, doors, shelves and custom woodwork.',    'fa-hammer',           'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=600'),
 ('Painting',            'painting',        'Interior and exterior wall painting and touch-ups.',       'fa-paint-roller',     'https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=600'),
 ('AC Repair',           'ac-repair',       'AC servicing, gas refill, installation and repair.',       'fa-snowflake',        'https://images.unsplash.com/photo-1631545806609-c2f4ba5bf18f?w=600'),
 ('Appliance Repair',    'appliance-repair','Washing machine, fridge, microwave and more.',             'fa-plug',             'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=600'),
 ('General Labour',      'general-labour',  'Shifting, loading, gardening and helping hands.',          'fa-people-carry-box', 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=600');

-- DEMO: services (base_price is in INR; workers set their own price per service)
INSERT INTO services (category_id, name, description, base_price, duration_minutes)
SELECT c.id, s.name, s.description, s.base_price, s.duration_minutes
FROM (
  SELECT 'plumbing' AS slug, 'Tap & pipe leak repair' AS name, 'Fix leaking taps, joints and pipes.' AS description, 350.00 AS base_price, 60 AS duration_minutes
  UNION ALL SELECT 'plumbing', 'Drain unblocking', 'Clear blocked sinks, toilets and drains.', 500.00, 90
  UNION ALL SELECT 'plumbing', 'Bathroom fitting installation', 'Install taps, showers, wash basins and commodes.', 800.00, 120
  UNION ALL SELECT 'electrical', 'Fan & light installation', 'Install or replace ceiling fans and light fittings.', 300.00, 60
  UNION ALL SELECT 'electrical', 'Switchboard repair', 'Repair or replace switches, sockets and boards.', 400.00, 60
  UNION ALL SELECT 'electrical', 'Home wiring safety check', 'Inspection of wiring, MCB and earthing.', 700.00, 120
  UNION ALL SELECT 'house-cleaning', 'Standard home cleaning', 'Sweeping, mopping, dusting and kitchen/bathroom cleaning.', 900.00, 180
  UNION ALL SELECT 'house-cleaning', 'Deep cleaning (1-2 BHK)', 'Full deep clean including windows and appliances.', 2500.00, 300
  UNION ALL SELECT 'carpentry', 'Furniture repair', 'Fix broken chairs, tables, beds and wardrobes.', 450.00, 120
  UNION ALL SELECT 'carpentry', 'Door & lock fitting', 'Door repair, hinge and lock installation.', 600.00, 120
  UNION ALL SELECT 'painting', 'Single room painting', 'Painting of one room (labour only).', 3500.00, 480
  UNION ALL SELECT 'painting', 'Wall touch-up', 'Small patches and damp-mark repainting.', 1200.00, 240
  UNION ALL SELECT 'ac-repair', 'AC general service', 'Cleaning of filters, coil and gas pressure check.', 599.00, 60
  UNION ALL SELECT 'ac-repair', 'AC gas refill', 'Gas leak check and refill.', 2200.00, 120
  UNION ALL SELECT 'ac-repair', 'AC installation', 'Split/window AC installation.', 1500.00, 180
  UNION ALL SELECT 'appliance-repair', 'Washing machine repair', 'Diagnosis and repair of top/front load machines.', 450.00, 90
  UNION ALL SELECT 'appliance-repair', 'Refrigerator repair', 'Cooling issues, door seal and compressor checks.', 500.00, 90
  UNION ALL SELECT 'general-labour', 'Home shifting helper (per half day)', 'Packing, loading and unloading help.', 900.00, 240
  UNION ALL SELECT 'general-labour', 'Garden & yard cleanup', 'Trimming, weeding and waste removal.', 700.00, 180
) AS s
JOIN service_categories c ON c.slug = s.slug;
