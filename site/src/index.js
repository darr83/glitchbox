// GlitchBox on Cloudflare: Workers (API) + D1 (database) + R2 (files) + Durable Objects (live chat).
export { ChatHub } from './chat.js';

const SESSION_DAYS = 365;
const COOKIE = 'ns_session';
const SINGLE_PUT_MAX = 95 * 1024 * 1024; // keep under the 100 MB request limit on the free plan

const CHANNELS = [
  { id: 'general', name: 'General', desc: 'Say hi and chat about anything games.' },
  { id: 'ideas', name: 'Ideas', desc: 'Pitch game ideas and get feedback.' },
  { id: 'upcoming', name: 'Upcoming', desc: 'Show off what you are working on next.' },
  { id: 'ai-devs', name: 'AI Devs', desc: 'AI-made games, tools and experiments.' },
  { id: 'feedback', name: 'Playtesting', desc: 'Ask people to play and review your build.' },
];
// Game status: released, upcoming (coming soon), or an Alpha/Beta test. Testing games live in the
// Testing tab, not the main store, and only they have a public tester chat on their store page.
const STATUSES = ['released', 'upcoming', 'alpha', 'beta'];
const TESTING = ['alpha', 'beta'];
const isTesting = (g) => TESTING.includes(g.status);
const GENRES = ['Action', 'Adventure', 'Arcade', 'Casual', 'Horror', 'Platformer', 'Puzzle', 'Racing', 'RPG', 'Shooter', 'Simulation', 'Sports', 'Strategy', 'Survival', 'Visual Novel', 'Other'];
// For now GlitchBox does browser games and Windows games only.
const PLATFORMS = ['windows'];
const DOWNLOAD_EXT = ['.zip', '.exe', '.msi']; // what the Windows app can install
const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
const CONTROLS = ['keyboard', 'mouse', 'gamepad', 'touch'];
const RATINGS = { everyone: 'Everyone', teen: 'Teen (13+)', mature: 'Mature (17+)' };
const MAX_SHOTS = 10;
const parseJson = (s, d) => { try { return JSON.parse(s) ?? d; } catch { return d; } };

// Turns a YouTube or Vimeo link into an embeddable player URL.
function trailerEmbed(url) {
  if (!url) return null;
  let m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/.exec(url);
  if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`;
  m = /vimeo\.com\/(?:video\/)?(\d+)/.exec(url);
  if (m) return `https://player.vimeo.com/video/${m[1]}`;
  return null;
}

// What a store page needs before it can go live. Required items block publishing.
function storeChecklist(g, files) {
  const shots = parseJson(g.screenshots, []);
  const req = parseJson(g.sysreq, {});
  const tags = (g.tags || '').split(',').filter(Boolean);
  const hasBuild = !!g.web_entry || files.length > 0;
  const hasDownloads = files.length > 0;
  const upcoming = g.status === 'upcoming';
  const items = [
    ['title', 'Title', !!g.title, true],
    ['tagline', 'Short description (at least 10 characters)', (g.tagline || '').length >= 10, true],
    ['description', 'Full description (at least 150 characters)', (g.description || '').length >= 150, true],
    ['tags', 'At least 2 tags', tags.length >= 2, true],
    ['cover', 'Cover image', !!g.cover, true],
    ['screenshots', 'At least 3 screenshots', shots.length >= 3, true],
    ['controls', 'Supported controls', !!g.controls, true],
    ['languages', 'Languages', !!g.languages, true],
    ['rating', 'Age rating', !!RATINGS[g.content_rating], true],
    upcoming ? ['release', 'Planned release date', !!g.release_date, true] : ['build', 'A playable build (browser or download)', hasBuild, true],
  ];
  if (hasDownloads) items.push(['sysreq', 'Minimum system requirements (OS and memory)', !!(req.os && req.ram), true]);
  items.push(['banner', 'Wide banner image (recommended)', !!g.banner, false]);
  items.push(['trailer', 'Trailer video (recommended)', !!g.trailer_url, false]);
  return items.map(([id, label, done, required]) => ({ id, label, done, required }));
}
const readyToPublish = (list) => list.every((i) => i.done || !i.required);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.data': 'application/octet-stream', '.pck': 'application/octet-stream',
};

// ---------- helpers ----------
const now = () => Date.now();
const tidy = (s, max) => String(s ?? '').trim().slice(0, max);
const enc = new TextEncoder();
async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function randomToken(bytes = 32) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function randomCode() {
  // Unbiased 6-digit code.
  const a = new Uint32Array(1);
  do crypto.getRandomValues(a); while (a[0] >= 4294000000);
  return String(a[0] % 1000000).padStart(6, '0');
}
const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
function extOf(name) {
  const n = String(name).toLowerCase();
  if (n.endsWith('.tar.gz')) return '.gz';
  const i = n.lastIndexOf('.');
  return i > n.lastIndexOf('/') && i >= 0 ? n.slice(i) : '';
}
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const fail = (status, msg) => { throw new HttpError(status, msg); };
function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.get('Cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function sessionCookie(token, secure, maxAge = SESSION_DAYS * 86400) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}
async function body(req) {
  try { return await req.json(); } catch { return {}; }
}

// ---------- mail ----------
async function sendLoginCode(env, email, code) {
  const site = env.SITE_NAME || 'GlitchBox';
  if (!env.RESEND_API_KEY) {
    if (env.DEV_MODE === '1') { console.log(`[dev mail] Login code for ${email}: ${code}`); return { dev: true }; }
    throw new Error('No email provider configured (set RESEND_API_KEY)');
  }
  const html = `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:auto;padding:24px;background:#0e0a1e;color:#e8ecf3;border-radius:12px">
    <h2 style="margin:0 0 12px">${site}</h2><p>Your login code is</p>
    <p style="font-size:34px;letter-spacing:8px;font-weight:700;margin:8px 0 16px;color:#22e6ff">${code}</p>
    <p style="color:#9aa4b5;font-size:13px">It expires in 10 minutes. If you did not ask for this, you can ignore this email.</p></div>`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.MAIL_FROM, to: email, subject: `${code} is your ${site} login code`, html,
      text: `Your ${site} login code is ${code}\n\nIt expires in 10 minutes. If you did not ask for this, you can ignore this email.`,
    }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
  return { dev: false };
}

