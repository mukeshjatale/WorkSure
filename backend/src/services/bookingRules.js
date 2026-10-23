// Pure booking rules (no database here, so they are easy to unit-test).

const ACTIVE_STATUSES = ['pending', 'accepted', 'in_progress']; // these block a worker's time slot
const FINAL_STATUSES = ['rejected', 'completed', 'cancelled'];

// Who may move a booking from one status to another.
//   customer: cancel while pending, or while accepted (>= 24 hours before start)
//   worker:   accept/reject pending, start/cancel accepted, complete in_progress
//   admin:    cancel any pending/accepted booking
const TRANSITIONS = {
  customer: { pending: ['cancelled'], accepted: ['cancelled'] },
  worker: {
    pending: ['accepted', 'rejected'],
    accepted: ['in_progress', 'cancelled'],
    in_progress: ['completed']
  },
  admin: { pending: ['cancelled'], accepted: ['cancelled'], in_progress: ['cancelled'] }
};

const CUSTOMER_CANCEL_HOURS = 24;

function canTransition(role, from, to) {
  const allowed = TRANSITIONS[role] && TRANSITIONS[role][from];
  return Boolean(allowed && allowed.includes(to));
}

// "09:30" -> 570
function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':');
  return Number(h) * 60 + Number(m);
}
// 570 -> "09:30:00"
function toTimeString(totalMinutes) {
  const h = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const m = String(totalMinutes % 60).padStart(2, '0');
  return `${h}:${m}:00`;
}

// Do [aStart, aEnd) and [bStart, bEnd) share any time? (touching ends do NOT overlap)
function overlaps(aStart, aEnd, bStart, bEnd) {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);
}

// Is the booking inside the worker's weekly hours for that weekday?
// availability: [{ day_of_week, start_time, end_time }]
function fitsAvailability(availability, dateStr, startTime, endTime) {
  const dow = new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const slot = availability.find((a) => Number(a.day_of_week) === dow);
  if (!slot) return false;
  return toMinutes(startTime) >= toMinutes(slot.start_time) && toMinutes(endTime) <= toMinutes(slot.end_time);
}

// The booking start as a JS Date. We treat the local date/time as India Standard Time (UTC+05:30)
// because WorkSure's demo data is Indian. Change OFFSET if you deploy elsewhere.
const OFFSET = '+05:30';
function startDateTime(dateStr, startTime) {
  return new Date(`${dateStr}T${String(startTime).slice(0, 5)}:00${OFFSET}`);
}

function isInFuture(dateStr, startTime, now = new Date()) {
  return startDateTime(dateStr, startTime).getTime() > now.getTime();
}

// Customer cancellation rule for ACCEPTED bookings.
function customerCanCancel(status, dateStr, startTime, now = new Date()) {
  if (status === 'pending') return true;
  if (status !== 'accepted') return false;
  const hoursLeft = (startDateTime(dateStr, startTime).getTime() - now.getTime()) / 3600000;
  return hoursLeft >= CUSTOMER_CANCEL_HOURS;
}

// Booking date must be today..today+90 days
function withinBookingWindow(dateStr, now = new Date(), maxDays = 90) {
  const start = startDateTime(dateStr, '00:00').getTime();
  const todayIst = new Date(now.getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
  const todayStart = startDateTime(todayIst, '00:00').getTime();
  return start >= todayStart && start <= todayStart + maxDays * 86400000;
}

module.exports = {
  ACTIVE_STATUSES, FINAL_STATUSES, TRANSITIONS, CUSTOMER_CANCEL_HOURS,
  canTransition, toMinutes, toTimeString, overlaps, fitsAvailability,
  startDateTime, isInFuture, customerCanCancel, withinBookingWindow
};
