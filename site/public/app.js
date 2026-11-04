// GlitchBox front end: a tiny single-page app with no build step.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const app = $('#app');
const state = { me: null, meta: null, stream: null, channel: null };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const linkify = (s) => esc(s).replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g, (u) => `<a href="${u}" target="_blank" rel="noopener nofollow">${u}</a>`);
const fmtSize = (b) => b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB';
const fmtNum = (n) => n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n);
function ago(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  if (s < 86400 * 7) return Math.floor(s / 86400) + 'd ago';
  return new Date(t).toLocaleDateString();
}
function hue(str) { let h = 0; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
const avatar = (name, size) => `<span class="avatar" style="background:linear-gradient(135deg,hsl(${hue(name)} 80% 70%),hsl(${(hue(name) + 50) % 360} 80% 62%));${size ? `width:${size}px;height:${size}px` : ''}">${esc((name || '?')[0].toUpperCase())}</span>`;
const coverHtml = (g) => g.cover
  ? `<img src="${esc(g.cover)}" alt="" loading="lazy">`
  : `<div class="gen-cover" style="background:linear-gradient(135deg,hsl(${hue(g.title)} 65% 42%),hsl(${(hue(g.title) + 70) % 360} 70% 30%))">${esc(g.title)}</div>`;

// ---------- icons ----------
const I = {
  windows: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 5.5 10 4.5v7H3zm8-1.2L21 3v8.5H11zM3 12.5h7v7l-7-1zm8 0h10V21l-10-1.4z"/></svg>',
  mac: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.4 12.6c0-2.5 2-3.6 2.1-3.7-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.7.9-.8 0-2-.9-3.2-.8-1.7 0-3.2 1-4 2.4-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8 1.5 0 1.9.8 3.2.8 1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.6-1-2.4-3.8zM14 5.2c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1 .1 2.1-.6 2.8-1.4z"/></svg>',
  linux: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c-2.2 0-3.5 1.8-3.5 4.2 0 1.5.4 2.5-.6 4-1.2 1.8-2.6 3.6-2.6 6 0 .8.2 1.4.5 1.9-.7.3-1.6.6-1.6 1.4 0 1.2 2.2 1 3.4 1.8.9.6 2.3.9 3.2.2.5.2 1.3.2 2.4 0 .9.7 2.3.4 3.2-.2 1.2-.8 3.4-.6 3.4-1.8 0-.8-.9-1.1-1.6-1.4.3-.5.5-1.1.5-1.9 0-2.4-1.4-4.2-2.6-6-1-1.5-.6-2.5-.6-4C15.5 3.8 14.2 2 12 2zm-1.4 4.2c.4 0 .7.5.7 1.1s-.3 1-.7 1-.7-.4-.7-1 .3-1.1.7-1.1zm2.8 0c.4 0 .7.5.7 1.1s-.3 1-.7 1-.7-.4-.7-1 .3-1.1.7-1.1zM12 9.3c.9 0 2 .6 2 1s-1.1 1.1-2 1.1-2-.7-2-1.1 1.1-1 2-1z"/></svg>',
  android: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.6 9.5 19.4 6.4a.4.4 0 0 0-.7-.4L16.9 9.2A10.6 10.6 0 0 0 12 8a10.6 10.6 0 0 0-4.9 1.2L5.3 6a.4.4 0 0 0-.7.4l1.8 3.1A9.6 9.6 0 0 0 1.5 17h21a9.6 9.6 0 0 0-4.9-7.5zM7 14.4a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm10 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/></svg>',
  web: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9S14.5 18.3 12 21c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/></svg>',
  other: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5" stroke-linecap="round"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 16V5m0 0L7.5 9.5M12 5l4.5 4.5M5 20h14"/></svg>',
  full: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
};
const TEST_LABEL = { alpha: 'Alpha test', beta: 'Beta test' };
const PLAT_NAME = { web: 'Browser', windows: 'Windows' };
const platIcons = (ps) => `<span class="plats">${ps.map((p) => `<span title="${PLAT_NAME[p]}">${I[p] || ''}</span>`).join('')}</span>`;
function detectOS() {
  const ua = navigator.userAgent;
  return /Win/i.test(navigator.platform || ua) || desk.api ? 'windows' : 'other';
}

// ---------- api ----------
async function api(path, opts = {}) {
  const init = { method: opts.method || 'GET', headers: { 'X-NS': '1' }, credentials: 'same-origin' };
  if (opts.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
  const r = await fetch(path, init);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || `Request failed (${r.status})`), { status: r.status });
  return data;
}
function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`; el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 4200);
}

// ---------- auth ----------
function renderNav() {
  const me = state.me;
  $('#nav-right').innerHTML = me
    ? `<a class="desk-badge" id="desk-dl" href="/library" data-link hidden></a>
       <a class="btn primary small upload-btn" href="/upload" data-link>${I.upload}<span>Upload game</span></a>
       <a class="user-chip" href="/settings" data-link>${avatar(me.username || me.email)}<span>${esc(me.username || 'Set up profile')}</span></a>`
    : `<button class="btn primary small" id="login-btn">Log in</button>`;
  $('#login-btn')?.addEventListener('click', () => loginModal());
  deskRefresh();
}

function modal(html) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal"><button class="x" aria-label="Close">&times;</button>${html}</div>`;
  const close = () => wrap.remove();
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  $('.x', wrap).onclick = close;
  document.body.append(wrap);
  return { el: $('.modal', wrap), close };
}

function loginModal(reason) {
  return new Promise((resolve) => {
    const m = modal(`
      <h2>Welcome</h2>
      <p>${esc(reason || 'Log in or sign up with your email. We will send you a 6-digit code. No passwords, ever.')}</p>
      <form id="f-email">
        <input class="input" type="email" name="email" placeholder="you@example.com" autocomplete="email" required autofocus>
        <button class="btn primary big" style="width:100%;margin-top:12px">Email me a code</button>
        <div class="err"></div>
      </form>`);
    const fe = $('#f-email', m.el);
    $('input', fe).focus();
    fe.onsubmit = async (e) => {
      e.preventDefault();
      const email = fe.email.value.trim();
      const btn = $('button', fe); btn.disabled = true; btn.textContent = 'Sending...';
      try {
        const r = await api('/api/auth/request', { method: 'POST', body: { email } });
        codeStep(email, r.devCode);
      } catch (err) { $('.err', fe).textContent = err.message; btn.disabled = false; btn.textContent = 'Email me a code'; }
    };
    if (state.me && !state.me.username) usernameStep();
    function codeStep(email, devCode) {
      m.el.innerHTML = `<button class="x" aria-label="Close">&times;</button>
        <h2>Check your email</h2>
        <p>We sent a code to <b style="color:var(--text)">${esc(email)}</b>. It expires in 10 minutes.</p>
        <form id="f-code">
          <input class="input code-input" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" required>
          <button class="btn primary big" style="width:100%;margin-top:12px">Log in</button>
          <div class="err"></div>
          ${devCode ? `<div class="dev-code">Dev mode (no email provider set up yet). Your code is <b>${esc(devCode)}</b></div>` : ''}
          <div class="row" style="margin-top:14px;justify-content:space-between">
            <button type="button" class="btn ghost small" id="back">Use a different email</button>
            <button type="button" class="btn ghost small" id="resend">Resend code</button>
          </div>
        </form>`;
      $('.x', m.el).onclick = m.close;
      const fc = $('#f-code', m.el);
      const inp = fc.code; inp.focus();
      inp.oninput = () => { inp.value = inp.value.replace(/\D/g, '').slice(0, 6); if (inp.value.length === 6) fc.requestSubmit(); };
      $('#back', m.el).onclick = () => { m.close(); loginModal(reason).then(resolve); };
      $('#resend', m.el).onclick = async () => {
        try { const r = await api('/api/auth/request', { method: 'POST', body: { email } }); toast('New code sent', 'ok'); if (r.devCode) $('.dev-code b', m.el).textContent = r.devCode; }
        catch (err) { $('.err', fc).textContent = err.message; }
      };
      fc.onsubmit = async (e) => {
        e.preventDefault();
        const btn = $('button', fc); btn.disabled = true;
        try {
          const r = await api('/api/auth/verify', { method: 'POST', body: { email, code: inp.value } });
          state.me = r.user; renderNav();
          if (!r.user.username) { usernameStep(); return; }
          m.close(); toast(`Welcome back, ${r.user.username}`, 'ok'); resolve(true); route();
        } catch (err) { $('.err', fc).textContent = err.message; btn.disabled = false; inp.select(); }
      };
    }
    function usernameStep() {
      m.el.innerHTML = `<h2>Pick a username</h2>
        <p>This is how other players and developers will see you.</p>
        <form id="f-user">
          <input class="input" name="username" placeholder="e.g. pixel_wizard" maxlength="24" required autofocus>
          <div class="hint" style="margin-top:6px">3 to 24 letters, numbers or underscores.</div>
          <button class="btn primary big" style="width:100%;margin-top:14px">Let's go</button>
          <div class="err"></div>
        </form>`;
      const fu = $('#f-user', m.el); fu.username.focus();
      fu.onsubmit = async (e) => {
        e.preventDefault();
        try {
          const r = await api('/api/me', { method: 'PATCH', body: { username: fu.username.value.trim() } });
          state.me = r.user; renderNav(); m.close(); toast(`You're in, ${r.user.username}!`, 'ok'); resolve(true); route();
        } catch (err) { $('.err', fu).textContent = err.message; }
      };
    }
  });
}
async function needLogin(reason) {
  if (state.me?.username) return true;
  return loginModal(reason);
}

// ---------- router ----------
const routes = [
  [/^\/$/, viewStore, 'store'],
  [/^\/game\/([^/]+)$/, viewGame, 'store'],
  [/^\/testing$/, viewTesting, 'testing'],
  [/^\/library$/, viewLibrary, 'library'],
  [/^\/community(?:\/([^/]+))?$/, viewCommunity, 'community'],
  [/^\/upload$/, () => viewEditor(null), ''],
  [/^\/edit\/(\d+)$/, viewEditor, ''],
  [/^\/dev\/([^/]+)$/, viewDev, ''],
  [/^\/settings$/, viewSettings, ''],
];
function go(path) { history.pushState({}, '', path); route(); }
async function route() {
  const path = location.pathname;
  for (const [re, fn, nav] of FULL_APP() ? routes : webRoutes) {
    const m = path.match(re);
    if (m) {
      $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === nav));
      if (nav !== 'community') state.channel = null;
      window.scrollTo(0, 0);
      try { await fn(...m.slice(1).map((x) => x && decodeURIComponent(x))); }
      catch (e) { app.innerHTML = `<div class="empty"><h3>Something went wrong</h3>${esc(e.message)}</div>`; }
      return;
    }
  }
  if (!FULL_APP()) return viewNeedsApp();
  app.innerHTML = `<div class="empty"><h3>Page not found</h3><a class="btn" href="/" data-link>Back to the store</a></div>`;
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (a && !e.metaKey && !e.ctrlKey && !e.shiftKey && a.origin === location.origin) { e.preventDefault(); go(a.pathname + a.search + a.hash); }
});
window.addEventListener('popstate', route);

