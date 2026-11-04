// Install manager for GlitchBox: downloads, pause/resume, unzip, updates, uninstall and launching games.
// Has no Electron imports, so it can be tested with plain Node.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { EventEmitter } = require('events');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { spawn } = require('child_process');
const extractZip = require('extract-zip');

const SKIP_EXE = /(unins|uninstall|setup|install|crash|vc_?redist|directx|dxsetup|unitycrashhandler|ue4prereq|dotnet|launcherhelper)/i;

class GameLibrary extends EventEmitter {
  /**
   * @param {object} o
   * @param {string} o.root           Folder for games, downloads and the install list.
   * @param {string} o.siteUrl        GlitchBox site, e.g. https://glitchbox.example.com
   * @param {() => Promise<string>} o.getCookie  Returns the Cookie header for the logged-in user.
   * @param {string} [o.platform]     Which builds to install: windows, mac or linux.
   */
  constructor({ root, siteUrl, getCookie, platform = 'windows' }) {
    super();
    this.root = root;
    this.siteUrl = siteUrl.replace(/\/$/, '');
    this.getCookie = getCookie;
    this.platform = platform;
    this.gamesDir = path.join(root, 'games');
    this.dlDir = path.join(root, 'downloads');
    this.stateFile = path.join(root, 'installs.json');
    fs.mkdirSync(this.gamesDir, { recursive: true });
    fs.mkdirSync(this.dlDir, { recursive: true });
    this.installs = {};
    try { this.installs = JSON.parse(fs.readFileSync(this.stateFile, 'utf8')); } catch { /* first run */ }
    this.jobs = new Map(); // gameId -> download/install job
    this.running = new Map(); // gameId -> { child, startedAt }
    this.updates = {}; // gameId -> latest file, when newer than installed
  }

