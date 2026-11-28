// Real accounts on the social pages: signing in with an emailed code, joining with an invite
// link, friends, invite links, blocking, reports, leaving, and your data. Signed out, or with
// accounts off, the Feed, profiles and Account show the sample in social.js instead.
//
// What is shown comes from the database, which decides what each person may see (see
// docs/data-model.md); this file only lays it out. Other people's words are always escaped.
let ACCT = null,
  acctJob = null;
const ACCT_FLOW = 'tandem-signin-v1';
const ACCT_COLORS = ['#c2562b', '#2f6fa8', '#7a4fa3', '#165b4e', '#b0429f', '#a9820c'];
const ACCT_EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@.]{2,}$/;
const acctInviteCode = (c) => typeof c === 'string' && /^[A-Za-z0-9_-]{22}$/.test(c);

function acctForget() {
  ACCT = null;
  acctJob = null;
}
// Who you are and who your people are, fetched after sign-in and kept for a short while.
// `finish_sign_in()` with no invite changes nothing for a member: it reports where you stand.
function acctLoad(fresh = false) {
  if (!bkSignedIn()) return Promise.resolve(null);
  if (ACCT && !fresh && Date.now() - ACCT.at < 30000) return Promise.resolve(ACCT);
  if (acctJob) return acctJob;
  const id = bkMyId();
  const job = (acctJob = (async () => {
    const st = await bkRpc('finish_sign_in');
    if (!st.ok) throw st;
    const out = {
      at: Date.now(),
      id,
      member: st.data?.member === true,
      admin: st.data?.admin === true,
      leaving: st.data?.leaving || null,
      me: null,
      people: [],
      invites: [],
      reports: null,
    };
    if (out.member) {
      const [me, priv, people, invites, reports] = await Promise.all([
        bkRows('profiles', `select=id,display_name,home_city,bio,created_at&id=eq.${id}`),
        bkRows('account_private', `select=travel_style,delete_after&id=eq.${id}`),
        bkRpc('my_people'),
        bkRows(
          'friend_invites',
          'select=id,note,created_at,expires_at,used_by,used_at&order=created_at.desc&limit=40',
        ),
        out.admin ? bkRpc('admin_reports', { p_status: 'open' }) : null,
      ]);
      for (const r of [me, priv, people, invites]) if (!r.ok) throw r;
      const p = me.data?.[0];
      if (p)
        out.me = {
          id,
          name: p.display_name,
          home: p.home_city || '',
          line: p.bio || '',
          joined: p.created_at,
          style: Array.isArray(priv.data?.[0]?.travel_style) ? priv.data[0].travel_style : [],
        };
      out.people = (people.data || []).filter((x) => BK_UUID.test(x.id || ''));
      out.invites = (invites.data || []).filter((x) => BK_UUID.test(x.id || ''));
      out.reports = reports?.ok ? reports.data || [] : null;
    }
    if (bkMyId() === id) ACCT = out;
    return out;
  })().finally(() => {
    if (acctJob === job) acctJob = null;
  }));
  return job;
}
// Draws a signed-in page once your data is here: at once from what is kept, then again when a
// fresh copy arrives. `draw(acct)` returns the page's HTML.
function acctPage(nav, title, draw) {
  headerActive(nav);
  document.title = title + ' · Tandem Roads';
  const at = location.hash,
    paint = () => {
      if (location.hash !== at || !ACCT) return;
      $('#app').innerHTML = ACCT.member ? draw(ACCT) : acctNotMember();
      socHeader();
    };
  if (ACCT) paint();
  else $('#app').innerHTML = loadingPage(skel('skel-line skel-title w40'));
  acctLoad(Boolean(ACCT)).then(paint, (r) => {
    if (location.hash !== at) return;
    if (!bkSignedIn()) return route();
    if (!ACCT) $('#app').innerHTML = loadFailed();
    else toast(bkProblem(r));
  });
}
const acctPerson = (id) => ACCT?.people.find((p) => p.id === id) || null;
const acctNeeds = () => (ACCT?.people || []).filter((p) => p.relation === 'asks_you');
function acctColor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ACCT_COLORS[h % ACCT_COLORS.length];
}
function acctAvatar(p, cls = '') {
  const first = [...String(p?.name || '').trim()][0] || '?';
  return `<span class="st-avatar soc-av ${cls}" style="--who:${acctColor(p?.id)}" aria-hidden="true">${esc(first.toUpperCase())}</span>`;
}
const acctDate = (t, year = true) =>
  t
    ? new Date(t).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        ...(year ? { year: 'numeric' } : {}),
      })
    : '';
const acctMonth = (t) =>
  t ? `${SOC_MONTHS[new Date(t).getMonth()]} ${new Date(t).getFullYear()}` : '';

// ---------------------------------------------------------------- signing in
// Where a sign-in got to, so switching to the mail app and back (which can reload the page on a
// phone) lands on the code box again. Kept in this tab only, for half an hour.
function acctFlow() {
  try {
    const f = JSON.parse(sessionStorage.getItem(ACCT_FLOW) || 'null');
    if (f && Date.now() - f.at < 30 * 60000 && ACCT_EMAIL.test(f.email || '')) return f;
  } catch {}
  return null;
}
function acctFlowKeep(f) {
  try {
    if (f) sessionStorage.setItem(ACCT_FLOW, JSON.stringify({ ...f, at: Date.now() }));
    else sessionStorage.removeItem(ACCT_FLOW);
  } catch {}
}
// Only pages inside the app may follow a sign-in.
const acctNext = (n) =>
  typeof n === 'string' && /^(feed|me|account|people\/[0-9a-f-]{36})$/.test(n) ? n : 'feed';

