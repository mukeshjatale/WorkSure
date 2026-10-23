/* customer-dashboard.js - the customer dashboard (customer-dashboard.html) and "My bookings" (my-bookings.html).
   Both pages share the booking cards, the details dialog and the review dialog. */
(function () {
  'use strict';
  const WS = window.WS;
  const OPEN_STATUSES = ['pending', 'accepted', 'in_progress'];
  let reviewBookingId = null;

  WS.ready.then((user) => {
    if (!user) return;
    if (WS.$('#recent-bookings')) initDashboard(user);
    if (WS.$('#booking-list')) initMyBookings(user);
  });

  /* ---------- shared pieces ---------- */
  function bookingCard(b) {
    const actions = [
      `<button type="button" class="btn btn-ghost btn-sm" data-action="details" data-id="${Number(b.id)}">
         <i class="fa-solid fa-circle-info" aria-hidden="true"></i> Details</button>`
    ];
    if (b.canCancel) {
      actions.push(`<button type="button" class="btn btn-danger-outline btn-sm" data-action="cancel" data-id="${Number(b.id)}">Cancel booking</button>`);
    }
    if (b.canReview) {
      actions.push(`<button type="button" class="btn btn-accent btn-sm" data-action="review" data-id="${Number(b.id)}">
         <i class="fa-solid fa-star" aria-hidden="true"></i> Rate this service</button>`);
    }
    const cancelNote = b.status === 'cancelled' && b.cancelReason
      ? `<div><dt>Note</dt><dd>${WS.esc(b.cancelReason)}</dd></div>` : '';

    return `
      <article class="card booking-card" id="booking-${Number(b.id)}">
        <div class="booking-head">
          <div>
            <h3>${WS.esc(b.serviceName)}</h3>
            <p class="muted">${WS.esc(b.categoryName)} &middot; Booking #${Number(b.id)}</p>
          </div>
          ${WS.statusBadge(b.status)}
        </div>
        <dl class="booking-meta">
          <div><dt>Professional</dt><dd>${WS.esc(b.workerName)}</dd></div>
          <div><dt>Date and time</dt><dd>${WS.fmtDate(b.bookingDate)}, ${WS.fmtTime(b.startTime)} &ndash; ${WS.fmtTime(b.endTime)}</dd></div>
          <div><dt>Address</dt><dd>${WS.esc(b.address)}</dd></div>
          <div><dt>Agreed price</dt><dd><span class="price">${WS.money(b.agreedPrice)}</span></dd></div>
          ${cancelNote}
        </dl>
        <div class="booking-actions">${actions.join('')}</div>
      </article>`;
  }

  async function openDetails(id) {
    const dialog = WS.$('#detail-dialog');
    const body = WS.$('#detail-body');
    WS.loading(body, 'Loading booking…');
    if (!dialog.open) dialog.showModal();
    try {
      const b = await WS.api.get(`/bookings/${id}`);
      const history = (b.history || []).map((h) => `
        <li><strong>${WS.esc(WS.statusLabel(h.newStatus))}</strong>
          <span class="muted">${WS.fmtDate(h.createdAt)}${h.changedBy ? ' &middot; ' + WS.esc(h.changedBy) : ''}</span>
          ${h.note ? `<br><span>${WS.esc(h.note)}</span>` : ''}</li>`).join('');
      body.innerHTML = `
        <dl class="detail-list">
          <div><dt>Service</dt><dd>${WS.esc(b.serviceName)} (${WS.esc(b.categoryName)})</dd></div>
          <div><dt>Status</dt><dd>${WS.statusBadge(b.status)}</dd></div>
          <div><dt>Professional</dt><dd>${WS.esc(b.workerName)}</dd></div>
          <div><dt>Date and time</dt><dd>${WS.fmtDate(b.bookingDate)}, ${WS.fmtTime(b.startTime)} &ndash; ${WS.fmtTime(b.endTime)}</dd></div>
          <div><dt>Address</dt><dd>${WS.esc(b.address)}</dd></div>
          <div><dt>Problem description</dt><dd>${WS.esc(b.description || 'None given')}</dd></div>
          <div><dt>Agreed price</dt><dd>${WS.money(b.agreedPrice)}</dd></div>
        </dl>
        <h3 class="mt-4">History</h3>
        <ol class="history-list">${history || '<li>No history yet.</li>'}</ol>`;
    } catch (error) {
      body.innerHTML = `<div class="alert alert-error" role="alert">${WS.esc(error.message)}</div>`;
    }
  }

  function openReview(id) {
    const dialog = WS.$('#review-dialog');
    const form = WS.$('#review-form');
    const card = document.getElementById(`booking-${id}`);
    reviewBookingId = id;
    form.reset();
    WS.setAlert(WS.$('#review-alert'), '');
    WS.$('#review-service').textContent = card ? `Service: ${card.querySelector('h3').textContent}` : '';
    if (!dialog.open) dialog.showModal();
  }

  // Delegated clicks for every booking card on the page.
  function attachActions(container, reload) {
    container.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const id = Number(button.dataset.id);
      if (button.dataset.action === 'details') {
        openDetails(id);
      } else if (button.dataset.action === 'review') {
        openReview(id);
      } else if (button.dataset.action === 'cancel') {
        if (!window.confirm('Cancel this booking? This cannot be undone.')) return;
        WS.setBusy(button, true, 'Cancelling…');
        try {
          await WS.api.patch(`/bookings/${id}/status`, { status: 'cancelled' });
          WS.toast('Booking cancelled.');
          reload();
        } catch (error) {
          WS.toast(error.message, 'error');
          WS.setBusy(button, false);
        }
      }
    });
  }

  function initReviewDialog(reload) {
    const form = WS.$('#review-form');
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      WS.setAlert(WS.$('#review-alert'), '');
      const data = new FormData(form);
      const rating = Number(data.get('rating'));
      if (!rating) {
        WS.setAlert(WS.$('#review-alert'), 'Please choose a rating from 1 to 5.');
        return;
      }
      const button = form.querySelector('button[type="submit"]');
      WS.setBusy(button, true, 'Submitting…');
      try {
        await WS.api.post('/reviews', {
          bookingId: reviewBookingId,
          rating,
          comment: String(data.get('comment') || '').trim()
        });
        WS.$('#review-dialog').close();
        WS.toast('Thank you for your review!');
        reload();
      } catch (error) {
        WS.setAlert(WS.$('#review-alert'), error.message);
      } finally {
        WS.setBusy(button, false);
      }
    });
  }

  /* ---------- customer dashboard ---------- */
  async function loadMyReviews() {
    const box = WS.$('#my-reviews');
    if (!box) return;
    WS.loading(box, 'Loading your reviews…');
    try {
      const reviews = await WS.api.get('/reviews/mine');
      if (!reviews.length) {
        WS.state(box, { icon: 'fa-star', title: 'No reviews yet', text: 'After a completed booking you can rate the professional.' });
        return;
      }
      box.innerHTML = reviews.map((r) => `
        <article class="card review-item">
          <div>${WS.stars(r.rating)}</div>
          <p>${r.comment ? WS.esc(r.comment) : '<span class="muted">No comment written.</span>'}</p>
          <p class="small muted">${WS.esc(r.serviceName)} with ${WS.esc(r.workerName)} &middot; ${WS.fmtDate(r.createdAt)}</p>
        </article>`).join('');
    } catch (error) {
      WS.state(box, { icon: 'fa-triangle-exclamation', title: 'Could not load reviews', text: error.message });
    }
  }

  // Handlers are attached once in initDashboard. This function only reloads the data.
  async function refreshDashboard() {
    const list = WS.$('#recent-bookings');
    WS.loading(list, 'Loading your bookings…');
    try {
      const result = await WS.api.get('/bookings', { limit: 100 });
      const items = result.items;
      WS.$('#stat-open').textContent = items.filter((b) => OPEN_STATUSES.includes(b.status)).length;
      WS.$('#stat-completed').textContent = items.filter((b) => b.status === 'completed').length;
      WS.$('#stat-review').textContent = items.filter((b) => b.canReview).length;
      WS.$('#stat-total').textContent = result.total;

      if (!items.length) {
        WS.state(list, {
          icon: 'fa-calendar-plus',
          title: 'No bookings yet',
          text: 'Find a professional and book your first service.',
          action: '<a class="btn btn-primary" href="services.html">Find a professional</a>'
        });
      } else {
        list.innerHTML = items.slice(0, 4).map(bookingCard).join('');
      }
    } catch (error) {
      WS.state(list, { icon: 'fa-triangle-exclamation', title: 'Could not load bookings', text: error.message });
    }
  }

  function initDashboard(user) {
    WS.$('#welcome-name').textContent = user.fullName.split(' ')[0];
    const list = WS.$('#recent-bookings');
    const reload = () => {
      refreshDashboard();
      loadMyReviews();
    };
    attachActions(list, reload);
    initReviewDialog(reload);
    loadMyReviews();
    refreshDashboard();
  }

  /* ---------- my-bookings.html ---------- */
  function initMyBookings() {
    const list = WS.$('#booking-list');
    const pager = WS.$('#pagination');
    const chips = WS.$$('[data-filter]');
    let filter = 'all';
    let currentPage = 1;

    if (WS.qs('new')) {
      WS.toast('Booking request sent! The professional will confirm it soon.');
      window.history.replaceState(null, '', 'my-bookings.html');
    }

    async function load(page) {
      currentPage = page;
      pager.innerHTML = '';
      WS.loading(list, 'Loading bookings…');
      try {
        const params = { page, limit: 10 };
        if (filter !== 'all') params.status = filter;
        const result = await WS.api.get('/bookings', params);
        if (!result.items.length) {
          WS.state(list, {
            icon: 'fa-calendar-xmark',
            title: 'No bookings here',
            text: filter === 'all' ? 'Your bookings will appear here after you book a service.' : 'Try another filter.',
            action: filter === 'all' ? '<a class="btn btn-primary" href="services.html">Find a professional</a>' : ''
          });
          return;
        }
        list.innerHTML = result.items.map(bookingCard).join('');
        WS.renderPager(pager, result, load);
      } catch (error) {
        WS.state(list, { icon: 'fa-triangle-exclamation', title: 'Could not load bookings', text: error.message });
      }
    }

    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        filter = chip.dataset.filter;
        chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
        load(1);
      });
    });

    attachActions(list, () => load(currentPage));
    initReviewDialog(() => load(currentPage));
    load(1);
  }
})();