// ---------- store ----------
const gameCard = (g) => `
  <a class="card" href="/game/${esc(g.slug)}" data-link>
    <div class="cover">${coverHtml(g)}
      <div class="badges">${g.status === 'upcoming' ? '<span class="badge soon">COMING SOON</span>' : ''}${TEST_LABEL[g.status] ? `<span class="badge test">${TEST_LABEL[g.status].toUpperCase()}</span>` : ''}${g.isAi ? '<span class="badge ai">AI-MADE</span>' : ''}${g.playUrl ? '<span class="badge web">PLAY NOW</span>' : ''}</div>
    </div>
    <div class="card-body">
      <div class="card-title">${esc(g.title)}</div>
      <div class="card-tag">${esc(g.tagline || g.genre)}</div>
      <div class="card-foot"><span>${esc(g.developer)} · ${esc(g.genre)}</span>${platIcons(g.platforms)}</div>
    </div>
  </a>`;

const storeFilters = { q: '', genre: '', sort: 'new', ai: false, web: false, status: '' };
async function viewStore() {
  app.innerHTML = `<div id="hero"></div>
    <div class="filters">
      <div class="search">${I.search}<input class="input" id="q" placeholder="Search games, tags, developers" value="${esc(storeFilters.q)}"></div>
      <button class="chip" data-f="web">${'Play in browser'}</button>
      <button class="chip" data-f="ai">AI-made</button>
      <button class="chip" data-f="upcoming">Coming soon</button>
      <div class="spacer"></div>
      <select class="input" id="genre"><option value="">All genres</option>${state.meta.genres.map((g) => `<option ${storeFilters.genre === g ? 'selected' : ''}>${g}</option>`).join('')}</select>
      <select class="input" id="sort">
        <option value="new">Newest</option><option value="popular">Most popular</option><option value="updated">Recently updated</option><option value="az">A to Z</option>
      </select>
    </div>
    <div id="results" class="grid"></div>`;
  $('#sort').value = storeFilters.sort;
  const syncChips = () => $$('.chip[data-f]').forEach((c) => c.classList.toggle('on', c.dataset.f === 'upcoming' ? storeFilters.status === 'upcoming' : storeFilters[c.dataset.f]));
  syncChips();
  $$('.chip[data-f]').forEach((c) => c.onclick = () => {
    const f = c.dataset.f;
    if (f === 'upcoming') storeFilters.status = storeFilters.status ? '' : 'upcoming'; else storeFilters[f] = !storeFilters[f];
    syncChips(); load();
  });
  let t; $('#q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { storeFilters.q = e.target.value; load(); }, 220); };
  $('#genre').onchange = (e) => { storeFilters.genre = e.target.value; load(); };
  $('#sort').onchange = (e) => { storeFilters.sort = e.target.value; load(); };

  async function load() {
    const p = new URLSearchParams({ sort: storeFilters.sort });
    if (storeFilters.q) p.set('q', storeFilters.q);
    if (storeFilters.genre) p.set('genre', storeFilters.genre);
    if (storeFilters.ai) p.set('ai', '1');
    if (storeFilters.web) p.set('web', '1');
    if (storeFilters.status) p.set('status', storeFilters.status);
    const { games } = await api('/api/games?' + p);
    const filtered = storeFilters.q || storeFilters.genre || storeFilters.ai || storeFilters.web || storeFilters.status;
    $('#results').innerHTML = games.length ? games.map(gameCard).join('')
      : `<div class="empty" style="grid-column:1/-1"><h3>${filtered ? 'No games match that' : 'The store is empty'}</h3>${filtered ? 'Try a different search or filter.' : 'Be the first to upload a game!'}</div>`;
  }
  await load();
  // Hero: most popular released game, or an intro banner.
  const { games: top } = await api('/api/games?sort=popular&status=released');
  const f = state.me ? (top.find((g) => g.cover) || top[0]) : null; // visitors see the brand banner first
  $('#hero').innerHTML = f ? `
    <a class="hero" href="/game/${esc(f.slug)}" data-link>
      <div class="hero-bg" style="${f.cover ? `background-image:url('${esc(f.cover)}')` : `background:linear-gradient(135deg,hsl(${hue(f.title)} 65% 40%),hsl(${(hue(f.title) + 70) % 360} 70% 25%))`}"></div>
      <div class="hero-body">
        <div class="hero-kicker">Featured${f.isAi ? ' · AI-made' : ''}</div>
        <h1>${esc(f.title)}</h1>
        <p>${esc(f.tagline || 'by ' + f.developer)}</p>
        <span class="btn primary big">${f.playUrl ? I.play + 'Play free now' : I.download + 'Get it free'}</span>
      </div>
    </a>` : `
    <div class="hero intro"><div class="hero-body">
      <div class="hero-kicker">The home of independent games</div>
      <h1>Play free. Share free.</h1>
      <p>GlitchBox is a free home for indie and AI developers. Play in your browser or install Windows games in one click, or upload your own game in minutes.</p>
      <div class="row"><a class="btn primary big" href="/upload" data-link>${I.upload}Upload your game</a>${top.length ? `<a class="btn big" href="#results" onclick="document.getElementById('results').scrollIntoView({behavior:'smooth'});return false">Browse games</a>` : ''}</div>
    </div><img class="hero-logo" src="/brand/logo-full.webp" alt="GlitchBox"></div>`;
}

// ---------- Alpha/Beta testing ----------
let testFilter = '';
async function viewTesting() {
  document.title = 'Testing · GlitchBox';
  app.innerHTML = `
    <div class="test-hero panel">
      <div><div class="hero-kicker">Alpha and Beta testing</div><h1>Play it before anyone else.</h1>
        <p class="hint">These games are still being made. Try them early, report bugs and talk to the developers in each game's tester chat.</p></div>
      <a class="btn primary" href="/upload" data-link>${I.upload}Submit a game for testing</a>
    </div>
    <div class="filters"><button class="chip" data-t="">All</button><button class="chip" data-t="alpha">Alpha</button><button class="chip" data-t="beta">Beta</button></div>
    <div id="results" class="grid"><div class="loading">Loading...</div></div>`;
  const load = async () => {
    $$('.chip[data-t]').forEach((c) => c.classList.toggle('on', c.dataset.t === testFilter));
    const { games } = await api('/api/games?sort=updated&status=' + (testFilter || 'testing'));
    $('#results').innerHTML = games.length ? games.map(gameCard).join('')
      : '<div class="empty" style="grid-column:1/-1"><h3>Nothing in testing right now</h3>Developers can set a game to Alpha test or Beta test in its store page setup.</div>';
  };
  $$('.chip[data-t]').forEach((c) => c.onclick = () => { testFilter = c.dataset.t; load(); });
  load();
}

// ---------- game page ----------
async function viewGame(slug) {
  app.innerHTML = '<div class="loading">Loading...</div>';
  const { game: g } = await api('/api/games/' + encodeURIComponent(slug));
  document.title = `${g.title} · GlitchBox`;
  const os = detectOS();
  const mine = state.me && state.me.id === g.developerId;
  const best = g.files.find((f) => f.platform === os);
  const soon = g.status === 'upcoming';
  const testing = TEST_LABEL[g.status];
  // Gallery: trailer first (if any), then screenshots.
  const slides = [...(g.trailerEmbed ? [{ type: 'video', src: g.trailerEmbed }] : []), ...g.screenshots.map((s) => ({ type: 'img', src: s.url }))];
  if (!slides.length && g.cover) slides.push({ type: 'img', src: g.cover });
  const CONTROL_NAME = { keyboard: 'Keyboard', mouse: 'Mouse', gamepad: 'Gamepad', touch: 'Touch' };
  const req = g.sysreq || {};
  const reqRows = [['OS', req.os], ['Processor', req.cpu], ['Memory', req.ram], ['Graphics', req.gpu], ['Storage', req.storage], ['Notes', req.notes]].filter(([, v]) => v);
  const details = [
    ['Genre', esc(g.genre)],
    ['Release', esc(g.releaseDate || (g.publishedAt ? new Date(g.publishedAt).toLocaleDateString() : ''))],
    ['Developer', `<a href="/dev/${esc(g.developer)}" data-link>${esc(g.developer)}</a>`],
    ['Age rating', esc(g.contentRatingLabel || '')],
    ['Controls', g.controls.map((k) => CONTROL_NAME[k]).join(', ')],
    ['Languages', esc(g.languages)],
    ['Content', esc(g.contentWarnings)],
  ].filter(([, v]) => v);
  const links = [g.website && `<a class="btn small" href="${esc(g.website)}" target="_blank" rel="noopener nofollow">Website</a>`, g.discord && `<a class="btn small" href="${esc(g.discord)}" target="_blank" rel="noopener nofollow">Discord</a>`].filter(Boolean).join('');
  const headBg = g.banner || g.cover;
  app.innerHTML = `
    ${mine && !g.published ? `<div class="draft-bar"><b>Draft.</b> Only you can see this page. <a class="btn small primary" href="/edit/${g.id}" data-link>Finish store page</a></div>` : ''}
    <div class="game-head ${g.banner ? 'has-banner' : ''}">
      <div class="game-head-bg" style="${headBg ? `background-image:url('${esc(headBg)}')` : `background:hsl(${hue(g.title)} 60% 35%)`}"></div>
      <div class="game-head-inner">
        <div class="gallery">
          <div class="stage" id="stage"></div>
          ${slides.length > 1 ? `<div class="thumbs" id="thumbs">${slides.map((s, i) => `<button class="thumb" data-i="${i}">${s.type === 'video' ? `<span class="vid">${I.play}</span>` : `<img src="${esc(s.src)}" alt="" loading="lazy">`}</button>`).join('')}</div>` : ''}
        </div>
        <div class="game-info">
          ${g.cover ? `<div class="cover small-cover"><img src="${esc(g.cover)}" alt=""></div>` : ''}
          <h1>${esc(g.title)}</h1>
          <div class="by">by <a href="/dev/${esc(g.developer)}" data-link>${esc(g.developer)}</a> · ${esc(g.genre)}${g.releaseDate ? ` · ${soon ? 'Coming ' : ''}${esc(g.releaseDate)}` : ''}</div>
          ${g.tagline ? `<div class="tagline">${esc(g.tagline)}</div>` : ''}
          <div class="tags">${soon ? '<span class="tag" style="color:var(--warn)">Coming soon</span>' : ''}${testing ? `<span class="tag test">${testing}</span>` : ''}${g.isAi ? '<span class="tag" style="color:#d9a7ff">AI-made</span>' : ''}${g.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
          <div class="actions">
            ${g.playUrl ? `<button class="btn ${desk.api && winFile(g) ? '' : 'primary'} big" id="play">${I.play}Play in browser</button>` : ''}
            ${deskSlot(g, 'big')}
            ${best && !(desk.api && winFile(g)) ? `<a class="btn ${g.playUrl ? '' : 'primary'} big" href="/api/download/${best.id}">${I.download}Download for ${PLAT_NAME[os]}</a>` : ''}
            ${!g.playUrl && !best && g.files.length && !(desk.api && winFile(g)) ? `<a class="btn primary big" href="#downloads">${I.download}See downloads</a>` : ''}
            <button class="btn big" id="lib">${g.inLibrary ? I.check + (soon ? 'On your wishlist' : 'In your library') : I.plus + (soon ? 'Add to wishlist' : 'Add to library')}</button>
            ${mine ? `<a class="btn ghost" href="/edit/${g.id}" data-link>Edit store page</a>` : ''}
          </div>
          <div class="stats">
            <div><b>${fmtNum(g.plays)}</b>plays</div><div><b>${fmtNum(g.downloads)}</b>downloads</div><div><b>${fmtNum(g.libraryCount)}</b>in libraries</div>
          </div>
        </div>
      </div>
    </div>
    <div class="game-cols">
      <div>
        ${testing ? `<div class="test-note"><b>This game is in ${testing.toLowerCase()}.</b> Expect bugs and unfinished parts. Play it, then tell ${esc(g.developer)} what you think in the tester chat below.</div>` : ''}
        <div class="panel"><h3>About this game</h3><div class="desc">${g.description ? linkify(g.description) : '<span class="hint">The developer has not written a description yet.</span>'}</div></div>
        ${testing ? `<div class="chat tester-chat" style="margin-top:16px">
          <div class="chat-head"><b>Tester chat</b><div>Open to everyone. Players and ${esc(g.developer)} talk about the ${testing.toLowerCase()} here. This chat closes when the game is fully released.</div></div>
          <div class="feed" id="feed"><div class="loading">Loading...</div></div>
          ${state.me?.username ? `<form class="composer" id="composer"><textarea class="input" name="body" placeholder="Report a bug, share feedback or ask a question" maxlength="2000"></textarea><button class="btn primary">Send</button></form>`
            : '<div class="composer" style="justify-content:center"><button class="btn primary" id="chat-login">Log in to join the chat</button></div>'}
        </div>` : ''}
        ${g.updates?.length ? `<div class="panel" style="margin-top:16px"><h3>Updates and patch notes</h3>
          <div class="updates">${g.updates.map((u) => `<div class="upd"><div class="row"><b>Version ${esc(u.version)}</b><span class="hint">${new Date(u.createdAt).toLocaleDateString()}</span></div>${u.notes ? `<div class="desc">${linkify(u.notes)}</div>` : ''}</div>`).join('')}</div></div>` : ''}
        ${reqRows.length ? `<div class="panel" style="margin-top:16px"><h3>System requirements <span class="hint" style="font-weight:400">(minimum)</span></h3>
          <dl class="spec">${reqRows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>` : ''}
      </div>
      <div>
        <div class="panel" id="downloads">
          <h3>Platforms</h3>
          <div class="dl-list">
            ${g.playUrl ? `<button class="dl" id="play2" style="cursor:pointer;text-align:left;color:inherit">${I.web}<span class="name">Play in your browser</span><span class="size">No install</span></button>` : ''}
            ${g.files.map((f) => `<a class="dl ${f.platform === os ? 'recommended' : ''}" href="/api/download/${f.id}">${I[f.platform]}<span class="name">${esc(f.filename)}${f.version ? ` <span class="hint">v${esc(f.version)}</span>` : ''}</span><span class="size">${fmtSize(f.size)}</span></a>`).join('')}
            ${!g.playUrl && !g.files.length ? `<div class="hint">${soon ? 'Not out yet. Add it to your wishlist to keep track.' : 'No builds uploaded yet.'}</div>` : ''}
          </div>
        </div>
        <div class="panel" style="margin-top:16px"><h3>Details</h3>
          <dl class="spec">${details.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
          ${links ? `<div class="row" style="margin-top:14px">${links}</div>` : ''}
        </div>
        ${testing ? '' : `<div class="panel" style="margin-top:16px">
          <h3>Talk about it</h3>
          <p class="hint" style="margin:0 0 12px">Share feedback or ideas with ${esc(g.developer)} and other players.</p>
          <a class="btn small" href="/community/feedback" data-link>Open Playtesting chat</a>
        </div>`}
      </div>
    </div>`;
  // gallery
  let cur = 0;
  const show = (i) => {
    cur = i; const s = slides[i]; const stage = $('#stage'); if (!stage) return;
    stage.innerHTML = !s ? `<div class="cover">${coverHtml(g)}</div>`
      : s.type === 'video' ? `<iframe src="${esc(s.src)}" title="Trailer" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`
      : `<img src="${esc(s.src)}" alt="Screenshot ${i + 1}" data-zoom>${slides.length > 1 ? '<button class="nav-arrow l" data-step="-1">‹</button><button class="nav-arrow r" data-step="1">›</button>' : ''}`;
    $$('.thumb').forEach((t) => t.classList.toggle('on', Number(t.dataset.i) === i));
  };
  show(0);
  deskRefresh();
  if (testing) {
    $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === 'testing'));
    mountChat(`/api/games/${g.id}/chat`, 'game:' + g.id, mine, 'No messages yet. Be the first to share feedback.', g.developerId);
  }
  $('#thumbs')?.addEventListener('click', (e) => { const t = e.target.closest('.thumb'); if (t) show(Number(t.dataset.i)); });
  $('#stage').addEventListener('click', (e) => {
    const step = e.target.closest('[data-step]');
    if (step) { show((cur + Number(step.dataset.step) + slides.length) % slides.length); return; }
    if (e.target.dataset.zoom !== undefined) lightbox(slides.filter((s) => s.type === 'img').map((s) => s.src), e.target.getAttribute('src'));
  });
  const play = () => openPlayer(g);
  $('#play')?.addEventListener('click', play);
  $('#play2')?.addEventListener('click', play);
  $('#lib').onclick = async () => {
    if (!(await needLogin('Log in to build your library.'))) return;
    try {
      if (g.inLibrary) { await api('/api/library/' + g.id, { method: 'DELETE' }); toast('Removed from your library'); }
      else { await api('/api/library/' + g.id, { method: 'POST' }); toast(soon ? 'Added to your wishlist' : 'Added to your library', 'ok'); }
      viewGame(slug);
    } catch (e) { toast(e.message, 'error'); }
  };
}