function renderSignIn(params) {
  headerActive('me');
  document.title = 'Sign in · Tandem Roads';
  if (!BK.on) return acctOff();
  if (bkSignedIn()) return void location.replace('#/' + acctNext(params.get('next')));
  const f = acctFlow(),
    next = acctNext(params.get('next') || f?.next);
  $('#app').innerHTML =
    `<div class="wrap soc-page acct-page"><header class="soc-top"><div><h1>Sign in</h1><p class="muted">Tandem Roads sends a six-digit code to your email. There is no password.</p></div></header>` +
    (f && !f.invite ? acctCodeBox(f) : acctEmailBox('signin', next)) +
    `<p class="soc-fine">New here? Tandem Roads is invite-only for now. Ask a friend who uses it to send you an invite link.</p></div>`;
  $('#acct-email')?.focus();
}
const acctEmailBox = (kind, next) =>
  `<form class="soc-set acct-form" data-acct-form="email" data-kind="${kind}" data-next="${esc(next)}" novalidate><div class="field"><label for="acct-email">Your email</label><input id="acct-email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" maxlength="254" required></div><p class="acct-problem" role="alert" hidden></p><button class="btn" type="submit">Send my code</button></form>`;
const acctCodeBox = (f) =>
  `<form class="soc-set acct-form" data-acct-form="code" novalidate><p class="acct-sent">${icon('check')} A code is on its way to <strong>${esc(f.email)}</strong>. It works for 15 minutes.</p><div class="field"><label for="acct-code">Six-digit code</label><input id="acct-code" class="acct-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="6" required></div><p class="acct-problem" role="alert" hidden></p><button class="btn" type="submit">${f.invite ? 'Join Tandem Roads' : 'Sign in'}</button><p class="acct-again">No email? Look in spam, or <button type="button" class="inline-link" data-action="acct-resend">send a new code</button>. <button type="button" class="inline-link" data-action="acct-restart">Use another email</button></p></form>`;
function acctOff() {
  $('#app').innerHTML =
    `<div class="wrap"><div class="empty">${icon('friends')}<h2>Accounts are not switched on yet.</h2><p>The Feed, profiles and Account show a sample until they are.</p><a class="btn" href="#/feed">See the sample</a></div></div>`;
}
function acctShowProblem(form, text) {
  const p = form?.querySelector('.acct-problem');
  if (!p) return toast(text);
  p.textContent = text;
  p.hidden = !text;
}
async function acctSendCode(form) {
  const email = $('#acct-email').value.trim().toLowerCase(),
    join = form.dataset.kind === 'join',
    code = join ? form.dataset.code : '';
  let name = '',
    band = '';
  if (join) {
    name = $('#acct-name').value.trim();
    const y = Number($('#acct-born-y').value),
      m = Number($('#acct-born-m').value);
    if (!name) return acctShowProblem(form, 'Add your name, so your friend knows it is you.');
    if (/[\x00-\x1f\x7f-\x9f‪-‮⁦-⁩﻿]/.test(name))
      return acctShowProblem(form, 'Use plain letters, numbers and punctuation in your name.');
    if (!y || !m) return acctShowProblem(form, 'Pick the month and year you were born.');
    const now = new Date();
    // To the month only, so a birthday this month counts as not yet.
    const age = now.getFullYear() - y - (now.getMonth() + 1 <= m ? 1 : 0);
    if (age < 16) {
      acctFlowKeep(null);
      $('#app').innerHTML =
        `<div class="wrap"><div class="empty">${icon('info')}<h2>Tandem Roads is for people 16 and over.</h2><p>Nothing you typed has been kept or sent anywhere.</p><a class="btn" href="#/">Explore places</a></div></div>`;
      return;
    }
    band = age >= 18 ? '18+' : '16-17';
  }
  if (!ACCT_EMAIL.test(email))
    return acctShowProblem(form, 'That email address does not look right.');
  const btn = form.querySelector('[type="submit"]');
  btn.disabled = true;
  acctShowProblem(form, '');
  const r = await bkSendCode(email, code);
  btn.disabled = false;
  if (!r.ok) {
    if (join && /invite-only/i.test(r.data?.msg || r.data?.message || ''))
      return acctShowProblem(
        form,
        'This invite link no longer works. It may have been used already, or be more than 14 days old. Ask your friend for a new one.',
      );
    return acctShowProblem(form, bkProblem(r));
  }
  const f = {
    email,
    next: form.dataset.next || 'feed',
    ...(join ? { invite: code, name, band } : {}),
  };
  acctFlowKeep(f);
  form.outerHTML = acctCodeBox(f);
  $('#acct-code')?.focus();
}
async function acctCheckCode(form) {
  const f = acctFlow(),
    code = $('#acct-code').value.replace(/\D/g, '');
  if (!f) return route();
  if (code.length !== 6) return acctShowProblem(form, 'The code has six digits.');
  const btn = form.querySelector('[type="submit"]');
  btn.disabled = true;
  acctShowProblem(form, '');
  const v = await bkVerify(f.email, code);
  if (!v.ok) {
    btn.disabled = false;
    return acctShowProblem(form, v.problem);
  }
  const r = await bkRpc(
    'finish_sign_in',
    f.invite ? { p_invite: f.invite, p_name: f.name, p_age_band: f.band } : {},
  );
  btn.disabled = false;
  if (!r.ok) return acctShowProblem(form, bkProblem(r));
  acctFlowKeep(null);
  acctForget();
  const out = r.data || {};
  if (!out.member) {
    // The invite stopped working between sending the code and typing it in.
    if (f.invite)
      toast('That invite link no longer works. Ask your friend for a new one.', null, 6000);
    return location.replace('#/account');
  }
  const friend = out.friend?.name ? esc(out.friend.name) : '';
  const said = {
    ok: friend ? `You and ${out.friend.name} are now friends.` : 'You are in.',
    already_friends: friend ? `You and ${out.friend.name} are already friends.` : '',
    own: 'That was your own invite link. Send it to a friend instead.',
    used: 'That invite link was used already, so it made no new friend.',
    expired: 'That invite link has expired, so it made no new friend.',
    unknown: 'That invite link does not work, so it made no new friend.',
  }[out.invite];
  if (out.created)
    toast(
      out.invite === 'ok' && friend
        ? `Welcome to Tandem Roads. ${said}`
        : 'Welcome to Tandem Roads.',
      null,
      6000,
    );
  else if (said) toast(said, null, 6000);
  else toast('Signed in.');
  // The invite code leaves the address bar and the history.
  location.replace(
    '#/' +
      (out.created && !f.invite
        ? 'account'
        : out.invite === 'ok' && out.friend?.id && BK_UUID.test(out.friend.id)
          ? 'people/' + out.friend.id
          : acctNext(f.next)),
  );
}

