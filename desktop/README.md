# GlitchBox for Windows

The desktop app for GlitchBox. It opens the GlitchBox website in its own window and adds the parts a browser can't do:

- **One-click installs.** Downloads pause and resume (even after a restart), zips unpack themselves, and games go into a library folder you choose.
- **Play button and playtime.** Starts the game's .exe, shows "Running", and adds the minutes played to your GlitchBox library.
- **Game updates.** When a developer uploads a new version, the app downloads it in the background, shows the patch notes, and keeps save files that sit next to the game.
- **App updates, tray and notifications.** The app updates itself from your site, lives in the system tray with your recent games, and sends desktop notifications for game updates, wishlist releases and @mentions.
- **Offline mode.** With no internet you still get a list of installed games with Play buttons.

## Run it locally

```bash
npm install
# Point it at a running GlitchBox site (the dev server is http://localhost:8787)
GLITCHBOX_URL=http://localhost:8787 npm start
```

On Windows PowerShell use `$env:GLITCHBOX_URL="http://localhost:8787"; npm start`.

## Test

The install manager test runs against a dev server started with `DEV_MODE=1`:

```bash
GLITCHBOX_URL=http://localhost:8787 npm test
```

It uploads a 120 MB test game, pauses and resumes the download, plays it, updates it (keeping a save file), restarts, and uninstalls.

## Build the installer

The easy way is GitHub Actions (`.github/workflows/desktop.yml`). It builds on Windows and uploads the installer to your R2 bucket, so the site's **Get the app** page (`/download`) and auto-update start working immediately.

1. Push this folder to a GitHub repository.
2. In the repository's **Settings > Secrets and variables > Actions**, add:
   - Secret `CLOUDFLARE_API_TOKEN`: a Cloudflare API token with *Workers R2 Storage: Edit*.
   - Secret `CLOUDFLARE_ACCOUNT_ID`: your Cloudflare account ID.
   - Variable `GLITCHBOX_URL`: your live site, for example `https://glitchbox.gg`.
3. Open **Actions > Windows app > Run workflow**. To release a new version later, push a tag such as `v0.1.1`.

To build by hand on a Windows PC:

```bash
npm install
set GLITCHBOX_URL=https://your-site
npm run dist:win
```

The output in `dist/` is `GlitchBox-Setup-<version>.exe`, its `.blockmap`, and `latest.yml`. Upload all three to R2 under `desktop/` (latest.yml last), and also upload the .exe as `desktop/GlitchBox-Setup.exe` for the download button.

Building on Linux works too, but needs Wine with 32-bit support (`wine64` and `wine32:i386`).

## Code signing

Unsigned installers show a Windows SmartScreen warning ("Windows protected your PC") until the app builds up a reputation. To remove it, buy a code signing certificate (or use Azure Trusted Signing). Then add `WINDOWS_CERT_BASE64` (the .pfx file in base64) and `WINDOWS_CERT_PASSWORD` as repository secrets. The workflow picks them up automatically.

## How it fits together

| File | What it does |
| --- | --- |
| `src/main.js` | The window, tray, notifications, app self-update, settings and the bridge the website talks to. |
| `src/library.js` | The install manager: download, resume, unpack, update, play, playtime, uninstall. |
| `src/preload.js` | Exposes `window.glitchbox` to the GlitchBox site only. Game pages under `/play/` never get it. |
| `src/offline/` | The page shown when the site can't be reached. |
| `scripts/write-config.js` | Bakes the site address into the build. |

Developers mark a build's version, patch notes and launch file on the store page editor. If no launch file is given, the app picks the most likely .exe and skips installers, uninstallers and crash reporters.

Installed games live in `%LOCALAPPDATA%\GlitchBox\Games` by default (changeable in Settings). App settings and the install list are in `%APPDATA%\GlitchBox`.
