/* services.js - the services page (search and filters), the service details page and the worker profile page.
   Each page is detected by its element id, so this one file serves all three pages. */
(function () {
  'use strict';
  const WS = window.WS;
  const PAGE_SIZE = 9;
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const isId = (value) => /^\d+$/.test(String(value || ''));

  WS.ready.then(() => {
    if (WS.$('#results-grid')) initServicesPage();
    if (WS.$('#service-detail')) initServiceDetail();
    if (WS.$('#worker-detail')) initWorkerProfile();
  });

  /* ---------- services.html: search, filters, pagination ---------- */
  function initServicesPage() {
    const form = WS.$('#filter-form');
    const grid = WS.$('#results-grid');
    const status = WS.$('#result-status');
    const pager = WS.$('#pagination');
    const serviceGrid = WS.$('#service-list');
    let currentPage = 1;

    // Reads the filters from the page address, so links such as services.html?categoryId=3 work.
    function fillFormFromUrl() {
      const params = new URLSearchParams(window.location.search);
      ['q', 'location', 'categoryId', 'minRating', 'date', 'sort'].forEach((name) => {
        if (params.has(name) && form.elements[name]) form.elements[name].value = params.get(name);
      });
      if (params.has('minPrice') || params.has('maxPrice')) {
        const range = `${params.get('minPrice') || ''}-${params.get('maxPrice') || ''}`;
        const exists = Array.from(form.elements.priceRange.options).some((option) => option.value === range);
        if (exists) form.elements.priceRange.value = range;
      }
      form.elements.available.checked = params.get('available') === 'true';
    }

    function readForm() {
      const data = new FormData(form);
      const text = (name) => String(data.get(name) || '').trim();
      return {
        q: text('q'),
        location: text('location'),
        categoryId: text('categoryId'),
        ...WS.parsePriceRange(data.get('priceRange')),
        minRating: text('minRating'),
        available: form.elements.available.checked ? 'true' : '',
        date: text('date'),
        sort: text('sort') || 'rating'
      };
    }

    async function search(page) {
      currentPage = page;
      const params = { ...readForm(), page, limit: PAGE_SIZE };
      const query = WS.toQuery(params);
      window.history.replaceState(null, '', `services.html${query ? '?' + query : ''}`);
      status.textContent = '';
      pager.innerHTML = '';
      WS.loading(grid, 'Searching professionals…');

      try {
        const result = await WS.api.get('/workers', params);
        status.textContent = result.total
          ? `${result.total} professional${result.total === 1 ? '' : 's'} found`
          : '';
        if (!result.items.length) {
          WS.state(grid, {
            icon: 'fa-magnifying-glass',
            title: 'No professionals match these filters',
            text: 'Try removing a filter or choosing a wider price range.',
            action: '<button type="button" class="btn btn-outline" data-reset-filters>Clear filters</button>'
          });
          return;
        }
        grid.innerHTML = result.items.map((w) => WS.workerCard(w)).join('');
        WS.renderPager(pager, result, (next) => search(next));
      } catch (error) {
        WS.state(grid, {
          icon: 'fa-triangle-exclamation',
          title: 'Search failed',
          text: error.message,
          action: '<button type="button" class="btn btn-outline" data-retry>Try again</button>'
        });
      }
    }

    function resetFilters() {
      form.reset();
      search(1);
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      search(1);
    });
    WS.$('#filter-reset').addEventListener('click', resetFilters);
    grid.addEventListener('click', (event) => {
      if (event.target.closest('[data-reset-filters]')) resetFilters();
      if (event.target.closest('[data-retry]')) search(currentPage);
    });

    function loadCategories() {
      return WS.api.get('/categories').then((categories) => {
        form.elements.categoryId.insertAdjacentHTML('beforeend',
          categories.map((c) => `<option value="${Number(c.id)}">${WS.esc(c.name)}</option>`).join(''));
      }).catch(() => { /* the search still works without the category list */ });
    }

    function loadServices() {
      WS.loading(serviceGrid, 'Loading services…');
      WS.api.get('/services').then((services) => {
        if (!services.length) {
          WS.state(serviceGrid, { icon: 'fa-list', title: 'No services available yet' });
          return;
        }
        serviceGrid.innerHTML = services.map((s) => `
          <a class="card card-hover category-card" href="service-details.html?id=${Number(s.id)}">
            <span class="small muted">${WS.esc(s.categoryName)}</span>
            <h3>${WS.esc(s.name)}</h3>
            <p>${WS.esc(s.description || '')}</p>
            <p class="small"><span class="price">${s.minPrice !== null && s.minPrice !== undefined ? WS.money(s.minPrice) : '—'}</span>
              <span class="muted">&middot; ${Number(s.workerCount || 0)} professional(s)</span></p>
          </a>`).join('');
      }).catch((error) => {
        WS.state(serviceGrid, { icon: 'fa-triangle-exclamation', title: 'Could not load services', text: error.message });
      });
    }

    loadServices();
    loadCategories().then(() => {
      fillFormFromUrl();
      search(1);
    });
  }

  /* ---------- service-details.html ---------- */
  function initServiceDetail() {
    const box = WS.$('#service-detail');
    const id = WS.qs('id');
    if (!isId(id)) {
      WS.state(box, {
        icon: 'fa-circle-question',
        title: 'Service not specified',
        text: 'Open a service from the services page.',
        action: '<a class="btn btn-primary" href="services.html">Browse services</a>'
      });
      return;
    }

    WS.loading(box, 'Loading service…');
    WS.api.get(`/services/${id}`).then((service) => {
      document.title = `${service.name} · WorkSure`;
      const workers = service.workers.length
        ? `<div class="grid-cards">${service.workers.map((w) => WS.workerCard(w)).join('')}</div>`
        : `<div class="state"><i class="fa-solid fa-user-slash" aria-hidden="true"></i>
             <h3>No verified professionals yet</h3>
             <p>New professionals for this service are added regularly.</p></div>`;

      box.innerHTML = `
        <section class="card">
          <p class="small muted">${WS.esc(service.categoryName)}</p>
          <h1>${WS.esc(service.name)}</h1>
          <p>${WS.esc(service.description || '')}</p>
          <ul class="meta-list">
            <li><i class="fa-solid fa-tag" aria-hidden="true"></i> Base price ${WS.money(service.basePrice)} (each professional sets their own price)</li>
            <li><i class="fa-solid fa-clock" aria-hidden="true"></i> About ${Number(service.durationMinutes)} minutes</li>
          </ul>
        </section>
        <h2 class="mt-5">Professionals for this service</h2>
        <p class="muted small">Prices shown are each professional's lowest listed price. You see the exact price before you book.</p>
        ${workers}`;
    }).catch((error) => {
      WS.state(box, {
        icon: 'fa-triangle-exclamation',
        title: 'Service not found',
        text: error.message,
        action: '<a class="btn btn-primary" href="services.html">Browse services</a>'
      });
    });
  }

  /* ---------- worker-profile.html ---------- */
  function initWorkerProfile() {
    const box = WS.$('#worker-detail');
    const id = WS.qs('id');
    if (!isId(id)) {
      WS.state(box, {
        icon: 'fa-circle-question',
        title: 'Professional not specified',
        text: 'Choose a professional from the search results.',
        action: '<a class="btn btn-primary" href="services.html">Find a professional</a>'
      });
      return;
    }

    WS.loading(box, 'Loading professional…');
    WS.api.get(`/workers/${id}`).then((worker) => {
      document.title = `${worker.fullName} · WorkSure`;
      box.innerHTML = profileHtml(worker);
      setupReviews(worker.id);
    }).catch((error) => {
      WS.state(box, {
        icon: 'fa-user-slash',
        title: 'Professional not found',
        text: error.message,
        action: '<a class="btn btn-primary" href="services.html">Find a professional</a>'
      });
    });
  }

  function profileHtml(w) {
    const photo = w.profilePhoto
      ? `<img class="avatar avatar-lg" src="${WS.esc(w.profilePhoto)}" alt="Photo of ${WS.esc(w.fullName)}" width="96" height="96">`
      : '<div class="avatar avatar-lg avatar-fallback" aria-hidden="true"><i class="fa-solid fa-user"></i></div>';
    const verified = w.verificationStatus === 'verified'
      ? '<span class="badge badge-verified"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Verified</span>'
      : '';
    const services = w.services.length
      ? `<div class="table-wrap">
           <table class="table">
             <thead><tr><th scope="col">Service</th><th scope="col">Duration</th><th scope="col">Price</th><th scope="col"><span class="sr-only">Action</span></th></tr></thead>
             <tbody>
               ${w.services.map((s) => `
                 <tr>
                   <td><strong>${WS.esc(s.name)}</strong><div class="small muted">${WS.esc(s.categoryName)}</div></td>
                   <td>${Number(s.durationMinutes)} min</td>
                   <td><span class="price">${WS.money(s.price)}</span></td>
                   <td><a class="btn btn-primary btn-sm" href="booking.html?workerId=${Number(w.id)}&amp;serviceId=${Number(s.serviceId)}">Book</a></td>
                 </tr>`).join('')}
             </tbody>
           </table>
         </div>`
      : '<p class="muted">This professional has not listed any services yet.</p>';
    const hours = w.availability.length
      ? `<ul class="check-list">${w.availability.map((a) =>
          `<li><i class="fa-solid fa-clock" aria-hidden="true"></i>
             <span><strong>${DAYS[a.dayOfWeek]}</strong>: ${WS.fmtTime(a.startTime)} &ndash; ${WS.fmtTime(a.endTime)}</span></li>`).join('')}</ul>`
      : '<p class="muted">Working hours have not been set.</p>';

    return `
      <section class="card">
        <div class="worker-head">
          ${photo}
          <div>
            <h1 class="worker-name">${WS.esc(w.fullName)}</h1>
            ${verified}
            <p class="muted">${WS.esc(w.headline || '')}</p>
          </div>
        </div>
        <ul class="meta-list">
          <li><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${WS.esc(w.location || 'Location not set')}</li>
          <li><i class="fa-solid fa-map" aria-hidden="true"></i> Serves: ${WS.esc(w.serviceArea || 'Not specified')}</li>
          <li><i class="fa-solid fa-briefcase" aria-hidden="true"></i> ${Number(w.experienceYears || 0)} years of experience</li>
          <li><i class="fa-solid fa-calendar" aria-hidden="true"></i> Member since ${WS.fmtDate(w.memberSince)}</li>
        </ul>
        <p>${WS.stars(w.avgRating)} <span class="muted">${Number(w.avgRating).toFixed(1)} &middot; ${Number(w.reviewCount)} review(s)</span></p>
        ${w.isAvailable ? '' : '<p><span class="badge badge-pending">Not taking new jobs right now</span></p>'}
      </section>

      <div class="two-col mt-5">
        <section class="card">
          <h2>About</h2>
          <p>${WS.esc(w.bio || '')}</p>
          <h3>Skills</h3>
          <p>${WS.esc(w.skills || '')}</p>
        </section>
        <section class="card">
          <h2>Working hours</h2>
          ${hours}
        </section>
      </div>

      <section class="dash-section mt-5">
        <h2>Services and prices</h2>
        <p class="muted small">The price is set by the professional. You confirm the final booking details on the next page.</p>
        ${services}
      </section>

      <section class="dash-section">
        <h2>Customer reviews</h2>
        <div id="review-list" class="grid-cards-compact"></div>
        <p id="review-status" class="muted"></p>
        <div class="text-center mt-4">
          <button type="button" id="load-more-reviews" class="btn btn-outline" hidden>Load more reviews</button>
        </div>
      </section>`;
  }

  function reviewCard(r) {
    return `
      <article class="card review-item">
        <div>${WS.stars(r.rating)}</div>
        <p>${r.comment ? WS.esc(r.comment) : '<span class="muted">No comment written.</span>'}</p>
        <p class="small muted">${WS.esc(r.customerName)} &middot; ${WS.esc(r.serviceName)} &middot; ${WS.fmtDate(r.createdAt)}</p>
      </article>`;
  }

  function setupReviews(workerId) {
    const list = WS.$('#review-list');
    const status = WS.$('#review-status');
    const more = WS.$('#load-more-reviews');
    let loadedPage = 0;

    async function load(page) {
      more.disabled = true;
      try {
        const result = await WS.api.get(`/workers/${workerId}/reviews`, { page });
        if (page === 1) {
          list.innerHTML = '';
          status.textContent = result.items.length ? '' : 'No reviews yet.';
        }
        list.insertAdjacentHTML('beforeend', result.items.map(reviewCard).join(''));
        loadedPage = page;
        more.hidden = page * result.limit >= result.total;
      } catch (error) {
        status.textContent = `Could not load reviews: ${error.message}`;
      } finally {
        more.disabled = false;
      }
    }

    more.addEventListener('click', () => load(loadedPage + 1));
    load(1);
  }
})();
