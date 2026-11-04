// Adds a demo developer, 3 demo games and a few chat messages.
// Usage: npm run seed            (local dev database)
//        npm run seed -- --remote (your live Cloudflare database)
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const where = process.argv.includes('--remote') ? '--remote' : '--local';
const demo = join(dirname(fileURLToPath(import.meta.url)), 'demo');
const wrangler = (...args) => execFileSync('npx', ['wrangler', ...args, where], { stdio: ['ignore', 'pipe', 'inherit'] }).toString();
const now = Date.now();
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

const games = [
  { id: 1, slug: 'orbit-dodge', title: 'Orbit Dodge', tagline: 'Survive the asteroid storm for as long as you can.', genre: 'Arcade', tags: 'space,arcade,one more go', ai: 0,
    desc: 'A one-mouse arcade game. Asteroids fly in from every direction and get faster over time, and every run is different.\n\nFeatures:\n- Endless, ever-faster asteroid waves\n- Beat your best score\n- Works with a mouse or a touch screen\n\nControls: move the mouse (or your finger) to dodge. Click to start.', web: 'orbit-dodge.html', w: 960, h: 600, controls: 'mouse,touch' },
  { id: 2, slug: 'neon-snake', title: 'Neon Snake', tagline: 'The classic, but glowing. Made in an afternoon with an AI pair programmer.', genre: 'Casual', tags: 'retro,snake,keyboard', ai: 1,
    desc: 'The snake you know, rebuilt with glowing neon visuals. Eat the pink squares, grow longer and try not to bite yourself. Walls wrap around, so plan ahead.\n\nMade in a single afternoon with an AI pair programmer.\n\nControls: arrow keys or WASD. Space to start.', web: 'neon-snake.html', w: 600, h: 600, controls: 'keyboard' },
  { id: 3, slug: 'skyforge', title: 'Skyforge', tagline: 'Build floating islands and trade between them. Coming next spring.', genre: 'Simulation', tags: 'building,cozy,trading', ai: 0, status: 'upcoming',
    desc: 'Skyforge is a cozy builder about floating islands, airships and trade routes. Grow tiny villages in the clouds, link them with sky-ship routes and watch your trading network come alive.\n\nWe are looking for playtesters, come say hi in #upcoming!', controls: 'keyboard,mouse,gamepad', release: 'Spring 2027' },
];

let sql = `INSERT OR IGNORE INTO users (id, email, username, bio, created_at) VALUES (1000000, 'demo@glitchbox.local', 'nightshift_games', 'Two-person studio making tiny arcade games.', ${now});\n`;
for (const g of games) {
  const id = 1000000 + g.id;
  const web = g.web ? `g/${id}/web/000000000000/` : null;
  const shots = [1, 2, 3].map((n) => `g/${id}/shots/demo${n}.png`);
  sql += `INSERT OR IGNORE INTO games (id, slug, developer_id, title, tagline, description, genre, tags, is_ai, status, cover, web_prefix, web_entry, web_width, web_height, plays,
      published, published_at, screenshots, controls, languages, content_rating, release_date, sysreq, created_at, updated_at)
    VALUES (${id}, ${q(g.slug)}, 1000000, ${q(g.title)}, ${q(g.tagline)}, ${q(g.desc)}, ${q(g.genre)}, ${q(g.tags)}, ${g.ai}, ${q(g.status || 'released')}, ${q(`g/${id}/cover/demo.png`)},
    ${web ? q(web) : 'NULL'}, ${web ? "'index.html'" : 'NULL'}, ${g.w || 960}, ${g.h || 600}, ${Math.floor(Math.random() * 400)},
    1, ${now}, ${q(JSON.stringify(shots))}, ${q(g.controls)}, 'English', 'everyone', ${q(g.release || '')}, '{}', ${now}, ${now});\n`;
  shots.forEach((k, n) => wrangler('r2', 'object', 'put', `glitchbox-files/${k}`, '--file', join(demo, `${g.slug}-shot${n + 1}.png`), '--content-type', 'image/png'));
  wrangler('r2', 'object', 'put', `glitchbox-files/g/${id}/cover/demo.png`, '--file', join(demo, `${g.slug}.png`), '--content-type', 'image/png');
  if (web) wrangler('r2', 'object', 'put', `glitchbox-files/${web}index.html`, '--file', join(demo, g.web), '--content-type', 'text/html; charset=utf-8');
}
const posts = [
  ['general', 'Welcome to GlitchBox! Free for everyone, upload your stuff and share it here.', 'NULL'],
  ['ideas', 'Idea: a rhythm game where the level is generated from your own music files. Would anyone play that?', 'NULL'],
  ['upcoming', 'Working on Skyforge, a cozy floating-island builder. Wishlist it if it looks fun!', 1000003],
  ['ai-devs', 'Neon Snake was built in one afternoon with an AI pair programmer. Happy to share the prompts I used.', 1000002],
];
posts.forEach(([ch, body, gid], i) => {
  sql += `INSERT OR IGNORE INTO posts (id, channel, user_id, body, game_id, created_at) VALUES (${1000000 + i}, ${q(ch)}, 1000000, ${q(body)}, ${gid}, ${now});\n`;
});
const file = join(mkdtempSync(join(tmpdir(), 'ns-seed-')), 'seed.sql');
writeFileSync(file, sql);
wrangler('d1', 'execute', 'glitchbox', '--file', file, '--yes');
console.log(`Seeded demo data (${where.slice(2)}).`);