// ---------- router ----------
const routes = [];
const route = (method, pattern, handler) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler });
};

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const c = { req, env, ctx, url, params: {}, setCookie: null };
    try {
      if (url.pathname.startsWith('/play/')) return await servePlay(c);
      if (url.pathname.startsWith('/media/')) return await serveMedia(c);
      if (url.pathname.startsWith('/desktop/')) return await serveDesktop(c);
      await loadSession(c);
      if (url.pathname.startsWith('/api/')) {
        if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.get('X-NS') !== '1') fail(403, 'Bad request origin');
        for (const r of routes) {
          if (r.method !== req.method) continue;
          const m = url.pathname.match(r.re);
          if (!m) continue;
          r.keys.forEach((k, i) => (c.params[k] = decodeURIComponent(m[i + 1])));
          const res = await r.handler(c);
          if (c.setCookie) res.headers.append('Set-Cookie', c.setCookie);
          return res;
        }
        fail(404, 'Not found');
      }
      return env.ASSETS.fetch(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e.stack || e);
      return json({ error: 'Something went wrong' }, 500);
    }
  },

  // Daily cleanup (add a cron trigger in wrangler.jsonc to enable).
  async scheduled(event, env) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM login_codes WHERE expires_at < ?').bind(now()),
      env.DB.prepare('DELETE FROM code_requests WHERE at < ?').bind(now() - 86400000),
      env.DB.prepare('DELETE FROM sessions WHERE last_seen < ?').bind(now() - SESSION_DAYS * 86400000),
    ]);
  },
};

// ---------- sessions ----------
async function loadSession(c) {
  const token = parseCookies(c.req)[COOKIE];
  if (!token) return;
  const hash = await sha256(token);
  const row = await c.env.DB.prepare('SELECT s.token_hash, s.last_seen, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?').bind(hash).first();
  if (!row) { c.setCookie = sessionCookie('', c.url.protocol === 'https:', 0); return; }
  // Rolling session: refresh at most once a day so active users never get logged out.
  if (now() - row.last_seen > 86400000) {
    c.ctx.waitUntil(c.env.DB.prepare('UPDATE sessions SET last_seen = ? WHERE token_hash = ?').bind(now(), hash).run());
    c.setCookie = sessionCookie(token, c.url.protocol === 'https:');
  }
  c.user = { id: row.id, email: row.email, username: row.username, bio: row.bio, created_at: row.created_at };
  c.sessionHash = hash;
}
const requireUser = (c) => c.user || fail(401, 'Please log in first');
const requireProfile = (c) => { requireUser(c); if (!c.user.username) fail(400, 'Pick a username first'); return c.user; };
const publicMe = (u) => u && { id: u.id, email: u.email, username: u.username, bio: u.bio };

// ---------- auth ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
route('POST', '/api/auth/request', async (c) => {
  const { DB } = c.env;
  const email = tidy((await body(c.req)).email, 254).toLowerCase();
  if (!EMAIL_RE.test(email)) fail(400, 'That email does not look right');
  const ip = c.req.headers.get('CF-Connecting-IP') || 'local';
  const since = now() - 15 * 60000;
  const [byEmail, byIp] = await Promise.all([
    DB.prepare('SELECT COUNT(*) n FROM code_requests WHERE email = ? AND at > ?').bind(email, since).first('n'),
    DB.prepare('SELECT COUNT(*) n FROM code_requests WHERE ip = ? AND at > ?').bind(ip, since).first('n'),
  ]);
  if (byEmail >= 5 || byIp >= 20) fail(429, 'Too many codes requested. Try again in a few minutes.');
  const code = randomCode();
  await DB.batch([
    DB.prepare('INSERT INTO code_requests (email, ip, at) VALUES (?, ?, ?)').bind(email, ip, now()),
    DB.prepare(`INSERT INTO login_codes (email, code_hash, expires_at, attempts) VALUES (?, ?, ?, 0)
      ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0`)
      .bind(email, await sha256(email + ':' + code), now() + 10 * 60000),
  ]);
  try {
    const r = await sendLoginCode(c.env, email, code);
    return json({ ok: true, devCode: r.dev ? code : undefined });
  } catch (e) {
    console.error('Email send failed:', e.message);
    fail(500, 'Could not send the email. Please try again.');
  }
});

route('POST', '/api/auth/verify', async (c) => {
  const { DB } = c.env;
  const b = await body(c.req);
  const email = tidy(b.email, 254).toLowerCase();
  const code = tidy(b.code, 12).replace(/\D/g, '');
  const row = await DB.prepare('SELECT * FROM login_codes WHERE email = ?').bind(email).first();
  if (!row || row.expires_at < now()) fail(400, 'That code has expired. Request a new one.');
  if (row.attempts >= 5) fail(429, 'Too many tries. Request a new code.');
  const a = enc.encode(row.code_hash), given = enc.encode(await sha256(email + ':' + code));
  if (a.length !== given.length || !crypto.subtle.timingSafeEqual(a, given)) {
    await DB.prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE email = ?').bind(email).run();
    fail(400, 'Wrong code. Check your email and try again.');
  }
  await DB.prepare('DELETE FROM login_codes WHERE email = ?').bind(email).run();
  let user = await DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  if (!user) user = await DB.prepare('INSERT INTO users (email, created_at) VALUES (?, ?) RETURNING *').bind(email, now()).first();
  const token = randomToken();
  await DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, last_seen, user_agent) VALUES (?, ?, ?, ?, ?)')
    .bind(await sha256(token), user.id, now(), now(), tidy(c.req.headers.get('User-Agent'), 200)).run();
  c.setCookie = sessionCookie(token, c.url.protocol === 'https:');
  return json({ ok: true, user: publicMe(user) });
});

route('POST', '/api/auth/logout', async (c) => {
  if (c.sessionHash) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(c.sessionHash).run();
  c.setCookie = sessionCookie('', c.url.protocol === 'https:', 0);
  return json({ ok: true });
});

route('GET', '/api/me', async (c) => json({ user: publicMe(c.user) || null }));
route('PATCH', '/api/me', async (c) => {
  requireUser(c);
  const b = await body(c.req);
  const username = tidy(b.username ?? c.user.username, 24);
  const bio = tidy(b.bio ?? c.user.bio, 300);
  if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) fail(400, 'Usernames are 3 to 24 letters, numbers or underscores');
  const taken = await c.env.DB.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id != ?').bind(username, c.user.id).first();
  if (taken) fail(400, 'That username is taken');
  const u = await c.env.DB.prepare('UPDATE users SET username = ?, bio = ? WHERE id = ? RETURNING *').bind(username, bio, c.user.id).first();
  return json({ user: publicMe(u) });
});

