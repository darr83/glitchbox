// GlitchBox for Windows: the store, library and community from the website, plus a real
// install manager, a Play button, playtime, game updates, a tray icon and notifications.
const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, session, shell, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { GameLibrary } = require('./library');

// ---------- config ----------
const bundled = (() => { try { return require('../app-config.json'); } catch { return {}; } })();
const SITE = (process.env.GLITCHBOX_URL || bundled.siteUrl || 'http://localhost:8787').replace(/\/$/, '');
const SITE_ORIGIN = new URL(SITE).origin;
const PARTITION = 'persist:glitchbox';
// Online games (hosted on the developer's own site) get their own storage, so they never see GlitchBox cookies
// but still keep their own logins between sessions.
const ONLINE_PARTITION = 'persist:glitchbox-online';
const OFFLINE = path.join(__dirname, 'offline', 'offline.html');
const ICON = path.join(__dirname, '..', 'build', 'icon.png');
const PLATFORM = process.env.GLITCHBOX_PLATFORM || (process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux');

if (process.env.GLITCHBOX_USER_DATA) app.setPath('userData', process.env.GLITCHBOX_USER_DATA);
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const DEFAULTS = { closeToTray: true, autoUpdateGames: true, openAtLogin: false, notifications: true, libraryPath: null, lastNotified: 0 };
let settings = { ...DEFAULTS };
function loadSettings() { try { settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch {} }
function saveSettings() { fs.mkdirSync(path.dirname(settingsFile()), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); }
function defaultLibraryPath() {
  return process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local'), 'GlitchBox', 'Games')
    : path.join(app.getPath('userData'), 'Games');
}

let win = null, tray = null, library = null, quitting = false, pendingPath = null;

// ---------- single instance & glitchbox:// links ----------
if (!app.requestSingleInstanceLock()) { app.quit(); }
app.setAsDefaultProtocolClient('glitchbox');
const linkPath = (argv) => {
  const url = argv.find((a) => a.startsWith('glitchbox://'));
  if (!url) return null;
  const p = '/' + url.slice('glitchbox://'.length).replace(/^\/+/, '');
  return /^\/[\w\-/]*$/.test(p) ? p : '/';
};
app.on('second-instance', (_e, argv) => { const p = linkPath(argv); showWindow(); if (p) openPath(p); });
app.on('open-url', (e, url) => { e.preventDefault(); const p = linkPath([url]); if (win) openPath(p); else pendingPath = p; });

const cookieHeader = async () => {
  const cookies = await session.fromPartition(PARTITION).cookies.get({ url: SITE });
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
};
const loggedIn = async () => (await cookieHeader()).includes('ns_session=');

// ---------- window ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1320, height: 840, minWidth: 980, minHeight: 640,
    title: 'GlitchBox', backgroundColor: '#0b0a14', icon: ICON, show: !process.argv.includes('--hidden'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0b0a14', symbolColor: '#e8e6f3', height: 64 },
    webPreferences: { preload: path.join(__dirname, 'preload.js'), partition: PARTITION, contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.webContents.setUserAgent(win.webContents.getUserAgent() + ' GlitchBoxDesktop/' + app.getVersion());
  // Links to other sites open in the normal browser.
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith('file:')) return;
    const u = new URL(url);
    if (u.origin === SITE_ORIGIN && u.pathname.startsWith('/play/')) { e.preventDefault(); openGameWindow(url); return; }
    if (u.origin === SITE_ORIGIN) return;
    e.preventDefault(); shell.openExternal(url);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (new URL(url).origin === SITE_ORIGIN) {
      // e.g. "open game in new window": no desktop bridge in there.
      return { action: 'allow', overrideBrowserWindowOptions: { backgroundColor: '#000', autoHideMenuBar: true, icon: ICON, webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true } } };
    }
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('did-fail-load', (_e, code, _desc, url, isMain) => {
    if (isMain && code !== -3 && !url.startsWith('file:')) win.loadFile(OFFLINE);
  });
  win.on('close', (e) => {
    if (!quitting && settings.closeToTray) { e.preventDefault(); win.hide(); }
  });
  openPath(pendingPath || linkPath(process.argv) || '/');
  pendingPath = null;
}
// Browser games get their own plain window with no desktop bridge.
function openGameWindow(url) {
  const w = new BrowserWindow({ width: 1280, height: 800, backgroundColor: '#000', autoHideMenuBar: true, icon: ICON, webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true } });
  w.loadURL(url);
}
// Online games open their own website in a plain window. The address comes from the GlitchBox API, never from the page.
const onlineWindows = new Map();
async function openOnlineGame(id) {
  id = Number(id);
  const open = onlineWindows.get(id);
  if (open && !open.isDestroyed()) { if (open.isMinimized()) open.restore(); open.focus(); return true; }
  const { game } = await (await library.api(`/api/games/${id}`)).json();
  let url;
  try { url = new URL(game?.onlineUrl || ''); } catch { throw new Error('This game has no online address'); }
  if (url.protocol !== 'https:') throw new Error('This game has no online address');
  const w = new BrowserWindow({
    width: 1280, height: 800, title: game.title, backgroundColor: '#000', autoHideMenuBar: true, icon: ICON,
    webPreferences: { partition: ONLINE_PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  // Links within the game stay in the window, links to other sites open in the normal browser.
  w.webContents.setWindowOpenHandler(({ url: to }) => {
    try {
      if (new URL(to).origin === url.origin) return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, icon: ICON, webPreferences: { partition: ONLINE_PARTITION, sandbox: true, contextIsolation: true } } };
      if (/^https?:/.test(to)) shell.openExternal(to);
    } catch {}
    return { action: 'deny' };
  });
  w.webContents.on('will-navigate', (e, to) => { if (!/^https:/.test(to)) { e.preventDefault(); if (/^http:/.test(to)) shell.openExternal(to); } });
  // Count the time the window was open as playtime, like installed games.
  const started = Date.now();
  onlineWindows.set(id, w);
  w.on('closed', () => {
    onlineWindows.delete(id);
    const minutes = Math.round((Date.now() - started) / 60000);
    if (minutes > 0) library.api(`/api/library/${id}/playtime`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ minutes: Math.min(minutes, 24 * 60) }) }).catch(() => {});
  });
  w.loadURL(url.href).catch(() => {});
  return true;
}
function openPath(p = '/') { win?.loadURL(SITE + p).catch(() => {}); }
function showWindow() { if (!win) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
const send = (evt) => { if (win && !win.isDestroyed()) win.webContents.send('gb:event', evt); };

// ---------- tray ----------
function buildTray() {
  const recent = Object.values(library.installs).sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0)).slice(0, 5);
  const menu = Menu.buildFromTemplate([
    { label: 'Open GlitchBox', click: showWindow },
    { label: 'Store', click: () => { showWindow(); openPath('/'); } },
    { label: 'Library', click: () => { showWindow(); openPath('/library'); } },
    { label: 'Community', click: () => { showWindow(); openPath('/community'); } },
    ...(recent.length ? [{ type: 'separator' }, ...recent.map((g) => ({ label: `Play ${g.title}`, click: () => playGame(g.gameId) }))] : []),
    ...(updateReady ? [{ type: 'separator' }, { label: 'Restart to update GlitchBox', click: () => { quitting = true; require('electron-updater').autoUpdater.quitAndInstall(); } }] : []),
    { type: 'separator' },
    { label: 'Quit GlitchBox', click: () => { quitting = true; app.quit(); } },
  ]);
  if (!tray) {
    tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
    tray.setToolTip('GlitchBox');
    tray.on('click', showWindow);
  }
  tray.setContextMenu(menu);
}

