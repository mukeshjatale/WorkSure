const r = require('./rules');

function validateRegister(body = {}) {
  const c = r.collector();
  c.add('fullName', r.text(body.fullName, 'Full name', { min: 2, max: 100 }));
  c.add('email', r.email(body.email));
  c.add('phone', r.phone(body.phone));
  c.add('password', r.password(body.password));
  if (body.password !== body.confirmPassword) c.add('confirmPassword', 'Passwords do not match');
  // Only customer or worker. "admin" is rejected here on purpose.
  c.add('role', r.oneOf(body.role, 'Role', ['customer', 'worker']));
  if (body.acceptTerms !== true && body.acceptTerms !== 'true') c.add('acceptTerms', 'You must accept the terms');
  return {
    errors: c.errors,
    value: c.ok ? {
      fullName: body.fullName.trim(),
      email: body.email.trim().toLowerCase(),
      phone: body.phone.trim(),
      password: body.password,
      role: body.role
    } : null
  };
}

function validateLogin(body = {}) {
  const c = r.collector();
  c.add('email', r.email(body.email));
  c.add('password', r.required(body.password, 'Password'));
  return {
    errors: c.errors,
    value: c.ok ? { email: body.email.trim().toLowerCase(), password: String(body.password) } : null
  };
}

function validateProfileUpdate(body = {}) {
  const c = r.collector();
  c.add('fullName', r.text(body.fullName, 'Full name', { min: 2, max: 100 }));
  c.add('phone', r.phone(body.phone));
  return { errors: c.errors, value: c.ok ? { fullName: body.fullName.trim(), phone: body.phone.trim() } : null };
}

function validatePasswordChange(body = {}) {
  const c = r.collector();
  c.add('currentPassword', r.required(body.currentPassword, 'Current password'));
  c.add('newPassword', r.password(body.newPassword));
  if (body.newPassword !== body.confirmPassword) c.add('confirmPassword', 'Passwords do not match');
  return {
    errors: c.errors,
    value: c.ok ? { currentPassword: String(body.currentPassword), newPassword: body.newPassword } : null
  };
}

module.exports = { validateRegister, validateLogin, validateProfileUpdate, validatePasswordChange };