route('GET', '/api/meta', async (c) => json({
  channels: CHANNELS, genres: GENRES, platforms: PLATFORMS, downloadExt: DOWNLOAD_EXT, controls: CONTROLS, ratings: RATINGS, maxShots: MAX_SHOTS,
  maxUploadMb: Number(c.env.MAX_FILE_MB || 5000), singlePutMax: SINGLE_PUT_MAX,
}));

// ---------- games ----------
async function gamesOut(c, rows) {
  if (!rows.length) return [];
  const { DB } = c.env;
  const ids = rows.map((g) => g.id);
  const marks = ids.map(() => '?').join(',');
  const devIds = [...new Set(rows.map((g) => g.developer_id))];
  const [files, devs, counts, mine] = await Promise.all([
    DB.prepare(`SELECT id, game_id, platform, filename, size, version, notes, launch_path AS launchPath, created_at AS createdAt FROM game_files WHERE game_id IN (${marks}) ORDER BY platform, id`).bind(...ids).all(),
    DB.prepare(`SELECT id, username FROM users WHERE id IN (${devIds.map(() => '?').join(',')})`).bind(...devIds).all(),
    DB.prepare(`SELECT game_id, COUNT(*) n FROM library WHERE game_id IN (${marks}) GROUP BY game_id`).bind(...ids).all(),
    c.user ? DB.prepare(`SELECT game_id FROM library WHERE user_id = ? AND game_id IN (${marks})`).bind(c.user.id, ...ids).all() : { results: [] },
  ]);
  const devName = Object.fromEntries(devs.results.map((d) => [d.id, d.username]));
  const libCount = Object.fromEntries(counts.results.map((r) => [r.game_id, r.n]));
  const inLib = new Set(mine.results.map((r) => r.game_id));
  return rows.map((g) => {
    const gf = files.results.filter((f) => f.game_id === g.id).map(({ game_id, ...f }) => f);
    const isOwner = c.user && c.user.id === g.developer_id;
    return {
      published: !!g.published, publishedAt: g.published_at,
      banner: g.banner ? `/media/${g.banner}` : null,
      screenshots: parseJson(g.screenshots, []).map((k) => ({ key: k, url: `/media/${k}` })),
      trailerUrl: g.trailer_url, trailerEmbed: trailerEmbed(g.trailer_url),
      sysreq: parseJson(g.sysreq, {}),
      controls: g.controls ? g.controls.split(',') : [], languages: g.languages,
      contentRating: g.content_rating, contentRatingLabel: RATINGS[g.content_rating] || null, contentWarnings: g.content_warnings,
      releaseDate: g.release_date, website: g.website, discord: g.discord,
      checklist: isOwner ? storeChecklist(g, gf) : undefined,
      id: g.id, slug: g.slug, title: g.title, tagline: g.tagline, description: g.description, genre: g.genre,
      tags: g.tags ? g.tags.split(',').filter(Boolean) : [], isAi: !!g.is_ai, status: g.status,
      cover: g.cover ? `/media/${g.cover}` : null,
      playUrl: g.web_entry ? `/play/${g.id}/${g.web_entry}` : null,
      webWidth: g.web_width, webHeight: g.web_height,
      platforms: [...new Set([...(g.web_entry ? ['web'] : []), ...gf.map((f) => f.platform)])],
      files: gf, developer: devName[g.developer_id] || 'unknown', developerId: g.developer_id,
      downloads: g.downloads, plays: g.plays, inLibrary: inLib.has(g.id), libraryCount: libCount[g.id] || 0,
      createdAt: g.created_at, updatedAt: g.updated_at,
    };
  });
}
const gameOut = async (c, g) => (await gamesOut(c, [g]))[0];

route('GET', '/api/games', async (c) => {
  const q = c.url.searchParams;
  const where = []; const args = [];
  const text = tidy(q.get('q'), 80);
  if (text) { where.push('(g.title LIKE ? OR g.tagline LIKE ? OR g.tags LIKE ? OR u.username LIKE ?)'); args.push(...Array(4).fill(`%${text}%`)); }
  if (GENRES.includes(q.get('genre'))) { where.push('g.genre = ?'); args.push(q.get('genre')); }
  if (q.get('ai') === '1') where.push('g.is_ai = 1');
  const st = q.get('status');
  if (st === 'testing') where.push("g.status IN ('alpha', 'beta')");
  else if (STATUSES.includes(st)) { where.push('g.status = ?'); args.push(st); }
  else where.push("g.status NOT IN ('alpha', 'beta')"); // the main store leaves out test builds
  if (q.get('web') === '1') where.push('g.web_entry IS NOT NULL');
  where.push('g.published = 1');
  const order = { new: 'g.created_at DESC', popular: '(g.downloads + g.plays) DESC, g.created_at DESC', updated: 'g.updated_at DESC', az: 'g.title COLLATE NOCASE' }[q.get('sort')] || 'g.created_at DESC';
  const { results } = await c.env.DB.prepare(`SELECT g.* FROM games g JOIN users u ON u.id = g.developer_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${order} LIMIT 200`).bind(...args).all();
  return json({ games: await gamesOut(c, results) });
});

route('GET', '/api/games/:slug', async (c) => {
  const s = c.params.slug;
  const g = await c.env.DB.prepare('SELECT * FROM games WHERE slug = ? OR id = ?').bind(s, Number(s) || -1).first();
  if (!g || (!g.published && g.developer_id !== c.user?.id)) fail(404, 'Game not found');
  const game = await gameOut(c, g);
  game.updates = (await c.env.DB.prepare('SELECT version, notes, created_at AS createdAt FROM game_updates WHERE game_id = ? ORDER BY created_at DESC LIMIT 20').bind(g.id).all()).results;
  return json({ game });
});