function lightbox(srcs, start) {
  let i = Math.max(0, srcs.indexOf(start));
  const el = document.createElement('div');
  el.className = 'lightbox';
  const draw = () => { el.innerHTML = `<img src="${esc(srcs[i])}" alt=""><button class="nav-arrow l">‹</button><button class="nav-arrow r">›</button><button class="lb-x">✕</button><div class="lb-n">${i + 1} / ${srcs.length}</div>`; };
  draw();
  const close = () => { el.remove(); removeEventListener('keydown', key); };
  const key = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') { i = (i + 1) % srcs.length; draw(); }
    if (e.key === 'ArrowLeft') { i = (i - 1 + srcs.length) % srcs.length; draw(); }
  };
  el.onclick = (e) => {
    if (e.target.classList.contains('r')) { i = (i + 1) % srcs.length; draw(); }
    else if (e.target.classList.contains('l')) { i = (i - 1 + srcs.length) % srcs.length; draw(); }
    else if (e.target.tagName !== 'IMG') close();
  };
  addEventListener('keydown', key);
  document.body.append(el);
}

function openPlayer(g) {
  api(`/api/games/${g.id}/played`, { method: 'POST' }).catch(() => {});
  if (state.me) api('/api/library/' + g.id, { method: 'POST' }).catch(() => {});
  const el = document.createElement('div');
  el.className = 'player';
  el.innerHTML = `
    <div class="player-bar">
      <span class="title">${esc(g.title)}</span><span class="hint">by ${esc(g.developer)}</span>
      <div class="spacer"></div>
      <button class="btn small" id="fs">${I.full}Fullscreen</button>
      <a class="btn small ghost" href="${esc(g.playUrl)}" target="_blank" rel="noopener">Open in new tab</a>
      <button class="btn small" id="close">Close</button>
    </div>
    <div class="player-stage">
      <iframe src="${esc(g.playUrl)}" sandbox="allow-scripts allow-pointer-lock allow-popups allow-forms allow-modals allow-downloads"
        allow="autoplay; fullscreen; gamepad; clipboard-write" allowfullscreen></iframe>
    </div>`;
  document.body.append(el);
  document.body.style.overflow = 'hidden';
  const frame = $('iframe', el);
  const fit = () => {
    const stage = $('.player-stage', el);
    const sw = stage.clientWidth - 40, sh = stage.clientHeight - 40;
    const s = Math.min(sw / g.webWidth, sh / g.webHeight, 1.5);
    frame.style.width = Math.floor(g.webWidth * s) + 'px';
    frame.style.height = Math.floor(g.webHeight * s) + 'px';
  };
  fit(); addEventListener('resize', fit);
  const close = () => { removeEventListener('resize', fit); removeEventListener('keydown', esc_); el.remove(); document.body.style.overflow = ''; };
  const esc_ = (e) => { if (e.key === 'Escape' && !document.fullscreenElement) close(); };
  addEventListener('keydown', esc_);
  $('#close', el).onclick = close;
  $('#fs', el).onclick = () => frame.requestFullscreen?.() || frame.webkitRequestFullscreen?.();
  frame.focus();
}

