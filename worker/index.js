// Per-person cloud backup for Timecard Helper.
// Static files are served before this runs; only /api/* reaches it (wrangler.jsonc run_worker_first).
// Cloudflare Access signs every request in front of the Worker, and the signed-in email picks the row,
// so each person only ever reads and writes their own backup.

const BACKUP_KEYS = ['pto-planner-v1', 'timecard_v3'];   // the localStorage entries a backup carries
const MAX_BYTES = 256 * 1024;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/backup') return json({ error: 'not found' }, 404);

    const signedIn = await accessEmail(request, env);
    if (!signedIn) return json({ error: 'sign in required' }, 401);
    const email = owner(signedIn, env);
    await ensureTable(env.DB);

    if (request.method === 'GET') {
      const row = await env.DB.prepare('SELECT data, updated FROM backups WHERE email = ?').bind(email).first();
      return json(row ? { updated: row.updated, data: JSON.parse(row.data) } : { updated: 0, data: null });
    }

    if (request.method === 'PUT') {
      const text = await request.text();
      if (text.length > MAX_BYTES) return json({ error: 'backup too large' }, 413);
      let body;
      try { body = JSON.parse(text); } catch (e) { return json({ error: 'bad json' }, 400); }
      const clean = sanitize(body);
      if (!clean) return json({ error: 'bad backup' }, 400);
      // newest copy wins: an older save from another device never replaces a newer one
      await env.DB.prepare(
        `INSERT INTO backups (email, data, updated) VALUES (?1, ?2, ?3)
         ON CONFLICT(email) DO UPDATE SET data = excluded.data, updated = excluded.updated
         WHERE excluded.updated > backups.updated`
      ).bind(email, JSON.stringify(clean.data), clean.updated).run();
      const row = await env.DB.prepare('SELECT updated FROM backups WHERE email = ?').bind(email).first();
      return json({ updated: row.updated });
    }

    return json({ error: 'method not allowed' }, 405);
  },
};

// One person, two sign-ins (work + personal email) share one backup. EMAIL_ALIASES is a Worker secret set in
// the dashboard, so no addresses live in the repo: "personal@gmail.com=work@company.com", one pair per line or comma.
function owner(email, env) {
  for (const pair of String(env.EMAIL_ALIASES || '').split(/[\n,]/)) {
    const [alias, main] = pair.split('=').map(x => (x || '').trim().toLowerCase());
    if (alias && main && alias === email) return main;
  }
  return email;
}

// only the known keys, as strings, with a sane timestamp
function sanitize(body) {
  if (!body || typeof body !== 'object' || !body.data || typeof body.data !== 'object') return null;
  const updated = Number(body.updated);
  if (!Number.isSafeInteger(updated) || updated <= 0 || updated > Date.now() + 864e5) return null;
  const data = {};
  for (const k of BACKUP_KEYS) {
    const v = body.data[k];
    if (v == null) continue;
    if (typeof v !== 'string') return null;
    data[k] = v;
  }
  return { updated, data };
}

let tableReady = false;
async function ensureTable(db) {
  if (tableReady) return;
  await db.prepare('CREATE TABLE IF NOT EXISTS backups (email TEXT PRIMARY KEY, data TEXT NOT NULL, updated INTEGER NOT NULL)').run();
  tableReady = true;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-timecard-backup': '1' },
  });
}

// ── ACCESS TOKEN ──
// With static assets the Worker doesn't get ctx.access, so it checks the Access JWT itself:
// signed by one of the team's keys, issued by the team domain, for this app's audience, not expired.
let certs = null, certsAt = 0;
async function teamKeys(env, refresh) {
  if (!certs || refresh || Date.now() - certsAt > 36e5) {
    const res = await fetch(`${env.ACCESS_ISSUER}/cdn-cgi/access/certs`);
    certs = (await res.json()).keys || [];
    certsAt = Date.now();
  }
  return certs;
}

async function accessEmail(request, env) {
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token) return null;
  try {
    const [h, p, s] = token.split('.');
    if (!h || !p || !s) return null;
    const header = JSON.parse(text64(h)), claims = JSON.parse(text64(p));
    if (header.alg !== 'RS256') return null;
    let jwk = (await teamKeys(env)).find(k => k.kid === header.kid);
    if (!jwk && Date.now() - certsAt > 3e5) jwk = (await teamKeys(env, true)).find(k => k.kid === header.kid);   // keys rotate
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, bytes64(s), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return null;
    if (![].concat(claims.aud).includes(env.ACCESS_AUD)) return null;
    if (claims.iss !== env.ACCESS_ISSUER) return null;
    if (!(claims.exp * 1000 > Date.now())) return null;
    return typeof claims.email === 'string' && claims.email ? claims.email.toLowerCase() : null;
  } catch (e) {
    return null;
  }
}

function bytes64(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
const text64 = s => new TextDecoder().decode(bytes64(s));
