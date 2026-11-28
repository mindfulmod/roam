// A stand-in for the accounts project, for browser tests of the sign-in, invite and friends
// screens. It answers the calls the app makes the way Supabase's sign-in service and database
// API do, from a small model kept in memory. The real rules are tested elsewhere: in
// supabase/tests (npm run test:db) and on a real local Supabase (tests/e2e, Accounts check).
import { randomUUID, randomBytes } from 'node:crypto';

export const FAKE_URL = 'https://backend.test';
export const FAKE_KEY = 'sb_publishable_test_0123456789';
const INVITE_ONLY =
  'Tandem Roads is invite-only for now. Ask a friend who uses it to send you an invite link.';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'apikey, authorization, content-type, prefer, x-client-info',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

export function fakeBackend({ founder = 'am@example.test' } = {}) {
  const users = new Map(), // email -> { id, email }
    profiles = new Map(), // id -> row
    priv = new Map(), // id -> { travel_style, delete_after, age_band }
    admins = new Set(),
    friendships = [],
    invites = [],
    blocks = [],
    reports = [],
    codes = new Map(), // email -> the latest code sent
    access = new Map(), // access token -> user id
    refresh = new Map(), // refresh token -> user id
    calls = [];
  const now = () => new Date().toISOString();
  const byId = (id) => [...users.values()].find((u) => u.id === id);
  const isMember = (id) => profiles.has(id);
  const leaving = (id) => Boolean(priv.get(id)?.delete_after);
  const blocked = (a, b) =>
    blocks.some(
      (x) =>
        (x.blocker_id === a && x.blocked_id === b) || (x.blocker_id === b && x.blocked_id === a),
    );
  const hasBlocked = (blocker, other) =>
    blocks.some((x) => x.blocker_id === blocker && x.blocked_id === other);
  const pair = (a, b) =>
    friendships.find(
      (f) =>
        (f.requester_id === a && f.addressee_id === b) ||
        (f.requester_id === b && f.addressee_id === a),
    );
  const friends = (a, b) => pair(a, b)?.status === 'accepted';
  const sees = (me, id) =>
    me === id || (!leaving(id) && (friends(me, id) || pair(me, id)?.addressee_id === me));
  const inviteFor = (code) => invites.find((i) => i.code === code);
  const inviteWorks = (i) =>
    i && !i.used_at && Date.parse(i.expires_at) > Date.now() && !leaving(i.inviter_id);

  function makeMember(id, name, band) {
    profiles.set(id, {
      id,
      display_name: name,
      home_city: null,
      bio: null,
      created_at: now(),
    });
    priv.set(id, { travel_style: [], delete_after: null, age_band: band });
  }
  function session(id) {
    const a = 'at-' + randomBytes(9).toString('hex'),
      r = 'rt-' + randomBytes(9).toString('hex');
    access.set(a, id);
    refresh.set(r, id);
    return {
      access_token: a,
      refresh_token: r,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id, email: byId(id).email },
    };
  }
  const eq = (q, k) => q.get(k)?.replace(/^eq\./, '');

  const rpc = {
    finish_sign_in(me, a) {
      const code = a.p_invite || null;
      let created = false,
        outcome = null,
        friend = null;
      const i = code ? inviteFor(code) : null;
      // In the same order as the real finish_sign_in(). A link from someone who blocked you, or
      // who is leaving, looks expired, as a stopped link does, so a block never shows.
      if (code) {
        if (!i) outcome = 'unknown';
        else if (i.inviter_id === me) outcome = 'own';
        else if (i.used_at) outcome = i.used_by === me ? 'already_friends' : 'used';
        else if (Date.parse(i.expires_at) <= Date.now()) outcome = 'expired';
        else if (blocked(i.inviter_id, me) || leaving(i.inviter_id)) outcome = 'expired';
        else outcome = 'ok';
      }
      if (!isMember(me)) {
        if (byId(me).email === founder) {
          makeMember(me, (a.p_name || '').trim() || 'Traveller', a.p_age_band || null);
          admins.add(me);
          created = true;
        } else if (outcome === 'ok') {
          if (!(a.p_name || '').trim())
            return [400, { code: '23514', message: 'Add your name first' }];
          if (!['16-17', '18+'].includes(a.p_age_band))
            return [400, { code: '23514', message: 'Tandem Roads is for people 16 and over' }];
          makeMember(me, a.p_name.trim(), a.p_age_band);
          created = true;
        } else return [200, { member: false, created: false, invite: outcome }];
      }
      if (outcome === 'ok') {
        const f = pair(i.inviter_id, me);
        if (f) f.status = 'accepted';
        else
          friendships.push({
            requester_id: i.inviter_id,
            addressee_id: me,
            status: 'accepted',
            created_at: now(),
          });
        i.used_by = me;
        i.used_at = now();
      }
      if (outcome === 'ok' || outcome === 'already_friends') {
        const p = profiles.get(i.inviter_id);
        friend = { id: p.id, name: p.display_name };
      }
      return [
        200,
        {
          member: true,
          created,
          admin: admins.has(me),
          invite: outcome,
          friend,
          leaving: priv.get(me)?.delete_after || null,
        },
      ];
    },
    my_people(me) {
      const rows = [];
      for (const f of friendships) {
        if (![f.requester_id, f.addressee_id].includes(me)) continue;
        const id = f.requester_id === me ? f.addressee_id : f.requester_id,
          p = profiles.get(id);
        if (!p || leaving(id)) continue;
        // A request from someone you blocked waits unseen, so the block never shows to them.
        if (f.addressee_id === me && hasBlocked(me, id)) continue;
        const open = f.status === 'accepted' || f.addressee_id === me;
        rows.push({
          id,
          name: p.display_name,
          home: open ? p.home_city : null,
          line: open ? p.bio : null,
          joined: open ? p.created_at : null,
          relation:
            f.status === 'accepted' ? 'friend' : f.addressee_id === me ? 'asks_you' : 'you_asked',
          since: f.created_at,
        });
      }
      for (const b of blocks)
        if (b.blocker_id === me && profiles.get(b.blocked_id))
          rows.push({
            id: b.blocked_id,
            name: profiles.get(b.blocked_id).display_name,
            home: null,
            line: null,
            joined: null,
            relation: 'blocked',
            since: b.created_at,
          });
      return [200, rows];
    },
    create_friend_invite(me, a) {
      if (!isMember(me)) return [403, { code: '42501', message: 'Members only' }];
      const code = randomBytes(16).toString('base64url').slice(0, 22);
      invites.push({
        id: randomUUID(),
        code,
        inviter_id: me,
        note: a.p_note || null,
        created_at: now(),
        expires_at: new Date(Date.now() + 14 * 864e5).toISOString(),
        used_by: null,
        used_at: null,
      });
      return [200, code];
    },
    cancel_friend_invite(me, a) {
      const i = invites.find((x) => x.id === a.p_invite && x.inviter_id === me && !x.used_at);
      if (i) i.expires_at = now();
      return [204, null];
    },
    request_account_deletion(me) {
      const p = priv.get(me);
      p.delete_after ||= new Date(Date.now() + 30 * 864e5).toISOString();
      for (const i of invites) if (i.inviter_id === me && !i.used_at) i.expires_at = now();
      return [200, p.delete_after];
    },
    cancel_account_deletion(me) {
      priv.get(me).delete_after = null;
      return [204, null];
    },
    delete_account_now(me) {
      if (!leaving(me))
        return [403, { code: '42501', message: 'Ask to delete your account first' }];
      const email = byId(me).email;
      users.delete(email);
      profiles.delete(me);
      priv.delete(me);
      for (let k = friendships.length - 1; k >= 0; k--)
        if ([friendships[k].requester_id, friendships[k].addressee_id].includes(me))
          friendships.splice(k, 1);
      return [204, null];
    },
    export_my_data(me) {
      return [
        200,
        {
          profile: profiles.get(me),
          private: { travel_style: priv.get(me).travel_style },
          people: rpc.my_people(me)[1],
          trips: [],
        },
      ];
    },
    admin_reports(me, a) {
      if (!admins.has(me)) return [403, { code: '42501', message: 'Admins only' }];
      return [
        200,
        reports
          .filter((r) => r.status === (a.p_status || 'open'))
          .map((r) => ({
            ...r,
            reporter_name: profiles.get(r.reporter_id)?.display_name,
            about_name: profiles.get(r.about_account)?.display_name,
          })),
      ];
    },
    admin_close_report(me, a) {
      if (!admins.has(me)) return [403, { code: '42501', message: 'Admins only' }];
      const r = reports.find((x) => x.id === a.p_report);
      if (!r) return [400, { code: 'P0002', message: 'No report with that id' }];
      r.status = 'closed';
      return [204, null];
    },
  };

  function rest(me, method, table, q, body) {
    if (table === 'profiles' && method === 'GET') {
      const id = eq(q, 'id'),
        p = profiles.get(id);
      return [200, p && sees(me, id) ? [p] : []];
    }
    if (table === 'profiles' && method === 'PATCH') {
      const id = eq(q, 'id'),
        p = profiles.get(id);
      if (!p || id !== me) return [200, []];
      for (const [k, v] of Object.entries(body)) {
        if (!['display_name', 'home_city', 'bio'].includes(k))
          return [401, { code: '42501', message: 'permission denied for table profiles' }];
        if (typeof v === 'string' && /[\x00-\x1f‪-‮]/.test(v))
          return [
            400,
            {
              code: '23514',
              message:
                'new row for relation "profiles" violates check constraint "profiles_plain_text"',
            },
          ];
        p[k] = v;
      }
      return [200, [p]];
    }
    if (table === 'account_private' && method === 'GET') {
      const id = eq(q, 'id');
      return [200, id === me && priv.get(id) ? [priv.get(id)] : []];
    }
    if (table === 'account_private' && method === 'PATCH') {
      const id = eq(q, 'id');
      if (id !== me || !priv.get(id)) return [200, []];
      priv.get(id).travel_style = body.travel_style;
      return [200, [priv.get(id)]];
    }
    if (table === 'friend_invites' && method === 'GET')
      return [
        200,
        invites
          .filter((i) => i.inviter_id === me)
          .reverse()
          .map(({ code: _code, ...i }) => i),
      ];
    if (table === 'friendships' && (method === 'PATCH' || method === 'DELETE')) {
      let hit;
      if (q.get('or')) {
        const ids = [...q.get('or').matchAll(/[0-9a-f-]{36}/g)].map((m) => m[0]);
        hit = friendships.filter(
          (f) =>
            ids.includes(f.requester_id) &&
            ids.includes(f.addressee_id) &&
            [f.requester_id, f.addressee_id].includes(me),
        );
      } else {
        const r = eq(q, 'requester_id'),
          a = eq(q, 'addressee_id');
        hit = friendships.filter(
          (f) =>
            f.requester_id === r &&
            f.addressee_id === a &&
            (method === 'DELETE' ? [r, a].includes(me) : a === me && !hasBlocked(a, r)),
        );
      }
      for (const f of hit)
        if (method === 'PATCH') Object.assign(f, body);
        else friendships.splice(friendships.indexOf(f), 1);
      return [200, hit];
    }
    if (table === 'blocks' && method === 'POST') {
      if (body.blocker_id !== me || !(sees(me, body.blocked_id) || pair(me, body.blocked_id)))
        return [403, { code: '42501', message: 'new row violates row-level security policy' }];
      blocks.push({ ...body, created_at: now() });
      const f = pair(body.blocker_id, body.blocked_id);
      if (f) friendships.splice(friendships.indexOf(f), 1);
      return [201, null];
    }
    if (table === 'blocks' && method === 'DELETE') {
      const k = blocks.findIndex(
        (b) =>
          b.blocker_id === me &&
          b.blocker_id === eq(q, 'blocker_id') &&
          b.blocked_id === eq(q, 'blocked_id'),
      );
      const gone = k < 0 ? [] : blocks.splice(k, 1);
      return [200, gone];
    }
    if (table === 'reports' && method === 'POST') {
      if (body.reporter_id !== me || !body.reason)
        return [403, { code: '42501', message: 'new row violates row-level security policy' }];
      reports.push({ id: randomUUID(), status: 'open', created_at: now(), ...body });
      return [201, null];
    }
    return [404, { message: `fake backend: no ${method} ${table}` }];
  }

  async function handle(route) {
    const req = route.request(),
      url = new URL(req.url()),
      method = req.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    let body = null;
    try {
      body = req.postData() ? JSON.parse(req.postData()) : null;
    } catch {}
    calls.push({ method, path: url.pathname + url.search, body });
    const send = (status, data) =>
      route.fulfill({
        status,
        headers: { ...CORS, 'content-type': 'application/json' },
        body: data === null || status === 204 ? '' : JSON.stringify(data),
      });
    if (req.headers().apikey !== FAKE_KEY) return send(401, { message: 'No API key found' });
    const p = url.pathname;
    if (p === '/auth/v1/otp') {
      const email = String(body?.email || '').toLowerCase();
      if (!users.has(email)) {
        const i = inviteFor(body?.data?.invite);
        if (email !== founder && !inviteWorks(i))
          return send(403, { code: 403, error_code: 'unexpected_failure', msg: INVITE_ONLY });
        users.set(email, { id: randomUUID(), email });
      }
      codes.set(email, String(100000 + Math.floor(Math.random() * 900000)));
      return send(200, {});
    }
    if (p === '/auth/v1/verify') {
      const email = String(body?.email || '').toLowerCase();
      if (!codes.get(email) || codes.get(email) !== body?.token)
        return send(403, {
          code: 403,
          error_code: 'otp_expired',
          msg: 'Token has expired or is invalid',
        });
      codes.delete(email);
      return send(200, session(users.get(email).id));
    }
    if (p === '/auth/v1/token') {
      const id = refresh.get(body?.refresh_token);
      if (!id || !byId(id))
        return send(400, {
          code: 400,
          error_code: 'refresh_token_not_found',
          msg: 'Invalid Refresh Token: Refresh Token Not Found',
        });
      refresh.delete(body.refresh_token);
      return send(200, session(id));
    }
    const token = (req.headers().authorization || '').replace(/^Bearer /, ''),
      me = access.get(token);
    if (p === '/auth/v1/logout') {
      access.delete(token);
      return send(204, null);
    }
    if (!me || !byId(me)) return send(401, { code: 'PGRST301', message: 'JWT expired' });
    const m = p.match(/^\/rest\/v1\/rpc\/(\w+)$/);
    if (m) {
      if (!rpc[m[1]]) return send(404, { message: 'no such function' });
      return send(...rpc[m[1]](me, body || {}));
    }
    const t = p.match(/^\/rest\/v1\/(\w+)$/);
    if (t) return send(...rest(me, method, t[1], url.searchParams, body));
    return send(404, { message: 'not found' });
  }

  return {
    url: FAKE_URL,
    key: FAKE_KEY,
    founder,
    handle,
    calls,
    codes,
    profiles,
    friendships,
    invites,
    blocks,
    reports,
    priv,
    users,
    admins,
    access,
    refresh,
    // A member made directly, for tests that start with people already in place.
    member(name, email = name.toLowerCase() + '@example.test') {
      const id = randomUUID();
      users.set(email, { id, email });
      makeMember(id, name, '18+');
      return id;
    },
    // An invite link made by a member. Returns its code.
    invite(from, note = null) {
      return rpc.create_friend_invite(from, { p_note: note })[1];
    },
    befriend(a, b) {
      friendships.push({ requester_id: a, addressee_id: b, status: 'accepted', created_at: now() });
    },
    ask(from, to) {
      friendships.push({
        requester_id: from,
        addressee_id: to,
        status: 'pending',
        created_at: now(),
      });
    },
    // A session for a member, in the shape the app keeps, to start a test signed in.
    sessionFor(id) {
      const s = session(id);
      return { ...s, user: { id, email: byId(id).email } };
    },
  };
}

// Points a browser context's app at the stand-in: the data file gets its address and key, and
// its requests are answered from memory. Call before the page opens.
export async function useBackend(context, fake) {
  await context.route(/\/data\.[0-9a-f]+\.js$/, async (r) => {
    const res = await r.fetch();
    const text = await res.text();
    if (!text.includes('"backend":{}')) throw new Error('data file has no empty backend to fill');
    await r.fulfill({
      response: res,
      body: text.replace(
        '"backend":{}',
        '"backend":' + JSON.stringify({ url: fake.url, key: fake.key }),
      ),
    });
  });
  await context.route(
    (u) => u.origin === fake.url,
    (r) => fake.handle(r),
  );
}
