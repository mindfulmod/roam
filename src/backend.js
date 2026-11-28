// Accounts: the app's link to its Supabase project. data/backend.json holds the project's
// address and publishable key (written by the Connect accounts workflow, see
// docs/accounts-setup.md). Both are public on purpose: what each person may read or change is
// decided by the database's own rules (supabase/migrations/), never by this file. With no
// project set, accounts are off and the social pages show the sample.
//
// Signing in keeps a session in this browser only. Nothing is sent to the project until someone
// signs in or opens an invite link, and the offline helper never stores its answers.
const BK = (() => {
  const c = DATA.backend || {},
    on =
      typeof c.url === 'string' &&
      /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(c.url) &&
      typeof c.key === 'string' &&
      /^[\w.-]{20,}$/.test(c.key);
  return { on, url: on ? c.url : '', key: on ? c.key : '' };
})();
const BK_SESSION = 'tandem-session-v1';
const BK_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function bkRead() {
  try {
    const s = JSON.parse(localStorage.getItem(BK_SESSION) || 'null');
    if (
      s &&
      typeof s.access_token === 'string' &&
      typeof s.refresh_token === 'string' &&
      Number.isFinite(s.expires_at) &&
      BK_UUID.test(s.user?.id || '')
    )
      return {
        access_token: s.access_token,
        refresh_token: s.refresh_token,
        expires_at: s.expires_at,
        user: { id: s.user.id, email: typeof s.user.email === 'string' ? s.user.email : '' },
      };
  } catch {}
  return null;
}
let bkSession = BK.on ? bkRead() : null;
function bkKeep(s) {
  bkSession = s;
  try {
    if (s) localStorage.setItem(BK_SESSION, JSON.stringify(s));
    else localStorage.removeItem(BK_SESSION);
  } catch {}
}
// A session as the sign-in service sends it, in the shape kept here.
function bkFromAuth(j) {
  if (!j?.access_token || !j.refresh_token || !BK_UUID.test(j.user?.id || '')) return null;
  const at = Number(j.expires_at) || Math.floor(Date.now() / 1000) + (Number(j.expires_in) || 3600);
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: at,
    user: { id: j.user.id, email: j.user.email || '' },
  };
}
const bkSignedIn = () => Boolean(BK.on && bkSession);
const bkMyId = () => bkSession?.user.id || '';

// Plain words for what went wrong, from the sign-in service's or the database's answer.
function bkProblem(r) {
  if (!r || r.status === 0) return 'Tandem Roads could not be reached. Check your connection.';
  const j = r.data || {},
    code = String(j.error_code || j.code || ''),
    msg = String(j.msg || j.message || j.error_description || '');
  if (r.status === 429 || /rate_limit/.test(code))
    return 'Too many tries for now. Wait a minute, then try again.';
  if (/otp_expired|invalid.*(token|otp)/i.test(code + ' ' + msg))
    return 'That code is wrong or has expired. Check the newest email, or ask for a new code.';
  if (/invite-only/i.test(msg)) return msg.slice(0, 200);
  if (/plain_text|plain_words/.test(msg)) return 'Use plain letters, numbers and punctuation only.';
  if (/display_name/.test(msg)) return 'Your name needs 1 to 40 characters.';
  // The database's own refusals are written as plain sentences (supabase/migrations/).
  if (
    /^(23514|42501|P0001|P0002)$/.test(code) &&
    /^[A-Z][^\n]{3,110}$/.test(msg) &&
    !/violates|permission denied|relation|column|function|JWT|duplicate/i.test(msg)
  )
    return msg.replace(/([^.])$/, '$1.');
  if (r.status === 401 || r.status === 403) return 'You are not allowed to do that.';
  return 'Something went wrong. Please try again.';
}

