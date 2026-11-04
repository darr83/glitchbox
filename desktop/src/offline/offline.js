const list = document.getElementById('list');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hours = (m) => (m >= 60 ? `${(m / 60).toFixed(1)} hours played` : m ? `${m} minutes played` : 'Not played yet');
async function draw(state) {
  state = state || await window.glitchbox.state();
  const games = Object.values(state.installs).sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
  list.innerHTML = games.length ? games.map((g) => `<div class="item"><b>${esc(g.title)}<small>${hours(g.playtimeMinutes)}${g.version ? ' · v' + esc(g.version) : ''}</small></b>
    <button class="ghost" data-folder="${g.gameId}">Files</button><button data-play="${g.gameId}">${state.running[g.gameId] ? 'Running' : 'Play'}</button></div>`).join('')
    : '<div class="empty">No installed games yet. Reconnect to browse the store.</div>';
}
list.onclick = (e) => {
  const p = e.target.dataset.play, f = e.target.dataset.folder;
  if (p) window.glitchbox.play(Number(p)).catch((er) => alert(er.message));
  if (f) window.glitchbox.openFolder(Number(f));
};
document.getElementById('retry').onclick = () => window.glitchbox.retryOnline();
window.glitchbox.onEvent((e) => { if (e.type === 'state') draw(e.state); });
draw();
