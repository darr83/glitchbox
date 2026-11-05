// Gives GlitchBox pages (and only them) a small, safe API for installing and playing games.
// Browser games run in sandboxed frames on a different origin, so they never see this.
const { contextBridge, ipcRenderer } = require('electron');

const call = (ch, ...a) => ipcRenderer.invoke(ch, ...a);
const listeners = new Set();
ipcRenderer.on('gb:event', (_e, evt) => listeners.forEach((fn) => { try { fn(evt); } catch {} }));

// Never expose the bridge to uploaded games (served from /play/ in an isolated, sandboxed origin).
const isGame = location.pathname.startsWith('/play/') || window.origin === 'null';
if (!isGame) contextBridge.exposeInMainWorld('glitchbox', {
  isDesktop: true,
  info: () => call('gb:info'),
  state: () => call('gb:state'),
  install: (id) => call('gb:install', id),
  pause: (id) => call('gb:pause', id),
  resume: (id) => call('gb:resume', id),
  cancel: (id) => call('gb:cancel', id),
  uninstall: (id) => call('gb:uninstall', id),
  play: (id) => call('gb:play', id),
  openOnline: (id) => call('gb:openOnline', id),
  openFolder: (id) => call('gb:openFolder', id),
  checkUpdates: () => call('gb:checkUpdates'),
  getSettings: () => call('gb:getSettings'),
  setSettings: (patch) => call('gb:setSettings', patch),
  chooseLibraryFolder: () => call('gb:chooseLibraryFolder'),
  retryOnline: () => call('gb:retryOnline'),
  onEvent: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
});
