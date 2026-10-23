/* main.js - shared layout (header and footer), helper functions, the contact form and the home page.
   Loaded on every page right after api.js. Page-specific scripts wait for WS.ready. */
(function () {
  'use strict';

  const WS = (window.WS = window.WS || {});

  // Change this to your real support address. It appears in the footer and on the contact page.
  WS.SUPPORT_EMAIL = 'support@example.com';

  /* ---------- small helpers ---------- */
  WS.$ = (selector, root = document) => root.querySelector(selector);
  WS.$$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  // Escapes text before it goes into innerHTML, so user-written text cannot run as code.
  WS.esc = (value) => String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));

  WS.money = (amount) => '₹' + Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  WS.qs = (name) => new URLSearchParams(window.location.search).get(name);

  WS.toQuery = (params) => {
    const search = new URLSearchParams();
    Object.keys(params).forEach((key) => {
      const value = params[key];
      if (value !== undefined && value !== null && value !== '') search.append(key, String(value));
    });
    return search.toString();
  };

  WS.fmtDate = (value) => {
    if (!value) return '—';
    const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  };

  WS.fmtTime = (value) => {
    if (!value) return '—';
    const [h, m] = String(value).split(':').map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  };

  const isoOf = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  WS.todayIso = () => isoOf(new Date());
  WS.dateOffsetIso = (days) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return isoOf(date);
  };

  WS.statusLabel = (status) => ({
    pending: 'Pending', accepted: 'Accepted', rejected: 'Rejected',
    in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled'
  }[status] || status);

  WS.statusBadge = (status) => `<span class="badge status-${WS.esc(status)}">${WS.esc(WS.statusLabel(status))}</span>`;

  WS.stars = (rating) => {
    const count = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
    return `<span class="stars" role="img" aria-label="${count} out of 5 stars">${'★'.repeat(count)}${'☆'.repeat(5 - count)}</span>`;
  };

  // "0-500" -> { minPrice: 0, maxPrice: 500 }, "2500-" -> { minPrice: 2500 }
  WS.parsePriceRange = (value) => {
    const out = {};
    if (!value) return out;
    const [low, high] = String(value).split('-');
    if (low) out.minPrice = Number(low);
    if (high) out.maxPrice = Number(high);
    return out;
  };

  // Only allows relative paths such as "/customer-dashboard.html" after login (prevents open redirects).
  WS.safeNext = (next, fallback) => (typeof next === 'string' && /^\/[^\/\\:]*$/.test(next) ? next : fallback);

  /* ---------- feedback: toasts, alerts, buttons, form errors ---------- */
  const ICONS = { success: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info' };

  WS.toast = (message, type = 'success') => {
    let region = WS.$('#toast-region');
    if (!region) {
      region = document.createElement('div');
      region.id = 'toast-region';
      region.className = 'toast-region';
      region.setAttribute('role', 'status');
      region.setAttribute('aria-live', 'polite');
      document.body.appendChild(region);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="fa-solid ${ICONS[type] || ICONS.info}" aria-hidden="true"></i><span></span>`;
    toast.querySelector('span').textContent = message;
    region.appendChild(toast);
    setTimeout(() => toast.remove(), 4500);
  };

  WS.setAlert = (target, message, type = 'error') => {
    if (!target) return;
    if (!message) { target.innerHTML = ''; return; }
    target.innerHTML = `<div class="alert alert-${type}" role="${type === 'error' ? 'alert' : 'status'}">
      <i class="fa-solid ${ICONS[type] || ICONS.info}" aria-hidden="true"></i><span></span></div>`;
    target.querySelector('span').textContent = message;
  };

  WS.setBusy = (button, busy, text = 'Please wait…') => {
    if (!button) return;
    if (busy) {
      if (!button.dataset.label) button.dataset.label = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<span class="spinner" aria-hidden="true"></span> ${WS.esc(text)}`;
    } else {
      button.disabled = false;
      if (button.dataset.label) {
        button.innerHTML = button.dataset.label;
        delete button.dataset.label;
      }
    }
  };

  // errors = { fieldName: 'message' } as returned by the server. Elements with data-error="fieldName" show the text.
  WS.showFieldErrors = (form, errors = {}) => {
    WS.$$('[data-error]', form).forEach((node) => {
      node.textContent = errors[node.dataset.error] || '';
    });
    WS.$$('input[name], select[name], textarea[name]', form).forEach((input) => {
      input.setAttribute('aria-invalid', errors[input.name] ? 'true' : 'false');
    });
    const firstInvalid = WS.$$('[aria-invalid="true"]', form)[0];
    if (firstInvalid) firstInvalid.focus();
  };
  WS.clearFieldErrors = (form) => WS.showFieldErrors(form, {});

  // Loading, empty and error panels. "action" must be static HTML written by us, never user text.
  WS.loading = (container, text = 'Loading…') => {
    container.innerHTML = `<div class="state state-loading" role="status">
      <span class="spinner" aria-hidden="true"></span><p>${WS.esc(text)}</p></div>`;
  };

  WS.state = (container, { icon = 'fa-circle-info', title = '', text = '', action = '' } = {}) => {
    container.innerHTML = `<div class="state">
      <i class="fa-solid ${WS.esc(icon)}" aria-hidden="true"></i>
      <h3>${WS.esc(title)}</h3>
      ${text ? `<p>${WS.esc(text)}</p>` : ''}
      ${action}</div>`;
  };

  /* ---------- reusable cards, tabs and pagination ---------- */
  WS.workerCard = (w) => {
    const photo = w.profilePhoto
      ? `<img class="avatar" src="${WS.esc(w.profilePhoto)}" alt="Photo of ${WS.esc(w.fullName)}" width="64" height="64" loading="lazy">`
      : '<div class="avatar avatar-fallback" aria-hidden="true"><i class="fa-solid fa-user"></i></div>';
    const verified = w.verificationStatus === 'verified'
      ? '<span class="badge badge-verified"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Verified</span>'
      : '<span class="badge badge-pending">Not verified</span>';
    const rating = Number(w.reviewCount) > 0
      ? `${WS.stars(w.avgRating)} <span class="muted small">${Number(w.avgRating).toFixed(1)} (${Number(w.reviewCount)})</span>`
      : '<span class="muted small">No reviews yet</span>';
    const price = w.minPrice !== null && w.minPrice !== undefined
      ? `<span>From <span class="price">${WS.money(w.minPrice)}</span></span>` : '';
    const paused = w.isAvailable === false
      ? '<p><span class="badge badge-pending">Not taking new jobs right now</span></p>' : '';

    return `
      <article class="card card-hover worker-card">
        <div class="worker-head">
          ${photo}
          <div>
            <h3 class="worker-name">${WS.esc(w.fullName)}</h3>
            ${verified}
          </div>
        </div>
        <p class="worker-headline">${WS.esc(w.headline || 'Home service professional')}</p>
        <ul class="meta-list">
          <li><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${WS.esc(w.location || 'Location not set')}</li>
          <li><i class="fa-solid fa-briefcase" aria-hidden="true"></i> ${Number(w.experienceYears || 0)} years experience</li>
          ${w.categories ? `<li><i class="fa-solid fa-tags" aria-hidden="true"></i> ${WS.esc(w.categories)}</li>` : ''}
        </ul>
        ${paused}
        <div class="worker-foot">
          <div>${rating}</div>
          <div>${price}</div>
        </div>
        <a class="btn btn-outline btn-block" href="worker-profile.html?id=${Number(w.id)}">View profile</a>
      </article>`;
  };

  WS.categoryCard = (c, href) => `
    <a class="card card-hover category-card" href="${WS.esc(href)}">
      <span class="category-icon" aria-hidden="true"><i class="fa-solid ${WS.esc(c.icon || 'fa-screwdriver-wrench')}"></i></span>
      <h3>${WS.esc(c.name)}</h3>
      <p class="muted">${WS.esc(c.description || '')}</p>
      <span class="small muted">${Number(c.serviceCount || 0)} services</span>
    </a>`;

  // Tabs with arrow-key support. Each tab needs role="tab", data-tab and aria-controls="<panel id>".
  WS.initTabs = (tablist, onChange) => {
    const tabs = WS.$$('[role="tab"]', tablist);

    function activate(tab, moveFocus) {
      tabs.forEach((t) => {
        const selected = t === tab;
        t.setAttribute('aria-selected', String(selected));
        t.tabIndex = selected ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !selected;
      });
      if (moveFocus) tab.focus();
      if (onChange) onChange(tab.dataset.tab);
    }

    tabs.forEach((t) => t.addEventListener('click', () => activate(t, false)));
    tablist.addEventListener('keydown', (event) => {
      const index = tabs.indexOf(document.activeElement);
      if (index < 0) return;
      let next = null;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next !== null) {
        event.preventDefault();
        activate(tabs[next], true);
      }
    });

    const initial = tabs.find((t) => t.getAttribute('aria-selected') === 'true') || tabs[0];
    if (initial) activate(initial, false);

    return {
      open(name) {
        const tab = tabs.find((t) => t.dataset.tab === name);
        if (tab) activate(tab, false);
      }
    };
  };

  WS.renderPager = (container, { page, limit, total }, onPage) => {
    const pages = Math.max(1, Math.ceil(Number(total || 0) / Number(limit || 1)));
    if (pages <= 1) {
      container.innerHTML = '';
      container.onclick = null;
      return;
    }
    container.innerHTML = `
      <button type="button" class="btn btn-outline btn-sm" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Previous</button>
      <span class="muted small">Page ${page} of ${pages}</span>
      <button type="button" class="btn btn-outline btn-sm" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>Next</button>`;
    container.onclick = (event) => {
      const button = event.target.closest('button[data-page]');
      if (button && !button.disabled) onPage(Number(button.dataset.page));
    };
  };

  /* ---------- header and footer ---------- */
  const GUEST_LINKS = [
    ['index.html', 'Home'],
    ['services.html', 'Find services'],
    ['about.html', 'About'],
    ['contact.html', 'Contact']
  ];
  const ROLE_LINKS = {
    customer: [
      ['index.html', 'Home'],
      ['services.html', 'Find services'],
      ['my-bookings.html', 'My bookings'],
      ['customer-dashboard.html', 'Dashboard']
    ],
    worker: [
      ['worker-dashboard.html', 'Worker dashboard'],
      ['about.html', 'About'],
      ['contact.html', 'Contact']
    ],
    admin: [
      ['admin-dashboard.html', 'Admin dashboard'],
      ['contact.html', 'Contact']
    ]
  };

  function renderHeader(user) {
    const host = document.getElementById('site-header');
    if (!host) return;
    const links = user ? (ROLE_LINKS[user.role] || GUEST_LINKS) : GUEST_LINKS;
    const here = window.location.pathname.split('/').pop() || 'index.html';
    const linkHtml = links.map(([href, label]) => {
      const active = href === here ? ' class="active" aria-current="page"' : '';
      return `<a href="${href}"${active}>${WS.esc(label)}</a>`;
    }).join('');
    const actions = user
      ? `<a class="nav-user" href="profile.html"><i class="fa-solid fa-circle-user" aria-hidden="true"></i> ${WS.esc(user.fullName.split(' ')[0])}</a>
         <button type="button" class="btn btn-outline btn-sm" data-logout>Log out</button>`
      : `<a class="btn btn-outline btn-sm" href="login.html">Log in</a>
         <a class="btn btn-primary btn-sm" href="register.html">Register</a>`;

    host.innerHTML = `
      <header class="site-header">
        <div class="container nav-wrap">
          <a class="brand" href="index.html"><i class="fa-solid fa-screwdriver-wrench" aria-hidden="true"></i> WorkSure</a>
          <button type="button" class="nav-toggle" data-nav-toggle aria-expanded="false" aria-controls="primary-nav">
            <i class="fa-solid fa-bars" aria-hidden="true"></i><span class="sr-only">Open menu</span>
          </button>
          <nav id="primary-nav" class="main-nav" aria-label="Main navigation">
            <div class="nav-links">${linkHtml}</div>
            <div class="nav-actions">${actions}</div>
          </nav>
        </div>
      </header>`;
  }

  function renderFooter() {
    const host = document.getElementById('site-footer');
    if (!host) return;
    host.innerHTML = `
      <footer class="site-footer">
        <div class="container footer-grid">
          <div>
            <a class="brand brand-light" href="index.html"><i class="fa-solid fa-screwdriver-wrench" aria-hidden="true"></i> WorkSure</a>
            <p class="mt-2">Book trusted plumbers, electricians, cleaners and other home professionals.</p>
          </div>
          <nav aria-label="Explore">
            <h3>Explore</h3>
            <ul class="footer-links">
              <li><a href="services.html">Find a professional</a></li>
              <li><a href="index.html#how-it-works">How it works</a></li>
              <li><a href="register.html?role=worker">Become a worker</a></li>
            </ul>
          </nav>
          <nav aria-label="Company">
            <h3>Company</h3>
            <ul class="footer-links">
              <li><a href="about.html">About WorkSure</a></li>
              <li><a href="contact.html">Contact us</a></li>
              <li><a href="login.html">Log in</a></li>
            </ul>
          </nav>
          <div>
            <h3>Contact</h3>
            <p><i class="fa-solid fa-envelope" aria-hidden="true"></i>
              <a href="mailto:${WS.esc(WS.SUPPORT_EMAIL)}">${WS.esc(WS.SUPPORT_EMAIL)}</a></p>
          </div>
        </div>
        <div class="container footer-bottom">&copy; ${new Date().getFullYear()} WorkSure. All rights reserved.</div>
      </footer>`;
  }

  // Asks the server who is logged in (null for guests). Used on every page load and after profile changes.
  WS.refreshLayout = async () => {
    let user = null;
    try {
      user = await WS.api.get('/auth/me');
    } catch (error) {
      user = null;
    }
    WS.currentUser = user;
    renderHeader(user);
    return user;
  };

  /* ---------- clicks shared by every page ---------- */
  document.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const logoutButton = target.closest('[data-logout]');
    if (logoutButton) {
      logoutButton.disabled = true;
      try {
        await WS.api.post('/auth/logout');
      } catch (error) {
        // Even if the request fails, the user is sent away from protected pages below.
      }
      window.location.href = 'index.html';
      return;
    }

    const navToggle = target.closest('[data-nav-toggle]');
    if (navToggle) {
      const nav = WS.$('#primary-nav');
      if (nav) {
        const open = nav.classList.toggle('is-open');
        navToggle.setAttribute('aria-expanded', String(open));
      }
      return;
    }

    const closer = target.closest('[data-close-dialog]');
    if (closer) {
      const dialog = closer.closest('dialog');
      if (dialog) dialog.close();
    }
  });

  /* ---------- contact page form (opens the visitor's email app) ---------- */
  function initContactForm() {
    const form = WS.$('#contact-form');
    if (!form) return;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const name = String(formData.get('name') || '').trim();
      const email = String(formData.get('email') || '').trim();
      const topic = String(formData.get('topic') || 'General question');
      const message = String(formData.get('message') || '').trim();

      const errors = {};
      if (name.length < 2) errors.name = 'Please enter your name.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = 'Please enter a valid email address.';
      if (message.length < 10) errors.message = 'Please write at least 10 characters.';
      WS.showFieldErrors(form, errors);
      if (Object.keys(errors).length) return;

      const subject = `WorkSure: ${topic}`;
      const body = `Name: ${name}\nEmail: ${email}\n\n${message}`;
      window.location.href = `mailto:${WS.SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      WS.setAlert(WS.$('#contact-alert'), 'Your email app should open with your message ready to send.', 'info');
    });
  }

  /* ---------- home page ---------- */
  function loadStats() {
    WS.api.get('/stats/public').then((stats) => {
      WS.$('#stat-workers').textContent = Number(stats.verifiedWorkers).toLocaleString('en-IN');
      WS.$('#stat-jobs').textContent = Number(stats.completedJobs).toLocaleString('en-IN');
      WS.$('#stat-categories').textContent = Number(stats.categories).toLocaleString('en-IN');
    }).catch(() => { /* numbers stay at 0 if the server is unreachable */ });
  }

  function loadCategories() {
    const grid = WS.$('#category-grid');
    const select = WS.$('#search-category');
    WS.loading(grid, 'Loading categories…');
    WS.api.get('/categories').then((categories) => {
      if (!categories.length) {
        WS.state(grid, { icon: 'fa-layer-group', title: 'No categories yet', text: 'Service categories will appear here soon.' });
        return;
      }
      grid.innerHTML = categories.map((c) => WS.categoryCard(c, `services.html?categoryId=${Number(c.id)}`)).join('');
      select.insertAdjacentHTML('beforeend',
        categories.map((c) => `<option value="${Number(c.id)}">${WS.esc(c.name)}</option>`).join(''));
    }).catch((error) => {
      WS.state(grid, { icon: 'fa-triangle-exclamation', title: 'Could not load categories', text: error.message });
    });
  }

  function loadFeatured() {
    const grid = WS.$('#featured-grid');
    WS.loading(grid, 'Finding top-rated professionals…');
    WS.api.get('/workers/featured').then((workers) => {
      if (!workers.length) {
        WS.state(grid, { icon: 'fa-user-check', title: 'Professionals are being verified', text: 'Verified workers will be listed here.' });
        return;
      }
      grid.innerHTML = workers.map((w) => WS.workerCard(w)).join('');
    }).catch((error) => {
      WS.state(grid, { icon: 'fa-triangle-exclamation', title: 'Could not load professionals', text: error.message });
    });
  }

  function loadTestimonials() {
    const grid = WS.$('#testimonial-grid');
    WS.api.get('/testimonials').then((items) => {
      if (!items.length) {
        WS.state(grid, { icon: 'fa-comments', title: 'No reviews yet', text: 'Reviews from completed bookings will appear here.' });
        return;
      }
      grid.innerHTML = items.map((t) => `
        <figure class="card testimonial">
          ${WS.stars(t.rating)}
          <blockquote>&ldquo;${WS.esc(t.comment)}&rdquo;</blockquote>
          <figcaption><strong>${WS.esc(t.customerName)}</strong> &middot; ${WS.esc(t.serviceName)} with ${WS.esc(t.workerName)}</figcaption>
        </figure>`).join('');
    }).catch(() => {
      WS.state(grid, { icon: 'fa-comments', title: 'Reviews are unavailable', text: 'Please try again later.' });
    });
  }

  function initHeroSearch() {
    const form = WS.$('#hero-search');
    const results = WS.$('#search-results');
    const grid = WS.$('#search-grid');
    const status = WS.$('#search-status');
    const viewAll = WS.$('#search-view-all');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const searchParams = {
        q: String(formData.get('q') || '').trim(),
        location: String(formData.get('location') || '').trim(),
        categoryId: formData.get('categoryId') || '',
        ...WS.parsePriceRange(formData.get('priceRange')),
        sort: 'rating'
      };
      const button = form.querySelector('button[type="submit"]');

      results.hidden = false;
      viewAll.href = `services.html?${WS.toQuery(searchParams)}`;
      status.textContent = '';
      WS.setBusy(button, true, 'Searching…');
      WS.loading(grid, 'Searching professionals…');

      try {
        const found = await WS.api.get('/workers', { ...searchParams, limit: 6 });
        status.textContent = found.total
          ? `${found.total} professional${found.total === 1 ? '' : 's'} found`
          : '';
        if (!found.items.length) {
          WS.state(grid, { icon: 'fa-magnifying-glass', title: 'No matches yet', text: 'Try a different service, location or price range.' });
        } else {
          grid.innerHTML = found.items.map((w) => WS.workerCard(w)).join('');
        }
      } catch (error) {
        WS.state(grid, { icon: 'fa-triangle-exclamation', title: 'Search failed', text: error.message });
      } finally {
        WS.setBusy(button, false);
      }
    });
  }

  function initHome() {
    if (!WS.$('#home-page')) return;
    loadStats();
    loadCategories();
    loadFeatured();
    loadTestimonials();
    initHeroSearch();
  }

  /* ---------- start ---------- */
  async function start() {
    renderHeader(null);
    renderFooter();
    const user = await WS.refreshLayout();
    initContactForm();
    initHome();
    return user;
  }

  WS.ready = start();
})();