async function slugify(DB, title) {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'game';
  let slug = base; let i = 2;
  while (await DB.prepare('SELECT 1 FROM games WHERE slug = ?').bind(slug).first()) slug = `${base}-${i++}`;
  return slug;
}
function readGameFields(b, existing = {}) {
  // bodyKey is the JSON field name, col the database column (defaults to the same name).
  const pick = (k, max, d, col = k) => b[k] !== undefined ? tidy(b[k], max) : (existing[col] ?? d);
  const tags = b.tags !== undefined
    ? tidy(b.tags, 200).split(',').map((t) => t.trim().toLowerCase().replace(/[^a-z0-9 \-]/g, '')).filter(Boolean).slice(0, 8).join(',')
    : (existing.tags || '');
  const w = Number(b.webWidth), h = Number(b.webHeight);
  return {
    title: pick('title', 80, ''), tagline: pick('tagline', 140, ''), description: pick('description', 8000, ''),
    genre: GENRES.includes(b.genre) ? b.genre : (existing.genre || 'Other'), tags,
    is_ai: b.isAi !== undefined ? (b.isAi ? 1 : 0) : (existing.is_ai || 0),
    status: STATUSES.includes(b.status) ? b.status : (existing.status || 'released'),
    web_width: w >= 200 && w <= 3840 ? Math.round(w) : (existing.web_width || 960),
    web_height: h >= 200 && h <= 2160 ? Math.round(h) : (existing.web_height || 600),
    trailer_url: pick('trailerUrl', 300, '', 'trailer_url'),
    sysreq: b.sysreq !== undefined
      ? JSON.stringify(Object.fromEntries(['os', 'cpu', 'ram', 'gpu', 'storage', 'notes'].map((k) => [k, tidy(b.sysreq?.[k], k === 'notes' ? 400 : 120)]).filter(([, v]) => v)))
      : (existing.sysreq || '{}'),
    controls: b.controls !== undefined ? [].concat(b.controls).filter((x) => CONTROLS.includes(x)).join(',') : (existing.controls || ''),
    languages: pick('languages', 200, ''),
    content_rating: b.contentRating !== undefined ? (RATINGS[b.contentRating] ? b.contentRating : '') : (existing.content_rating || ''),
    content_warnings: pick('contentWarnings', 300, '', 'content_warnings'),
    release_date: pick('releaseDate', 40, '', 'release_date'),
    website: cleanUrl(b.website, existing.website),
    discord: cleanUrl(b.discord, existing.discord),
  };
}
function cleanUrl(v, d = '') {
  if (v === undefined) return d || '';
  const u = tidy(v, 300);
  if (!u) return '';
  if (!/^https?:\/\/[^\s]+$/i.test(u)) fail(400, 'Links must start with http:// or https://');
  return u;
}
function checkTrailer(f) {
  if (f.trailer_url && !trailerEmbed(f.trailer_url)) fail(400, 'The trailer must be a YouTube or Vimeo link');
}
const GAME_COLS = ['title', 'tagline', 'description', 'genre', 'tags', 'is_ai', 'status', 'web_width', 'web_height', 'trailer_url', 'sysreq', 'controls', 'languages', 'content_rating', 'content_warnings', 'release_date', 'website', 'discord'];
async function gameFiles(env, id) {
  return (await env.DB.prepare('SELECT platform FROM game_files WHERE game_id = ?').bind(id).all()).results;
}
async function ownGame(c, id) {
  requireProfile(c);
  const g = await c.env.DB.prepare('SELECT * FROM games WHERE id = ?').bind(Number(id)).first();
  if (!g) fail(404, 'Game not found');
  if (g.developer_id !== c.user.id) fail(403, 'That is not your game');
  return g;
}

route('POST', '/api/games', async (c) => {
  requireProfile(c);
  const f = readGameFields(await body(c.req));
  if (!f.title) fail(400, 'Your game needs a title');
  checkTrailer(f);
  // New games start as drafts. They go live with POST /api/games/:id/publish once the store page is complete.
  const g = await c.env.DB.prepare(`INSERT INTO games (slug, developer_id, ${GAME_COLS.join(', ')}, created_at, updated_at)
    VALUES (?, ?, ${GAME_COLS.map(() => '?').join(', ')}, ?, ?) RETURNING *`)
    .bind(await slugify(c.env.DB, f.title), c.user.id, ...GAME_COLS.map((k) => f[k]), now(), now()).first();
  return json({ game: await gameOut(c, g) });
});

route('PUT', '/api/games/:id', async (c) => {
  const g = await ownGame(c, c.params.id);
  const b = await body(c.req);
  const f = readGameFields(b, g);
  if (!f.title) fail(400, 'Your game needs a title');
  checkTrailer(f);
  let updated = await c.env.DB.prepare(`UPDATE games SET ${GAME_COLS.map((k) => k + '=?').join(', ')}, updated_at=? WHERE id=? RETURNING *`)
    .bind(...GAME_COLS.map((k) => f[k]), now(), g.id).first();
  if (g.status !== 'released' && f.status === 'released' && g.published) {
    updated = await c.env.DB.prepare('UPDATE games SET released_at = ? WHERE id = ? RETURNING *').bind(now(), g.id).first();
  }
  if (b.removeWeb && g.web_prefix) {
    updated = await c.env.DB.prepare('UPDATE games SET web_prefix = NULL, web_entry = NULL WHERE id = ? RETURNING *').bind(g.id).first();
    c.ctx.waitUntil(deletePrefix(c.env, g.web_prefix));
  }
  if (Array.isArray(b.screenshots)) {
    // Reorder or remove screenshots. Only keys the game already has are kept.
    const current = parseJson(g.screenshots, []);
    const keep = b.screenshots.filter((k, i, a) => current.includes(k) && a.indexOf(k) === i);
    const removed = current.filter((k) => !keep.includes(k));
    updated = await c.env.DB.prepare('UPDATE games SET screenshots = ? WHERE id = ? RETURNING *').bind(JSON.stringify(keep), g.id).first();
    if (removed.length) c.ctx.waitUntil(c.env.BUCKET.delete(removed));
  }
  if (b.removeBanner && g.banner) {
    updated = await c.env.DB.prepare('UPDATE games SET banner = NULL WHERE id = ? RETURNING *').bind(g.id).first();
    c.ctx.waitUntil(c.env.BUCKET.delete(g.banner));
  }
  // A live game that no longer meets the store rules goes back to draft.
  if (updated.published && !readyToPublish(storeChecklist(updated, await gameFiles(c.env, g.id)))) {
    updated = await c.env.DB.prepare('UPDATE games SET published = 0 WHERE id = ? RETURNING *').bind(g.id).first();
  }
  return json({ game: await gameOut(c, updated) });
});

route('POST', '/api/games/:id/publish', async (c) => {
  const g = await ownGame(c, c.params.id);
  const list = storeChecklist(g, await gameFiles(c.env, g.id));
  if (!readyToPublish(list)) {
    return json({ error: 'Finish your store page first: ' + list.filter((i) => i.required && !i.done).map((i) => i.label.replace(/ \(.*\)/, '')).join(', '), checklist: list }, 400);
  }
  const updated = await c.env.DB.prepare(`UPDATE games SET published = 1, published_at = COALESCE(published_at, ?), updated_at = ?,
    released_at = CASE WHEN status = 'released' THEN COALESCE(released_at, ?) ELSE released_at END WHERE id = ? RETURNING *`).bind(now(), now(), now(), g.id).first();
  return json({ game: await gameOut(c, updated) });
});

