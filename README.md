# GlitchBox

The home of independent games: a free, Steam-style store, library and community for indie and AI game developers.

| Folder | What it is |
| --- | --- |
| `site/` | The website and API on Cloudflare (Workers, D1, R2, Durable Objects). See `site/README.md` to run and deploy it. |
| `desktop/` | GlitchBox for Windows, the desktop app (Electron). See `desktop/README.md`. |
| `brand/` | Logos and the app icon. |
| `.github/workflows/desktop.yml` | Builds the Windows installer and publishes it to the site's R2 bucket. |
