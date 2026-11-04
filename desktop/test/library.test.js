// End-to-end test of the install manager against a running GlitchBox dev server.
// Usage: GLITCHBOX_URL=http://localhost:8787 node test/library.test.js
// The dev server must run with DEV_MODE=1 so login codes come back in the response.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const { GameLibrary } = require('../src/library');

const SITE = process.env.GLITCHBOX_URL || 'http://localhost:8787';
let cookie = '';
const api = async (p, init = {}) => {
  const r = await fetch(SITE + p, { ...init, headers: { 'X-NS': '1', 'Content-Type': 'application/json', Cookie: cookie, ...(init.headers || {}) } });
  const set = r.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${p}: ${data.error || r.status}`);
  return data;
};
const once = (em, ev, test = () => true) => new Promise((res, rej) => {
  const on = (x) => { if (test(x)) { em.off(ev, on); res(x); } };
  em.on(ev, on); em.once('failed', (e) => rej(new Error(e.error)));
});

// Minimal zip writer (stored, no compression) that keeps Unix permissions, so the test game is executable.
function makeZip(files) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const locals = [], centrals = []; let offset = 0;
  for (const [name, data, mode = 0o644] of files) {
    const n = Buffer.from(name), d = Buffer.from(data), crc = crc32(d);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(d.length, 18); lh.writeUInt32LE(d.length, 22); lh.writeUInt16LE(n.length, 26);
    locals.push(lh, n, d);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(0x031e, 4); ch.writeUInt16LE(20, 6); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(d.length, 20); ch.writeUInt32LE(d.length, 24);
    ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(((0o100000 | mode) << 16) >>> 0, 38); ch.writeUInt32LE(offset, 42);
    centrals.push(ch, n);
    offset += 30 + n.length + d.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

async function uploadBuild(gameId, zip, version, notes) {
  const { key } = await api('/api/uploads/key', { method: 'POST', body: JSON.stringify({ gameId, kind: 'files', filename: `game-${version}.zip` }) });
  const CHUNK = 50 * 1024 * 1024;
  if (zip.length <= 95 * 1024 * 1024) {
    await api(`/api/uploads/blob?key=${encodeURIComponent(key)}`, { method: 'PUT', body: zip, headers: { 'Content-Type': 'application/zip' } });
  } else {
    const { uploadId } = await api('/api/uploads/mpu', { method: 'POST', body: JSON.stringify({ key, size: zip.length }) });
    const parts = [];
    for (let i = 0, n = 1; i < zip.length; i += CHUNK, n++) {
      parts.push((await api(`/api/uploads/mpu?key=${encodeURIComponent(key)}&uploadId=${encodeURIComponent(uploadId)}&part=${n}`, { method: 'PUT', body: zip.subarray(i, i + CHUNK) })).part);
    }
    await api('/api/uploads/mpu/complete', { method: 'POST', body: JSON.stringify({ key, uploadId, parts }) });
  }
  await api(`/api/games/${gameId}/files`, { method: 'POST', body: JSON.stringify({ platform: 'windows', key, filename: `game-${version}.zip`, version, notes, launchPath: 'MyGame/run.sh' }) });
}

(async () => {
  const email = `desk${Date.now()}@example.com`;
  const { devCode } = await api('/api/auth/request', { method: 'POST', body: JSON.stringify({ email }) });
  await api('/api/auth/verify', { method: 'POST', body: JSON.stringify({ email, code: devCode }) });
  await api('/api/me', { method: 'PATCH', body: JSON.stringify({ username: 'desk_' + (Date.now() % 1e6) }) });
  const { game } = await api('/api/games', { method: 'POST', body: JSON.stringify({ title: 'Desktop Test Game' }) });

  const marker = path.join(os.tmpdir(), `gb-played-${game.id}`);
  const big = crypto.randomBytes(120 * 1024 * 1024); // big enough to pause mid-download and to use chunked upload
  const script = `#!/bin/sh\necho played > "${marker}"\nsleep 1\n`;
  await uploadBuild(game.id, makeZip([['MyGame/run.sh', script, 0o755], ['MyGame/Data/level.dat', big], ['MyGame/readme.txt', 'v1']]), '1.0.0', 'First release');
  const bigHash = crypto.createHash('sha256').update(big).digest('hex');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gb-lib-'));
  const lib = new GameLibrary({ root, siteUrl: SITE, getCookie: async () => cookie, platform: 'windows' });

  // 1. install with pause and resume
  await lib.install(game.id);
  await once(lib, 'change', (s) => s.jobs[game.id]?.received > 20 * 1024 * 1024);
  lib.pause(game.id);
  await new Promise((r) => setTimeout(r, 300));
  const part = fs.readdirSync(path.join(root, 'downloads'))[0];
  const partSize = fs.statSync(path.join(root, 'downloads', part)).size;
  assert(partSize > 0 && partSize < big.length, 'partial download kept on disk');
  console.log(`paused at ${(partSize / 1e6).toFixed(0)} MB`);
  lib.resume(game.id);
  await once(lib, 'installed');
  const inst = lib.installs[game.id];
  assert.equal(inst.version, '1.0.0');
  assert.equal(inst.exe, path.join('MyGame', 'run.sh'));
  const got = crypto.createHash('sha256').update(fs.readFileSync(path.join(inst.dir, 'MyGame/Data/level.dat'))).digest('hex');
  assert.equal(got, bigHash, 'file intact after pause/resume');
  console.log('installed v1.0.0, file intact after resume:', inst.dir);

  // 2. play + playtime
  assert.equal(lib.play(game.id), 'started');
  assert(lib.snapshot().running[game.id], 'shows as running');
  await once(lib, 'stopped');
  assert.equal(fs.readFileSync(marker, 'utf8').trim(), 'played');
  console.log('played, game process ran and exited');

  // 3. update keeps player saves
  fs.writeFileSync(path.join(inst.dir, 'MyGame', 'save.dat'), 'my progress');
  await uploadBuild(game.id, makeZip([['MyGame/run.sh', script, 0o755], ['MyGame/readme.txt', 'v2']]), '1.0.1', 'Bug fixes');
  const found = await lib.checkUpdates();
  assert.equal(found.length, 1); assert.equal(found[0].version, '1.0.1');
  await lib.install(game.id);
  await once(lib, 'installed');
  const inst2 = lib.installs[game.id];
  assert.equal(inst2.version, '1.0.1');
  assert.equal(fs.readFileSync(path.join(inst2.dir, 'MyGame/readme.txt'), 'utf8'), 'v2');
  assert.equal(fs.readFileSync(path.join(inst2.dir, 'MyGame/save.dat'), 'utf8'), 'my progress');
  assert.equal((await lib.checkUpdates()).length, 0);
  console.log('updated to v1.0.1, save file kept');

  // 4. playtime reached the server, notifications endpoint works
  const { library } = await api('/api/library');
  assert(library.find((g) => g.id === game.id), 'game is in the library');
  await api('/api/notifications?since=0');

  // 5. state survives a restart, then uninstall
  const lib2 = new GameLibrary({ root, siteUrl: SITE, getCookie: async () => cookie, platform: 'windows' });
  assert.equal(lib2.installs[game.id].version, '1.0.1');
  await lib2.uninstall(game.id);
  assert(!fs.existsSync(inst2.dir), 'files deleted');
  console.log('uninstalled');
  fs.rmSync(root, { recursive: true, force: true });
  console.log('ALL PASSED');
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
