/* booking.js - the booking form (booking.html?workerId=..&serviceId=..).
   The browser sends only the choices. The server looks up the real price, duration and availability. */
(function () {
  'use strict';
  const WS = window.WS;
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const pad = (n) => String(n).padStart(2, '0');

  WS.ready.then((user) => {
    const form = WS.$('#booking-form');
    if (!form) return;
    if (!user || user.role !== 'customer') {
      WS.setAlert(WS.$('#form-alert'), 'Only customer accounts can book services.', 'info');
      form.hidden = true;
      return;
    }
    start(form);
  });

  function timeOptions() {
    const options = ['<option value="">Choose a start time</option>'];
    for (let minutes = 6 * 60; minutes <= 20 * 60 + 30; minutes += 30) {
      const value = `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
      options.push(`<option value="${value}">${WS.fmtTime(value)}</option>`);
    }
    return options.join('');
  }

  async function start(form) {
    const workerId = WS.qs('workerId');
    const presetService = WS.qs('serviceId');
    const alertBox = WS.$('#form-alert');
    const summary = WS.$('#booking-summary');
    const priceBox = WS.$('#price-box');
    const hoursBox = WS.$('#hours-note');

    if (!/^\d+$/.test(workerId || '')) {
      WS.state(summary, {
        icon: 'fa-circle-question',
        title: 'Professional not specified',
        text: 'Open booking from a professional\'s profile.',
        action: '<a class="btn btn-primary" href="services.html">Find a professional</a>'
      });
      form.hidden = true;
      return;
    }

    WS.loading(summary, 'Loading professional…');
    let worker;
    try {
      worker = await WS.api.get(`/workers/${workerId}`);
    } catch (error) {
      WS.state(summary, { icon: 'fa-user-slash', title: 'Professional not found', text: error.message });
      form.hidden = true;
      return;
    }

    if (!worker.services.length) {
      WS.state(summary, { icon: 'fa-list', title: 'No services listed', text: 'This professional has not listed any services yet.' });
      form.hidden = true;
      return;
    }

    document.title = `Book ${worker.fullName} · WorkSure`;
    summary.innerHTML = `
      <h1 class="booking-title">Book ${WS.esc(worker.fullName)}</h1>
      <p class="muted">${WS.esc(worker.headline || '')}</p>
      <ul class="meta-list">
        <li><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${WS.esc(worker.location || 'Location not set')}</li>
        <li><i class="fa-solid fa-star" aria-hidden="true"></i> ${Number(worker.avgRating).toFixed(1)} (${Number(worker.reviewCount)} reviews)</li>
      </ul>`;

    const select = form.elements.serviceId;
    select.innerHTML = worker.services.map((s) =>
      `<option value="${Number(s.serviceId)}">${WS.esc(s.name)} · ${WS.money(s.price)} · ${Number(s.durationMinutes)} min</option>`
    ).join('');
    if (presetService && worker.services.some((s) => String(s.serviceId) === presetService)) {
      select.value = presetService;
    }

    form.elements.startTime.innerHTML = timeOptions();
    form.elements.bookingDate.min = WS.todayIso();
    form.elements.bookingDate.max = WS.dateOffsetIso(90);
    form.elements.bookingDate.value = WS.dateOffsetIso(1);

    hoursBox.innerHTML = worker.availability.length
      ? `<p class="small muted">Working hours</p><ul class="small">${worker.availability.map((a) =>
          `<li>${DAYS[a.dayOfWeek]}: ${WS.fmtTime(a.startTime)} &ndash; ${WS.fmtTime(a.endTime)}</li>`).join('')}</ul>`
      : '<p class="small muted">This professional has not set working hours yet.</p>';

    function updatePrice() {
      const chosen = worker.services.find((s) => String(s.serviceId) === select.value);
      priceBox.innerHTML = chosen
        ? `<p class="small muted">Agreed price</p>
           <p class="stat-value">${WS.money(chosen.price)}</p>
           <p class="small muted">About ${Number(chosen.durationMinutes)} minutes</p>`
        : '';
    }
    select.addEventListener('change', updatePrice);
    updatePrice();

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      WS.clearFieldErrors(form);
      WS.setAlert(alertBox, '');
      const data = new FormData(form);
      const body = {
        workerId: Number(workerId),
        serviceId: Number(data.get('serviceId')),
        bookingDate: String(data.get('bookingDate') || ''),
        startTime: String(data.get('startTime') || ''),
        address: String(data.get('address') || '').trim(),
        description: String(data.get('description') || '').trim()
      };

      const today = WS.todayIso();
      const now = new Date();
      const errors = {};
      if (!body.serviceId) errors.serviceId = 'Choose a service.';
      if (!body.bookingDate) errors.bookingDate = 'Choose a date.';
      else if (body.bookingDate < today) errors.bookingDate = 'The date cannot be in the past.';
      if (!body.startTime) errors.startTime = 'Choose a start time.';
      else if (body.bookingDate === today && body.startTime <= `${pad(now.getHours())}:${pad(now.getMinutes())}`) {
        errors.startTime = 'Choose a later time today.';
      }
      if (body.address.length < 8) errors.address = 'Enter the full service address (at least 8 characters).';
      if (body.description.length > 1000) errors.description = 'Keep the description under 1000 characters.';
      WS.showFieldErrors(form, errors);
      if (Object.keys(errors).length) return;

      const button = form.querySelector('button[type="submit"]');
      WS.setBusy(button, true, 'Sending request…');
      try {
        const booking = await WS.api.post('/bookings', body);
        window.location.href = `my-bookings.html?new=${Number(booking.id)}`;
      } catch (error) {
        WS.showFieldErrors(form, error.errors);
        WS.setAlert(alertBox, error.message);
        WS.setBusy(button, false);
      }
    });
  }
})();
