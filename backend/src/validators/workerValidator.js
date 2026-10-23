const r = require('./rules');

function validateWorkerProfile(body = {}) {
  const c = r.collector();
  c.add('headline', r.text(body.headline, 'Headline', { min: 5, max: 120 }));
  c.add('bio', r.text(body.bio, 'Description', { min: 10, max: 2000 }));
  c.add('skills', r.text(body.skills, 'Skills', { min: 2, max: 255 }));
  c.add('experienceYears', r.intInRange(body.experienceYears, 'Experience (years)', 0, 60));
  c.add('location', r.text(body.location, 'Location (city)', { min: 2, max: 100 }));
  c.add('serviceArea', r.text(body.serviceArea, 'Service area', { min: 2, max: 255 }));
  c.add('isAvailable', typeof body.isAvailable === 'boolean' ? null : 'Availability must be true or false');
  return {
    errors: c.errors,
    value: c.ok ? {
      headline: body.headline.trim(),
      bio: body.bio.trim(),
      skills: body.skills.trim(),
      experienceYears: Number(body.experienceYears),
      location: body.location.trim(),
      serviceArea: body.serviceArea.trim(),
      isAvailable: body.isAvailable
    } : null
  };
}

function validateWorkerService(body = {}) {
  const c = r.collector();
  c.add('serviceId', r.positiveId(body.serviceId, 'Service'));
  c.add('price', r.money(body.price, 'Price'));
  return { errors: c.errors, value: c.ok ? { serviceId: Number(body.serviceId), price: Number(body.price) } : null };
}

function validateWorkerPrice(body = {}) {
  const c = r.collector();
  c.add('price', r.money(body.price, 'Price'));
  const hasActive = typeof body.isActive === 'boolean';
  if (body.isActive !== undefined && !hasActive) c.add('isActive', 'isActive must be true or false');
  return { errors: c.errors, value: c.ok ? { price: Number(body.price), isActive: hasActive ? body.isActive : true } : null };
}

// Weekly hours: [{ dayOfWeek: 1, startTime: '09:00', endTime: '18:00' }, ...]
function validateAvailability(body = {}) {
  const c = r.collector();
  const slots = body.slots;
  if (!Array.isArray(slots)) {
    c.add('slots', 'slots must be a list');
    return { errors: c.errors, value: null };
  }
  if (slots.length > 7) c.add('slots', 'At most 7 days can be set');
  const seen = new Set();
  const clean = [];
  slots.forEach((s, i) => {
    const label = `Row ${i + 1}`;
    c.add(`slots.${i}.dayOfWeek`, r.intInRange(s && s.dayOfWeek, `${label} day`, 0, 6));
    c.add(`slots.${i}.startTime`, r.time(s && s.startTime, `${label} start time`));
    c.add(`slots.${i}.endTime`, r.time(s && s.endTime, `${label} end time`));
    if (s && !c.errors[`slots.${i}.startTime`] && !c.errors[`slots.${i}.endTime`] && s.endTime <= s.startTime) {
      c.add(`slots.${i}.endTime`, `${label}: end time must be after start time`);
    }
    if (s && seen.has(Number(s.dayOfWeek))) c.add(`slots.${i}.dayOfWeek`, `${label}: day is repeated`);
    if (s) seen.add(Number(s.dayOfWeek));
    clean.push({ dayOfWeek: Number(s && s.dayOfWeek), startTime: s && s.startTime, endTime: s && s.endTime });
  });
  return { errors: c.errors, value: c.ok ? { slots: clean } : null };
}

module.exports = { validateWorkerProfile, validateWorkerService, validateWorkerPrice, validateAvailability };