route('POST', '/api/games/:id/unpublish', async (c) => {
  const g = await ownGame(c, c.params.id);
  const updated = await c.env.DB.prepare('UPDATE games SET published = 0 WHERE id = ? RETURNING *').bind(g.id).first();
  return json({ game: await gameOut(c, updated) });
});

route('DELETE', '/api/games/:id', async (c) => {
  const g = await ownGame(c, c.params.id);
  await c.env.DB.prepare('DELETE FROM games WHERE id = ?').bind(g.id).run();
  c.ctx.waitUntil(deletePrefix(c.env, `g/${g.id}/`));
  return json({ ok: true });
});

async function deletePrefix(env, prefix) {
  let cursor;
  do {
    const list = await env.BUCKET.list({ prefix, cursor, limit: 1000 });
    if (list.objects.length) await env.BUCKET.delete(list.objects.map((o) => o.key));
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
}

// ---------- uploads (straight into R2, in chunks for big files) ----------
// Keys always look like g/<gameId>/<kind>/..., so ownership is checked from the key itself.
async function checkKey(c, key) {
  const m = /^g\/(\d+)\/(cover|banner|shots|files|web)\/[^\0]+$/.exec(key || '');
  if (!m || key.includes('..') || key.length > 900) fail(400, 'Bad upload key');
  await ownGame(c, m[1]);
  return { gameId: Number(m[1]), kind: m[2] };
}
const maxBytes = (env) => Number(env.MAX_FILE_MB || 5000) * 1024 * 1024;

route('POST', '/api/uploads/key', async (c) => {
  // Hands out a fresh key for a cover, download or browser build.
  const b = await body(c.req);
  const g = await ownGame(c, b.gameId);
  const safe = tidy(b.filename, 200).replace(/[^a-zA-Z0-9._ -]/g, '_') || 'file';
  if (['cover', 'banner', 'shots'].includes(b.kind)) {
    if (!IMAGE_EXT.includes(extOf(safe))) fail(400, 'Images must be PNG, JPG, WEBP or GIF');
    return json({ key: `g/${g.id}/${b.kind}/${hex(6)}${extOf(safe)}` });
  }
  if (b.kind === 'files') {
    if (!DOWNLOAD_EXT.includes(extOf(safe))) fail(400, `${safe}: unsupported file type ${extOf(safe) || '(none)'}`);
    return json({ key: `g/${g.id}/files/${hex(6)}/${safe}` });
  }
  if (b.kind === 'web') return json({ prefix: `g/${g.id}/web/${hex(6)}/` });
  fail(400, 'Unknown upload kind');
});

route('PUT', '/api/uploads/blob', async (c) => {
  const key = c.url.searchParams.get('key');
  await checkKey(c, key);
  const len = Number(c.req.headers.get('Content-Length') || 0);
  if (len > SINGLE_PUT_MAX) fail(413, 'Too big for one request, use chunked upload');
  const type = c.req.headers.get('Content-Type') || MIME[extOf(key)] || 'application/octet-stream';
  const obj = await c.env.BUCKET.put(key, c.req.body, { httpMetadata: { contentType: type } });
  return json({ ok: true, size: obj.size });
});

route('POST', '/api/uploads/mpu', async (c) => {
  const b = await body(c.req);
  await checkKey(c, b.key);
  if (Number(b.size) > maxBytes(c.env)) fail(413, `Files can be up to ${c.env.MAX_FILE_MB} MB`);
  const mpu = await c.env.BUCKET.createMultipartUpload(b.key, { httpMetadata: { contentType: MIME[extOf(b.key)] || 'application/octet-stream' } });
  return json({ uploadId: mpu.uploadId });
});
route('PUT', '/api/uploads/mpu', async (c) => {
  const q = c.url.searchParams;
  const key = q.get('key');
  await checkKey(c, key);
  const n = Number(q.get('part'));
  if (!(n >= 1 && n <= 10000)) fail(400, 'Bad part number');
  const part = await c.env.BUCKET.resumeMultipartUpload(key, q.get('uploadId')).uploadPart(n, c.req.body);
  return json({ part });
});
route('POST', '/api/uploads/mpu/complete', async (c) => {
  const b = await body(c.req);
  await checkKey(c, b.key);
  const obj = await c.env.BUCKET.resumeMultipartUpload(b.key, b.uploadId).complete(b.parts);
  return json({ ok: true, size: obj.size });
});
route('POST', '/api/uploads/mpu/abort', async (c) => {
  const b = await body(c.req);
  await checkKey(c, b.key);
  await c.env.BUCKET.resumeMultipartUpload(b.key, b.uploadId).abort();
  return json({ ok: true });
});

// Attach uploaded objects to a game.
route('POST', '/api/games/:id/image', async (c) => {
  // slot: cover | banner (replaces) or shots (adds a screenshot).
  const g = await ownGame(c, c.params.id);
  const { key, slot } = await body(c.req);
  const k = await checkKey(c, key);
  if (k.gameId !== g.id || k.kind !== slot || !['cover', 'banner', 'shots'].includes(slot)) fail(400, 'Bad image key');
  const head = await c.env.BUCKET.head(key);
  if (!head) fail(400, 'Upload the image first');
  if (head.size > 15 * 1024 * 1024) { c.ctx.waitUntil(c.env.BUCKET.delete(key)); fail(400, 'Images can be up to 15 MB'); }
  if (slot === 'shots') {
    const shots = parseJson(g.screenshots, []);
    if (shots.length >= MAX_SHOTS) { c.ctx.waitUntil(c.env.BUCKET.delete(key)); fail(400, `Up to ${MAX_SHOTS} screenshots`); }
    shots.push(key);
    await c.env.DB.prepare('UPDATE games SET screenshots = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(shots), now(), g.id).run();
  } else {
    await c.env.DB.prepare(`UPDATE games SET ${slot} = ?, updated_at = ? WHERE id = ?`).bind(key, now(), g.id).run();
    if (g[slot] && g[slot] !== key) c.ctx.waitUntil(c.env.BUCKET.delete(g[slot]));
  }
  return json({ ok: true });
});

route('POST', '/api/games/:id/files', async (c) => {
  const g = await ownGame(c, c.params.id);
  const b = await body(c.req);
  const k = await checkKey(c, b.key);
  if (k.gameId !== g.id || k.kind !== 'files') fail(400, 'Bad file key');
  if (!PLATFORMS.includes(b.platform)) fail(400, 'Unknown platform');
  const head = await c.env.BUCKET.head(b.key);
  if (!head) fail(400, 'Upload the file first');
  const filename = tidy(b.filename, 200) || b.key.split('/').pop();
  const version = tidy(b.version, 40);
  const notes = tidy(b.notes, 4000);
  const launch = tidy(b.launchPath, 260).replace(/\\/g, '/').replace(/^\/+/, '');
  if (launch.split('/').includes('..')) fail(400, 'The launch file must be inside the build');
  const older = (await c.env.DB.prepare('SELECT id, r2_key FROM game_files WHERE game_id = ? AND platform = ?').bind(g.id, b.platform).all()).results;
  const f = await c.env.DB.prepare('INSERT INTO game_files (game_id, platform, filename, r2_key, size, version, notes, launch_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id')
    .bind(g.id, b.platform, filename, b.key, head.size, version, notes, launch, now()).first();
  // A new build replaces the old one for that platform, so players always get the latest version.
  if (b.replace !== false && older.length) {
    await c.env.DB.prepare(`DELETE FROM game_files WHERE id IN (${older.map(() => '?').join(',')})`).bind(...older.map((o) => o.id)).run();
    c.ctx.waitUntil(c.env.BUCKET.delete(older.map((o) => o.r2_key)));
  }
  // Post patch notes once per version, so players see what changed.
  if (g.published && version && !(await c.env.DB.prepare('SELECT 1 FROM game_updates WHERE game_id = ? AND version = ?').bind(g.id, version).first())) {
    await c.env.DB.prepare('INSERT INTO game_updates (game_id, version, notes, created_at) VALUES (?, ?, ?, ?)').bind(g.id, version, notes, now()).run();
  }
  await c.env.DB.prepare('UPDATE games SET updated_at = ? WHERE id = ?').bind(now(), g.id).run();
  return json({ ok: true, id: f.id });
});

route('DELETE', '/api/games/:id/files/:fileId', async (c) => {
  const g = await ownGame(c, c.params.id);
  const f = await c.env.DB.prepare('SELECT * FROM game_files WHERE id = ? AND game_id = ?').bind(Number(c.params.fileId), g.id).first();
  if (!f) fail(404, 'File not found');
  await c.env.DB.prepare('DELETE FROM game_files WHERE id = ?').bind(f.id).run();
  c.ctx.waitUntil(c.env.BUCKET.delete(f.r2_key));
  if (g.published && !readyToPublish(storeChecklist(g, await gameFiles(c.env, g.id)))) {
    await c.env.DB.prepare('UPDATE games SET published = 0 WHERE id = ?').bind(g.id).run();
    return json({ ok: true, unpublished: true });
  }
  return json({ ok: true });
});

route('POST', '/api/games/:id/web', async (c) => {
  // Make an uploaded browser build live. The build files were extracted in the browser and uploaded under `prefix`.
  const g = await ownGame(c, c.params.id);
  const b = await body(c.req);
  const prefix = String(b.prefix || '');
  if (!new RegExp(`^g/${g.id}/web/[0-9a-f]{12}/$`).test(prefix)) fail(400, 'Bad build prefix');
  const entry = String(b.entry || '');
  if (!/^[^\0]+\.html?$/i.test(entry) || entry.includes('..')) fail(400, 'No index.html found in the browser build');
  if (!(await c.env.BUCKET.head(prefix + entry))) fail(400, 'Upload the build first');
  const encoded = entry.split('/').map(encodeURIComponent).join('/');
  await c.env.DB.prepare('UPDATE games SET web_prefix = ?, web_entry = ?, updated_at = ? WHERE id = ?').bind(prefix, encoded, now(), g.id).run();
  if (g.web_prefix && g.web_prefix !== prefix) c.ctx.waitUntil(deletePrefix(c.env, g.web_prefix));
  return json({ ok: true });
});

// ---------- downloads, plays, library ----------
route('GET', '/api/download/:fileId', async (c) => {
  const f = await c.env.DB.prepare('SELECT * FROM game_files WHERE id = ?').bind(Number(c.params.fileId)).first();
  if (!f) fail(404, 'File not found');
  const range = c.req.headers.get('Range');
  const obj = await c.env.BUCKET.get(f.r2_key, range ? { range: c.req.headers } : {});
  if (!obj) fail(404, 'File missing');
  if (!range) {
    const writes = [c.env.DB.prepare('UPDATE games SET downloads = downloads + 1 WHERE id = ?').bind(f.game_id)];
    if (c.user) writes.push(c.env.DB.prepare('INSERT OR IGNORE INTO library (user_id, game_id, added_at) VALUES (?, ?, ?)').bind(c.user.id, f.game_id, now()));
    c.ctx.waitUntil(c.env.DB.batch(writes));
  }
  const headers = new Headers({
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${f.filename.replace(/["\\\r\n]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(f.filename)}`,
    'Accept-Ranges': 'bytes', ETag: obj.httpEtag,
  });
  if (range && obj.range) {
    const start = obj.range.offset ?? 0;
    const len = obj.range.length ?? obj.size - start;
    headers.set('Content-Range', `bytes ${start}-${start + len - 1}/${obj.size}`);
    headers.set('Content-Length', String(len));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set('Content-Length', String(obj.size));
  return new Response(obj.body, { headers });
});

route('POST', '/api/games/:id/played', async (c) => {
  await c.env.DB.prepare('UPDATE games SET plays = plays + 1 WHERE id = ?').bind(Number(c.params.id)).run();
  return json({ ok: true });
});

route('GET', '/api/library', async (c) => {
  requireUser(c);
  const [lib, mine] = await Promise.all([
    c.env.DB.prepare('SELECT g.*, l.playtime_minutes AS _playtime, l.last_played AS _last_played FROM library l JOIN games g ON g.id = l.game_id WHERE l.user_id = ? AND (g.published = 1 OR g.developer_id = l.user_id) ORDER BY COALESCE(l.last_played, l.added_at) DESC').bind(c.user.id).all(),
    c.env.DB.prepare('SELECT * FROM games WHERE developer_id = ? ORDER BY updated_at DESC').bind(c.user.id).all(),
  ]);
  const library = (await gamesOut(c, lib.results)).map((g, i) => ({ ...g, playtimeMinutes: lib.results[i]._playtime, lastPlayed: lib.results[i]._last_played }));
  return json({ library, uploads: await gamesOut(c, mine.results) });
});

// The Windows app reports playtime when a game closes.
route('POST', '/api/library/:id/playtime', async (c) => {
  requireUser(c);
  const minutes = Math.round(Number((await body(c.req)).minutes));
  if (!(minutes >= 0 && minutes <= 24 * 60)) fail(400, 'Bad playtime');
  const id = Number(c.params.id);
  await c.env.DB.prepare('INSERT OR IGNORE INTO library (user_id, game_id, added_at) VALUES (?, ?, ?)').bind(c.user.id, id, now()).run();
  await c.env.DB.prepare('UPDATE library SET playtime_minutes = playtime_minutes + ?, last_played = ? WHERE user_id = ? AND game_id = ?').bind(minutes, now(), c.user.id, id).run();
  return json({ ok: true });
});

// Things the Windows app turns into desktop notifications: game updates, wishlist releases, @mentions.
route('GET', '/api/notifications', async (c) => {
  requireUser(c);
  const since = Math.max(Number(c.url.searchParams.get('since')) || 0, now() - 7 * 86400000);
  const { DB } = c.env;
  const [updates, released, mentions] = await Promise.all([
    DB.prepare(`SELECT u.version, u.notes, u.created_at, g.id, g.slug, g.title FROM game_updates u JOIN library l ON l.game_id = u.game_id AND l.user_id = ?
      JOIN games g ON g.id = u.game_id WHERE u.created_at > ? AND g.published = 1 ORDER BY u.created_at DESC LIMIT 20`).bind(c.user.id, since).all(),
    DB.prepare(`SELECT g.id, g.slug, g.title, g.released_at FROM games g JOIN library l ON l.game_id = g.id AND l.user_id = ?
      WHERE g.released_at > ? AND g.published = 1 ORDER BY g.released_at DESC LIMIT 20`).bind(c.user.id, since).all(),
    c.user.username ? DB.prepare(`SELECT p.id, p.channel, p.body, p.created_at, u.username FROM posts p JOIN users u ON u.id = p.user_id
      WHERE p.created_at > ? AND p.user_id != ? AND p.body LIKE ? ORDER BY p.created_at DESC LIMIT 20`).bind(since, c.user.id, `%@${c.user.username}%`).all() : { results: [] },
  ]);
  const items = [
    ...updates.results.map((r) => ({ type: 'update', at: r.created_at, title: `${r.title} updated to ${r.version}`, body: r.notes.slice(0, 140) || 'A new version is ready.', path: `/game/${r.slug}`, gameId: r.id })),
    ...released.results.map((r) => ({ type: 'released', at: r.released_at, title: `${r.title} is out now!`, body: 'A game on your wishlist just released.', path: `/game/${r.slug}`, gameId: r.id })),
    ...mentions.results.map((r) => ({ type: 'mention', at: r.created_at, title: `${r.username} mentioned you in #${r.channel}`, body: r.body.slice(0, 140), path: `/community/${r.channel}` })),
  ].sort((a, b) => b.at - a.at);
  return json({ now: now(), items });
});

// Windows app downloads and self-updates. CI uploads the installer and latest.yml to R2 under desktop/.
route('GET', '/api/desktop', async (c) => {
  const yml = await c.env.BUCKET.get('desktop/latest.yml');
  if (!yml) return json({ available: false });
  const text = await yml.text();
  const version = /^version:\s*(\S+)/m.exec(text)?.[1] || null;
  return json({ available: true, version, url: '/desktop/GlitchBox-Setup.exe' });
});
route('POST', '/api/library/:id', async (c) => {
  requireUser(c);
  const g = await c.env.DB.prepare('SELECT id FROM games WHERE id = ?').bind(Number(c.params.id)).first();
  if (!g) fail(404, 'Game not found');
  await c.env.DB.prepare('INSERT OR IGNORE INTO library (user_id, game_id, added_at) VALUES (?, ?, ?)').bind(c.user.id, g.id, now()).run();
  return json({ ok: true });
});
route('DELETE', '/api/library/:id', async (c) => {
  requireUser(c);
  await c.env.DB.prepare('DELETE FROM library WHERE user_id = ? AND game_id = ?').bind(c.user.id, Number(c.params.id)).run();
  return json({ ok: true });
});

route('GET', '/api/devs/:username', async (c) => {
  const u = await c.env.DB.prepare('SELECT id, username, bio, created_at FROM users WHERE username = ? COLLATE NOCASE').bind(c.params.username).first();
  if (!u) fail(404, 'Developer not found');
  const { results } = await c.env.DB.prepare('SELECT * FROM games WHERE developer_id = ? AND published = 1 ORDER BY created_at DESC').bind(u.id).all();
  return json({ dev: u, games: await gamesOut(c, results) });
});

// ---------- community chat ----------
async function postsOut(c, rows) {
  if (!rows.length) return [];
  const uids = [...new Set(rows.map((p) => p.user_id))];
  const gids = [...new Set(rows.map((p) => p.game_id).filter(Boolean))];
  const [users, games] = await Promise.all([
    c.env.DB.prepare(`SELECT id, username FROM users WHERE id IN (${uids.map(() => '?').join(',')})`).bind(...uids).all(),
    gids.length ? c.env.DB.prepare(`SELECT id, slug, title, tagline, cover FROM games WHERE id IN (${gids.map(() => '?').join(',')})`).bind(...gids).all() : { results: [] },
  ]);
  const un = Object.fromEntries(users.results.map((u) => [u.id, u.username]));
  const gm = Object.fromEntries(games.results.map((g) => [g.id, { id: g.id, slug: g.slug, title: g.title, tagline: g.tagline, cover: g.cover ? `/media/${g.cover}` : null }]));
  return rows.map((p) => ({ id: p.id, channel: p.channel, body: p.body, createdAt: p.created_at, author: un[p.user_id] || 'unknown', authorId: p.user_id, game: gm[p.game_id] || null }));
}
const hub = (env) => env.CHAT.get(env.CHAT.idFromName('global'));

route('GET', '/api/channels/:ch/posts', async (c) => {
  if (!CHANNELS.find((x) => x.id === c.params.ch)) fail(404, 'No such channel');
  const before = Number(c.url.searchParams.get('before')) || Number.MAX_SAFE_INTEGER;
  const { results } = await c.env.DB.prepare('SELECT * FROM posts WHERE channel = ? AND id < ? ORDER BY id DESC LIMIT 60').bind(c.params.ch, before).all();
  return json({ posts: await postsOut(c, results.reverse()) });
});

route('POST', '/api/channels/:ch/posts', async (c) => {
  requireProfile(c);
  if (!CHANNELS.find((x) => x.id === c.params.ch)) fail(404, 'No such channel');
  const b = await body(c.req);
  const text = tidy(b.body, 2000);
  if (!text) fail(400, 'Write something first');
  const recent = await c.env.DB.prepare('SELECT COUNT(*) n FROM posts WHERE user_id = ? AND created_at > ?').bind(c.user.id, now() - 30000).first('n');
  if (recent >= 8) fail(429, 'Slow down a little');
  let gameId = null;
  if (b.gameId) gameId = (await c.env.DB.prepare('SELECT id FROM games WHERE id = ? AND (published = 1 OR developer_id = ?)').bind(Number(b.gameId), c.user.id).first())?.id ?? null;
  const row = await c.env.DB.prepare('INSERT INTO posts (channel, user_id, body, game_id, created_at) VALUES (?, ?, ?, ?, ?) RETURNING *')
    .bind(c.params.ch, c.user.id, text, gameId, now()).first();
  const [post] = await postsOut(c, [row]);
  c.ctx.waitUntil(hub(c.env).broadcast({ type: 'post', post }));
  return json({ post });
});

route('DELETE', '/api/posts/:id', async (c) => {
  requireProfile(c);
  const p = await c.env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(Number(c.params.id)).first();
  if (!p) fail(404, 'Post not found');
  const gameDev = p.channel.startsWith('game:') && (await c.env.DB.prepare('SELECT developer_id FROM games WHERE id = ?').bind(Number(p.channel.slice(5))).first('developer_id')) === c.user.id;
  if (p.user_id !== c.user.id && !gameDev) fail(404, 'Post not found');
  await c.env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(p.id).run();
  c.ctx.waitUntil(hub(c.env).broadcast({ type: 'delete', id: p.id, channel: p.channel }));
  return json({ ok: true });
});

// Tester chat on Alpha/Beta store pages. Anyone can read it, signed-in players can post.
// It closes when the game moves to full release (the messages are kept but no longer shown).
async function testingGame(c, id) {
  const g = await c.env.DB.prepare('SELECT * FROM games WHERE id = ?').bind(Number(id)).first();
  if (!g || (!g.published && g.developer_id !== c.user?.id)) fail(404, 'Game not found');
  if (!isTesting(g)) fail(410, 'The tester chat closed when this game was released');
  return g;
}
route('GET', '/api/games/:id/chat', async (c) => {
  const g = await testingGame(c, c.params.id);
  const before = Number(c.url.searchParams.get('before')) || Number.MAX_SAFE_INTEGER;
  const { results } = await c.env.DB.prepare('SELECT * FROM posts WHERE channel = ? AND id < ? ORDER BY id DESC LIMIT 80').bind('game:' + g.id, before).all();
  return json({ posts: await postsOut(c, results.reverse()) });
});
route('POST', '/api/games/:id/chat', async (c) => {
  requireProfile(c);
  const g = await testingGame(c, c.params.id);
  const text = tidy((await body(c.req)).body, 2000);
  if (!text) fail(400, 'Write something first');
  const recent = await c.env.DB.prepare('SELECT COUNT(*) n FROM posts WHERE user_id = ? AND created_at > ?').bind(c.user.id, now() - 30000).first('n');
  if (recent >= 8) fail(429, 'Slow down a little');
  const row = await c.env.DB.prepare('INSERT INTO posts (channel, user_id, body, created_at) VALUES (?, ?, ?, ?) RETURNING *')
    .bind('game:' + g.id, c.user.id, text, now()).first();
  const [post] = await postsOut(c, [row]);
  c.ctx.waitUntil(hub(c.env).broadcast({ type: 'post', post }));
  return json({ post });
});

// Live updates over a WebSocket held by the ChatHub Durable Object.
route('GET', '/api/live', async (c) => {
  if (c.req.headers.get('Upgrade') !== 'websocket') fail(426, 'Expected a WebSocket');
  return hub(c.env).fetch(c.req);
});

// ---------- files ----------
async function serveDesktop(c) {
  const name = decodeURIComponent(c.url.pathname.slice('/desktop/'.length));
  if (!/^[\w.\- ]+$/.test(name)) return new Response('Not found', { status: 404 });
  const obj = await c.env.BUCKET.get('desktop/' + name);
  if (!obj) return new Response('Not found', { status: 404 });
  const type = name.endsWith('.yml') ? 'text/yaml' : 'application/octet-stream';
  return new Response(obj.body, { headers: { 'Content-Type': type, 'Content-Length': String(obj.size), 'Cache-Control': name.endsWith('.yml') ? 'no-cache' : 'public, max-age=3600', ETag: obj.httpEtag } });
}

async function serveMedia(c) {
  const key = decodeURIComponent(c.url.pathname.slice('/media/'.length));
  if (!/^g\/\d+\/(cover|banner|shots)\//.test(key)) return new Response('Not found', { status: 404 });
  const obj = await c.env.BUCKET.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || MIME[extOf(key)] || 'image/png', 'Cache-Control': 'public, max-age=604800', ETag: obj.httpEtag, 'X-Content-Type-Options': 'nosniff' } });
}

// Browser games. Each one runs under a sandbox CSP (an isolated origin), so uploaded code can never act as the logged-in user.
async function servePlay(c) {
  const m = /^\/play\/(\d+)\/(.*)$/.exec(c.url.pathname);
  if (!m) return new Response('Not found', { status: 404 });
  const g = await c.env.DB.prepare('SELECT web_prefix FROM games WHERE id = ?').bind(Number(m[1])).first();
  if (!g?.web_prefix) return new Response('Not found', { status: 404 });
  let rel; try { rel = decodeURIComponent(m[2]); } catch { return new Response('Bad path', { status: 400 }); }
  if (rel.split('/').includes('..')) return new Response('Bad path', { status: 400 });
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const obj = await c.env.BUCKET.get(g.web_prefix + rel);
  if (!obj) return new Response('Not found', { status: 404 });
  const headers = new Headers({
    'Access-Control-Allow-Origin': '*',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Content-Security-Policy': 'sandbox allow-scripts allow-pointer-lock allow-popups allow-forms allow-modals allow-downloads',
    'Cache-Control': 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
    ETag: obj.httpEtag,
  });
  // Unity / Godot pre-compressed builds (.br / .gz): tell the browser and keep Cloudflare from compressing again.
  let base = rel; let encoding = null;
  if (rel.endsWith('.br')) { encoding = 'br'; base = rel.slice(0, -3); }
  else if (rel.endsWith('.gz')) { encoding = 'gzip'; base = rel.slice(0, -3); }
  headers.set('Content-Type', MIME[extOf(base)] || 'application/octet-stream');
  if (encoding) {
    headers.set('Content-Encoding', encoding);
    return new Response(obj.body, { headers, encodeBody: 'manual' });
  }
  return new Response(obj.body, { headers });
}
