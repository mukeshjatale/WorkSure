// Run with:  npm test      (uses Node's built-in test runner, no extra packages)
const test = require('node:test');
const assert = require('node:assert/strict');
const r = require('../src/services/bookingRules');

test('overlap: partly overlapping slots clash', () => {
  assert.equal(r.overlaps('10:00', '12:00', '11:00', '13:00'), true);
});
test('overlap: identical slots clash', () => {
  assert.equal(r.overlaps('10:00', '12:00', '10:00', '12:00'), true);
});
test('overlap: one slot inside another clashes', () => {
  assert.equal(r.overlaps('09:00', '17:00', '11:00', '12:00'), true);
});
test('overlap: back-to-back slots do NOT clash', () => {
  assert.equal(r.overlaps('10:00', '12:00', '12:00', '14:00'), false);
  assert.equal(r.overlaps('12:00', '14:00', '10:00', '12:00'), false);
});
test('overlap: separate slots do not clash', () => {
  assert.equal(r.overlaps('08:00', '09:00', '15:00', '16:00'), false);
});

test('time helpers convert correctly', () => {
  assert.equal(r.toMinutes('09:30'), 570);
  assert.equal(r.toTimeString(570), '09:30:00');
  assert.equal(r.toTimeString(r.toMinutes('10:00') + 90), '11:30:00');
});

test('availability: Monday 10:00-12:00 fits Mon 09:00-18:00', () => {
  const av = [{ day_of_week: 1, start_time: '09:00:00', end_time: '18:00:00' }];
  assert.equal(r.fitsAvailability(av, '2030-01-07', '10:00:00', '12:00:00'), true); // 2030-01-07 is a Monday
});
test('availability: booking that ends after closing is rejected', () => {
  const av = [{ day_of_week: 1, start_time: '09:00:00', end_time: '18:00:00' }];
  assert.equal(r.fitsAvailability(av, '2030-01-07', '17:00:00', '19:00:00'), false);
});
test('availability: day with no hours is rejected', () => {
  const av = [{ day_of_week: 1, start_time: '09:00:00', end_time: '18:00:00' }];
  assert.equal(r.fitsAvailability(av, '2030-01-06', '10:00:00', '12:00:00'), false); // Sunday
});

test('status rules: worker may accept or reject a pending booking', () => {
  assert.equal(r.canTransition('worker', 'pending', 'accepted'), true);
  assert.equal(r.canTransition('worker', 'pending', 'rejected'), true);
});
test('status rules: worker cannot skip straight to completed', () => {
  assert.equal(r.canTransition('worker', 'pending', 'completed'), false);
  assert.equal(r.canTransition('worker', 'accepted', 'completed'), false);
});
test('status rules: full worker path works', () => {
  assert.equal(r.canTransition('worker', 'accepted', 'in_progress'), true);
  assert.equal(r.canTransition('worker', 'in_progress', 'completed'), true);
});
test('status rules: customer can only cancel, never accept or complete', () => {
  assert.equal(r.canTransition('customer', 'pending', 'cancelled'), true);
  assert.equal(r.canTransition('customer', 'pending', 'accepted'), false);
  assert.equal(r.canTransition('customer', 'in_progress', 'completed'), false);
});
test('status rules: nothing leaves a final status', () => {
  for (const role of ['customer', 'worker', 'admin']) {
    for (const from of r.FINAL_STATUSES) {
      for (const to of ['pending', 'accepted', 'in_progress', 'completed', 'cancelled', 'rejected']) {
        assert.equal(r.canTransition(role, from, to), false, `${role}: ${from} -> ${to}`);
      }
    }
  }
});
test('status rules: unknown role has no permissions', () => {
  assert.equal(r.canTransition('hacker', 'pending', 'accepted'), false);
});

test('customer cancellation: pending can always be cancelled', () => {
  assert.equal(r.customerCanCancel('pending', '2030-01-07', '10:00'), true);
});
test('customer cancellation: accepted needs 24h notice', () => {
  const now = new Date('2030-01-06T10:00:00+05:30');
  assert.equal(r.customerCanCancel('accepted', '2030-01-07', '12:00', now), true);  // 26h left
  assert.equal(r.customerCanCancel('accepted', '2030-01-07', '09:00', now), false); // 23h left
});
test('customer cancellation: in-progress or completed cannot be cancelled by customer', () => {
  assert.equal(r.customerCanCancel('in_progress', '2030-01-07', '10:00'), false);
  assert.equal(r.customerCanCancel('completed', '2030-01-07', '10:00'), false);
});

test('future check', () => {
  const now = new Date('2030-01-06T10:00:00+05:30');
  assert.equal(r.isInFuture('2030-01-06', '09:00', now), false);
  assert.equal(r.isInFuture('2030-01-06', '11:00', now), true);
});
test('booking window: today ok, yesterday not, 91 days ahead not', () => {
  const now = new Date('2030-01-06T10:00:00+05:30');
  assert.equal(r.withinBookingWindow('2030-01-06', now), true);
  assert.equal(r.withinBookingWindow('2030-01-05', now), false);
  assert.equal(r.withinBookingWindow('2030-04-07', now), false); // > 90 days
  assert.equal(r.withinBookingWindow('2030-03-30', now), true);
});