// ---------------------------------------------------------------- joining with an invite link
function renderJoin(code) {
  headerActive('me');
  document.title = 'Join · Tandem Roads';
  if (!BK.on) return acctOff();
  if (!acctInviteCode(code)) {
    $('#app').innerHTML =
      `<div class="wrap"><div class="empty">${icon('link')}<h2>This invite link is not complete.</h2><p>Part of it may have been cut off. Ask your friend to send it again.</p><a class="btn" href="#/">Explore places</a></div></div>`;
    return;
  }
  // Already signed in: use the invite at once.
  if (bkSignedIn()) {
    $('#app').innerHTML = loadingPage(skel('skel-line skel-title w40'));
    acctFlowKeep(null);
    bkRpc('finish_sign_in', { p_invite: code }).then((r) => {
      acctForget();
      const out = r.data || {},
        name = out.friend?.name;
      if (!r.ok) toast(bkProblem(r));
      else if (out.invite === 'ok')
        toast(`You and ${name || 'your friend'} are now friends.`, null, 6000);
      else if (out.invite === 'already_friends')
        toast(`You and ${name || 'your friend'} are already friends.`);
      else if (out.invite === 'own')
        toast('That is your own invite link. Send it to a friend.', null, 6000);
      else toast('That invite link no longer works. Ask your friend for a new one.', null, 6000);
      location.replace(
        out.invite === 'ok' && BK_UUID.test(out.friend?.id || '')
          ? '#/people/' + out.friend.id
          : '#/feed',
      );
    });
    return;
  }
  const f = acctFlow(),
    now = new Date().getFullYear(),
    years = Array.from({ length: 101 }, (_, i) => now - i);
  $('#app').innerHTML =
    `<div class="wrap soc-page acct-page"><header class="soc-top"><div><h1>You’re invited</h1><p class="muted">A friend invited you to Tandem Roads, where friends share the trips they take. Only people you know can see you, and there are no public pages.</p></div></header>` +
    (f?.invite === code
      ? acctCodeBox(f)
      : `<form class="soc-set acct-form" data-acct-form="email" data-kind="join" data-code="${esc(code)}" data-next="feed" novalidate><div class="field"><label for="acct-name">Your name</label><input id="acct-name" maxlength="40" autocomplete="name" required></div><fieldset class="field acct-born"><legend>When were you born?</legend><select id="acct-born-m" aria-label="Month"><option value="">Month</option>${SOC_MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}</select><select id="acct-born-y" aria-label="Year"><option value="">Year</option>${years.map((y) => `<option>${y}</option>`).join('')}</select><small>Only to check you are 16 or over. It is not kept.</small></fieldset><div class="field"><label for="acct-email">Your email</label><input id="acct-email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" maxlength="254" required><small>For your sign-in codes. Friends never see it.</small></div><p class="acct-problem" role="alert" hidden></p><button class="btn" type="submit">Send my code</button></form>`) +
    `<ul class="st-rules acct-rules"><li>Joining makes you friends with whoever sent the link.</li><li>A trip is seen only by people all its travellers approve.</li><li>You can download everything, or leave, at any time.</li></ul>` +
    `<p class="soc-fine">Already a member? Signing in with this link makes you friends too.</p></div>`;
}

