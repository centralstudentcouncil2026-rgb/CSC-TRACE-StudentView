'use strict';
// Public deployment URL; administrator credentials are never included in source.
window.traceBackend = (() => {
  const url = 'https://script.google.com/macros/s/AKfycbxT1TtODhRE1bYW19UUSdNiU4VbIxVwf4jKWXeljrER0PJFKrPv6HmxQygc2WdiSqFk/exec';
  const sessionKey = 'csc-trace-google-session';
  let session = null;
  try { session = JSON.parse(sessionStorage.getItem(sessionKey) || 'null'); } catch (_) {}
  function token() { return session && session.expires > Date.now() && typeof session.token === 'string' ? session.token : ''; }
  function clearSession() { session = null; try { sessionStorage.removeItem(sessionKey); } catch (_) {} }
  async function request(action, payload = {}, authenticated = false) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(action === 'list' ? url + '?action=list' : url, {
        method: action === 'list' ? 'GET' : 'POST',
        redirect: 'follow', credentials: 'omit', cache: 'no-store', signal: controller.signal,
        ...(action === 'list' ? {} : { headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...payload, action, ...(authenticated ? { token: token() } : {}) }) })
      });
      let result;
      try { result = await response.json(); } catch (_) { throw new Error('The backend did not return JSON. Check the Apps Script deployment access and setup.'); }
      if (!response.ok || !result || result.ok !== true) {
        const error = new Error(result?.error || 'The backend could not complete the request.');
        error.code = result?.code;
        if (error.code === 'UNAUTHORIZED' && authenticated) clearSession();
        throw error;
      }
      return result;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('The server took too long. Refresh to check whether your change was saved before retrying.');
      if (error instanceof TypeError) throw new Error('Cannot reach the Google Sheets backend. Check your connection and Apps Script web app access.');
      throw error;
    } finally { clearTimeout(timeout); }
  }
  return { request, token, clearSession,
    async login(username, password) {
      const result = await request('login', { username, password });
      if (typeof result.token !== 'string' || !Number.isFinite(result.expiresIn)) throw new Error('Invalid login response from the backend.');
      session = { token: result.token, expires: Date.now() + result.expiresIn * 1000 };
      try { sessionStorage.setItem(sessionKey, JSON.stringify(session)); } catch (_) {}
    },
    async logout() { try { if (token()) await request('logout', {}, true); } finally { clearSession(); } }
  };
})();
