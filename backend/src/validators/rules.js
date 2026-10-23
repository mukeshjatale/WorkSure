// Small reusable checks. Each returns an error message (string) or null.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const isString = (v) => typeof v === 'string';

function required(v, label) {
  if (v === undefined || v === null || (isString(v) && v.trim() === '')) return `${label} is required`;
  return null;
}
function text(v, label, { min = 1, max = 255, optional = false } = {}) {
  if (v === undefined || v === null || (isString(v) && v.trim() === '')) {
    return optional ? null : `${label} is required`;
  }
  if (!isString(v)) return `${label} must be text`;
  const len = v.trim().length;
  if (len < min) return `${label} must be at least ${min} characters`;
  if (len > max) return `${label} must be at most ${max} characters`;
  return null;
}
function email(v) {
  if (!isString(v) || !EMAIL_RE.test(v.trim()) || v.length > 150) return 'Enter a valid email address';
  return null;
}
function phone(v) {
  if (!isString(v)) return 'Enter a valid phone number';
  const digits = v.replace(/\D/g, '');
  if (!/^[0-9+\-\s()]{7,20}$/.test(v.trim()) || digits.length < 7 || digits.length > 15) {
    return 'Enter a valid phone number (7 to 15 digits)';
  }
  return null;
}
function password(v) {
  if (!isString(v) || v.length < 8) return 'Password must be at least 8 characters';
  if (v.length > 72) return 'Password must be at most 72 characters';
  if (!/[A-Za-z]/.test(v) || !/[0-9]/.test(v)) return 'Password must contain at least one letter and one number';
  return null;
}
function intInRange(v, label, min, max) {
  const n = typeof v === 'number' ? v : Number(v);
  if (v === '' || v === null || v === undefined || !Number.isInteger(n) || n < min || n > max) {
    return `${label} must be a whole number between ${min} and ${max}`;
  }
  return null;
}
function money(v, label) {
  const n = typeof v === 'number' ? v : Number(v);
  if (v === '' || v === null || v === undefined || !Number.isFinite(n) || n <= 0 || n > 1000000) {
    return `${label} must be a number greater than 0`;
  }
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) {
    return `${label} can have at most 2 decimal places`;
  }
  return null;
}
function oneOf(v, label, allowed) {
  if (!allowed.includes(v)) return `${label} must be one of: ${allowed.join(', ')}`;
  return null;
}
// Real calendar date in YYYY-MM-DD
function date(v, label = 'Date') {
  if (!isString(v) || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${label} must be in YYYY-MM-DD format`;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return `${label} is not a real date`;
  return null;
}
// HH:MM (24 hour)
function time(v, label = 'Time') {
  if (!isString(v) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) return `${label} must be in HH:MM (24-hour) format`;
  return null;
}
function positiveId(v, label = 'ID') {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) return `${label} must be a positive whole number`;
  return null;
}

// Collects errors: const c = collector(); c.add('email', rules.email(x)); c.errors
function collector() {
  const errors = {};
  return {
    errors,
    add(field, msg) { if (msg && !errors[field]) errors[field] = msg; },
    get ok() { return Object.keys(errors).length === 0; }
  };
}

module.exports = { required, text, email, phone, password, intInRange, money, oneOf, date, time, positiveId, collector };
