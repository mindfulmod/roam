// Connects the live site to its Supabase project. Run by .github/workflows/connect-accounts.yml
// after `supabase db push` has applied supabase/migrations/. Safe to run again at any time.
//
//   1. Sign-in settings (scripts/supabase/auth-settings.mjs), the email template, and email
//      through Resend, set with Supabase's Management API.
//   2. The founder email, so the first sign-in (whoever runs the app) can join without an invite.
//   3. The project's address and publishable key, written to data/backend.json for the app. Both
//      are meant to be public: what anyone may read or change is decided by the database rules.
//   4. The guide's places (scripts/supabase/guide-places.mjs), so a stop logged at a guide place
//      on a shared trip has its place row. Added or updated, never removed.
//
// Needs SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF, RESEND_API_KEY and ADMIN_EMAIL; EMAIL_FROM
// is optional. Nothing secret is ever printed.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUTH, SMTP, TEMPLATE, DEFAULT_FROM } from './auth-settings.mjs';
import { guidePlaces, guideSql } from './guide-places.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const env = (k) => (process.env[k] || '').trim();
const token = env('SUPABASE_ACCESS_TOKEN'),
  ref = env('SUPABASE_PROJECT_REF'),
  resendKey = env('RESEND_API_KEY'),
  admin = env('ADMIN_EMAIL').toLowerCase(),
  from = env('EMAIL_FROM') || DEFAULT_FROM;

const EMAIL = /^[^\s@'"\\$;]+@[^\s@'"\\$;]+\.[a-z]{2,}$/i;
const problems = [];
if (!token) problems.push('SUPABASE_ACCESS_TOKEN is missing');
if (!/^[a-z]{20}$/.test(ref))
  problems.push('SUPABASE_PROJECT_REF should be the 20 letters in your project address');
if (!resendKey.startsWith('re_')) problems.push('RESEND_API_KEY should start with re_');
if (!EMAIL.test(admin)) problems.push('ADMIN_EMAIL is not an email address');
if (!EMAIL.test(from)) problems.push('EMAIL_FROM is not an email address');
if (problems.length) {
  console.error('Cannot connect accounts yet:\n- ' + problems.join('\n- '));
  process.exit(1);
}

// This run's log is public, so a reply printed to explain a failure first has anything secret
// or personal blanked out of it, in case the reply repeats what it was sent.
const adminHex = Buffer.from(admin, 'utf8').toString('hex');
const hidden = [token, resendKey, admin, adminHex].filter((s) => s.length >= 4);
const scrub = (text) => hidden.reduce((t, s) => t.split(s).join('[hidden]'), text);

// `quiet` leaves the reply out of the error altogether, for calls whose body holds the email.
async function api(method, route, body, { quiet = false } = {}) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}${route}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    const why = quiet ? '(reply not shown)' : scrub(text).slice(0, 300);
    throw new Error(`${method} ${route}: HTTP ${res.status} ${why}`);
  }
  return text ? JSON.parse(text) : null;
}

// 1. Sign-in settings.
const template = await readFile(path.join(root, TEMPLATE), 'utf8');
const wanted = {
  ...AUTH,
  ...SMTP,
  smtp_admin_email: from,
  mailer_templates_magic_link_content: template,
  mailer_templates_confirmation_content: template,
};
await api('PATCH', '/config/auth', { ...wanted, smtp_pass: resendKey });
const now = (await api('GET', '/config/auth')) || {};
const same = (a, b) => String(a).trim() === String(b).trim();
// A setting the API does not report back is listed but not treated as a failure.
const off = Object.keys(wanted).filter((k) => k in now && !same(now[k], wanted[k]));
for (const k of Object.keys(wanted))
  console.log(`${off.includes(k) ? 'NOT SET' : k in now ? 'ok     ' : 'sent   '} ${k}`);
if (off.length) {
  console.error(`\n${off.length} sign-in settings did not take. See the lines marked NOT SET.`);
  process.exit(1);
}

// 2. The founder email. Sent as hex so no character in it can change the SQL.
await api(
  'POST',
  '/database/query',
  {
    query: `insert into private.settings (key, value) values ('founder_email', convert_from(decode('${adminHex}', 'hex'), 'UTF8')) on conflict (key) do update set value = excluded.value`,
  },
  { quiet: true },
);
console.log('ok      founder email stored');

// 3. The address and publishable key for the app.
const keys = await api('GET', '/api-keys?reveal=true');
const pick =
  keys.find((k) => k.type === 'publishable' && k.api_key) ||
  keys.find((k) => k.type === 'legacy' && k.name === 'anon' && k.api_key);
if (!pick) {
  console.error('No publishable key found. Create one under Project Settings > API Keys.');
  process.exit(1);
}
const backend = { url: `https://${ref}.supabase.co`, key: pick.api_key };
await writeFile(path.join(root, 'data/backend.json'), JSON.stringify(backend, null, 2) + '\n');
console.log(`ok      data/backend.json points at ${backend.url} (${pick.type} key)`);

// 4. The guide's places, a few hundred at a time.
const places = await guidePlaces();
for (const query of guideSql(places, 300)) await api('POST', '/database/query', { query });
console.log(`ok      ${places.length} guide places in the database`);
