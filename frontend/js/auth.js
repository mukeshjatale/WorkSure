/* auth.js - login and registration forms, and the show/hide password buttons. */
(function () {
  'use strict';
  const WS = window.WS;

  // <button data-toggle-password data-target="inputId"> shows or hides a password field.
  document.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('[data-toggle-password]') : null;
    if (!button) return;
    const input = document.getElementById(button.dataset.target);
    if (!input) return;
    const showing = input.type === 'password';
    input.type = showing ? 'text' : 'password';
    button.setAttribute('aria-label', showing ? 'Hide password' : 'Show password');
    button.innerHTML = `<i class="fa-solid ${showing ? 'fa-eye-slash' : 'fa-eye'}" aria-hidden="true"></i>`;
  });

  function initLogin() {
    const form = WS.$('#login-form');
    if (!form) return;
    const alertBox = WS.$('#form-alert');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      WS.clearFieldErrors(form);
      WS.setAlert(alertBox, '');
      const data = new FormData(form);
      const button = form.querySelector('button[type="submit"]');
      WS.setBusy(button, true, 'Logging in…');

      try {
        const user = await WS.api.post('/auth/login', {
          email: String(data.get('email') || '').trim(),
          password: String(data.get('password') || '')
        });
        WS.setAlert(alertBox, 'Logged in. Taking you to your dashboard…', 'success');
        window.location.href = WS.safeNext(WS.qs('next'), user.redirect);
      } catch (error) {
        WS.showFieldErrors(form, error.errors);
        WS.setAlert(alertBox, error.message);
        WS.setBusy(button, false);
      }
    });
  }

  function initRegister() {
    const form = WS.$('#register-form');
    if (!form) return;
    const alertBox = WS.$('#form-alert');

    // Links such as register.html?role=worker pre-select the account type.
    if (WS.qs('role') === 'worker') form.elements.role.value = 'worker';

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      WS.clearFieldErrors(form);
      WS.setAlert(alertBox, '');
      const data = new FormData(form);
      const body = {
        fullName: String(data.get('fullName') || '').trim(),
        email: String(data.get('email') || '').trim(),
        phone: String(data.get('phone') || '').trim(),
        password: String(data.get('password') || ''),
        confirmPassword: String(data.get('confirmPassword') || ''),
        role: data.get('role'),
        acceptTerms: form.elements.acceptTerms.checked
      };

      // Quick checks in the browser. The server repeats every check, so these are only for convenience.
      const local = {};
      if (body.password !== body.confirmPassword) local.confirmPassword = 'Passwords do not match.';
      if (!body.acceptTerms) local.acceptTerms = 'Please accept the terms to continue.';
      if (Object.keys(local).length) {
        WS.showFieldErrors(form, local);
        return;
      }

      const button = form.querySelector('button[type="submit"]');
      WS.setBusy(button, true, 'Creating your account…');
      try {
        const user = await WS.api.post('/auth/register', body);
        const note = user.role === 'worker'
          ? 'Account created. Complete your professional profile; an admin must verify it before customers can book you.'
          : 'Account created. Taking you to your dashboard…';
        WS.setAlert(alertBox, note, 'success');
        window.location.href = user.redirect;
      } catch (error) {
        WS.showFieldErrors(form, error.errors);
        WS.setAlert(alertBox, error.message);
        WS.setBusy(button, false);
      }
    });
  }

  WS.ready.then((user) => {
    // Already logged in: go straight to the dashboard.
    if (user && (WS.$('#login-form') || WS.$('#register-form'))) {
      window.location.replace(user.redirect || 'index.html');
      return;
    }
    initLogin();
    initRegister();
  });
})();