async function bkCall(path, { method = 'GET', body, token, prefer, signal } = {}) {
  const headers = { apikey: BK.key };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const stop = new AbortController(),
    timer = setTimeout(() => stop.abort(), 20000);
  signal?.addEventListener('abort', () => stop.abort());
  try {
    const res = await fetch(BK.url + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: stop.signal,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {}
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  } finally {
    clearTimeout(timer);
  }
}

// A fresh access token. Refreshing takes a lock, so two open tabs never spend the same refresh
// token (each works only once). `stale` is a token the service just turned down.
let bkRefreshing = null;
async function bkToken(stale = '') {
  if (!bkSession) return '';
  const fresh = (s) => s && s.access_token !== stale && s.expires_at - Date.now() / 1000 > 60;
  if (fresh(bkSession)) return bkSession.access_token;
  if (!bkRefreshing) {
    const run = async () => {
      const latest = bkRead() || bkSession;
      if (!latest) return;
      if (fresh(latest)) return bkKeep(latest);
      const r = await bkCall('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        body: { refresh_token: latest.refresh_token },
      });
      const s = r.ok && bkFromAuth(r.data);
      if (s) bkKeep(s);
      else if (r.status >= 400 && r.status < 500) bkSignedOut('expired');
    };
    bkRefreshing = (navigator.locks?.request ? navigator.locks.request('tandem-auth', run) : run())
      .catch(() => {})
      .finally(() => (bkRefreshing = null));
  }
  await bkRefreshing;
  return bkSession?.access_token || '';
}
// A call as the signed-in person. A token the service no longer accepts is refreshed once.
async function bkAuthed(path, opts = {}) {
  const token = bkSignedIn() ? await bkToken() : '';
  if (!token) return { ok: false, status: 401, data: null };
  let r = await bkCall(path, { ...opts, token });
  if (r.status === 401 && bkSession) {
    const again = await bkToken(token);
    if (again && again !== token) r = await bkCall(path, { ...opts, token: again });
  }
  return r;
}
const bkRpc = (fn, args = {}) =>
  bkAuthed('/rest/v1/rpc/' + fn, { method: 'POST', body: args, prefer: 'return=representation' });
const bkRows = (table, query) => bkAuthed(`/rest/v1/${table}?${query}`);
const bkChange = (table, query, body) =>
  bkAuthed(`/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    body,
    prefer: 'return=representation',
  });
const bkAdd = (table, body) =>
  bkAuthed('/rest/v1/' + table, { method: 'POST', body, prefer: 'return=minimal' });
const bkRemove = (table, query) =>
  bkAuthed(`/rest/v1/${table}?${query}`, { method: 'DELETE', prefer: 'return=representation' });

// Signing in: a six-digit code by email. The invite code, when there is one, travels with the
// request so the database can let a new account be made (private.before_user_created).
const bkSendCode = (email, invite) =>
  bkCall('/auth/v1/otp', {
    method: 'POST',
    body: { email, create_user: true, ...(invite ? { data: { invite } } : {}) },
  });
async function bkVerify(email, code) {
  const r = await bkCall('/auth/v1/verify', {
    method: 'POST',
    body: { type: 'email', email, token: code },
  });
  const s = r.ok && bkFromAuth(r.data);
  if (s) bkKeep(s);
  return s ? { ok: true } : { ok: false, problem: bkProblem(r.ok ? { status: 500 } : r) };
}
async function bkSignOut() {
  const token = bkSession?.access_token;
  bkSignedOut('user');
  if (token) await bkCall('/auth/v1/logout?scope=local', { method: 'POST', token });
}
// Forgets the session and everything loaded with it. `why`: 'user', 'expired' or 'gone'.
function bkSignedOut(why) {
  const was = Boolean(bkSession);
  bkKeep(null);
  acctForget();
  if (was && why === 'expired') toast('You were signed out. Sign in again to see your friends.');
  if (was) socHeader();
}
// Another tab signed in or out.
addEventListener('storage', (e) => {
  if (e.key !== BK_SESSION || !BK.on) return;
  const before = bkMyId();
  bkSession = bkRead();
  if (bkMyId() !== before) {
    acctForget();
    socHeader();
    if (/^#\/(feed|me|people|account|signin|join)/.test(location.hash)) route();
  }
});
