// The live project's sign-in settings (scripts/supabase/auth-settings.mjs) and the local test
// Supabase (supabase/config.toml) must make the same choices, or the end-to-end tests would be
// checking something other than what friends get. Also: the email holds a code and never a link.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { root } from './helpers.mjs';
import { AUTH, TEMPLATE } from '../scripts/supabase/auth-settings.mjs';

const toml = await readFile(path.join(root, 'supabase/config.toml'), 'utf8');
// The value of `key` inside [section] of config.toml (a flat, simple subset of TOML).
function setting(section, key) {
  const start = toml.indexOf(`\n[${section}]\n`);
  assert.ok(start >= 0, `config.toml has no [${section}]`);
  const body = toml.slice(start + section.length + 4).split(/\n\[/)[0];
  const m = body.match(new RegExp(`^${key}\\s*=\\s*(.+)$`, 'm'));
  assert.ok(m, `config.toml [${section}] has no ${key}`);
  return JSON.parse(m[1].trim());
}

test('local and live sign-in settings agree', () => {
  assert.equal(setting('auth.email', 'otp_length'), AUTH.mailer_otp_length);
  assert.equal(setting('auth.email', 'otp_expiry'), AUTH.mailer_otp_exp);
  assert.equal(setting('auth.email', 'enable_confirmations'), !AUTH.mailer_autoconfirm);
  assert.equal(setting('auth', 'enable_anonymous_sign_ins'), AUTH.external_anonymous_users_enabled);
  assert.equal(setting('auth', 'enable_signup'), !AUTH.disable_signup);
  assert.equal(setting('auth', 'jwt_expiry'), AUTH.jwt_exp);
  assert.equal(
    setting('auth', 'refresh_token_reuse_interval'),
    AUTH.security_refresh_token_reuse_interval,
  );
  assert.equal(
    setting('auth.hook.before_user_created', 'enabled'),
    AUTH.hook_before_user_created_enabled,
  );
  assert.equal(setting('auth.hook.before_user_created', 'uri'), AUTH.hook_before_user_created_uri);
  for (const kind of ['magic_link', 'confirmation']) {
    assert.equal(
      setting(`auth.email.template.${kind}`, 'subject'),
      AUTH[`mailer_subjects_${kind}`],
    );
    assert.equal(setting(`auth.email.template.${kind}`, 'content_path'), './' + TEMPLATE);
  }
});

test('the sign-in email carries the six-digit code and no sign-in link', async () => {
  const html = await readFile(path.join(root, TEMPLATE), 'utf8');
  assert.match(html, /\{\{ \.Token \}\}/);
  assert.doesNotMatch(html, /ConfirmationURL|TokenHash|RedirectTo|SiteURL/);
  assert.match(AUTH.mailer_subjects_magic_link, /\{\{ \.Token \}\}/);
  assert.match(html, /15 minutes/);
  assert.equal(AUTH.mailer_otp_exp, 15 * 60);
});

test('the sign-up hook named in the settings exists in the migrations', async () => {
  const fn = AUTH.hook_before_user_created_uri
    .replace('pg-functions://postgres/', '')
    .replace('/', '.');
  const { readdir } = await import('node:fs/promises');
  const dir = path.join(root, 'supabase/migrations');
  const all = (
    await Promise.all((await readdir(dir)).map((f) => readFile(path.join(dir, f), 'utf8')))
  ).join('\n');
  assert.match(all, new RegExp(`create function ${fn.replace('.', '\\.')}\\(event jsonb\\)`));
  assert.match(
    all,
    new RegExp(
      `grant execute on function ${fn.replace('.', '\\.')}\\(jsonb\\) to supabase_auth_admin`,
    ),
  );
});

test('every place in the guide goes to the database, so any of them can be logged together', async () => {
  const { guidePlaces, guideSql } = await import('../scripts/supabase/guide-places.mjs');
  const { readdir } = await import('node:fs/promises');
  const dir = path.join(root, 'data/cities');
  let items = 0;
  for (const f of await readdir(dir))
    items += JSON.parse(await readFile(path.join(dir, f), 'utf8')).items.length;
  const rows = await guidePlaces();
  assert.equal(rows.length, items, 'a guide place was left out, so a shared trip could not log it');
  for (const r of rows) {
    assert.doesNotMatch(r.id, /^u-/, `${r.id}: "u-" ids are for places members add`);
    assert.ok(r.name && r.name.length <= 120 && r.city_id, r.id);
  }
  const batches = guideSql(rows, 1000);
  assert.equal(batches.length, Math.ceil(rows.length / 1000));
  const back = batches.flatMap((q) =>
    JSON.parse(Buffer.from(q.match(/decode\('([0-9a-f]+)'/)[1], 'hex').toString('utf8')),
  );
  assert.deepEqual(back, rows, 'the rows reach the database exactly as read');
  // The only part of the SQL that changes from batch to batch is the hex, so no name can alter it.
  const shape = new Set(batches.map((q) => q.replace(/decode\('[0-9a-f]+', 'hex'\)/, 'decode(…)')));
  assert.equal(shape.size, 1);
  assert.doesNotMatch([...shape][0], /[0-9a-f]{40}/);
});