// ---------------------------------------------------------------- feed
function acctFeed() {
  acctPage('feed', 'Feed', (a) => {
    const needs = acctNeeds(),
      friends = a.people.filter((p) => p.relation === 'friend');
    return (
      `<div class="wrap soc-page soc-feed"><header class="soc-top"><div><h1>Feed</h1><p class="muted">What needs you, then your friends’ travels, newest first.</p></div></header>` +
      acctLeavingNote(a) +
      (needs.length
        ? `<section class="soc-needs" aria-label="Needs you"><div class="soc-sechead"><h2>Needs you</h2></div><div class="soc-needlist">${needs.map(acctNeedHtml).join('')}</div></section>`
        : '') +
      `<section class="soc-stream" aria-label="From your friends"><div class="soc-sechead"><h2>From your friends</h2></div>${
        friends.length
          ? `<div class="soc-friendrow soc-strip" role="list" aria-label="Your friends">${friends.map((p) => `<a class="soc-friend" role="listitem" href="#/people/${p.id}" aria-label="${esc(p.name)}">${acctAvatar(p, 'mid')}<span>${esc(p.name)}</span></a>`).join('')}</div>`
          : ''
      }<p class="soc-calm">${friends.length ? 'Nothing from your friends yet. When one of them shares a trip with you, it shows up here.' : 'No friends here yet. Send someone an invite link: when they join, you are friends.'}</p></section>` +
      `<section class="soc-end">${icon('check')}<h2>You’re all caught up</h2><p class="muted">That is everything. The feed does not refill itself.</p><div class="soc-need-acts"><a class="btn" href="#/">Explore places</a><button class="btn ghost" data-action="acct-invite">Invite a friend</button></div></section>` +
      footer() +
      '</div>'
    );
  });
}
const acctNeedHtml = (p) =>
  `<article class="soc-need acct-need"><a class="soc-rowwho" href="#/people/${p.id}">${acctAvatar(p)}<span><strong>${esc(p.name)}</strong><small>wants to be friends${p.home ? ' · ' + esc(p.home) : ''}</small></span></a><div class="soc-need-acts"><button class="btn small" data-action="acct-accept" data-id="${p.id}">Accept</button><button class="btn small ghost" data-action="acct-decline" data-id="${p.id}">Not now</button></div></article>`;
function acctLeavingNote(a) {
  if (!a.leaving) return '';
  return `<p class="soc-set-note acct-leaving">${icon('info')} Your account will be deleted on <strong>${esc(acctDate(a.leaving))}</strong>. Friends already cannot see you. <button class="inline-link" data-action="acct-stay">Stay on Tandem Roads</button></p>`;
}
// The header: your initial, and how many friend requests are waiting.
function acctHeader() {
  const n = acctNeeds().length,
    me = ACCT?.me;
  $$('.feed-count').forEach((e) => {
    e.textContent = n;
    e.toggleAttribute('data-zero', !n);
  });
  $$('.me-link').forEach((a) => {
    a.innerHTML = me
      ? acctAvatar(me)
      : '<span class="st-avatar soc-av acct-av-wait" aria-hidden="true"></span>';
    a.hidden = false;
  });
}
function acctNotMember() {
  return `<div class="wrap"><div class="empty">${icon('link')}<h2>You are signed in, but not a member yet.</h2><p>To join, open the invite link a friend sent you on this device. If it has expired, ask them for a new one.</p><button class="btn ghost" data-action="acct-signout">Sign out</button></div></div>`;
}

// ---------------------------------------------------------------- profiles
function acctProfile(id) {
  if (!BK_UUID.test(id)) {
    headerActive('');
    $('#app').innerHTML = acctNoProfile();
    return;
  }
  const self = id === bkMyId();
  if (self)
    return acctPage('me', 'Your profile', (a) =>
      a.me ? acctProfileHtml(a.me, 'self', a) : acctNoProfile(),
    );
  // Someone else: what the database lets you see of them, and how you know each other.
  headerActive('');
  document.title = 'Profile · Tandem Roads';
  const at = location.hash;
  $('#app').innerHTML = loadingPage(skel('skel-line skel-title w40'));
  Promise.all([
    acctLoad(),
    bkRows('profiles', `select=id,display_name,home_city,bio,created_at&id=eq.${id}`),
  ]).then(
    ([a, r]) => {
      if (location.hash !== at) return;
      const p = r.ok && r.data?.[0];
      if (!a?.member || !p)
        return void ($('#app').innerHTML = a?.member ? acctNoProfile() : acctNotMember());
      const rel = acctPerson(id)?.relation || 'trip';
      document.title = `${p.display_name} · Tandem Roads`;
      $('#app').innerHTML = acctProfileHtml(
        {
          id,
          name: p.display_name,
          home: p.home_city || '',
          line: p.bio || '',
          joined: p.created_at,
        },
        rel,
        a,
      );
      socHeader();
    },
    () => location.hash === at && ($('#app').innerHTML = loadFailed()),
  );
}
const acctNoProfile = () =>
  `<div class="wrap"><div class="empty">${icon('friends')}<h2>This profile isn’t available.</h2><p>Profiles are seen only by friends and by people who share a trip.</p><a class="btn" href="#/feed">Back to the feed</a></div></div>`;
