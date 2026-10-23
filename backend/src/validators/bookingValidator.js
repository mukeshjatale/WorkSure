const r = require('./rules');

function validateCreateBooking(body = {}) {
  const c = r.collector();
  c.add('workerId', r.positiveId(body.workerId, 'Worker'));
  c.add('serviceId', r.positiveId(body.serviceId, 'Service'));
  c.add('bookingDate', r.date(body.bookingDate, 'Booking date'));
  c.add('startTime', r.time(body.startTime, 'Start time'));
  c.add('address', r.text(body.address, 'Service address', { min: 8, max: 255 }));
  c.add('description', r.text(body.description, 'Description', { max: 1000, optional: true }));
  return {
    errors: c.errors,
    value: c.ok ? {
      workerId: Number(body.workerId),
      serviceId: Number(body.serviceId),
      bookingDate: body.bookingDate,
      startTime: body.startTime,
      address: body.address.trim(),
      description: body.description ? String(body.description).trim() : null
    } : null
  };
}

const STATUS_ACTIONS = ['accepted', 'rejected', 'in_progress', 'completed', 'cancelled'];

function validateStatusChange(body = {}) {
  const c = r.collector();
  c.add('status', r.oneOf(body.status, 'Status', STATUS_ACTIONS));
  c.add('reason', r.text(body.reason, 'Reason', { max: 255, optional: true }));
  return {
    errors: c.errors,
    value: c.ok ? { status: body.status, reason: body.reason ? String(body.reason).trim() : null } : null
  };
}

function validateReview(body = {}) {
  const c = r.collector();
  c.add('bookingId', r.positiveId(body.bookingId, 'Booking'));
  c.add('rating', r.intInRange(body.rating, 'Rating', 1, 5));
  c.add('comment', r.text(body.comment, 'Comment', { max: 1000, optional: true }));
  return {
    errors: c.errors,
    value: c.ok ? {
      bookingId: Number(body.bookingId),
      rating: Number(body.rating),
      comment: body.comment ? String(body.comment).trim() : null
    } : null
  };
}

module.exports = { validateCreateBooking, validateStatusChange, validateReview };
