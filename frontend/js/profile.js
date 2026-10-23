/* profile.js - account details and password change, shared by customers, workers and admins. */
(function () {
  'use strict';
  const WS = window.WS;
  const ROLE_LABELS = { customer: 'Customer', worker: 'Professional (worker)', admin: 'Administrator' };
  const ROLE_LINKS = {
    customer: '<a href="customer-dashboard.html">Back to your dashboard</a>',
    worker: '<a href="worker-dashboard.html">Manage your professional profile, services and hours</a>',
    admin: '<a href="admin-dashboard.html">Back to the admin dashboard</a>'
  };

  WS.ready.then((user) => {
    if (!user) return;
    const form = WS.$('#account-form');
    const passwordForm = WS.$('#password-form');
    WS.$('#account-role').textContent = ROLE_LABELS[user.role] || user.role;
    WS.$('#role-links').innerHTML = ROLE_LINKS[user.role] || '';

    fillAccount(form, user);
    form.addEventListener('submit', (event) => saveAccount(event, form));
    passwordForm.addEventListener('submit', (event) => changePassword(event, passwordForm));
  });

  function fillAccount(form, user) {
    form.elements.fullName.value = user.fullName || '';
    form.elements.email.value = user.email || '';
    form.elements.phone.value = user.phone || '';
  }

  async function saveAccount(event, form) {
    event.preventDefault();
    WS.clearFieldErrors(form);
    WS.setAlert(WS.$('#account-alert'), '');
    const data = new FormData(form);
    const button = form.querySelector('button[type="submit"]');
    WS.setBusy(button, true, 'Saving…');
    try {
      const updated = await WS.api.put('/auth/me', {
        fullName: String(data.get('fullName') || '').trim(),
        phone: String(data.get('phone') || '').trim()
      });
      fillAccount(form, updated);
      await WS.refreshLayout(); // updates the name shown in the header
      WS.toast('Your details are saved.');
    } catch (error) {
      WS.showFieldErrors(form, error.errors);
      WS.setAlert(WS.$('#account-alert'), error.message);
    } finally {
      WS.setBusy(button, false);
    }
  }

  async function changePassword(event, form) {
    event.preventDefault();
    WS.clearFieldErrors(form);
    WS.setAlert(WS.$('#password-alert'), '');
    const data = new FormData(form);
    const body = {
      currentPassword: String(data.get('currentPassword') || ''),
      newPassword: String(data.get('newPassword') || ''),
      confirmPassword: String(data.get('confirmPassword') || '')
    };
    const button = form.querySelector('button[type="submit"]');
    WS.setBusy(button, true, 'Updating…');
    try {
      await WS.api.put('/auth/me/password', body);
      form.reset();
      WS.toast('Your password has been changed.');
    } catch (error) {
      WS.showFieldErrors(form, error.errors);
      WS.setAlert(WS.$('#password-alert'), error.message);
    } finally {
      WS.setBusy(button, false);
    }
  }
})();