function acctProfileHtml(p, rel, a) {
  const acts = {
    self: `<a class="btn small" href="#/account">${icon('pencil')} Edit profile</a><button class="btn small ghost" data-action="acct-invite">${icon('plus')} Invite a friend</button>`,
    friend: `<button class="btn small ghost" data-action="acct-person-more" data-id="${p.id}">${icon('more')} More</button>`,
    asks_you: `<button class="btn small" data-action="acct-accept" data-id="${p.id}">Accept</button><button class="btn small ghost" data-action="acct-decline" data-id="${p.id}">Not now</button><button class="btn small ghost" data-action="acct-person-more" data-id="${p.id}">${icon('more')} More</button>`,
    you_asked: `<button class="btn small ghost" data-action="acct-cancel-ask" data-id="${p.id}">Cancel your request</button><button class="btn small ghost" data-action="acct-person-more" data-id="${p.id}">${icon('more')} More</button>`,
    trip: `<button class="btn small ghost" data-action="acct-person-more" data-id="${p.id}">${icon('more')} More</button>`,
  }[rel];
  const how = {
    self: 'This is how friends see you.',
    friend: 'Friends',
    asks_you: 'Wants to be friends',
    you_asked: 'You asked to be friends',
    trip: 'You share a trip',
  }[rel];
  return (
    `<div class="wrap soc-page soc-profile acct-profile">${rel === 'self' ? acctLeavingNote(a) : ''}<header class="soc-phead">${acctAvatar(p, 'big')}<div><h1>${esc(p.name)}</h1>${p.home ? `<p class="soc-home">${icon('pin')} ${esc(p.home)}</p>` : ''}${p.line ? `<p class="soc-line">${esc(p.line)}</p>` : ''}<p class="muted acct-how">${esc(how)}${p.joined ? ` · on the road since ${esc(acctMonth(p.joined))}` : ''}</p></div></header>` +
    `<div class="soc-need-acts acct-acts">${acts || ''}</div>` +
    `<section class="soc-set acct-soon"><h2>Trips</h2><p class="soc-set-note">${rel === 'self' ? 'Trips you share with friends will show here.' : 'Trips you share, and trips their travellers let you see, will show here.'}</p></section>` +
    footer() +
    '</div>'
  );
}
function acctPersonMore(id) {
  const p = acctPerson(id),
    name = esc(p?.name || $('.acct-profile h1')?.textContent || 'this person'),
    friend = p?.relation === 'friend';
  showModal(
    `<div class="modalcontent"><h2 id="modal-heading">${name}</h2><div class="soc-people">${friend ? `<button class="soc-personrow" data-action="acct-unfriend" data-id="${id}">${icon('close')}<strong>Remove ${name} as a friend</strong><small>They are not told. You can be friends again with a new invite link.</small></button>` : ''}<button class="soc-personrow" data-action="acct-block" data-id="${id}">${icon('trash')}<strong>Block ${name}</strong><small>Your friendship ends, and nothing they send reaches you. They are not told. Shared trips stay.</small></button><button class="soc-personrow" data-action="acct-report" data-id="${id}">${icon('info')}<strong>Report ${name}</strong><small>Goes to the person who runs Tandem Roads</small></button></div></div>`,
    'Options',
  );
}