function notify(title, body, p) {
  if (!settings.notifications || !Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: ICON });
  n.on('click', () => { showWindow(); if (p) openPath(p); });
  n.show();
}

// ---------- games ----------
function playGame(id) {
  try {
    const r = library.play(id, { openPath: (d) => shell.openPath(d) });
    if (r === 'started') win?.minimize();
    return r;
  } catch (e) { notify('Could not start the game', e.message); throw e; }
}

async function checkGameUpdates() {
  if (!(await loggedIn())) return [];
  try {
    const found = await library.checkUpdates();
    if (settings.autoUpdateGames) {
      for (const u of found) if (!library.running.has(u.gameId)) library.install(u.gameId).catch(() => {});
    }
    return found;
  } catch { return []; }
}

async function pollNotifications() {
  if (!settings.notifications || !(await loggedIn())) return;
  try {
    if (!settings.lastNotified) { settings.lastNotified = Date.now(); saveSettings(); return; }
    const r = await fetch(`${SITE}/api/notifications?since=${settings.lastNotified}`, { headers: { Cookie: await cookieHeader() } });
    if (!r.ok) return;
    const { now, items } = await r.json();
    settings.lastNotified = now; saveSettings();
    for (const it of items.slice(0, 5).reverse()) {
      if (it.type === 'update' && library.installs[it.gameId]) continue; // the install manager tells them about these
      notify(it.title, it.body, it.path);
    }
  } catch {}
}