// ---------- library ----------
let libTab = 'games';
async function viewLibrary() {
  if (!state.me) {
    app.innerHTML = `<div class="empty"><h3>Your library lives here</h3><p>Log in to keep track of games you play, download and wishlist.</p><button class="btn primary" id="li">Log in</button></div>`;
    $('#li').onclick = () => loginModal();
    return;
  }
  app.innerHTML = '<div class="loading">Loading...</div>';
  const { library, uploads } = await api('/api/library');
  const owned = library.filter((g) => g.status !== 'upcoming');
  const wish = library.filter((g) => g.status === 'upcoming');
  const lists = { games: owned, wishlist: wish, uploads };
  const os = detectOS();
  const item = (g) => {
    const best = g.files.find((f) => f.platform === os) || g.files[0];
    return `<div class="lib-item">
      <a class="cover" href="/game/${esc(g.slug)}" data-link>${coverHtml(g)}</a>
      <div class="meta">
        <a class="t" href="/game/${esc(g.slug)}" data-link>${esc(g.title)}</a>
        <div class="s">${esc(g.developer)} · ${esc(g.genre)}${g.status === 'upcoming' ? ' · <span style="color:var(--warn)">Coming soon</span>' : ''}${g.checklist && !g.published ? ` · <span class="draft-tag">Draft, ${g.checklist.filter((i) => i.required && i.done).length}/${g.checklist.filter((i) => i.required).length} done</span>` : ''}${g.checklist && g.published ? ' · <span class="live-tag">Live</span>' : ''}</div>
        <div style="margin-top:6px" class="row">${platIcons(g.platforms)}${g.playtimeMinutes ? `<span class="hint">${fmtTime(g.playtimeMinutes)}</span>` : ''}</div>
      </div>
      <div class="row">
        ${libTab !== 'uploads' ? deskSlot(g, 'small') : ''}
        ${g.playUrl ? `<button class="btn ${desk.api && winFile(g) ? '' : 'primary'} small" data-play="${g.id}">${I.web}Play in browser</button>` : ''}
        ${best && !(desk.api && winFile(g) && libTab !== 'uploads') ? `<a class="btn small" href="/api/download/${best.id}">${I.download}${PLAT_NAME[best.platform]}</a>` : ''}
        ${libTab === 'uploads' ? `<a class="btn small ${g.published ? '' : 'primary'}" href="/edit/${g.id}" data-link>${g.published ? 'Edit page' : 'Finish setup'}</a>` : `<button class="btn small ghost" data-rm="${g.id}">Remove</button>`}
      </div>
    </div>`;
  };
  const draw = () => {
    const list = lists[libTab];
    app.innerHTML = `
      <div class="row"><h1 class="page-title">Library</h1><div class="spacer"></div><a class="btn primary" href="/upload" data-link>${I.upload}Upload a game</a></div>
      <div class="tabs">
        <button data-tab="games" class="${libTab === 'games' ? 'on' : ''}">Games<span class="count">${owned.length}</span></button>
        <button data-tab="wishlist" class="${libTab === 'wishlist' ? 'on' : ''}">Wishlist<span class="count">${wish.length}</span></button>
        <button data-tab="uploads" class="${libTab === 'uploads' ? 'on' : ''}">My uploads<span class="count">${uploads.length}</span></button>
      </div>
      <div class="lib-list">${list.length ? list.map(item).join('') : `<div class="empty">${{
        games: '<h3>No games yet</h3>Find something to play in the <a href="/" data-link style="color:var(--accent)">store</a>.',
        wishlist: '<h3>Your wishlist is empty</h3>Add upcoming games to hear about them first.',
        uploads: '<h3>You have not uploaded anything yet</h3><a class="btn primary" style="margin-top:12px" href="/upload" data-link>Upload your first game</a>',
      }[libTab]}</div>`}</div>`;
    $$('[data-tab]').forEach((b) => b.onclick = () => { libTab = b.dataset.tab; draw(); });
    $$('[data-play]').forEach((b) => b.onclick = () => openPlayer(list.find((g) => g.id == b.dataset.play)));
    $$('[data-rm]').forEach((b) => b.onclick = async () => { await api('/api/library/' + b.dataset.rm, { method: 'DELETE' }); viewLibrary(); });
    deskRefresh();
  };
  draw();
}