// ---------------------------------------------------------------- account
function acctAccount() {
  acctPage('me', 'Account', (a) => {
    const me = a.me || { name: '', home: '', line: '', style: [] },
      by = (k) => a.people.filter((p) => p.relation === k),
      friends = by('friend'),
      now = Date.now(),
      open = a.invites.filter((i) => !i.used_at && Date.parse(i.expires_at) > now),
      used = a.invites.filter((i) => i.used_at).slice(0, 5),
      nameOf = (id) => acctPerson(id)?.name;
    return (
      `<div class="wrap soc-page soc-account acct-account"><div class="backline"><a href="#/me">${icon('left')} Your profile</a></div><header class="soc-top"><div><h1>Account</h1><p class="muted">Your profile, your friends, and your data.</p></div></header>` +
      acctLeavingNote(a) +
      `<section class="soc-set"><h2>Sign in</h2><div class="soc-row"><span><strong>Email</strong><small>Never shown to friends</small></span><em class="acct-email">${esc(bkSession?.user.email || '')}</em></div><div class="soc-row"><span><strong>Sign out</strong><small>On this device. Your saved places and trip stay here.</small></span><button class="btn small ghost" data-action="acct-signout">Sign out</button></div></section>` +
      `<section class="soc-set"><h2>Profile</h2><p class="soc-set-note">Friends see this, and so do people you share a trip with. Nobody else can.</p><div class="soc-fields"><div class="field"><label for="acct-f-name">Name</label><input id="acct-f-name" data-acct-field="name" maxlength="40" value="${esc(me.name)}" autocomplete="name"></div><div class="field"><label for="acct-f-home">Home city</label><input id="acct-f-home" data-acct-field="home" maxlength="80" value="${esc(me.home)}" autocomplete="off"></div><div class="field wide"><label for="acct-f-line">One line about how you travel</label><input id="acct-f-line" data-acct-field="line" maxlength="160" value="${esc(me.line)}" autocomplete="off"></div><div class="field wide"><label for="acct-f-style">Travel style, up to four, separated by commas</label><input id="acct-f-style" data-acct-field="style" maxlength="120" value="${esc(me.style.join(', '))}" autocomplete="off"><small>Only you see this.</small></div></div><div class="soc-row"><span><strong>On the road since</strong><small>The month you joined</small></span><em>${esc(acctMonth(me.joined))}</em></div></section>` +
      `<section class="soc-set"><h2>Friends</h2><p class="soc-set-note">People join with an invite link from a friend. There is no search and no suggested strangers.</p>${
        acctNeeds().length
          ? `<div class="soc-needlist">${acctNeeds().map(acctNeedHtml).join('')}</div>`
          : ''
      }<div class="soc-peoplelist">${friends
        .map(
          (p) =>
            `<div class="soc-row person"><a class="soc-rowwho" href="#/people/${p.id}">${acctAvatar(p)}<strong>${esc(p.name)}</strong>${p.since ? `<small>Friends since ${esc(acctDate(p.since))}</small>` : ''}</a>${icon('arrow')}</div>`,
        )
        .join('')}${by('you_asked')
        .map(
          (p) =>
            `<div class="soc-row person"><span class="soc-rowwho">${acctAvatar(p)}<strong>${esc(p.name)}</strong><small>You asked</small></span><button class="btn small ghost" data-action="acct-cancel-ask" data-id="${p.id}">Cancel</button></div>`,
        )
        .join(
          '',
        )}</div>${friends.length ? '' : '<p class="soc-fine">No friends yet.</p>'}<button class="btn small" data-action="acct-invite">${icon('plus')} Invite a friend</button>` +
      (open.length || used.length
        ? `<h3 class="acct-sub">Your invite links</h3><div class="soc-peoplelist">${open
            .map(
              (i) =>
                `<div class="soc-row"><span><strong>${i.note ? 'For ' + esc(i.note) : 'Invite link'}</strong><small>Made ${esc(acctDate(i.created_at, false))}, works until ${esc(acctDate(i.expires_at, false))}</small></span><button class="btn small ghost" data-action="acct-stop-invite" data-id="${i.id}">Stop it</button></div>`,
            )
            .join('')}${used
            .map(
              (i) =>
                `<div class="soc-row"><span><strong>${i.note ? 'For ' + esc(i.note) : 'Invite link'}</strong><small>Used ${nameOf(i.used_by) ? 'by ' + esc(nameOf(i.used_by)) + ' ' : ''}on ${esc(acctDate(i.used_at, false))}</small></span><em>Used</em></div>`,
            )
            .join('')}</div>`
        : '') +
      (by('blocked').length
        ? `<h3 class="acct-sub">Blocked</h3><div class="soc-peoplelist">${by('blocked')
            .map(
              (p) =>
                `<div class="soc-row person"><span class="soc-rowwho">${acctAvatar(p)}<strong>${esc(p.name)}</strong><small>Blocked</small></span><button class="btn small ghost" data-action="acct-unblock" data-id="${p.id}">Unblock</button></div>`,
            )
            .join('')}</div>`
        : '') +
      '</section>' +
      (a.admin ? acctReportsHtml(a) : '') +
      `<section class="soc-set"><h2>About Tandem Roads</h2><a class="soc-row link" href="#/guide"><span><strong>About & sources</strong><small>How places are ranked, where the information comes from, photo and map credits</small></span>${icon('arrow')}</a></section>` +
      `<section class="soc-set"><h2>Your data</h2><div class="soc-row"><span><strong>Download everything</strong><small>What Tandem Roads holds about you, plus what this device keeps, as one file</small></span><button class="btn small ghost" data-action="acct-download">${icon('download')} Download</button></div>${
        a.leaving
          ? `<div class="soc-row"><span><strong>Delete now</strong><small>Instead of waiting until ${esc(acctDate(a.leaving))}. This cannot be undone.</small></span><button class="btn small ghost" data-action="acct-delete-now">Delete now</button></div>`
          : `<div class="soc-row"><span><strong>Leave Tandem Roads</strong><small>Friends stop seeing you at once. Everything is deleted after 30 days, unless you come back.</small></span><button class="btn small ghost" data-action="acct-leave">Leave</button></div>`
      }<p class="soc-fine">No ads, no tracking, no location trail. Photos you pick are yours.</p></section>` +
      footer() +
      '</div>'
    );
  });
}
function acctReportsHtml(a) {
  const list = a.reports || [];
  return `<section class="soc-set acct-reports"><h2>Reports</h2><p class="soc-set-note">Only admins see this. Reports show who and why, never anyone’s trips.</p>${
    list.length
      ? list
          .map(
            (r) =>
              `<div class="soc-row"><span><strong>${esc(r.reporter_name || 'Someone who left')} reported ${esc(r.about_name || (r.about_kind === 'person' ? 'someone who left' : 'a ' + r.about_kind))}</strong><small>${esc(acctDate(r.created_at))}: ${esc(r.reason)}</small></span><button class="btn small ghost" data-action="acct-close-report" data-id="${BK_UUID.test(r.id) ? r.id : ''}">Close</button></div>`,
          )
          .join('')
      : '<p class="soc-fine">No open reports.</p>'
  }</section>`;
}

