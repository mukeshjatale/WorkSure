/* api.js - the only file that talks to the backend.
   Every request goes to /api/... on the same server that serves these pages.
   The backend requires the header X-Requested-With on every change (POST, PUT, PATCH, DELETE). */
(function () {
  'use strict';

  window.WS = window.WS || {};
  const BASE_URL = '/api';
  const SECURITY_HEADER = { 'X-Requested-With': 'WorkSure' };

  function buildUrl(path, params) {
    let url = BASE_URL + path;
    if (params) {
      const search = new URLSearchParams();
      Object.keys(params).forEach((key) => {
        const value = params[key];
        if (value !== undefined && value !== null && value !== '') search.append(key, String(value));
      });
      const text = search.toString();
      if (text) url += '?' + text;
    }
    return url;
  }

  async function request(method, path, options = {}) {
    const headers = { Accept: 'application/json' };
    if (method !== 'GET') Object.assign(headers, SECURITY_HEADER);

    const init = { method, headers, credentials: 'same-origin' };
    if (options.form) {
      init.body = options.form; // browser sets the multipart header itself
    } else if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }

    let response;
    try {
      response = await fetch(buildUrl(path, options.params), init);
    } catch (networkError) {
      const error = new Error('Cannot reach the WorkSure server. Check your internet connection and try again.');
      error.status = 0;
      error.errors = {};
      throw error;
    }

    const text = await response.text();
    let payload = null;
    if (text) {
      try { payload = JSON.parse(text); } catch (parseError) { payload = null; }
    }

    if (!response.ok || (payload && payload.success === false)) {
      const error = new Error((payload && payload.message) || `Request failed (${response.status}).`);
      error.status = response.status;
      error.errors = (payload && payload.errors) || {};

      // Session ended while on a protected page: send the user to log in and come back afterwards.
      if (response.status === 401 && document.body.hasAttribute('data-protected') && !path.startsWith('/auth/')) {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = 'login.html?next=' + next;
      }
      throw error;
    }

    return payload ? payload.data : null;
  }

  window.WS.api = {
    get: (path, params) => request('GET', path, { params }),
    post: (path, body) => request('POST', path, { body }),
    put: (path, body) => request('PUT', path, { body }),
    patch: (path, body) => request('PATCH', path, { body }),
    del: (path) => request('DELETE', path),
    upload: (path, formData) => request('POST', path, { form: formData })
  };
})();
