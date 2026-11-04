// Bakes the GlitchBox site address into the app at build time.
// Usage: GLITCHBOX_URL=https://glitchbox.example.com npm run dist:win
const fs = require('fs');
const path = require('path');
const url = process.env.GLITCHBOX_URL;
if (!url) { console.error('Set GLITCHBOX_URL to your GlitchBox site, e.g. https://glitchbox.example.com'); process.exit(1); }
fs.writeFileSync(path.join(__dirname, '..', 'app-config.json'), JSON.stringify({ siteUrl: url.replace(/\/$/, '') }, null, 2) + '\n');
// Point app self-updates at the same site.
const pkgFile = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
pkg.build.publish = [{ provider: 'generic', url: url.replace(/\/$/, '') + '/desktop' }];
fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
console.log('Building GlitchBox for', url);