// ---------------------------------------------------------------- doing things
// Runs one change, then reloads your people and redraws the page. `done` is the toast.
async function acctDo(job, done) {
  const r = await job;
  if (!r || !r.ok) return (toast(bkProblem(r)), false);
  await acctLoad(true).catch(() => {});
  if (done) toast(done);
  route();
  return true;
}
function acctInviteSheet() {
  showModal(
    `<div class="modalcontent acct-invite"><h2 id="modal-heading">Invite a friend</h2><p class="lead">Make a link and send it to one person. When they join with it, you are friends.</p><div class="field"><label for="acct-note">Who is it for? <small>Only you see this</small></label><input id="acct-note" maxlength="40" placeholder="Sam" autocomplete="off"></div><div class="actions"><button class="btn" data-action="acct-make-invite">Make the link</button><button class="btn ghost" data-action="close-modal">Cancel</button></div><ul class="st-rules"><li>A link works once, for 14 days.</li><li>Anyone holding it can join, so send it only to the person it is for.</li></ul></div>`,
    'Invite a friend',
  );
}
async function acctMakeInvite() {
  const note = $('#acct-note')?.value.trim() || '',
    btn = $('[data-action="acct-make-invite"]');
  if (/[\x00-\x1f\x7f-\x9f‪-‮⁦-⁩﻿]/.test(note))
    return toast('Use plain letters and numbers in the note.');
  if (btn) btn.disabled = true;
  const r = await bkRpc('create_friend_invite', note ? { p_note: note } : {});
  if (btn) btn.disabled = false;
  if (!r.ok || !acctInviteCode(r.data)) return toast(bkProblem(r));
  const link = `${location.origin}${location.pathname}#/join/${r.data}`;
  acctForget();
  showModal(
    `<div class="modalcontent acct-invite"><h2 id="modal-heading">Your invite link</h2><p class="lead">${note ? `For ${esc(note)}. ` : ''}It works once, until ${esc(acctDate(Date.now() + 14 * 864e5, false))}. This is the only time it is shown, so send it now.</p><div class="field"><label for="acct-link">Invite link</label><input id="acct-link" readonly value="${esc(link)}"></div><div class="actions">${navigator.share ? `<button class="btn" data-action="acct-share-invite">${icon('share')} Send it</button>` : ''}<button class="btn ${navigator.share ? 'ghost' : ''}" data-action="acct-copy-invite">${icon('link')} Copy</button></div><p class="soc-fine">If it is lost, stop it under Account, Friends, and make a new one.</p></div>`,
    'Invite a friend',
  );
}
function acctReport(id) {
  const name = esc(acctPerson(id)?.name || $('.acct-profile h1')?.textContent || 'this person');
  showModal(
    `<div class="modalcontent"><h2 id="modal-heading">Report ${name}</h2><p class="lead">Say what happened. The person who runs Tandem Roads reads it; ${name} is not told who sent it.</p><div class="field"><label for="acct-reason">What happened</label><textarea id="acct-reason" maxlength="1000"></textarea></div><div class="actions"><button class="btn" data-action="acct-report-go" data-id="${id}">Send the report</button><button class="btn ghost" data-action="close-modal">Cancel</button></div></div>`,
    'Report',
  );
}
function acctConfirm(title, lead, action, id, label) {
  showModal(
    `<div class="modalcontent"><h2 id="modal-heading">${title}</h2><p class="lead">${lead}</p><div class="actions"><button class="btn" data-action="${action}" data-id="${id || ''}">${label}</button><button class="btn ghost" data-action="close-modal">Cancel</button></div></div>`,
    title,
  );
}
async function acctDownload() {
  const r = await bkRpc('export_my_data');
  if (!r.ok) return toast(bkProblem(r));
  const blob = new Blob(
    [
      JSON.stringify(
        {
          app: 'Tandem Roads',
          exported: new Date().toISOString(),
          email: bkSession?.user.email || '',
          account: r.data,
          thisDevice: { trip: S, social: SOCS },
        },
        null,
        2,
      ),
    ],
    { type: 'application/json' },
  );
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'tandem-roads-my-data.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  toast('Downloaded.');
}
async function acctSaveField(key, value) {
  const id = bkMyId();
  let r;
  if (key === 'style') {
    const style = value
      .split(',')
      .map((x) => x.trim().slice(0, 28))
      .filter(Boolean)
      .slice(0, 4);
    r = await bkChange('account_private', `id=eq.${id}`, { travel_style: style });
  } else {
    const col = { name: 'display_name', home: 'home_city', line: 'bio' }[key];
    if (!col) return;
    const v = value.trim();
    if (key === 'name' && !v) return toast('Your name cannot be empty.');
    r = await bkChange('profiles', `id=eq.${id}`, { [col]: v || null });
  }
  if (!r.ok || !r.data?.length) return toast(r.ok ? 'That did not save.' : bkProblem(r));
  await acctLoad(true).catch(() => {});
  socHeader();
  toast('Saved.', null, 1600);
}

