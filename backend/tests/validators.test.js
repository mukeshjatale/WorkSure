const test = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../src/validators/authValidator');
const booking = require('../src/validators/bookingValidator');
const worker = require('../src/validators/workerValidator');
const admin = require('../src/validators/adminValidator');

const goodRegister = () => ({
  fullName: 'Asha Rao', email: 'Asha@Example.com', phone: '+91 98765 43210',
  password: 'Secret123', confirmPassword: 'Secret123', role: 'customer', acceptTerms: true
});

test('register: valid data passes and email is lower-cased', () => {
  const { errors, value } = auth.validateRegister(goodRegister());
  assert.deepEqual(errors, {});
  assert.equal(value.email, 'asha@example.com');
});
test('register: role "admin" is rejected', () => {
  const { errors } = auth.validateRegister({ ...goodRegister(), role: 'admin' });
  assert.ok(errors.role);
});
test('register: unknown extra fields are ignored (mass assignment)', () => {
  const { value } = auth.validateRegister({ ...goodRegister(), isActive: 0, id: 5, verification_status: 'verified' });
  assert.deepEqual(Object.keys(value).sort(), ['email', 'fullName', 'password', 'phone', 'role']);
});
test('register: weak password, mismatch, bad email, no terms', () => {
  const { errors } = auth.validateRegister({ ...goodRegister(), email: 'nope', password: 'abc', confirmPassword: 'xyz', acceptTerms: false });
  assert.ok(errors.email && errors.password && errors.confirmPassword && errors.acceptTerms);
});
test('register: password needs letters and numbers', () => {
  assert.ok(auth.validateRegister({ ...goodRegister(), password: 'onlyletters', confirmPassword: 'onlyletters' }).errors.password);
  assert.ok(auth.validateRegister({ ...goodRegister(), password: '12345678', confirmPassword: '12345678' }).errors.password);
});
test('register: non-string inputs do not crash', () => {
  const { errors } = auth.validateRegister({ fullName: { $ne: 1 }, email: ['a'], phone: 5, password: 1, role: {}, acceptTerms: 'yes' });
  assert.ok(Object.keys(errors).length >= 5);
});
test('login: requires valid email and a password', () => {
  assert.ok(auth.validateLogin({ email: 'bad', password: '' }).errors.email);
  assert.deepEqual(auth.validateLogin({ email: 'a@b.co', password: 'x' }).errors, {});
});

const goodBooking = () => ({ workerId: '3', serviceId: 2, bookingDate: '2030-01-07', startTime: '10:00', address: '12 Rose Lane, Pune', description: 'Leaking tap' });
test('booking: valid data passes and ids become numbers', () => {
  const { errors, value } = booking.validateCreateBooking(goodBooking());
  assert.deepEqual(errors, {});
  assert.equal(value.workerId, 3);
});
test('booking: client-sent price is ignored', () => {
  const { value } = booking.validateCreateBooking({ ...goodBooking(), agreedPrice: 1, price: 1, customerId: 99, status: 'completed' });
  assert.equal('agreedPrice' in value, false);
  assert.equal('customerId' in value, false);
  assert.equal('status' in value, false);
});
test('booking: rejects fake dates and bad times', () => {
  assert.ok(booking.validateCreateBooking({ ...goodBooking(), bookingDate: '2030-02-31' }).errors.bookingDate);
  assert.ok(booking.validateCreateBooking({ ...goodBooking(), startTime: '25:00' }).errors.startTime);
  assert.ok(booking.validateCreateBooking({ ...goodBooking(), startTime: '9am' }).errors.startTime);
});
test('booking: short address rejected', () => {
  assert.ok(booking.validateCreateBooking({ ...goodBooking(), address: 'x' }).errors.address);
});
test('status change: only allowed words', () => {
  assert.ok(booking.validateStatusChange({ status: 'pending' }).errors.status);
  assert.ok(booking.validateStatusChange({ status: 'hacked' }).errors.status);
  assert.deepEqual(booking.validateStatusChange({ status: 'accepted' }).errors, {});
});
test('review: rating must be 1-5', () => {
  assert.ok(booking.validateReview({ bookingId: 1, rating: 0 }).errors.rating);
  assert.ok(booking.validateReview({ bookingId: 1, rating: 6 }).errors.rating);
  assert.ok(booking.validateReview({ bookingId: 1, rating: 2.5 }).errors.rating);
  assert.deepEqual(booking.validateReview({ bookingId: 1, rating: 5, comment: 'Great' }).errors, {});
});

test('worker profile: needs all fields', () => {
  assert.ok(Object.keys(worker.validateWorkerProfile({}).errors).length >= 6);
});
test('worker service: price must be positive money', () => {
  assert.ok(worker.validateWorkerService({ serviceId: 1, price: -5 }).errors.price);
  assert.ok(worker.validateWorkerService({ serviceId: 1, price: 'abc' }).errors.price);
  assert.ok(worker.validateWorkerService({ serviceId: 1, price: 10.123 }).errors.price);
  assert.deepEqual(worker.validateWorkerService({ serviceId: 1, price: 499.5 }).errors, {});
});
test('availability: end must be after start, no repeated day', () => {
  assert.ok(worker.validateAvailability({ slots: [{ dayOfWeek: 1, startTime: '10:00', endTime: '09:00' }] }).errors['slots.0.endTime']);
  const dup = worker.validateAvailability({ slots: [
    { dayOfWeek: 1, startTime: '09:00', endTime: '10:00' }, { dayOfWeek: 1, startTime: '11:00', endTime: '12:00' }] });
  assert.ok(dup.errors['slots.1.dayOfWeek']);
  assert.deepEqual(worker.validateAvailability({ slots: [] }).errors, {});
});

test('admin: category icon must look like a Font Awesome class', () => {
  assert.ok(admin.validateCategory({ name: 'Gardening', icon: '<script>' }).errors.icon);
  assert.deepEqual(admin.validateCategory({ name: 'Gardening', icon: 'fa-seedling' }).errors, {});
});
test('admin: flags must be real booleans', () => {
  assert.ok(admin.validateActiveFlag({ isActive: 'yes' }).errors.isActive);
  assert.deepEqual(admin.validateActiveFlag({ isActive: false }).errors, {});
});
