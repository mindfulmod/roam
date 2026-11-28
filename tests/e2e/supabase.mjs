// Helpers for the end-to-end account tests, which run against a real local Supabase
// (`supabase start`, see .github/workflows/accounts.yml). Not part of `npm test`.
//
//   SUPABASE_URL   the local API, e.g. http://127.0.0.1:54321
//   SUPABASE_KEY   its publishable (or anon) key
//   MAIL_URL       the local mail catcher (Mailpit or Inbucket), e.g. http://127.0.0.1:54324
//   DB_URL         a postgres:// address for arranging things the app cannot do itself
import { execFileSync } from 'node:child_process';

export const URL_ = process.env.SUPABASE_URL;
export const KEY = process.env.SUPABASE_KEY;
export const MAIL = process.env.MAIL_URL || 'http://127.0.0.1:54324';
export const DB = process.env.DB_URL;
if (!URL_ || !KEY || !DB) throw new Error('Set SUPABASE_URL, SUPABASE_KEY and DB_URL first.');

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One SQL statement as the database owner. Returns the first column of the first row as text.
export function sql(query) {
  return execFileSync('psql', [DB, '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', query], {
    encoding: 'utf8',
  }).trim();
}

async function call(path, { method = 'GET', body, token, headers = {} } = {}) {
  const res = await fetch(URL_ + path, {
    method,
    headers: {
      apikey: KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  return { status: res.status, ok: res.ok, json, text };
}
export const auth = (path, body, opts = {}) =>
  call('/auth/v1/' + path, { method: 'POST', body, ...opts });
export const rest = (path, opts = {}) => call('/rest/v1/' + path, opts);
export const rpc = (fn, args, token) =>
  call('/rest/v1/rpc/' + fn, { method: 'POST', body: args || {}, token });

// The newest sign-in code emailed to an address. Works with Mailpit and with the older Inbucket.
export async function codeFor(email, { after = 0, tries = 40 } = {}) {
  for (let i = 0; i < tries; i++) {
    const text = await latestMail(email, after).catch(() => null);
    const m = text && text.match(/\b(\d{6})\b/);
    if (m) return m[1];
    await sleep(250);
  }
  throw new Error('No sign-in code arrived for ' + email);
}
async function latestMail(email, after) {
  // Mailpit
  let r = await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent('to:' + email)}`);
  if (r.ok) {
    const list = (await r.json()).messages || [];
    const fresh = list.filter((m) => Date.parse(m.Created) >= after);
    if (!fresh.length) return null;
    const msg = await (await fetch(`${MAIL}/api/v1/message/${fresh[0].ID}`)).json();
    return (msg.Subject || '') + '\n' + (msg.Text || '') + '\n' + (msg.HTML || '');
  }
  // Inbucket
  const box = email.split('@')[0];
  r = await fetch(`${MAIL}/api/v1/mailbox/${box}`);
  if (!r.ok) return null;
  const list = (await r.json()).filter((m) => Date.parse(m.date) >= after);
  if (!list.length) return null;
  const msg = await (
    await fetch(`${MAIL}/api/v1/mailbox/${box}/${list[list.length - 1].id}`)
  ).json();
  return (msg.subject || '') + '\n' + (msg.body?.text || '') + '\n' + (msg.body?.html || '');
}
export async function mailCount(email) {
  const r = await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent('to:' + email)}`);
  if (r.ok) return ((await r.json()).messages || []).length;
  const box = email.split('@')[0];
  const r2 = await fetch(`${MAIL}/api/v1/mailbox/${box}`);
  return r2.ok ? (await r2.json()).length : 0;
}

// Ask for a code, read it from the mail catcher, and sign in with it. Returns the session.
export async function signIn(email, data) {
  const after = Date.now() - 1000;
  const asked = await auth('otp', { email, create_user: true, ...(data ? { data } : {}) });
  if (!asked.ok) throw Object.assign(new Error('otp refused: ' + asked.text), { res: asked });
  const token = await codeFor(email, { after });
  const v = await auth('verify', { type: 'email', email, token });
  if (!v.ok) throw new Error('verify refused: ' + v.text);
  return v.json;
}
