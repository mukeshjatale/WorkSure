/* worker-dashboard.js - the worker dashboard: booking requests, active jobs, history, earnings,
   professional profile and photo, services and prices, weekly availability and reviews. */
(function () {
  'use strict';
  const WS = window.WS;
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first
  const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

  // What a worker can do next, by booking status. The server enforces the same rules.
  const ACTIONS = {
    accept: { status: 'accepted', label: 'Accept', cls: 'btn-primary' },
    reject: { status: 'rejected', label: 'Decline', cls: 'btn-danger-outline', ask: 'Reason for declining (optional):' },
    start: { status: 'in_progress', label: 'Start job', cls: 'btn-primary' },
    complete: { status: 'completed', label: 'Mark completed', cls: 'btn-accent', confirm: 'Mark this job as completed?' },
    cancel: { status: 'cancelled', label: 'Cancel booking', cls: 'btn-danger-outline', ask: 'Reason for cancelling (optional):', confirm: 'Cancel this accepted booking?' }
  };
  const NEXT_ACTIONS = {
    pending: ['accept', 'reject'],
    accepted: ['start', 'cancel'],
    in_progress: ['complete']
  };

  const setText = (selector, text) => {
    const el = WS.$(selector);
    if (el) el.textContent = text;
  };
  const text = (formData, name) => String(formData.get(name) || '').trim();

  WS.ready.then((user) => {
    if (!user || user.role !== 'worker') return;
    initBookingActions();
    initProfile();
    initServices();
    initAvailability();

    const loaders = {
      requests: refreshBookings,
      jobs: refreshBookings,
      history: refreshBookings,
      earnings: refreshEarnings,
      profile: loadProfile,
      services: loadServices,
      availability: loadAvailability,
      reviews: loadReviews
    };
    WS.initTabs(WS.$('#worker-tabs'), (name) => {
      if (loaders[name]) loaders[name]();
    });
  });

  /* ---------- bookings: requests, jobs, history ---------- */
  function jobCard(b) {
    const id = Number(b.id);
    const buttons = (NEXT_ACTIONS[b.status] || []).map((key) => {
      const def = ACTIONS[key];
      return `<button type="button" class="btn ${def.cls} btn-sm" data-action="${key}" data-id="${id}">${def.label}</button>`;
    }).join('');

    return `
      <article class="card booking-card" id="job-${id}">
        <div class="booking-head">
          <div>
            <h3>${WS.esc(b.serviceName)}</h3>
            <p class="muted">${WS.esc(b.categoryName)} &middot; Booking #${id}</p>
          </div>
          ${WS.statusBadge(b.status)}
        </div>
        <dl class="booking-meta">
          <div><dt>Customer</dt><dd>${WS.esc(b.customerName)}</dd></div>
          <div><dt>Date and time</dt><dd>${WS.fmtDate(b.bookingDate)}, ${WS.fmtTime(b.startTime)} &ndash; ${WS.fmtTime(b.endTime)}</dd></div>
          <div><dt>Address</dt><dd>${WS.esc(b.address)}</dd></div>
          <div><dt>Agreed price</dt><dd><span class="price">${WS.money(b.agreedPrice)}</span></dd></div>
          ${b.description ? `<div><dt>Problem described</dt><dd>${WS.esc(b.description)}</dd></div>` : ''}
          ${b.cancelReason ? `<div><dt>Note</dt><dd>${WS.esc(b.cancelReason)}</dd></div>` : ''}
        </dl>
        ${buttons ? `<div class="booking-actions">${buttons}</div>` : ''}
      </article>`;
  }

  function renderList(container, items, empty) {
    if (!items.length) {
      WS.state(container, empty);
      return;
    }
    container.innerHTML = items.map(jobCard).join('');
  }

  async function refreshBookings() {
    const requests = WS.$('#list-requests');
    const jobs = WS.$('#list-jobs');
    const history = WS.$('#list-history');
    [requests, jobs, history].forEach((list) => WS.loading(list, 'Loading bookings…'));

    try {
      const result = await WS.api.get('/bookings', { limit: 100 });
      const items = result.items;
      const pending = items.filter((b) => b.status === 'pending');
      setText('#count-requests', String(pending.length));
      renderList(requests, pending, {
        icon: 'fa-inbox', title: 'No new requests', text: 'New booking requests from customers appear here.'
      });
      renderList(jobs, items.filter((b) => ['accepted', 'in_progress'].includes(b.status)), {
        icon: 'fa-screwdriver-wrench', title: 'No active jobs', text: 'Accepted bookings you are working on appear here.'
      });
      renderList(history, items.filter((b) => ['completed', 'rejected', 'cancelled'].includes(b.status)), {
        icon: 'fa-clock-rotate-left', title: 'No past jobs yet', text: 'Completed, declined and cancelled bookings appear here.'
      });
    } catch (error) {
      [requests, jobs, history].forEach((list) => WS.state(list, {
        icon: 'fa-triangle-exclamation', title: 'Could not load bookings', text: error.message
      }));
    }
  }

  async function runBookingAction(button) {
    const def = ACTIONS[button.dataset.action];
    const id = Number(button.dataset.id);
    if (!def) return;
    if (def.confirm && !window.confirm(def.confirm)) return;

    let reason;
    if (def.ask) {
      const answer = window.prompt(def.ask, '');
      if (answer === null) return; // the user pressed Cancel in the prompt
      reason = answer.trim() || undefined;
    }

    WS.setBusy(button, true, 'Saving…');
    try {
      await WS.api.patch(`/bookings/${id}/status`, { status: def.status, reason });
      WS.toast('Booking updated.');
      await Promise.all([refreshBookings(), refreshEarnings()]);
    } catch (error) {
      WS.toast(error.message, 'error');
      WS.setBusy(button, false);
    }
  }

  function initBookingActions() {
    WS.$('#worker-main').addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (button) runBookingAction(button);
    });
  }

  /* ---------- earnings ---------- */
  async function refreshEarnings() {
    const recent = WS.$('#earn-recent');
    try {
      const e = await WS.api.get('/worker/earnings');
      setText('#earn-total', WS.money(e.totalEarned));
      setText('#earn-total-jobs', `${Number(e.completedJobs)} completed job(s)`);
      setText('#earn-month', WS.money(e.thisMonthEarned));
      setText('#earn-month-jobs', `${Number(e.thisMonthJobs)} job(s) this month`);
      setText('#earn-upcoming', WS.money(e.upcomingValue));
      setText('#earn-upcoming-jobs', `${Number(e.upcomingJobs)} job(s) booked`);
      setText('#earn-pending', String(Number(e.pendingRequests)));
      setText('#earn-note', e.note);
      recent.innerHTML = e.recent.length
        ? e.recent.map((r) => `
            <tr>
              <td>${WS.fmtDate(r.bookingDate)}</td>
              <td>${WS.esc(r.serviceName)}</td>
              <td><span class="price">${WS.money(r.agreedPrice)}</span></td>
            </tr>`).join('')
        : '<tr><td colspan="3" class="muted">No completed jobs yet.</td></tr>';
    } catch (error) {
      recent.innerHTML = `<tr><td colspan="3" class="muted">Could not load earnings: ${WS.esc(error.message)}</td></tr>`;
    }
  }

  /* ---------- professional profile and photo ---------- */
  function verifyNote(status) {
    const note = WS.$('#verify-note');
    const messages = {
      verified: ['is-verified', 'Your profile is verified. Customers can find and book you.'],
      pending: ['is-pending', 'Your profile is waiting for admin verification. It stays hidden from customers until it is approved.'],
      rejected: ['is-rejected', 'Your verification was not approved. Update your details or contact support for help.']
    };
    const [cls, message] = messages[status] || messages.pending;
    note.className = `verify-note ${cls}`;
    note.textContent = message;
  }

  function showPhoto(url) {
    const img = WS.$('#photo-preview');
    const fallback = WS.$('#photo-fallback');
    img.hidden = !url;
    if (url) img.src = url;
    fallback.hidden = Boolean(url);
  }

  async function loadProfile() {
    const form = WS.$('#worker-profile-form');
    const alertBox = WS.$('#profile-alert');
    WS.setAlert(alertBox, '');
    try {
      const p = await WS.api.get('/worker/profile');
      form.elements.headline.value = p.headline || '';
      form.elements.bio.value = p.bio || '';
      form.elements.skills.value = p.skills || '';
      form.elements.experienceYears.value = p.experienceYears === null ? 0 : p.experienceYears;
      form.elements.location.value = p.location || '';
      form.elements.serviceArea.value = p.serviceArea || '';
      form.elements.isAvailable.checked = Boolean(p.isAvailable);
      verifyNote(p.verificationStatus);
      showPhoto(p.profilePhoto);
    } catch (error) {
      WS.setAlert(alertBox, error.message);
    }
  }

  function initProfile() {
    const form = WS.$('#worker-profile-form');
    const alertBox = WS.$('#profile-alert');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      WS.clearFieldErrors(form);
      WS.setAlert(alertBox, '');
      const data = new FormData(form);
      const body = {
        headline: text(data, 'headline'),
        bio: text(data, 'bio'),
        skills: text(data, 'skills'),
        experienceYears: Number(data.get('experienceYears')),
        location: text(data, 'location'),
        serviceArea: text(data, 'serviceArea'),
        isAvailable: form.elements.isAvailable.checked
      };
      const button = form.querySelector('button[type="submit"]');
      WS.setBusy(button, true, 'Saving…');
      try {
        await WS.api.put('/worker/profile', body);
        WS.toast('Profile saved.');
      } catch (error) {
        WS.showFieldErrors(form, error.errors);
        WS.setAlert(alertBox, error.message);
      } finally {
        WS.setBusy(button, false);
      }
    });

    const photoForm = WS.$('#photo-form');
    const photoAlert = WS.$('#photo-alert');
    photoForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      WS.setAlert(photoAlert, '');
      const input = photoForm.elements.photo;
      const file = input.files && input.files[0];
      if (!file) {
        WS.setAlert(photoAlert, 'Choose an image first.');
        return;
      }
      if (!PHOTO_TYPES.includes(file.type)) {
        WS.setAlert(photoAlert, 'Only JPG, PNG or WEBP images are allowed.');
        return;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        WS.setAlert(photoAlert, 'The image must be 2 MB or smaller.');
        return;
      }
      const button = photoForm.querySelector('button[type="submit"]');
      WS.setBusy(button, true, 'Uploading…');
      try {
        const result = await WS.api.upload('/worker/profile/photo', new FormData(photoForm));
        showPhoto(result.profilePhoto);
        input.value = '';
        WS.toast('Profile photo updated.');
      } catch (error) {
        WS.setAlert(photoAlert, error.message);
      } finally {
        WS.setBusy(button, false);
      }
    });
  }

  /* ---------- services and prices ---------- */
  function renderMyServices(services) {
    const body = WS.$('#services-body');
    if (!services.length) {
      body.innerHTML = '<tr><td colspan="5" class="muted">You have not added any services yet. Use the form below.</td></tr>';
      return;
    }
    body.innerHTML = services.map((s) => {
      const id = Number(s.serviceId);
      return `
        <tr data-service-row="${id}">
          <td><strong>${WS.esc(s.name)}</strong><div class="small muted">${WS.esc(s.categoryName)}</div></td>
          <td>${WS.money(s.basePrice)} &middot; ${Number(s.durationMinutes)} min</td>
          <td>
            <label class="sr-only" for="price-${id}">Your price for ${WS.esc(s.name)}</label>
            <input class="input" id="price-${id}" type="number" min="1" step="0.01" value="${Number(s.price)}" data-price>
          </td>
          <td>
            <label class="checkbox-row"><input type="checkbox" data-active ${s.isActive ? 'checked' : ''}> <span>Accepting</span></label>
          </td>
          <td>
            <div class="actions">
              <button type="button" class="btn btn-primary btn-sm" data-service-action="save" data-id="${id}">Save</button>
              <button type="button" class="btn btn-danger-outline btn-sm" data-service-action="remove" data-id="${id}">Remove</button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  function fillServiceOptions(all, mine) {
    const taken = new Set(mine.map((s) => Number(s.serviceId)));
    const available = all.filter((s) => !taken.has(Number(s.id)));
    const select = WS.$('#add-service-select');
    select.innerHTML = available.length
      ? '<option value="">Choose a service</option>' + available.map((s) =>
          `<option value="${Number(s.id)}">${WS.esc(s.name)} (${WS.esc(s.categoryName)}) &middot; base ${WS.money(s.basePrice)}</option>`).join('')
      : '<option value="">You already offer every active service</option>';
    select.disabled = !available.length;
  }

  async function loadServices() {
    const body = WS.$('#services-body');
    WS.setAlert(WS.$('#services-alert'), '');
    body.innerHTML = '<tr><td colspan="5" class="muted">Loading services…</td></tr>';
    try {
      const [mine, all] = await Promise.all([WS.api.get('/worker/services'), WS.api.get('/services')]);
      renderMyServices(mine);
      fillServiceOptions(all, mine);
    } catch (error) {
      body.innerHTML = `<tr><td colspan="5" class="muted">Could not load services: ${WS.esc(error.message)}</td></tr>`;
    }
  }

  function initServices() {
    const body = WS.$('#services-body');
    const alertBox = WS.$('#services-alert');

    body.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-service-action]');
      if (!button) return;
      const id = Number(button.dataset.id);
      const row = body.querySelector(`[data-service-row="${id}"]`);

      if (button.dataset.serviceAction === 'save') {
        const price = Number(row.querySelector('[data-price]').value);
        const isActive = row.querySelector('[data-active]').checked;
        if (!(price > 0)) {
          WS.setAlert(alertBox, 'Enter a price greater than 0.');
          return;
        }
        WS.setBusy(button, true, 'Saving…');
        try {
          await WS.api.put(`/worker/services/${id}`, { price, isActive });
          WS.toast('Service saved.');
          await loadServices();
        } catch (error) {
          WS.setAlert(alertBox, error.message);
          WS.setBusy(button, false);
        }
      }

      if (button.dataset.serviceAction === 'remove') {
        if (!window.confirm('Remove this service from your profile?')) return;
        WS.setBusy(button, true, 'Removing…');
        try {
          await WS.api.del(`/worker/services/${id}`);
          WS.toast('Service removed.');
          await loadServices();
        } catch (error) {
          WS.setAlert(alertBox, error.message);
          WS.setBusy(button, false);
        }
      }
    });

    const addForm = WS.$('#add-service-form');
    addForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      WS.clearFieldErrors(addForm);
      WS.setAlert(alertBox, '');
      const data = new FormData(addForm);
      const body2 = { serviceId: Number(data.get('serviceId')), price: Number(data.get('price')) };
      const errors = {};
      if (!body2.serviceId) errors.serviceId = 'Choose a service.';
      if (!(body2.price > 0)) errors.price = 'Enter a price greater than 0.';
      if (Object.keys(errors).length) {
        WS.showFieldErrors(addForm, errors);
        return;
      }
      const button = addForm.querySelector('button[type="submit"]');
      WS.setBusy(button, true, 'Adding…');
      try {
        await WS.api.post('/worker/services', body2);
        addForm.reset();
        WS.toast('Service added.');
        await loadServices();
      } catch (error) {
        WS.showFieldErrors(addForm, error.errors);
        WS.setAlert(alertBox, error.message);
      } finally {
        WS.setBusy(button, false);
      }
    });
  }

  /* ---------- weekly availability ---------- */
  function renderAvailability(slots) {
    WS.$('#availability-rows').innerHTML = DAY_ORDER.map((day) => {
      const slot = slots.find((s) => Number(s.dayOfWeek) === day);
      const name = DAY_NAMES[day];
      return `
        <div class="availability-row">
          <label class="checkbox-row"><input type="checkbox" name="on-${day}" ${slot ? 'checked' : ''}>
            <span class="day-name">${name}</span></label>
          <div class="availability-times">
            <label class="sr-only" for="start-${day}">${name} start time</label>
            <input class="input" type="time" id="start-${day}" name="start-${day}" value="${slot ? slot.startTime : '09:00'}">
            <span class="muted" aria-hidden="true">to</span>
            <label class="sr-only" for="end-${day}">${name} end time</label>
            <input class="input" type="time" id="end-${day}" name="end-${day}" value="${slot ? slot.endTime : '18:00'}">
          </div>
        </div>`;
    }).join('');
  }

  async function loadAvailability() {
    const alertBox = WS.$('#availability-alert');
    WS.setAlert(alertBox, '');
    try {
      renderAvailability(await WS.api.get('/worker/availability'));
    } catch (error) {
      WS.setAlert(alertBox, error.message);
    }
  }

  function initAvailability() {
    const form = WS.$('#availability-form');
    const alertBox = WS.$('#availability-alert');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      WS.setAlert(alertBox, '');
      const data = new FormData(form);
      const slots = [];
      for (const day of DAY_ORDER) {
        if (!data.get(`on-${day}`)) continue;
        const startTime = String(data.get(`start-${day}`) || '');
        const endTime = String(data.get(`end-${day}`) || '');
        if (!startTime || !endTime || endTime <= startTime) {
          WS.setAlert(alertBox, `${DAY_NAMES[day]}: the end time must be after the start time.`);
          return;
        }
        slots.push({ dayOfWeek: day, startTime, endTime });
      }
      const button = form.querySelector('button[type="submit"]');
      WS.setBusy(button, true, 'Saving…');
      try {
        await WS.api.put('/worker/availability', { slots });
        WS.toast('Working hours saved.');
      } catch (error) {
        WS.setAlert(alertBox, error.message);
      } finally {
        WS.setBusy(button, false);
      }
    });
  }

  /* ---------- reviews ---------- */
  async function loadReviews() {
    const list = WS.$('#worker-reviews-list');
    const status = WS.$('#worker-reviews-status');
    status.textContent = '';
    try {
      const result = await WS.api.get('/worker/reviews');
      setText('#worker-avg', result.reviewCount
        ? `${Number(result.avgRating).toFixed(1)} average from ${Number(result.reviewCount)} review(s)`
        : 'No reviews yet');
      if (!result.items.length) {
        list.innerHTML = '';
        status.textContent = 'Reviews from completed jobs will appear here.';
        return;
      }
      list.innerHTML = result.items.map((r) => `
        <article class="card review-item">
          <div>${WS.stars(r.rating)}</div>
          <p>${r.comment ? WS.esc(r.comment) : '<span class="muted">No comment written.</span>'}</p>
          <p class="small muted">${WS.esc(r.customerName)} &middot; ${WS.esc(r.serviceName)} &middot; ${WS.fmtDate(r.createdAt)}</p>
        </article>`).join('');
    } catch (error) {
      status.textContent = `Could not load reviews: ${error.message}`;
    }
  }
})();