// ---------- community ----------
function ensureStream() {
  if (state.stream) return;
  let retry = 1000;
  const connect = () => {
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/live`);
    state.stream = ws;
    let ping;
    ws.onopen = () => { retry = 1000; ping = setInterval(() => ws.readyState === 1 && ws.send('ping'), 30000); };
    ws.onmessage = (e) => {
      if (e.data === 'pong') return;
      const evt = JSON.parse(e.data);
      if (evt.type === 'post' && evt.post.channel === state.channel) appendPost(evt.post);
      if (evt.type === 'delete') $(`.msg[data-id="${evt.id}"]`)?.remove();
    };
    ws.onclose = () => { clearInterval(ping); setTimeout(connect, retry); retry = Math.min(retry * 2, 30000); };
  };
  connect();
}
let lastPost = null;
function postHtml(p, prev) {
  const cont = prev && prev.authorId === p.authorId && p.createdAt - prev.createdAt < 5 * 60 * 1000 && !p.game;
  const mine = state.me && (state.me.id === p.authorId || state.chatMod);
  return `<div class="msg ${cont ? 'cont' : ''}" data-id="${p.id}">
    ${avatar(p.author)}
    <div class="msg-body">
      ${cont ? '' : `<div><span class="who"><a href="/dev/${esc(p.author)}" data-link>${esc(p.author)}</a></span>${state.chatDev && state.chatDev === p.authorId ? '<span class="dev-badge">Developer</span>' : ''}<span class="when">${ago(p.createdAt)}</span></div>`}
      <div class="text">${linkify(p.body)}${mine ? `<button class="del" data-del="${p.id}">delete</button>` : ''}</div>
      ${p.game ? `<a class="game-embed" href="/game/${esc(p.game.slug)}" data-link><div class="cover">${coverHtml(p.game)}</div><div><b>${esc(p.game.title)}</b><span>${esc(p.game.tagline || 'View game page')}</span></div></a>` : ''}
    </div></div>`;
}
function appendPost(p) {
  const feed = $('#feed'); if (!feed || $(`.msg[data-id="${p.id}"]`, feed)) return;
  const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 120;
  $('.empty', feed)?.remove();
  feed.insertAdjacentHTML('beforeend', postHtml(p, lastPost));
  lastPost = p;
  if (atBottom || p.authorId === state.me?.id) feed.scrollTop = feed.scrollHeight;
}
// Loads a feed into #feed and wires up #composer. Used by community channels and tester chats.
async function mountChat(url, channel, canModerate, emptyText, devId = null) {
  state.channel = channel; state.chatMod = canModerate; state.chatDev = devId;
  ensureStream();
  const { posts } = await api(url);
  const feed = $('#feed'); if (!feed) return;
  lastPost = null;
  feed.innerHTML = posts.length ? '' : `<div class="empty" style="margin:auto;border:0;background:none">${emptyText}</div>`;
  posts.forEach(appendPost);
  feed.scrollTop = feed.scrollHeight;
  feed.onclick = async (e) => {
    const id = e.target.dataset?.del;
    if (id && confirm('Delete this message?')) await api('/api/posts/' + id, { method: 'DELETE' }).catch((err) => toast(err.message, 'error'));
  };
  $('#chat-login')?.addEventListener('click', () => loginModal());
  const form = $('#composer');
  if (!form) return;
  const ta = form.body;
  ta.oninput = () => { ta.style.height = '46px'; ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'; };
  ta.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const body = ta.value.trim(); if (!body) return;
    try {
      const { post } = await api(url, { method: 'POST', body: { body, gameId: form.gameId?.value || null } });
      ta.value = ''; ta.style.height = '46px'; if (form.gameId) form.gameId.value = '';
      appendPost(post);
    } catch (err) { toast(err.message, 'error'); }
  };
}
async function viewCommunity(ch) {
  const channels = state.meta.channels;
  const c = channels.find((x) => x.id === ch) || channels[0];
  let myGames = [];
  if (state.me?.username) myGames = (await api('/api/library')).uploads;
  app.innerHTML = `
    <div class="community">
      <div class="channels"><h4>Channels</h4>${channels.map((x) => `<a href="/community/${x.id}" data-link class="${x.id === c.id ? 'on' : ''}"><span class="hash">#</span>${esc(x.name)}</a>`).join('')}</div>
      <div class="chat">
        <div class="chat-head"><b># ${esc(c.name)}</b><div>${esc(c.desc)}</div></div>
        <div class="feed" id="feed"><div class="loading">Loading...</div></div>
        ${state.me?.username ? `
        <form class="composer" id="composer">
          <textarea class="input" name="body" placeholder="Message #${esc(c.name)}" maxlength="2000"></textarea>
          ${myGames.length ? `<select class="input" name="gameId"><option value="">Attach a game...</option>${myGames.map((g) => `<option value="${g.id}">${esc(g.title)}</option>`).join('')}</select>` : ''}
          <button class="btn primary">Send</button>
        </form>` : `<div class="composer" style="justify-content:center"><button class="btn primary" id="chat-login">Log in to join the conversation</button></div>`}
      </div>
    </div>`;
  await mountChat(`/api/channels/${c.id}/posts`, c.id, false, `<h3>No messages yet</h3>Start the conversation in #${esc(c.name)}.`);
  $('#composer textarea')?.focus();
}

// ---------- store page setup (upload / edit) ----------
// Suggests the next version number from the newest uploaded build (1.0.3 -> 1.0.4).
function nextVersion(g) {
  const v = (g?.files || []).map((f) => f.version).filter(Boolean).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
  if (!v) return '1.0.0';
  const m = /^(.*?)(\d+)$/.exec(v);
  return m ? m[1] + (Number(m[2]) + 1) : v + '.1';
}
const imgSize = (file) => new Promise((res) => {
  const url = URL.createObjectURL(file); const im = new Image();
  im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight, url }); im.onerror = () => res({ w: 0, h: 0, url }); im.src = url;
});
async function viewEditor(id) {
  if (!(await needLogin('Log in to upload your game. It is free.'))) { go('/'); return; }
  let g = null;
  if (id) {
    g = (await api('/api/games/' + id)).game;
    if (g.developerId !== state.me.id) { app.innerHTML = '<div class="empty"><h3>That is not your game</h3></div>'; return; }
  }
  const { genres, ratings, controls: CONTROLS, maxShots } = state.meta;
  const ext = state.meta.downloadExt.join(',');
  const req = g?.sysreq || {};
  // Pending media chosen in this session.
  const media = { cover: null, banner: null };
  let shots = (g?.screenshots || []).map((s) => ({ key: s.key, url: s.url }));
  const CONTROL_NAME = { keyboard: 'Keyboard', mouse: 'Mouse', gamepad: 'Gamepad', touch: 'Touch screen' };
  const platRow = (p, hint) => `
    <div class="plat-row"><div class="lbl">${I[p]}${PLAT_NAME[p]}</div>
      <label class="drop" data-drop><input type="file" name="${p}" accept="${ext}" multiple><b>Drop or choose file</b><span class="hint">${hint}</span><div class="picked"></div></label></div>
    ${(g?.files || []).filter((f) => f.platform === p).map((f) => `<div class="existing">${I.check}${esc(f.filename)} (${fmtSize(f.size)}) <button type="button" class="btn small ghost danger" data-rmfile="${f.id}">Remove</button></div>`).join('')}`;
  const sec = (n, title, sub, body) => `<section class="panel setup-sec"><div class="sec-head"><span class="sec-n">${n}</span><div><h3>${title}</h3>${sub ? `<div class="hint">${sub}</div>` : ''}</div></div>${body}</section>`;

  app.innerHTML = `
    <div class="row" style="margin-bottom:6px"><h1 class="page-title" style="margin:0">${g ? 'Edit store page' : 'Set up your store page'}</h1>
      ${g ? `<span class="status-pill ${g.published ? 'live' : ''}">${g.published ? 'Live' : 'Draft'}</span>` : '<span class="status-pill">New draft</span>'}</div>
    <p class="hint" style="margin:0 0 22px">Every game on GlitchBox has a complete store page. Fill in the checklist and your game goes live. You can save a draft any time.</p>
    <form id="editor" class="form-grid" novalidate>
      <div>
        ${sec(1, 'Basics', 'What your game is called and where it fits.', `
          <label class="field"><span>Title</span><input class="input" name="title" maxlength="80" value="${esc(g?.title)}" placeholder="My Amazing Game"></label>
          <label class="field"><span>Short description <em class="count" data-count="tagline">0/140</em></span><input class="input" name="tagline" maxlength="140" value="${esc(g?.tagline)}" placeholder="One sentence that sells it. Shown on store cards."></label>
          <div class="two">
            <label class="field"><span>Genre</span><select class="input" name="genre">${genres.map((x) => `<option ${(g?.genre || 'Other') === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
            <label class="field"><span>Status</span><select class="input" name="status">${[['released', 'Released'], ['upcoming', 'Coming soon'], ['alpha', 'Alpha test'], ['beta', 'Beta test']].map(([v, l]) => `<option value="${v}" ${(g?.status || 'released') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          </div>
          <div class="two">
            <label class="field"><span>Release date</span><input class="input" name="releaseDate" maxlength="40" value="${esc(g?.releaseDate)}" placeholder="e.g. 12 March 2027 or Spring 2027"></label>
            <label class="field"><span>Tags</span><input class="input" name="tags" value="${esc(g?.tags.join(', '))}" placeholder="pixel art, roguelike, co-op"></label>
          </div>
          <label class="toggle"><input type="checkbox" name="isAi" ${g?.isAi ? 'checked' : ''}> Made with AI (tools, assets or code)</label>`)}

        ${sec(2, 'About this game', 'The main description on your store page. Say what it is, how it plays and what makes it special.', `
          <label class="field" style="margin:0"><textarea class="input" name="description" maxlength="8000" rows="10" placeholder="Hook the player in the first line.\n\nFeatures:\n- ...\n- ...\n\nHow to play: ...">${esc(g?.description)}</textarea>
          <div class="hint" style="margin-top:6px">At least 150 characters. Links are clickable.<em class="count" data-count="description">0</em></div></label>`)}

        ${sec(3, 'Images and video', 'Good images are the biggest reason people click. Use real in-game shots.', `
          <div class="two">
            <div class="field"><span class="lbl-t">Cover image <em class="hint">16:9, at least 960×540</em></span>
              <label class="drop cover-drop" data-img="cover"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif">${g?.cover ? `<img src="${esc(g.cover)}" alt="">` : '<div><b>Drop cover image</b><span class="hint">Shown in the store and library</span></div>'}</label></div>
            <div class="field"><span class="lbl-t">Banner <em class="hint">optional, wide, e.g. 1920×620</em></span>
              <label class="drop cover-drop banner-drop" data-img="banner"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif">${g?.banner ? `<img src="${esc(g.banner)}" alt="">` : '<div><b>Drop banner image</b><span class="hint">Used behind your game page header</span></div>'}</label>
              ${g?.banner ? '<label class="hint" style="display:block;margin-top:6px;cursor:pointer"><input type="checkbox" name="removeBanner"> Remove banner</label>' : ''}</div>
          </div>
          <div class="field"><span class="lbl-t">Screenshots <em class="hint">3 to ${maxShots}, at least 960×540. Use the arrows to set the order.</em></span>
            <div class="shots" id="shots"></div></div>
          <label class="field" style="margin:0"><span>Trailer <em class="hint">optional YouTube or Vimeo link</em></span><input class="input" name="trailerUrl" value="${esc(g?.trailerUrl)}" placeholder="https://www.youtube.com/watch?v=..."></label>`)}

        ${sec(4, 'Builds', 'Upload a browser build, a Windows build, or both.', `
          <h4 class="sub">${I.web.replace('<svg', '<svg style="width:17px;vertical-align:-3px;margin-right:6px"')}Play in browser <span class="hint" style="font-weight:400">(recommended, works on any computer)</span></h4>
          <label class="drop" data-drop><input type="file" name="web" accept=".zip,.html,.htm"><b>Drop your web build .zip</b><span class="hint">A zip with an index.html inside (HTML5, Unity WebGL, Godot Web, GameMaker HTML5, PICO-8, Phaser...) or a single .html file</span><div class="picked"></div></label>
          ${g?.playUrl ? `<div class="hint" style="margin-top:8px">${I.check.replace('<svg', '<svg style="width:14px;vertical-align:-2px"')} Browser build is live. Upload a new zip to replace it, or <label style="color:var(--danger);cursor:pointer"><input type="checkbox" name="removeWeb" style="vertical-align:-2px"> remove it</label>.</div>` : ''}
          <div class="two" style="margin-top:14px">
            <label class="field"><span>Game width (px)</span><input class="input" name="webWidth" type="number" min="200" max="3840" value="${g?.webWidth || 960}"></label>
            <label class="field"><span>Game height (px)</span><input class="input" name="webHeight" type="number" min="200" max="2160" value="${g?.webHeight || 600}"></label>
          </div>
          <h4 class="sub">Windows build</h4>
          <div class="two">
            <label class="field"><span>Version <em class="hint">for new uploads</em></span><input class="input" name="buildVersion" maxlength="40" placeholder="${esc(nextVersion(g))}"></label>
            <label class="field"><span>Windows launch file <em class="hint">optional</em></span><input class="input" name="launchPath" maxlength="260" value="${esc((g?.files || []).find((f) => f.platform === 'windows')?.launchPath || '')}" placeholder="e.g. MyGame.exe or Bin/MyGame.exe"></label>
          </div>
          <label class="field"><span>What's new <em class="hint">patch notes shown to players when you upload a new version</em></span><textarea class="input" name="buildNotes" rows="3" maxlength="4000" placeholder="- Fixed a crash on level 3&#10;- Added controller support"></textarea></label>
          <div class="hint" style="margin:-6px 0 16px">A new upload replaces the old Windows build, and players who installed it get the update automatically.</div>
          ${platRow('windows', '.zip (best), .exe, .msi')}`)}

        ${sec(5, 'System requirements', 'Needed if you offer downloads, so players know it will run.', `
          <div class="two">
            <label class="field"><span>Operating system</span><input class="input" name="req_os" maxlength="120" value="${esc(req.os)}" placeholder="Windows 10 64-bit"></label>
            <label class="field"><span>Memory (RAM)</span><input class="input" name="req_ram" maxlength="120" value="${esc(req.ram)}" placeholder="4 GB"></label>
            <label class="field"><span>Processor</span><input class="input" name="req_cpu" maxlength="120" value="${esc(req.cpu)}" placeholder="Intel i3 / Ryzen 3 or better"></label>
            <label class="field"><span>Graphics</span><input class="input" name="req_gpu" maxlength="120" value="${esc(req.gpu)}" placeholder="Intel UHD 620 / GTX 750"></label>
            <label class="field"><span>Storage</span><input class="input" name="req_storage" maxlength="120" value="${esc(req.storage)}" placeholder="500 MB"></label>
            <label class="field"><span>Notes</span><input class="input" name="req_notes" maxlength="400" value="${esc(req.notes)}" placeholder="Anything else players should know"></label>
          </div>`)}

        ${sec(6, 'Details', 'Helps players find games they can actually play.', `
          <div class="field"><span class="lbl-t">Supported controls</span>
            <div class="checks">${CONTROLS.map((k) => `<label class="check"><input type="checkbox" name="controls" value="${k}" ${g?.controls.includes(k) ? 'checked' : ''}>${CONTROL_NAME[k]}</label>`).join('')}</div></div>
          <div class="two">
            <label class="field"><span>Languages</span><input class="input" name="languages" maxlength="200" value="${esc(g?.languages)}" placeholder="English, Spanish"></label>
            <label class="field"><span>Age rating</span><select class="input" name="contentRating"><option value="">Choose...</option>${Object.entries(ratings).map(([k, v]) => `<option value="${k}" ${g?.contentRating === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          </div>
          <label class="field"><span>Content warnings <em class="hint">optional</em></span><input class="input" name="contentWarnings" maxlength="300" value="${esc(g?.contentWarnings)}" placeholder="e.g. cartoon violence, flashing lights"></label>
          <div class="two">
            <label class="field" style="margin:0"><span>Website <em class="hint">optional</em></span><input class="input" name="website" value="${esc(g?.website)}" placeholder="https://..."></label>
            <label class="field" style="margin:0"><span>Discord <em class="hint">optional</em></span><input class="input" name="discord" value="${esc(g?.discord)}" placeholder="https://discord.gg/..."></label>
          </div>`)}
      </div>

      <aside class="setup-side">
        <div class="panel">
          <div class="row" style="justify-content:space-between;margin-bottom:8px"><h3 style="margin:0">Store page checklist</h3><b id="pct" class="hint">0%</b></div>
          <div class="progress" style="margin:0 0 14px"><div id="pctbar"></div></div>
          <ul class="checklist" id="checklist"></ul>
          <button class="btn primary big" style="width:100%" id="publish" type="button">${g?.published ? 'Save and update live page' : 'Publish game'}</button>
          <button class="btn" style="width:100%;margin-top:10px" id="draft" type="button">${g?.published ? 'Save and unpublish' : 'Save draft'}</button>
          <div class="progress" id="upbar" hidden><div></div></div>
          <div class="hint" id="upstatus" style="margin-top:8px"></div>
          <div class="err" id="ferr"></div>
          ${g ? `<div class="row" style="margin-top:12px;justify-content:space-between"><a class="btn small ghost" href="/game/${esc(g.slug)}" data-link>${g.published ? 'View page' : 'Preview page'}</a><button type="button" class="btn small ghost danger" id="delgame">Delete game</button></div>` : ''}
        </div>
        <div class="panel tips" style="margin-top:16px">
          <h3 style="color:var(--text)">Tips for a great page</h3>
          <ul style="padding-left:18px;margin:0">
            <li><b>Screenshots</b> sell your game. Show real gameplay, not menus.</li>
            <li><b>Browser builds</b> run on any computer with no install.</li>
            <li><b>Zip your whole build folder</b> for each platform. Build 64-bit for Windows, and universal for Mac.</li>
            <li><b>Godot 4 web:</b> turn off "Thread Support". <b>Unity WebGL:</b> Brotli or Gzip both work.</li>
          </ul>
        </div>
      </aside>
    </form>`;

  const form = $('#editor');
  // ----- live counters & checklist -----
  const pickedFiles = () => ({
    web: form.web.files[0], downloads: state.meta.platforms.flatMap((p) => [...form[p].files].map((file) => ({ platform: p, file }))),
  });
  function checklist() {
    const v = (n) => (form[n]?.value || '').trim();
    const tags = v('tags').split(',').map((t) => t.trim()).filter(Boolean);
    const { web, downloads } = pickedFiles();
    const existingFiles = (g?.files || []).filter((f) => $(`[data-rmfile="${f.id}"]`));
    const hasWeb = (!!g?.playUrl && !form.removeWeb?.checked) || !!web;
    const hasDownloads = existingFiles.length > 0 || downloads.length > 0;
    const upcoming = v('status') === 'upcoming';
    const items = [
      ['Title', !!v('title'), true],
      ['Short description', v('tagline').length >= 10, true],
      ['Full description (150+ characters)', v('description').length >= 150, true],
      ['At least 2 tags', tags.length >= 2, true],
      ['Cover image', !!(media.cover || g?.cover), true],
      [`At least 3 screenshots (${shots.length})`, shots.length >= 3, true],
      ['Supported controls', $$('[name=controls]:checked', form).length > 0, true],
      ['Languages', !!v('languages'), true],
      ['Age rating', !!v('contentRating'), true],
      upcoming ? ['Planned release date', !!v('releaseDate'), true] : ['A playable build', hasWeb || existingFiles.length > 0 || downloads.length > 0, true],
    ];
    if (hasDownloads) items.push(['System requirements (OS and memory)', !!(v('req_os') && v('req_ram')), true]);
    items.push(['Banner image', !!(media.banner || (g?.banner && !form.removeBanner?.checked)), false]);
    items.push(['Trailer video', !!v('trailerUrl'), false]);
    return items.map(([label, done, required]) => ({ label, done, required }));
  }
  function renderChecklist() {
    const list = checklist();
    const reqd = list.filter((i) => i.required);
    const pct = Math.round(reqd.filter((i) => i.done).length / reqd.length * 100);
    $('#pct').textContent = pct + '%'; $('#pctbar').style.width = pct + '%';
    $('#checklist').innerHTML = list.map((i) => `<li class="${i.done ? 'done' : ''} ${i.required ? '' : 'opt'}">${i.done ? I.check : '<span class="dot"></span>'}${esc(i.label)}${i.required ? '' : ' <em>optional</em>'}</li>`).join('');
    $('#publish').disabled = pct < 100;
    $('[data-count="tagline"]').textContent = `${form.tagline.value.length}/140`;
    $('[data-count="description"]').textContent = form.description.value.length;
  }
  form.addEventListener('input', renderChecklist);
  form.addEventListener('change', renderChecklist);

  // ----- screenshots -----
  function renderShots() {
    $('#shots').innerHTML = shots.map((s, i) => `
      <div class="shot"><img src="${esc(s.url)}" alt="">
        <div class="shot-tools">
          <button type="button" data-mv="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} title="Move left">‹</button>
          <button type="button" data-mv="${i}" data-d="1" ${i === shots.length - 1 ? 'disabled' : ''} title="Move right">›</button>
          <button type="button" data-rm="${i}" title="Remove">✕</button>
        </div>${s.file ? '<span class="new">new</span>' : ''}</div>`).join('')
      + (shots.length < maxShots ? `<label class="shot add"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden>${I.plus}<span>Add screenshots</span></label>` : '');
    const add = $('#shots .add input');
    if (add) add.onchange = () => addShots([...add.files]);
    renderChecklist();
  }
  async function addShots(files) {
    for (const file of files) {
      if (shots.length >= maxShots) { toast(`Up to ${maxShots} screenshots`, 'error'); break; }
      const { w, h, url } = await imgSize(file);
      if (w < 960 || h < 540) { toast(`${file.name} is ${w}×${h}. Screenshots need to be at least 960×540.`, 'error'); continue; }
      shots.push({ file, url });
    }
    renderShots();
  }
  $('#shots').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.rm !== undefined) shots.splice(Number(b.dataset.rm), 1);
    if (b.dataset.mv !== undefined) { const i = Number(b.dataset.mv), j = i + Number(b.dataset.d); [shots[i], shots[j]] = [shots[j], shots[i]]; }
    renderShots();
  });
  const shotsBox = $('#shots');
  shotsBox.ondragover = (e) => { e.preventDefault(); shotsBox.classList.add('over'); };
  shotsBox.ondragleave = () => shotsBox.classList.remove('over');
  shotsBox.ondrop = (e) => { e.preventDefault(); shotsBox.classList.remove('over'); addShots([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'))); };

  // ----- cover / banner -----
  $$('[data-img]').forEach((zone) => {
    const slot = zone.dataset.img; const input = $('input', zone);
    const pick = async (file) => {
      if (!file) return;
      const { w, h, url } = await imgSize(file);
      const min = slot === 'banner' ? [1200, 300] : [960, 540];
      if (w < min[0] || h < min[1]) { toast(`That image is ${w}×${h}. The ${slot} needs to be at least ${min[0]}×${min[1]}.`, 'error'); return; }
      media[slot] = file;
      $$('img, div', zone).forEach((n) => n.remove()); zone.insertAdjacentHTML('beforeend', `<img src="${url}" alt="">`);
      renderChecklist();
    };
    input.onchange = () => pick(input.files[0]);
    zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('over'); };
    zone.ondragleave = () => zone.classList.remove('over');
    zone.ondrop = (e) => { e.preventDefault(); zone.classList.remove('over'); pick(e.dataTransfer.files[0]); };
  });

  // ----- build drop zones -----
  $$('[data-drop]').forEach((zone) => {
    const input = $('input', zone);
    const show = () => { $('.picked', zone).textContent = [...input.files].map((f) => `${f.name} (${fmtSize(f.size)})`).join(', '); renderChecklist(); };
    input.onchange = show;
    zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('over'); };
    zone.ondragleave = () => zone.classList.remove('over');
    zone.ondrop = (e) => { e.preventDefault(); zone.classList.remove('over'); input.files = e.dataTransfer.files; show(); };
  });
  $$('[data-rmfile]').forEach((b) => b.onclick = async () => {
    if (!confirm('Remove this file?')) return;
    await api(`/api/games/${g.id}/files/${b.dataset.rmfile}`, { method: 'DELETE' });
    b.closest('.existing').remove(); toast('File removed'); renderChecklist();
  });
  $('#delgame')?.addEventListener('click', async () => {
    if (!confirm(`Delete "${g.title}" for good? This removes all its files.`)) return;
    await api('/api/games/' + g.id, { method: 'DELETE' }); toast('Game deleted'); go('/library');
  });

  // ----- saving -----
  const busy = (on) => { $('#publish').disabled = on; $('#draft').disabled = on; };
  const status = (t) => { $('#upstatus').textContent = t; };
  async function save() {
    const wasLive = !!g?.published;
    const meta = {
      title: form.title.value, tagline: form.tagline.value, genre: form.genre.value, status: form.status.value,
      tags: form.tags.value, description: form.description.value, isAi: form.isAi.checked, releaseDate: form.releaseDate.value,
      trailerUrl: form.trailerUrl.value.trim(), languages: form.languages.value, contentRating: form.contentRating.value,
      contentWarnings: form.contentWarnings.value, website: form.website.value.trim(), discord: form.discord.value.trim(),
      controls: $$('[name=controls]:checked', form).map((x) => x.value),
      sysreq: Object.fromEntries(['os', 'cpu', 'ram', 'gpu', 'storage', 'notes'].map((k) => [k, form['req_' + k].value])),
      webWidth: form.webWidth.value, webHeight: form.webHeight.value,
      removeWeb: !!form.removeWeb?.checked, removeBanner: !!form.removeBanner?.checked,
      screenshots: shots.filter((s) => s.key).map((s) => s.key),
    };
    if (!meta.title.trim()) throw new Error('Give your game a title first');
    status('Saving details...');
    const { game } = await api(g ? '/api/games/' + g.id : '/api/games', { method: g ? 'PUT' : 'POST', body: meta });
    g = game;
    if (!id) { id = g.id; history.replaceState({}, '', '/edit/' + g.id); }

    const { web, downloads } = pickedFiles();
    let webFiles = [];
    if (web) {
      if (/\.html?$/i.test(web.name)) webFiles = [{ path: 'index.html', data: web }];
      else if (/\.zip$/i.test(web.name)) {
        status('Unpacking browser build...');
        const zipBytes = new Uint8Array(await web.arrayBuffer());
        const entries = await new Promise((res, rej) => fflate.unzip(zipBytes, (er, out) => er ? rej(new Error('That browser build zip could not be opened')) : res(out)));
        webFiles = Object.entries(entries)
          .filter(([p]) => !p.endsWith('/') && !p.startsWith('__MACOSX/') && !p.split('/').includes('..'))
          .map(([path, data]) => ({ path, data: new Blob([data]) }));
      } else throw new Error('Browser builds must be a .zip (with an index.html inside) or a single .html file');
    }
    const entry = webFiles.map((f) => f.path).filter((p) => /(^|\/)index\.html?$/i.test(p)).sort((a, b) => a.split('/').length - b.split('/').length)[0];
    if (web && !entry) throw new Error('No index.html found in the browser build zip');

    const newShots = shots.filter((s) => s.file);
    const total = (media.cover?.size || 0) + (media.banner?.size || 0) + newShots.reduce((s, x) => s + x.file.size, 0)
      + webFiles.reduce((s, f) => s + f.data.size, 0) + downloads.reduce((s, d) => s + d.file.size, 0);
    const bar = $('#upbar'); let done = 0;
    if (total) bar.hidden = false;
    const tick = (n) => { done += n; const pct = total ? Math.round(done / total * 100) : 100; $('div', bar).style.width = pct + '%'; status(`Uploading ${pct}%`); };
    const warnings = [];
    const putImage = async (slot, file) => {
      const { key } = await api('/api/uploads/key', { method: 'POST', body: { gameId: g.id, kind: slot, filename: file.name } });
      await uploadBlob(key, file, tick);
      await api(`/api/games/${g.id}/image`, { method: 'POST', body: { slot, key } });
      return key;
    };
    for (const slot of ['cover', 'banner']) {
      if (media[slot]) { try { await putImage(slot, media[slot]); media[slot] = null; } catch (er) { warnings.push(er.message); } }
    }
    for (const s of newShots) {
      try { s.key = await putImage('shots', s.file); delete s.file; } catch (er) { warnings.push(er.message); }
    }
    if (newShots.length) await api('/api/games/' + g.id, { method: 'PUT', body: { screenshots: shots.filter((s) => s.key).map((s) => s.key) } });
    if (webFiles.length) {
      const { prefix } = await api('/api/uploads/key', { method: 'POST', body: { gameId: g.id, kind: 'web' } });
      const queue = [...webFiles];
      await Promise.all(Array.from({ length: 6 }, async () => {
        while (queue.length) { const f = queue.shift(); await uploadBlob(prefix + f.path, f.data, tick); }
      }));
      await api(`/api/games/${g.id}/web`, { method: 'POST', body: { prefix, entry } });
    }
    for (const d of downloads) {
      try {
        const { key } = await api('/api/uploads/key', { method: 'POST', body: { gameId: g.id, kind: 'files', filename: d.file.name } });
        await uploadBlob(key, d.file, tick);
        await api(`/api/games/${g.id}/files`, { method: 'POST', body: {
          platform: d.platform, key, filename: d.file.name,
          version: form.buildVersion.value.trim() || nextVersion(g), notes: form.buildNotes.value.trim(),
          launchPath: d.platform === 'windows' ? form.launchPath.value.trim() : '',
        } });
      } catch (er) { warnings.push(er.message); }
    }
    warnings.forEach((w) => toast(w, 'error'));
    g = (await api('/api/games/' + g.id)).game;
    return { wasLive };
  }
  async function run(publish) {
    busy(true); $('#ferr').textContent = '';
    try {
      const { wasLive } = await save();
      if (publish) {
        status('Publishing...');
        const r = await api(`/api/games/${g.id}/publish`, { method: 'POST' });
        toast(wasLive ? 'Live page updated' : 'Your game is live!', 'ok');
        go('/game/' + r.game.slug);
        return;
      }
      if (g.published) await api(`/api/games/${g.id}/unpublish`, { method: 'POST' });
      toast('Draft saved', 'ok');
      viewEditor(g.id);
    } catch (er) {
      $('#ferr').textContent = er.message || 'Something went wrong. Try again.';
      status(''); $('#upbar').hidden = true; busy(false); renderChecklist();
    }
  }
  $('#publish').onclick = () => run(true);
  $('#draft').onclick = () => run(false);
  form.onsubmit = (e) => e.preventDefault();
  renderShots();
}

// Uploads go straight into storage. Big files are sent in 50 MB chunks so there is no practical size limit.
function xhrPut(url, blob, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('X-NS', '1');
    let last = 0;
    xhr.upload.onprogress = (ev) => { onProgress(ev.loaded - last); last = ev.loaded; };
    xhr.onload = () => {
      let data = {}; try { data = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 400) reject(new Error(data.error || `Upload failed (${xhr.status})`));
      else { onProgress(blob.size - last); resolve(data); }
    };
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'));
    xhr.send(blob);
  });
}
async function uploadBlob(key, blob, onProgress) {
  const k = encodeURIComponent(key);
  if (blob.size <= state.meta.singlePutMax) return xhrPut(`/api/uploads/blob?key=${k}`, blob, onProgress);
  const CHUNK = 50 * 1024 * 1024;
  const { uploadId } = await api('/api/uploads/mpu', { method: 'POST', body: { key, size: blob.size } });
  try {
    const parts = [];
    for (let i = 0, n = 1; i < blob.size; i += CHUNK, n++) {
      let tries = 0;
      for (;;) {
        try { parts.push((await xhrPut(`/api/uploads/mpu?key=${k}&uploadId=${encodeURIComponent(uploadId)}&part=${n}`, blob.slice(i, i + CHUNK), onProgress)).part); break; }
        catch (er) { if (++tries >= 3) throw er; }
      }
    }
    return await api('/api/uploads/mpu/complete', { method: 'POST', body: { key, uploadId, parts } });
  } catch (er) {
    api('/api/uploads/mpu/abort', { method: 'POST', body: { key, uploadId } }).catch(() => {});
    throw er;
  }
}

// ---------- developer page & settings ----------
async function viewDev(name) {
  const { dev, games } = await api('/api/devs/' + encodeURIComponent(name));
  document.title = `${dev.username} · GlitchBox`;
  app.innerHTML = `
    <div class="dev-head">${avatar(dev.username)}<div><h1>${esc(dev.username)}</h1><div class="hint">${esc(dev.bio || 'Game developer')} · joined ${new Date(dev.created_at).toLocaleDateString()}</div></div></div>
    <div class="section-title">Games (${games.length})</div>
    <div class="grid">${games.length ? games.map(gameCard).join('') : '<div class="empty" style="grid-column:1/-1">No games yet.</div>'}</div>`;
}

async function viewSettings() {
  if (!state.me) { go('/'); return; }
  app.innerHTML = `
    <h1 class="page-title">Your profile</h1>
    <form class="panel" id="prof" style="max-width:560px">
      <label class="field"><span>Username</span><input class="input" name="username" maxlength="24" value="${esc(state.me.username)}" required></label>
      <label class="field"><span>Bio</span><textarea class="input" name="bio" maxlength="300" rows="3" placeholder="Tell people what you make">${esc(state.me.bio)}</textarea></label>
      <label class="field"><span>Email</span><input class="input" value="${esc(state.me.email)}" disabled></label>
      <div class="row"><button class="btn primary">Save</button>${state.me.username ? `<a class="btn ghost" href="/dev/${esc(state.me.username)}" data-link>View public page</a>` : ''}<div class="spacer"></div><button type="button" class="btn danger" id="logout">Log out</button></div>
      <div class="err"></div>
    </form>
    ${await deskSettingsHtml()}`;
  deskSettingsBind();
  const f = $('#prof');
  f.onsubmit = async (e) => {
    e.preventDefault();
    try { const r = await api('/api/me', { method: 'PATCH', body: { username: f.username.value.trim(), bio: f.bio.value } }); state.me = r.user; renderNav(); toast('Profile saved', 'ok'); }
    catch (err) { $('.err', f).textContent = err.message; }
  };
  $('#logout').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); state.me = null; renderNav(); toast('Logged out'); go('/'); };
}

// ---------- Windows app integration ----------
// When the site runs inside GlitchBox for Windows, window.glitchbox is available and
// downloads become real installs with Play, Update and Uninstall buttons.
const desk = { api: window.glitchbox?.isDesktop ? window.glitchbox : null, state: { installs: {}, jobs: {}, running: {}, updates: {} }, info: null };
const fmtTime = (m) => !m ? '' : m >= 60 ? `${(m / 60).toFixed(m >= 600 ? 0 : 1)} hrs played` : `${m} min played`;
const fmtSpeed = (b) => b > 1e6 ? (b / 1e6).toFixed(1) + ' MB/s' : Math.round(b / 1e3) + ' KB/s';
const winFile = (g) => (g.files || []).filter((f) => f.platform === (desk.info?.platform || 'windows')).sort((a, b) => b.id - a.id)[0];

async function deskInit() {
  if (!desk.api) return;
  document.body.classList.add('desktop');
  [desk.info, desk.state] = await Promise.all([desk.api.info(), desk.api.state()]);
  desk.api.onEvent((e) => {
    if (e.type === 'state') { desk.state = e.state; deskRefresh(); }
    if (e.type === 'app-update') toast(`GlitchBox ${e.version} is ready. It installs next time you restart the app.`, 'ok');
  });
}

/** Placeholder that renders install / play controls for a game. */
function deskSlot(g, size = 'big') {
  if (!desk.api) return '';
  const f = winFile(g);
  if (!f && !desk.state.installs[g.id]) return '';
  return `<div class="desk ${size}" data-desk="${g.id}" data-size="${f?.size || 0}" data-title="${esc(g.title)}" data-version="${esc(f?.version || '')}"></div>`;
}
function deskRender(el) {
  const id = Number(el.dataset.desk);
  const big = el.classList.contains('big');
  const s = desk.state;
  const inst = s.installs[id], job = s.jobs[id], run = s.running[id], upd = s.updates[id];
  const b = (cls, act, label, icon = '') => `<button class="btn ${big ? 'big' : 'small'} ${cls}" data-dact="${act}" data-id="${id}">${icon}${label}</button>`;
  let html = '';
  if (job && ['downloading', 'paused', 'queued', 'installing', 'error'].includes(job.status)) {
    const pct = job.total ? Math.min(100, Math.floor(job.received / job.total * 100)) : 0;
    const label = { downloading: `${job.isUpdate ? 'Updating' : 'Downloading'} ${pct}% · ${fmtSpeed(job.speed || 0)}`, paused: `Paused at ${pct}%`, queued: 'Starting...', installing: 'Installing...', error: job.error || 'Something went wrong' }[job.status];
    html = `<div class="desk-job ${job.status}"><div class="desk-row"><span>${esc(label)}</span><span class="hint">${fmtSize(job.received || 0)} / ${fmtSize(job.total || 0)}</span></div>
      <div class="progress"><div style="width:${job.status === 'installing' ? 100 : pct}%"></div></div>
      <div class="row" style="margin-top:8px">${job.status === 'downloading' ? b('', 'pause', 'Pause') : ''}${['paused', 'error'].includes(job.status) ? b('primary', 'resume', job.status === 'error' ? 'Retry' : 'Resume') : ''}${job.status !== 'installing' ? b('ghost', 'cancel', 'Cancel') : ''}</div></div>`;
  } else if (run) {
    html = `${b('running', 'none', 'Running', I.play)}`;
  } else if (inst) {
    html = `${upd ? b('primary', 'install', `Update${upd.version ? ' to ' + esc(upd.version) : ''}`, I.download) : ''}
      ${b(upd ? '' : 'primary', 'play', inst.exe ? 'Play' : 'Open', I.play)}
      <div class="desk-more"><button class="btn ${big ? 'big' : 'small'} ghost" data-dact="menu" data-id="${id}" title="More">⋯</button>
        <div class="desk-menu" hidden><button data-dact="folder" data-id="${id}">Browse local files</button><button data-dact="uninstall" data-id="${id}">Uninstall</button></div></div>
      ${big ? `<div class="hint desk-meta">${[inst.version && 'v' + esc(inst.version), fmtSize(inst.size || 0) + ' on disk', fmtTime(inst.playtimeMinutes)].filter(Boolean).join(' · ')}</div>` : ''}`;
  } else {
    html = b('primary', 'install', `Install${el.dataset.size > 0 ? ' · ' + fmtSize(Number(el.dataset.size)) : ''}`, I.download);
  }
  el.innerHTML = html;
}
function deskRefresh() {
  $$('[data-desk]').forEach(deskRender);
  const active = Object.values(desk.state.jobs).filter((j) => ['downloading', 'queued', 'installing'].includes(j.status)).length;
  const badge = $('#desk-dl');
  if (badge) { badge.hidden = !active; badge.textContent = `${active} downloading`; }
}
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-dact]');
  if (!btn || !desk.api) return;
  const id = Number(btn.dataset.id), act = btn.dataset.dact;
  e.preventDefault();
  if (act === 'menu') { const m = btn.nextElementSibling; $$('.desk-menu').forEach((x) => x !== m && (x.hidden = true)); m.hidden = !m.hidden; return; }
  $$('.desk-menu').forEach((x) => (x.hidden = true));
  try {
    if (act === 'install') {
      if (!(await needLogin('Log in to install games.'))) return;
      await desk.api.install(id);
      api(`/api/library/${id}`, { method: 'POST' }).then(() => { const l = $('#lib'); if (l && !l.textContent.includes('wishlist')) l.innerHTML = I.check + 'In your library'; }).catch(() => {});
    }
    if (act === 'pause') await desk.api.pause(id);
    if (act === 'resume') await desk.api.resume(id);
    if (act === 'cancel') await desk.api.cancel(id);
    if (act === 'play') await desk.api.play(id);
    if (act === 'folder') await desk.api.openFolder(id);
    if (act === 'uninstall') { if (await desk.api.uninstall(id)) toast('Uninstalled'); }
  } catch (er) { toast(String(er.message || er).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 'error'); }
});
document.addEventListener('click', (e) => { if (!e.target.closest('.desk-more')) $$('.desk-menu').forEach((x) => (x.hidden = true)); });

async function deskSettingsHtml() {
  if (!desk.api) return '';
  const s = await desk.api.getSettings();
  const t = (k, label, hint) => `<label class="toggle" style="margin-bottom:12px"><input type="checkbox" data-dset="${k}" ${s[k] ? 'checked' : ''}><span>${label}<br><span class="hint" style="font-weight:400">${hint}</span></span></label>`;
  return `<h2 class="section-title">GlitchBox for Windows <span class="hint" style="font-weight:400">v${esc(desk.info.version)}</span></h2>
    <div class="panel" style="max-width:560px">
      ${t('autoUpdateGames', 'Update games automatically', 'New versions download in the background.')}
      ${t('closeToTray', 'Keep running in the tray when closed', 'So downloads and notifications keep going.')}
      ${t('notifications', 'Desktop notifications', 'Game updates, wishlist releases and @mentions.')}
      ${t('openAtLogin', 'Start GlitchBox when Windows starts', 'Opens quietly in the tray.')}
      <div class="field" style="margin-top:8px"><span class="lbl-t">Game library folder</span>
        <div class="row"><code class="path" id="libpath">${esc(s.libraryPath)}</code><button type="button" class="btn small" id="libmove">Change</button></div></div>
      <button type="button" class="btn small" id="chkupd">Check for game updates</button>
    </div>`;
}
function deskSettingsBind() {
  if (!desk.api) return;
  $$('[data-dset]').forEach((c) => c.onchange = () => desk.api.setSettings({ [c.dataset.dset]: c.checked }).then(() => toast('Saved', 'ok')));
  $('#libmove')?.addEventListener('click', async () => {
    try { $('#libpath').textContent = await desk.api.chooseLibraryFolder(); } catch (er) { toast(String(er.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 'error'); }
  });
  $('#chkupd')?.addEventListener('click', async () => {
    const found = await desk.api.checkUpdates();
    toast(found.length ? `Updating ${found.map((f) => f.title).join(', ')}` : 'All your games are up to date', 'ok');
  });
}

// ---------- Website (info only) ----------
// The full store, library, community and uploads live in the GlitchBox apps. In a normal
// browser the site is an info site that points people to the download.
const FULL_APP = () => !!desk.api;
let deskDownload = null;
const getDownload = async () => deskDownload ||= await api('/api/desktop').catch(() => ({ available: false }));
const dlButton = (d, cls = 'primary big') => d.available
  ? `<a class="btn ${cls}" href="${esc(d.url)}">${I.windows}Download for Windows${d.version ? ` <span class="dl-ver">v${esc(d.version)}</span>` : ''}</a>`
  : `<span class="btn ${cls} disabled" title="The first release is on its way">${I.windows}Windows download coming soon</span>`;

const webRoutes = [
  [/^\/$/, viewLanding, 'home'],
  [/^\/download$/, () => viewLanding('download'), 'home'],
  [/^\/developers$/, viewDevInfo, 'developers'],
  [/^\/game\/([^/]+)$/, viewGamePreview, ''],
];

function renderWebNav() {
  $('.nav-links').innerHTML = `
    <a href="/" data-link data-nav="home">Home</a>
    <a href="/#features" data-link data-nav="features">Features</a>
    <a href="/developers" data-link data-nav="developers">For developers</a>`;
  $('#nav-right').innerHTML = '<a class="btn primary small" href="/download" data-link>' + I.download + '<span>Get GlitchBox</span></a>';
}

async function viewLanding(focus) {
  document.title = 'GlitchBox · The home of independent games';
  const [d, games] = await Promise.all([getDownload(), api('/api/games?sort=popular').then((r) => r.games.slice(0, 8)).catch(() => [])]);
  const feats = [
    ['One-click installs', 'Every game installs with a single click. Downloads pause, resume and unpack themselves.'],
    ['Automatic updates', 'Games update in the background, and you can read the patch notes for every version.'],
    ['Your library', 'Everything you own in one place, with playtime for every game.'],
    ['Alpha and Beta testing', 'Play games before they are finished and chat with the developers about them.'],
    ['Wishlist alerts', 'Get a notification the moment a game you are waiting for comes out.'],
    ['Works offline', 'Installed games keep working with no internet connection.'],
  ];
  app.innerHTML = `
    <section class="land-hero">
      <div class="land-copy">
        <div class="hero-kicker">Free for players and developers</div>
        <h1>The home of <span class="grad">independent games</span>.</h1>
        <p>GlitchBox is a free game launcher for indie and AI-made games. Find new games, install them in one click and keep them up to date automatically.</p>
        <div class="row" id="download">${dlButton(d)}</div>
        <div class="hint" style="margin-top:12px">Windows 10 and 11, 64-bit.</div>
      </div>
      <img class="land-logo" src="/brand/logo-full.webp" alt="GlitchBox">
    </section>
    <section class="land-shot"><img src="/brand/app-store.webp" alt="The GlitchBox app showing the game store" loading="lazy"></section>
    <h2 class="land-h" id="features">Everything in one app</h2>
    <div class="land-grid">${feats.map(([t, x]) => `<div class="panel"><h3>${t}</h3><div class="hint">${x}</div></div>`).join('')}</div>
    ${games.length ? `<h2 class="land-h">Games on GlitchBox</h2>
      <div class="land-games">${games.map((g) => `<a class="land-game" href="/game/${esc(g.slug)}" data-link><div class="cover">${coverHtml(g)}</div><b>${esc(g.title)}</b><span class="hint">${esc(g.developer)}</span></a>`).join('')}</div>` : ''}
    <section class="land-cta panel">
      <div><h2>Make games? Put them on GlitchBox.</h2><p class="hint">Free to publish, with a proper store page, automatic updates for your players and a community to grow with.</p></div>
      <a class="btn big" href="/developers" data-link>For developers</a>
    </section>
    <h2 class="land-h">Questions</h2>
    <div class="faq">${[
      ['Is it really free?', 'Yes. GlitchBox is free for players and free for developers to publish on.'],
      ['Why do I need the app?', 'The app installs, updates and launches your games, tracks playtime and keeps your library in one place. The website is just here to tell you about it.'],
      ['Do I need a password?', 'No. You sign in with your email and a 6-digit code, and the app keeps you signed in.'],
      ['Can I play on Mac, Linux or my phone?', 'Not yet. For now GlitchBox is a Windows app with browser games and Windows games.'],
      ['Windows says it protected my PC?', 'Early versions of new apps can show this message. Click "More info" and then "Run anyway".'],
    ].map(([q, a]) => `<details class="panel"><summary>${q}</summary><p class="hint">${a}</p></details>`).join('')}</div>
    <section class="land-hero small"><div class="land-copy"><h2>Ready to play?</h2><div class="row">${dlButton(d)}</div></div></section>`;
  if (focus === 'download') $('#download')?.scrollIntoView({ block: 'center' });
  else if (location.hash) $(location.hash)?.scrollIntoView();
}

async function viewDevInfo() {
  document.title = 'For developers · GlitchBox';
  const d = await getDownload();
  const steps = [
    ['Get the app and sign in', 'Download GlitchBox for Windows and sign in with your email. No passwords.'],
    ['Create your store page', 'Add a title, description, cover, screenshots, tags, controls and age rating. A checklist shows what is missing before you can publish.'],
    ['Upload your build', 'Upload a browser game (.zip with index.html) or a Windows game (.zip, .exe or .msi). Big files are fine.'],
    ['Publish and update', 'Players install with one click. Upload a new version with patch notes and every player gets it automatically.'],
  ];
  app.innerHTML = `
    <section class="land-hero">
      <div class="land-copy">
        <div class="hero-kicker">For developers</div>
        <h1>Publish your game <span class="grad">for free</span>.</h1>
        <p>Indie studio, solo developer or AI game maker, GlitchBox gives your game a professional store page and gets it in front of players, with no fees.</p>
        <div class="row">${dlButton(d)}</div>
      </div>
    </section>
    <h2 class="land-h">How it works</h2>
    <div class="land-grid steps">${steps.map(([t, x], i) => `<div class="panel"><div class="step-n">${i + 1}</div><h3>${t}</h3><div class="hint">${x}</div></div>`).join('')}</div>
    <h2 class="land-h">What you can upload</h2>
    <div class="panel"><div class="formats">${[['Browser game', '.zip with index.html, or a single .html'], ['Windows game', '.zip of your game folder (best), or an .exe or .msi installer']]
      .map(([p, f]) => `<div><b>${p}</b><span class="hint">${f}</span></div>`).join('')}</div>
      <p class="hint" style="margin:14px 0 0">Windows games installed through the app update themselves when you upload a new version.</p></div>`;
}

// A shared game link opens a short preview with a download button. The full page is in the app.
async function viewGamePreview(slug) {
  let g;
  try { ({ game: g } = await api('/api/games/' + encodeURIComponent(slug))); } catch { return viewNeedsApp(); }
  document.title = `${g.title} · GlitchBox`;
  const d = await getDownload();
  const shots = g.screenshots.slice(0, 3);
  app.innerHTML = `
    <section class="preview panel">
      <div class="preview-cover">${g.banner ? `<img src="${esc(g.banner)}" alt="">` : coverHtml(g)}</div>
      <div class="preview-body">
        <div class="hero-kicker">${g.status === 'upcoming' ? 'Coming soon on GlitchBox' : TEST_LABEL[g.status] ? TEST_LABEL[g.status] + ' on GlitchBox' : 'Available on GlitchBox'}</div>
        <h1>${esc(g.title)}</h1>
        <div class="hint">by ${esc(g.developer)} · ${esc(g.genre)}</div>
        ${g.tagline ? `<p>${esc(g.tagline)}</p>` : ''}
        <div class="row">${dlButton(d)}<a class="btn big" href="glitchbox://game/${esc(g.slug)}">Open in GlitchBox</a></div>
        <div class="hint" style="margin-top:10px">Get the free GlitchBox app to install and play ${esc(g.title)}.</div>
      </div>
    </section>
    ${shots.length ? `<div class="preview-shots">${shots.map((s) => `<img src="${esc(s.url)}" alt="" loading="lazy">`).join('')}</div>` : ''}`;
}

function viewNeedsApp() {
  app.innerHTML = `<div class="empty"><h3>This part of GlitchBox is in the app</h3>
    <p>The store, your library, the community and uploads all live in GlitchBox for Windows.</p>
    <a class="btn primary" href="/download" data-link>${I.download}Get GlitchBox</a></div>`;
}

// ---------- boot ----------
(async function boot() {
  const [{ user }, meta] = await Promise.all([api('/api/me'), api('/api/meta')]);
  state.me = user; state.meta = meta;
  await deskInit().catch(() => {});
  if (!FULL_APP()) { document.body.classList.add('website'); renderWebNav(); return route(); }
  renderNav();
  await route();
  if (user && !user.username) loginModal();
})();