document.addEventListener('submit', (e) => {
  const form = e.target.closest?.('[data-acct-form]');
  if (!form) return;
  e.preventDefault();
  if (form.dataset.acctForm === 'email') acctSendCode(form);
  else if (form.dataset.acctForm === 'code') acctCheckCode(form);
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.matches?.('[data-acct-field]') && bkSignedIn()) acctSaveField(t.dataset.acctField, t.value);
});
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-action^="acct-"]');
  if (!b) return;
  const a = b.dataset.action,
    id = BK_UUID.test(b.dataset.id || '') ? b.dataset.id : '',
    me = bkMyId();
  if (a === 'acct-resend') {
    const f = acctFlow();
    if (!f) return route();
    const r = await bkSendCode(f.email, f.invite);
    acctShowProblem(b.closest('form'), r.ok ? '' : bkProblem(r));
    if (r.ok) toast('A new code is on its way.');
  } else if (a === 'acct-restart') {
    acctFlowKeep(null);
    route();
  } else if (a === 'acct-invite') {
    if (bkSignedIn()) acctInviteSheet();
    else location.hash = '#/signin';
  } else if (a === 'acct-make-invite') acctMakeInvite();
  else if (a === 'acct-share-invite') {
    const url = $('#acct-link')?.value;
    if (url)
      navigator
        .share({ title: 'Tandem Roads', text: 'Join me on Tandem Roads', url })
        .catch(() => {});
  } else if (a === 'acct-copy-invite') {
    const box = $('#acct-link');
    if (!box) return;
    try {
      await navigator.clipboard.writeText(box.value);
      toast('Link copied.');
    } catch {
      box.select();
      toast('Select the link and copy it.');
    }
  } else if (a === 'acct-signout') {
    await bkSignOut();
    toast('Signed out. Your saved places and trip are still here.');
    location.hash = '#/';
    route();
  } else if (a === 'acct-person-more' && id) acctPersonMore(id);
  else if (a === 'acct-accept' && id)
    acctDo(
      bkChange('friendships', `requester_id=eq.${id}&addressee_id=eq.${me}`, {
        status: 'accepted',
      }),
      'You are friends now.',
    );
  else if (a === 'acct-decline' && id)
    acctDo(
      bkRemove('friendships', `requester_id=eq.${id}&addressee_id=eq.${me}`),
      'Request turned down. They are not told.',
    );
  else if (a === 'acct-cancel-ask' && id)
    acctDo(
      bkRemove('friendships', `requester_id=eq.${me}&addressee_id=eq.${id}`),
      'Request cancelled.',
    );
  else if (a === 'acct-unfriend' && id) {
    closeModal();
    acctDo(
      bkRemove(
        'friendships',
        `or=(and(requester_id.eq.${me},addressee_id.eq.${id}),and(requester_id.eq.${id},addressee_id.eq.${me}))`,
      ),
      'Removed. They are not told.',
    );
  } else if (a === 'acct-block' && id) {
    closeModal();
    acctDo(bkAdd('blocks', { blocker_id: me, blocked_id: id }), 'Blocked. They are not told.').then(
      (ok) => ok && location.hash.startsWith('#/people/') && (location.hash = '#/account'),
    );
  } else if (a === 'acct-unblock' && id)
    acctDo(
      bkRemove('blocks', `blocker_id=eq.${me}&blocked_id=eq.${id}`),
      'Unblocked. You are not friends again until one of you sends an invite link.',
    );
  else if (a === 'acct-report' && id) acctReport(id);
  else if (a === 'acct-report-go' && id) {
    const reason = $('#acct-reason')?.value.trim();
    if (!reason) return toast('Say what happened first.');
    closeModal();
    const r = await bkAdd('reports', {
      reporter_id: me,
      about_account: id,
      about_kind: 'person',
      reason,
    });
    toast(r.ok ? 'Sent. Thank you for telling us.' : bkProblem(r));
  } else if (a === 'acct-stop-invite' && id)
    acctDo(bkRpc('cancel_friend_invite', { p_invite: id }), 'That link no longer works.');
  else if (a === 'acct-close-report' && id)
    acctDo(bkRpc('admin_close_report', { p_report: id }), 'Report closed.');
  else if (a === 'acct-download') acctDownload();
  else if (a === 'acct-leave')
    acctConfirm(
      'Leave Tandem Roads?',
      'Friends stop seeing you at once, and your invite links stop working. Everything is deleted after 30 days. Sign in before then to stay.',
      'acct-leave-go',
      '',
      'Leave',
    );
  else if (a === 'acct-leave-go') {
    closeModal();
    acctDo(bkRpc('request_account_deletion'), 'Done. You have 30 days to change your mind.');
  } else if (a === 'acct-stay')
    acctDo(bkRpc('cancel_account_deletion'), 'Welcome back. Friends can see you again.');
  else if (a === 'acct-delete-now')
    acctConfirm(
      'Delete everything now?',
      'Your profile, friendships, invite links, and your part of every trip go now. This cannot be undone.',
      'acct-delete-go',
      '',
      'Delete now',
    );
  else if (a === 'acct-delete-go') {
    closeModal();
    const r = await bkRpc('delete_account_now');
    if (!r.ok) return toast(bkProblem(r));
    bkSignedOut('gone');
    toast(
      'Your account is deleted. Saved places on this device stay until you clear them.',
      null,
      6000,
    );
    location.hash = '#/';
  }
});
// Your avatar and friend requests in the header, as soon as the app opens.
if (bkSignedIn()) setTimeout(() => acctLoad().then(socHeader, () => {}), 0);