  // ---------- state ----------
  save() {
    const tmp = this.stateFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.installs, null, 2));
    fs.renameSync(tmp, this.stateFile);
  }
  snapshot() {
    const jobs = {};
    for (const [id, j] of this.jobs) jobs[id] = { status: j.status, received: j.received, total: j.total, speed: j.speed, error: j.error, isUpdate: j.isUpdate };
    return { installs: this.installs, jobs, running: Object.fromEntries([...this.running].map(([id, r]) => [id, { startedAt: r.startedAt }])), updates: this.updates };
  }
  changed() { this.emit('change', this.snapshot()); }

  async api(pathname, init = {}) {
    const headers = { 'X-NS': '1', Cookie: await this.getCookie(), ...(init.headers || {}) };
    const r = await fetch(this.siteUrl + pathname, { ...init, headers });
    if (!r.ok) {
      let msg = `Request failed (${r.status})`;
      try { msg = (await r.json()).error || msg; } catch {}
      throw new Error(msg);
    }
    return r;
  }

  /** Picks the newest build for this computer's platform. */
  pickFile(game) {
    const files = (game.files || []).filter((f) => f.platform === this.platform).sort((a, b) => b.id - a.id);
    return files[0] || null;
  }

  // ---------- install / update ----------
  async install(gameId) {
    gameId = Number(gameId);
    if (this.jobs.has(gameId) && this.jobs.get(gameId).status !== 'error') return;
    if (this.running.has(gameId)) throw new Error('Close the game before updating it');
    const { game } = await (await this.api(`/api/games/${gameId}`)).json();
    const file = this.pickFile(game);
    if (!file) throw new Error(`${game.title} has no ${this.platform} download yet`);
    const existing = this.installs[gameId];
    if (existing && existing.fileId === file.id) return; // already up to date
    await this.ensureSpace(file.size * (/\.zip$/i.test(file.filename) ? 3 : 1.2));
    const job = {
      game: { id: game.id, title: game.title, slug: game.slug, cover: game.cover }, file,
      status: 'queued', received: 0, total: file.size, speed: 0, error: null, isUpdate: !!existing,
      part: path.join(this.dlDir, `${game.id}-${file.id}.part`),
    };
    this.jobs.set(gameId, job);
    this.changed();
    this.runJob(gameId);
  }

  async ensureSpace(bytes) {
    try {
      const st = await fsp.statfs(this.root);
      const free = st.bavail * st.bsize;
      if (free < bytes) throw new Error(`Not enough disk space. Needs ${fmt(bytes)}, ${fmt(free)} free.`);
    } catch (e) {
      if (/disk space/.test(e.message)) throw e; // statfs not supported: carry on
    }
  }

  async runJob(gameId) {
    const job = this.jobs.get(gameId);
    if (!job) return;
    job.status = 'downloading'; job.error = null;
    job.controller = new AbortController();
    this.changed();
    try {
      await this.download(job);
      job.status = 'installing'; this.changed();
      await this.finishInstall(job);
      this.jobs.delete(gameId);
      delete this.updates[gameId];
      this.changed();
      this.emit('installed', { gameId, title: job.game.title, version: job.file.version, isUpdate: job.isUpdate });
    } catch (e) {
      if (job.status === 'paused' || job.status === 'cancelled') return;
      job.status = 'error'; job.error = e.message;
      this.changed();
      this.emit('failed', { gameId, title: job.game.title, error: e.message });
    }
  }

  async download(job) {
    let have = 0;
    try { have = (await fsp.stat(job.part)).size; } catch {}
    if (have >= job.total && job.total > 0) { job.received = have; return; }
    const res = await fetch(`${this.siteUrl}/api/download/${job.file.id}`, {
      headers: { Cookie: await this.getCookie(), ...(have ? { Range: `bytes=${have}-` } : {}) },
      signal: job.controller.signal,
    });
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    if (have && res.status !== 206) have = 0; // server ignored the range: start over
    job.received = have;
    let lastTick = Date.now(), lastBytes = have;
    const counter = new (require('stream').Transform)({
      transform: (chunk, _enc, cb) => {
        job.received += chunk.length;
        const t = Date.now();
        if (t - lastTick > 300) {
          job.speed = Math.round((job.received - lastBytes) / ((t - lastTick) / 1000));
          lastTick = t; lastBytes = job.received;
          this.changed();
        }
        cb(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(res.body), counter, fs.createWriteStream(job.part, { flags: have ? 'a' : 'w' }), { signal: job.controller.signal });
    const size = (await fsp.stat(job.part)).size;
    if (job.total && size !== job.total) throw new Error('The download was incomplete. Try again.');
  }

  async finishInstall(job) {
    const { game, file } = job;
    const old = this.installs[game.id];
    const safeName = `${game.slug || 'game'}-${game.id}`.replace(/[^a-z0-9-]/gi, '_');
    const dir = path.join(this.gamesDir, safeName);
    const staging = dir + '.new';
    await fsp.rm(staging, { recursive: true, force: true });
    await fsp.mkdir(staging, { recursive: true });
    const lower = file.filename.toLowerCase();
    let kind = 'files';
    if (lower.endsWith('.zip')) {
      await extractZip(job.part, { dir: staging }); // extract-zip refuses paths outside the folder
      await fsp.rm(job.part, { force: true });
      kind = 'zip';
      // Many zips wrap everything in one folder. Flatten that so launch paths stay simple.
      const top = (await fsp.readdir(staging)).filter((n) => n !== '__MACOSX');
      if (top.length === 1 && (await fsp.stat(path.join(staging, top[0]))).isDirectory() && !file.launchPath) {
        const inner = path.join(staging, top[0]);
        for (const n of await fsp.readdir(inner)) await fsp.rename(path.join(inner, n), path.join(staging, n));
        await fsp.rmdir(inner);
      }
    } else {
      await fsp.rename(job.part, path.join(staging, path.basename(file.filename)));
      kind = lower.endsWith('.exe') ? 'exe' : 'files';
    }
    // Updates: keep files the player created (saves, settings) that the new build does not replace.
    if (old && fs.existsSync(old.dir)) {
      await copyMissing(old.dir, staging);
      await fsp.rm(old.dir, { recursive: true, force: true });
    }
    await fsp.rm(dir, { recursive: true, force: true });
    await fsp.rename(staging, dir);
    const exe = await this.findLaunchFile(dir, file.launchPath, kind);
    this.installs[game.id] = {
      gameId: game.id, title: game.title, slug: game.slug, cover: game.cover,
      fileId: file.id, filename: file.filename, version: file.version || '', kind, dir, exe,
      size: await dirSize(dir), installedAt: old?.installedAt || Date.now(), updatedAt: Date.now(),
      playtimeMinutes: old?.playtimeMinutes || 0, lastPlayed: old?.lastPlayed || null,
    };
    this.save();
  }

  /** Finds what to run: the developer's launch file, else the most likely .exe. */
  async findLaunchFile(dir, launchPath, kind) {
    if (launchPath) {
      const p = path.resolve(dir, launchPath);
      if (p.startsWith(dir + path.sep) && fs.existsSync(p)) return path.relative(dir, p);
    }
    if (kind === 'files') return null;
    const found = [];
    const walk = async (d, depth) => {
      if (depth > 3) return;
      for (const e of await fsp.readdir(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) await walk(p, depth + 1);
        else if (/\.exe$/i.test(e.name) && !SKIP_EXE.test(e.name)) found.push({ p, depth, size: (await fsp.stat(p)).size });
      }
    };
    await walk(dir, 0);
    found.sort((a, b) => a.depth - b.depth || b.size - a.size);
    return found[0] ? path.relative(dir, found[0].p) : null;
  }

  pause(gameId) {
    const job = this.jobs.get(Number(gameId));
    if (!job || job.status !== 'downloading') return;
    job.status = 'paused'; job.speed = 0;
    job.controller.abort();
    this.changed();
  }
  resume(gameId) {
    const job = this.jobs.get(Number(gameId));
    if (!job || !['paused', 'error'].includes(job.status)) return;
    this.runJob(Number(gameId));
  }
  async cancel(gameId) {
    gameId = Number(gameId);
    const job = this.jobs.get(gameId);
    if (!job) return;
    const wasDownloading = job.status === 'downloading';
    job.status = 'cancelled';
    if (wasDownloading) job.controller.abort();
    this.jobs.delete(gameId);
    await new Promise((r) => setTimeout(r, 50));
    await fsp.rm(job.part, { force: true });
    this.changed();
  }

  async uninstall(gameId) {
    gameId = Number(gameId);
    if (this.running.has(gameId)) throw new Error('Close the game first');
    const inst = this.installs[gameId];
    if (!inst) return;
    await fsp.rm(inst.dir, { recursive: true, force: true });
    delete this.installs[gameId];
    delete this.updates[gameId];
    this.save();
    this.changed();
  }

  // ---------- play ----------
  /** Starts a game. Returns 'started', or 'opened' when there is nothing to run directly (e.g. an .msi). */
  play(gameId, { openPath } = {}) {
    gameId = Number(gameId);
    const inst = this.installs[gameId];
    if (!inst) throw new Error('Install the game first');
    if (this.running.has(gameId)) return 'running';
    if (!inst.exe) {
      if (openPath) openPath(inst.dir);
      return 'opened';
    }
    const exe = path.resolve(inst.dir, inst.exe);
    if (!exe.startsWith(inst.dir + path.sep) || !fs.existsSync(exe)) throw new Error('The game files are missing. Try reinstalling.');
    const child = spawn(exe, [], { cwd: path.dirname(exe), stdio: 'ignore', windowsHide: false });
    const startedAt = Date.now();
    this.running.set(gameId, { child, startedAt });
    inst.lastPlayed = startedAt;
    this.save();
    this.changed();
    const done = (err) => {
      if (!this.running.has(gameId)) return;
      this.running.delete(gameId);
      const minutes = Math.round((Date.now() - startedAt) / 60000);
      inst.playtimeMinutes = (inst.playtimeMinutes || 0) + minutes;
      this.save();
      this.changed();
      this.emit('stopped', { gameId, minutes, error: err?.message });
      this.api(`/api/library/${gameId}/playtime`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ minutes }) }).catch(() => {});
    };
    child.on('exit', () => done());
    child.on('error', (e) => done(e));
    return 'started';
  }

  // ---------- updates ----------
  /** Compares installed builds with the site. Returns the games that have a newer build. */
  async checkUpdates() {
    const ids = Object.keys(this.installs);
    if (!ids.length) return [];
    const { library } = await (await this.api('/api/library')).json();
    const byId = Object.fromEntries(library.map((g) => [g.id, g]));
    const found = [];
    for (const id of ids) {
      let game = byId[id];
      if (!game) { try { game = (await (await this.api(`/api/games/${id}`)).json()).game; } catch { continue; } }
      const latest = this.pickFile(game);
      if (latest && latest.id !== this.installs[id].fileId) {
        this.updates[id] = { fileId: latest.id, version: latest.version, notes: latest.notes };
        found.push({ gameId: Number(id), title: game.title, version: latest.version });
      } else delete this.updates[id];
    }
    this.changed();
    return found;
  }
}

async function copyMissing(from, to) {
  for (const e of await fsp.readdir(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) { await fsp.mkdir(b, { recursive: true }); await copyMissing(a, b); }
    else if (!fs.existsSync(b)) await fsp.copyFile(a, b);
  }
}
async function dirSize(d) {
  let total = 0;
  for (const e of await fsp.readdir(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    total += e.isDirectory() ? await dirSize(p) : (await fsp.stat(p)).size;
  }
  return total;
}
function fmt(b) { return b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : Math.round(b / 1e6) + ' MB'; }

module.exports = { GameLibrary };