// ---------- app self-update ----------
let updateReady = false;
function setupAutoUpdate() {
  if (!app.isPackaged) return;
  const { autoUpdater } = require('electron-updater');
  autoUpdater.setFeedURL({ provider: 'generic', url: `${SITE}/desktop` });
  autoUpdater.autoDownload = true;
  autoUpdater.on('update-downloaded', (info) => {
    updateReady = true; buildTray();
    send({ type: 'app-update', version: info.version });
    notify('GlitchBox update ready', `Version ${info.version} installs when you restart GlitchBox.`);
  });
  autoUpdater.on('error', () => {});
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  check(); setInterval(check, 4 * 3600 * 1000);
}

// ---------- IPC (only from GlitchBox pages) ----------
function trusted(e) {
  if (!win || e.senderFrame !== win.webContents.mainFrame) return false; // only the main GlitchBox window, never a game frame
  const url = e.senderFrame?.url || '';
  if (url.startsWith('file:')) return url.includes('/offline/offline.html');
  try { const u = new URL(url); return u.origin === SITE_ORIGIN && !u.pathname.startsWith('/play/'); } catch { return false; }
}
function handle(channel, fn) {
  ipcMain.handle(channel, async (e, ...args) => {
    if (!trusted(e)) throw new Error('Not allowed');
    return fn(...args);
  });
}
function registerIpc() {
  handle('gb:info', () => ({ version: app.getVersion(), platform: PLATFORM, site: SITE, libraryPath: library.root, updateReady }));
  handle('gb:state', () => library.snapshot());
  handle('gb:install', (id) => library.install(id));
  handle('gb:pause', (id) => library.pause(id));
  handle('gb:resume', (id) => library.resume(id));
  handle('gb:cancel', (id) => library.cancel(id));
  handle('gb:uninstall', async (id) => {
    const inst = library.installs[id];
    if (!inst) return false;
    const { response } = await dialog.showMessageBox(win, { type: 'question', buttons: ['Uninstall', 'Cancel'], defaultId: 1, cancelId: 1, title: 'Uninstall', message: `Uninstall ${inst.title}?`, detail: 'This deletes the game files from this PC. You can install it again any time.' });
    if (response !== 0) return false;
    await library.uninstall(id); buildTray(); return true;
  });
  handle('gb:play', (id) => playGame(id));
  handle('gb:openOnline', (id) => openOnlineGame(id));
  handle('gb:openFolder', (id) => { const i = library.installs[id]; if (i) shell.openPath(i.dir); });
  handle('gb:checkUpdates', () => checkGameUpdates());
  handle('gb:getSettings', () => ({ ...settings, libraryPath: library.root }));
  handle('gb:setSettings', (patch) => {
    for (const k of ['closeToTray', 'autoUpdateGames', 'openAtLogin', 'notifications']) if (typeof patch?.[k] === 'boolean') settings[k] = patch[k];
    app.setLoginItemSettings({ openAtLogin: settings.openAtLogin, args: ['--hidden'] });
    saveSettings();
    return settings;
  });
  handle('gb:chooseLibraryFolder', async () => {
    if (Object.keys(library.installs).length || library.jobs.size) throw new Error('Uninstall your games before moving the library folder.');
    const r = await dialog.showOpenDialog(win, { title: 'Choose where to install games', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return library.root;
    settings.libraryPath = path.join(r.filePaths[0], 'GlitchBox Games'); saveSettings();
    startLibrary(); return library.root;
  });
  handle('gb:retryOnline', () => openPath('/library'));
}

function startLibrary() {
  library = new GameLibrary({ root: settings.libraryPath || defaultLibraryPath(), siteUrl: SITE, getCookie: cookieHeader, platform: PLATFORM });
  library.on('change', (s) => send({ type: 'state', state: s }));
  library.on('installed', ({ title, version, isUpdate }) => { buildTray(); notify(isUpdate ? `${title} updated` : `${title} is ready to play`, isUpdate ? `Now on version ${version || 'latest'}.` : 'Find it in your library.', '/library'); });
  library.on('failed', ({ title, error }) => notify(`Could not install ${title}`, error, '/library'));
  library.on('stopped', () => { buildTray(); });
}

// ---------- start ----------
app.whenReady().then(() => {
  loadSettings();
  startLibrary();
  registerIpc();
  createWindow();
  buildTray();
  setupAutoUpdate();
  setTimeout(checkGameUpdates, 8000);
  setInterval(checkGameUpdates, 30 * 60 * 1000);
  setTimeout(pollNotifications, 15000);
  setInterval(pollNotifications, 5 * 60 * 1000);
});
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { if (process.platform !== 'darwin' && !settings.closeToTray) app.quit(); });
app.on('activate', showWindow);

module.exports = { SITE };
