/* admin-dashboard.js - administrator tools: overview, worker verification, accounts, categories, services,
   bookings, review moderation, reports and the activity log. Every action is checked again by the server. */
(function () {
  'use strict';
  const WS = window.WS;
  const PAGE_SIZE = 20;
  const ROLE_LABELS = { customer: 'Customer', worker: 'Worker', admin: 'Admin' };
  const BOOKING_STATUSES = ['pending', 'accepted', 'in_progress', 'completed', 'rejected', 'cancelled'];
  const state = {
    categories: [],
    page: { workers: 1, users: 1, bookings: 1, reviews: 1 }
  };

  WS.ready.then((user) => {
    if (!user || user.role !== 'admin') return;
    initActions();
    initForms();
    initFilters();

    const loaders = {
      overview: loadOverview,
      workers: loadWorkers,
      users: loadUsers,
      categories: loadCategories,
      services: loadServicesAdmin,
      bookings: loadBookings,
      reviews: loadReviews,
      reports: loadReports,
      activity: loadLogs
    };
    WS.initTabs(WS.$('#admin-tabs'), (name) => {
      if (loaders[name]) loaders[name]();
    });
  });

  /* ---------- table helpers ---------- */
  const esc = WS.esc;
  const setText = (selector, value) => {
    const el = WS.$(selector);
    if (el) el.textContent = value;
  };
  const rowMessage = (colspan, message) => `<tr><td colspan="${colspan}" class="muted">${esc(message)}</td></tr>`;
  const loadingRow = (body, colspan) => { body.innerHTML = rowMessage(colspan, 'Loading…'); };
  const errorRow = (body, colspan, error) => { body.innerHTML = rowMessage(colspan, `Could not load: ${error.message}`); };
  const visibleBadge = (on, onText, offText) => on
    ? `<span class="badge badge-verified">${esc(onText)}</span>`
    : `<span class="badge badge-pending">${esc(offText)}</span>`;

  /* ---------- overview ---------- */
  async function loadOverview() {
    const grid = WS.$('#admin-stats');
    const statusList = WS.$('#booking-status-summary');
    WS.loading(grid, 'Loading statistics…');
    try {
      const s = await WS.api.get('/admin/stats');
      const totalBookings = Object.values(s.bookingsByStatus).reduce((sum, n) => sum + Number(n), 0);
      const cards = [
        ['Customers', s.users.customer || 0],
        ['Workers', s.users.worker || 0],
        ['Pending verification', s.workersByVerification.pending || 0],
        ['Verified workers', s.workersByVerification.verified || 0],
        ['Inactive accounts', s.inactiveUsers || 0],
        ['Total bookings', totalBookings],
        ['Completed jobs', s.completedBookings || 0],
        ['Completed job value', WS.money(s.completedBookingValue)],
        ['Reviews', s.reviews.total || 0],
        ['Hidden reviews', s.reviews.hidden || 0]
      ];
      grid.innerHTML = cards.map(([label, value]) => `
        <div class="card stat-card">
          <div class="stat-value">${esc(value)}</div>
          <div class="stat-label">${esc(label)}</div>
        </div>`).join('');
      statusList.innerHTML = BOOKING_STATUSES.map((status) =>
        `<li>${WS.statusBadge(status)} <strong>${Number(s.bookingsByStatus[status] || 0)}</strong></li>`).join('');
    } catch (error) {
      WS.state(grid, { icon: 'fa-triangle-exclamation', title: 'Could not load statistics', text: error.message });
    }
  }

  /* ---------- workers: verification ---------- */
  function workerRow(w) {
    const id = Number(w.id);
    const actions = [];
    if (w.verificationStatus !== 'verified') {
      actions.push(`<button type="button" class="btn btn-primary btn-sm" data-action="verify-worker" data-id="${id}" data-status="verified">Verify</button>`);
    }
    if (w.verificationStatus !== 'rejected') {
      actions.push(`<button type="button" class="btn btn-danger-outline btn-sm" data-action="verify-worker" data-id="${id}" data-status="rejected">Reject</button>`);
    }
    if (w.verificationStatus !== 'pending') {
      actions.push(`<button type="button" class="btn btn-ghost btn-sm" data-action="verify-worker" data-id="${id}" data-status="pending">Set pending</button>`);
    }
    return `
      <tr>
        <td><strong>${esc(w.fullName)}</strong><div class="small muted">${esc(w.email)}<br>${esc(w.phone)}</div></td>
        <td>${esc(w.headline || '—')}<div class="small muted">${esc(w.location || '')}</div></td>
        <td>${Number(w.experienceYears || 0)} yrs</td>
        <td>${Number(w.serviceCount || 0)}</td>
        <td><span class="badge badge-${esc(w.verificationStatus)}">${esc(w.verificationStatus)}</span></td>
        <td>${Number(w.reviewCount || 0)} &middot; ${Number(w.avgRating || 0).toFixed(1)}</td>
        <td><div class="actions">${actions.join('')}</div></td>
      </tr>`;
  }

  async function loadWorkers() {
    const body = WS.$('#workers-body');
    loadingRow(body, 7);
    try {
      const result = await WS.api.get('/admin/workers', {
        status: WS.$('#worker-status-filter').value,
        page: state.page.workers,
        limit: PAGE_SIZE
      });
      body.innerHTML = result.items.length ? result.items.map(workerRow).join('') : rowMessage(7, 'No workers in this list.');
      WS.renderPager(WS.$('#workers-pager'), result, (page) => {
        state.page.workers = page;
        loadWorkers();
      });
    } catch (error) {
      errorRow(body, 7, error);
    }
  }

  /* ---------- users ---------- */
  function userRow(u) {
    const id = Number(u.id);
    const toggle = u.isActive
      ? `<button type="button" class="btn btn-danger-outline btn-sm" data-action="toggle-user" data-id="${id}" data-active="1">Deactivate</button>`
      : `<button type="button" class="btn btn-primary btn-sm" data-action="toggle-user" data-id="${id}" data-active="0">Activate</button>`;
    return `
      <tr>
        <td><strong>${esc(u.fullName)}</strong></td>
        <td>${esc(u.email)}<div class="small muted">${esc(u.phone)}</div></td>
        <td>${esc(ROLE_LABELS[u.role] || u.role)}</td>
        <td>${visibleBadge(u.isActive, 'Active', 'Inactive')}</td>
        <td>${WS.fmtDate(String(u.createdAt).slice(0, 10))}</td>
        <td>${toggle}</td>
      </tr>`;
  }

  async function loadUsers() {
    const body = WS.$('#users-body');
    loadingRow(body, 6);
    try {
      const result = await WS.api.get('/admin/users', {
        role: WS.$('#user-role-filter').value,
        q: WS.$('#user-search').value.trim(),
        page: state.page.users,
        limit: PAGE_SIZE
      });
      body.innerHTML = result.items.length ? result.items.map(userRow).join('') : rowMessage(6, 'No accounts match.');
      WS.renderPager(WS.$('#users-pager'), result, (page) => {
        state.page.users = page;
        loadUsers();
      });
    } catch (error) {
      errorRow(body, 6, error);
    }
  }

  /* ---------- categories ---------- */
  function categoryRow(c) {
    const id = Number(c.id);
    return `
      <tr>
        <td><strong>${esc(c.name)}</strong><div class="small muted">${esc(c.description || '')}</div></td>
        <td><i class="fa-solid ${esc(c.icon)}" aria-hidden="true"></i> <span class="small muted">${esc(c.icon)}</span></td>
        <td>${visibleBadge(c.isActive, 'Visible', 'Hidden')}</td>
        <td class="small muted">${esc(c.slug)}</td>
        <td>
          <div class="actions">
            <button type="button" class="btn btn-outline btn-sm" data-action="edit-category" data-id="${id}">Edit</button>
            <button type="button" class="btn btn-ghost btn-sm" data-action="toggle-category" data-id="${id}" data-active="${c.isActive ? 1 : 0}">${c.isActive ? 'Hide' : 'Show'}</button>
          </div>
        </td>
      </tr>`;
  }

  async function loadCategories() {
    const body = WS.$('#categories-body');
    loadingRow(body, 5);
    try {
      state.categories = await WS.api.get('/admin/categories');
      body.innerHTML = state.categories.length
        ? state.categories.map(categoryRow).join('')
        : rowMessage(5, 'No categories yet. Add one with the form above.');
      fillCategorySelect();
    } catch (error) {
      errorRow(body, 5, error);
    }
  }

  function fillCategorySelect() {
    const select = WS.$('#service-category');
    const current = select.value;
    select.innerHTML = '<option value="">Choose a category</option>' + state.categories.map((c) =>
      `<option value="${Number(c.id)}">${esc(c.name)}${c.isActive ? '' : ' (hidden)'}</option>`).join('');
    if (current) select.value = current;
  }

  function fillCategoryForm(id) {
    const form = WS.$('#category-form');
    const c = state.categories.find((item) => Number(item.id) === id);
    if (!c) return;
    form.elements.categoryId.value = c.id;
    form.elements.name.value = c.name;
    form.elements.description.value = c.description || '';
    form.elements.icon.value = c.icon || '';
    form.elements.imageUrl.value = c.imageUrl || '';
    WS.$('#category-form-title').textContent = `Edit category: ${c.name}`;
    WS.clearFieldErrors(form);
    form.elements.name.focus();
  }

  function resetCategoryForm() {
    const form = WS.$('#category-form');
    form.reset();
    form.elements.categoryId.value = '';
    WS.$('#category-form-title').textContent = 'Add a category';
    WS.clearFieldErrors(form);
    WS.setAlert(WS.$('#category-alert'), '');
  }

  /* ---------- services ---------- */
  function serviceRow(s) {
    const id = Number(s.id);
    return `
      <tr>
        <td><strong>${esc(s.name)}</strong><div class="small muted">${esc(s.description || '')}</div></td>
        <td>${esc(s.categoryName)}</td>
        <td>${WS.money(s.basePrice)}</td>
        <td>${Number(s.durationMinutes)} min</td>
        <td>${visibleBadge(s.isActive, 'Visible', 'Hidden')}</td>
        <td>
          <div class="actions">
            <button type="button" class="btn btn-outline btn-sm" data-action="edit-service" data-id="${id}">Edit</button>
            <button type="button" class="btn btn-ghost btn-sm" data-action="toggle-service" data-id="${id}" data-active="${s.isActive ? 1 : 0}">${s.isActive ? 'Hide' : 'Show'}</button>
          </div>
        </td>
      </tr>`;
  }

  async function loadServicesAdmin() {
    const body = WS.$('#services-admin-body');
    loadingRow(body, 6);
    try {
      state.categories = await WS.api.get('/admin/categories');
      fillCategorySelect();
      const services = await WS.api.get('/admin/services');
      body.innerHTML = services.length ? services.map(serviceRow).join('') : rowMessage(6, 'No services yet.');
      state.services = services;
    } catch (error) {
      errorRow(body, 6, error);
    }
  }

  function fillServiceForm(id) {
    const form = WS.$('#service-form');
    const s = (state.services || []).find((item) => Number(item.id) === id);
    if (!s) return;
    form.elements.serviceId.value = s.id;
    form.elements.categoryId.value = s.categoryId;
    form.elements.name.value = s.name;
    form.elements.description.value = s.description || '';
    form.elements.basePrice.value = s.basePrice;
    form.elements.durationMinutes.value = s.durationMinutes;
    WS.$('#service-form-title').textContent = `Edit service: ${s.name}`;
    WS.clearFieldErrors(form);
    form.elements.name.focus();
  }

  function resetServiceForm() {
    const form = WS.$('#service-form');
    form.reset();
    form.elements.serviceId.value = '';
    form.elements.durationMinutes.value = '120';
    WS.$('#service-form-title').textContent = 'Add a service';
    WS.clearFieldErrors(form);
    WS.setAlert(WS.$('#service-alert'), '');
  }

  /* ---------- bookings ---------- */
  function bookingRow(b) {
    return `
      <tr>
        <td>#${Number(b.id)}</td>
        <td>${WS.fmtDate(b.bookingDate)}<div class="small muted">${WS.fmtTime(b.startTime)}</div></td>
        <td>${esc(b.serviceName)}</td>
        <td>${esc(b.customerName)}</td>
        <td>${esc(b.workerName)}</td>
        <td>${WS.money(b.agreedPrice)}</td>
        <td>${WS.statusBadge(b.status)}</td>
      </tr>`;
  }

  async function loadBookings() {
    const body = WS.$('#admin-bookings-body');
    loadingRow(body, 7);
    try {
      const result = await WS.api.get('/admin/bookings', {
        status: WS.$('#booking-status-filter').value,
        page: state.page.bookings,
        limit: PAGE_SIZE
      });
      body.innerHTML = result.items.length ? result.items.map(bookingRow).join('') : rowMessage(7, 'No bookings match this filter.');
      WS.renderPager(WS.$('#bookings-pager'), result, (page) => {
        state.page.bookings = page;
        loadBookings();
      });
    } catch (error) {
      errorRow(body, 7, error);
    }
  }

  /* ---------- reviews ---------- */
  function reviewRow(r) {
    const id = Number(r.id);
    const toggle = r.isHidden
      ? `<button type="button" class="btn btn-primary btn-sm" data-action="moderate-review" data-id="${id}" data-hidden="0">Show</button>`
      : `<button type="button" class="btn btn-danger-outline btn-sm" data-action="moderate-review" data-id="${id}" data-hidden="1">Hide</button>`;
    return `
      <tr>
        <td>${WS.stars(r.rating)}</td>
        <td>${esc(r.comment || '—')}</td>
        <td>${esc(r.customerName)}</td>
        <td>${esc(r.workerName)}</td>
        <td>${WS.fmtDate(String(r.createdAt).slice(0, 10))}</td>
        <td>${visibleBadge(!r.isHidden, 'Visible', 'Hidden')}</td>
        <td>${toggle}</td>
      </tr>`;
  }

  async function loadReviews() {
    const body = WS.$('#admin-reviews-body');
    loadingRow(body, 7);
    try {
      const result = await WS.api.get('/admin/reviews', {
        hidden: WS.$('#review-filter').value,
        page: state.page.reviews,
        limit: PAGE_SIZE
      });
      body.innerHTML = result.items.length ? result.items.map(reviewRow).join('') : rowMessage(7, 'No reviews match this filter.');
      WS.renderPager(WS.$('#reviews-pager'), result, (page) => {
        state.page.reviews = page;
        loadReviews();
      });
    } catch (error) {
      errorRow(body, 7, error);
    }
  }

  /* ---------- reports ---------- */
  function simpleRows(list, colspan, render, emptyText) {
    return list && list.length ? list.map(render).join('') : rowMessage(colspan, emptyText);
  }

  async function loadReports() {
    try {
      const r = await WS.api.get('/admin/reports');
      WS.$('#report-month-body').innerHTML = simpleRows(r.byMonth, 4, (m) => `
        <tr><td>${esc(m.month)}</td><td>${Number(m.bookings)}</td><td>${Number(m.completed)}</td><td>${WS.money(m.completedValue)}</td></tr>`,
        'No bookings in the last six months.');
      WS.$('#report-category-body').innerHTML = simpleRows(r.byCategory, 3, (c) => `
        <tr><td>${esc(c.category)}</td><td>${Number(c.bookings)}</td><td>${WS.money(c.completedValue)}</td></tr>`,
        'No bookings yet.');
      WS.$('#report-worker-body').innerHTML = simpleRows(r.topWorkers, 3, (w) => `
        <tr><td>${esc(w.fullName)}</td><td>${Number(w.completedJobs)}</td><td>${WS.money(w.earned)}</td></tr>`,
        'No completed jobs yet.');
      setText('#report-note', r.note || '');
    } catch (error) {
      WS.setAlert(WS.$('#report-alert'), `Could not load reports: ${error.message}`);
    }
  }

  /* ---------- activity log ---------- */
  async function loadLogs() {
    const body = WS.$('#logs-body');
    loadingRow(body, 5);
    try {
      const logs = await WS.api.get('/admin/logs');
      body.innerHTML = simpleRows(logs, 5, (l) => `
        <tr>
          <td>${WS.fmtDate(String(l.createdAt).slice(0, 10))}</td>
          <td>${esc(l.adminName || 'Removed account')}</td>
          <td>${esc(l.action)}</td>
          <td>${esc(l.targetType)} ${l.targetId ? '#' + Number(l.targetId) : ''}</td>
          <td>${esc(l.details || '')}</td>
        </tr>`, 'No administrator actions recorded yet.');
    } catch (error) {
      errorRow(body, 5, error);
    }
  }

  /* ---------- actions (buttons inside tables) ---------- */
  function initActions() {
    WS.$('#admin-main').addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const id = Number(button.dataset.id);
      const action = button.dataset.action;
      try {
        if (action === 'verify-worker') {
          await WS.api.patch(`/admin/workers/${id}/verification`, { status: button.dataset.status });
          WS.toast('Worker status updated.');
          loadWorkers();
        } else if (action === 'toggle-user') {
          const makeActive = button.dataset.active !== '1';
          if (!makeActive && !window.confirm('Deactivate this account? The person will not be able to log in.')) return;
          await WS.api.patch(`/admin/users/${id}/status`, { isActive: makeActive });
          WS.toast(makeActive ? 'Account activated.' : 'Account deactivated.');
          loadUsers();
        } else if (action === 'edit-category') {
          fillCategoryForm(id);
        } else if (action === 'toggle-category') {
          const makeActive = button.dataset.active !== '1';
          await WS.api.patch(`/admin/categories/${id}/status`, { isActive: makeActive });
          WS.toast(makeActive ? 'Category is visible.' : 'Category is hidden.');
          loadCategories();
        } else if (action === 'edit-service') {
          fillServiceForm(id);
        } else if (action === 'toggle-service') {
          const makeActive = button.dataset.active !== '1';
          await WS.api.patch(`/admin/services/${id}/status`, { isActive: makeActive });
          WS.toast(makeActive ? 'Service is visible.' : 'Service is hidden.');
          loadServicesAdmin();
        } else if (action === 'moderate-review') {
          const hide = button.dataset.hidden === '1';
          if (hide && !window.confirm('Hide this review from public pages?')) return;
          await WS.api.patch(`/admin/reviews/${id}/moderation`, { isHidden: hide });
          WS.toast(hide ? 'Review hidden.' : 'Review is visible again.');
          loadReviews();
        }
      } catch (error) {
        WS.toast(error.message, 'error');
      }
    });
  }

  /* ---------- forms ---------- */
  function initForms() {
    const categoryForm = WS.$('#category-form');
    categoryForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      WS.clearFieldErrors(categoryForm);
      WS.setAlert(WS.$('#category-alert'), '');
      const data = new FormData(categoryForm);
      const categoryId = String(data.get('categoryId') || '');
      const body = {
        name: String(data.get('name') || '').trim(),
        description: String(data.get('description') || '').trim(),
        icon: String(data.get('icon') || '').trim(),
        imageUrl: String(data.get('imageUrl') || '').trim()
      };
      const button = categoryForm.querySelector('button[type="submit"]');
      WS.setBusy(button, true, 'Saving…');
      try {
        if (categoryId) await WS.api.put(`/admin/categories/${categoryId}`, body);
        else await WS.api.post('/admin/categories', body);
        WS.toast('Category saved.');
        resetCategoryForm();
        loadCategories();
      } catch (error) {
        WS.showFieldErrors(categoryForm, error.errors);
        WS.setAlert(WS.$('#category-alert'), error.message);
      } finally {
        WS.setBusy(button, false);
      }
    });
    WS.$('#category-reset').addEventListener('click', resetCategoryForm);

    const serviceForm = WS.$('#service-form');
    serviceForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      WS.clearFieldErrors(serviceForm);
      WS.setAlert(WS.$('#service-alert'), '');
      const data = new FormData(serviceForm);
      const serviceId = String(data.get('serviceId') || '');
      const body = {
        categoryId: Number(data.get('categoryId')),
        name: String(data.get('name') || '').trim(),
        description: String(data.get('description') || '').trim(),
        basePrice: Number(data.get('basePrice')),
        durationMinutes: Number(data.get('durationMinutes'))
      };
      const button = serviceForm.querySelector('button[type="submit"]');
      WS.setBusy(button, true, 'Saving…');
      try {
        if (serviceId) await WS.api.put(`/admin/services/${serviceId}`, body);
        else await WS.api.post('/admin/services', body);
        WS.toast('Service saved.');
        resetServiceForm();
        loadServicesAdmin();
      } catch (error) {
        WS.showFieldErrors(serviceForm, error.errors);
        WS.setAlert(WS.$('#service-alert'), error.message);
      } finally {
        WS.setBusy(button, false);
      }
    });
    WS.$('#service-reset').addEventListener('click', resetServiceForm);
  }

  /* ---------- filters and search ---------- */
  function initFilters() {
    WS.$('#worker-status-filter').addEventListener('change', () => {
      state.page.workers = 1;
      loadWorkers();
    });
    WS.$('#user-role-filter').addEventListener('change', () => {
      state.page.users = 1;
      loadUsers();
    });
    WS.$('#user-search-form').addEventListener('submit', (event) => {
      event.preventDefault();
      state.page.users = 1;
      loadUsers();
    });
    WS.$('#booking-status-filter').addEventListener('change', () => {
      state.page.bookings = 1;
      loadBookings();
    });
    WS.$('#review-filter').addEventListener('change', () => {
      state.page.reviews = 1;
      loadReviews();
    });
  }
})();
