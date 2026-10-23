const r = require('./rules');

function validateCategory(body = {}) {
  const c = r.collector();
  c.add('name', r.text(body.name, 'Name', { min: 2, max: 80 }));
  c.add('description', r.text(body.description, 'Description', { max: 255, optional: true }));
  const icon = body.icon === undefined || body.icon === '' ? 'fa-screwdriver-wrench' : body.icon;
  if (typeof icon !== 'string' || !/^fa-[a-z0-9-]{2,45}$/.test(icon)) c.add('icon', 'Icon must look like fa-wrench');
  if (body.imageUrl && !/^https?:\/\/[^\s]{3,240}$/.test(body.imageUrl)) c.add('imageUrl', 'Image URL must start with http:// or https://');
  return {
    errors: c.errors,
    value: c.ok ? {
      name: body.name.trim(),
      description: body.description ? String(body.description).trim() : null,
      icon,
      imageUrl: body.imageUrl ? body.imageUrl : null
    } : null
  };
}

function validateService(body = {}) {
  const c = r.collector();
  c.add('categoryId', r.positiveId(body.categoryId, 'Category'));
  c.add('name', r.text(body.name, 'Name', { min: 2, max: 120 }));
  c.add('description', r.text(body.description, 'Description', { max: 500, optional: true }));
  c.add('basePrice', r.money(body.basePrice, 'Base price'));
  c.add('durationMinutes', r.intInRange(body.durationMinutes, 'Duration (minutes)', 15, 720));
  return {
    errors: c.errors,
    value: c.ok ? {
      categoryId: Number(body.categoryId),
      name: body.name.trim(),
      description: body.description ? String(body.description).trim() : null,
      basePrice: Number(body.basePrice),
      durationMinutes: Number(body.durationMinutes)
    } : null
  };
}

function validateActiveFlag(body = {}) {
  const c = r.collector();
  if (typeof body.isActive !== 'boolean') c.add('isActive', 'isActive must be true or false');
  return { errors: c.errors, value: c.ok ? { isActive: body.isActive } : null };
}

function validateVerification(body = {}) {
  const c = r.collector();
  c.add('status', r.oneOf(body.status, 'Status', ['verified', 'rejected', 'pending']));
  return { errors: c.errors, value: c.ok ? { status: body.status } : null };
}

function validateReviewModeration(body = {}) {
  const c = r.collector();
  if (typeof body.isHidden !== 'boolean') c.add('isHidden', 'isHidden must be true or false');
  return { errors: c.errors, value: c.ok ? { isHidden: body.isHidden } : null };
}

module.exports = { validateCategory, validateService, validateActiveFlag, validateVerification, validateReviewModeration };
