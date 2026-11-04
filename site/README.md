# GlitchBox

**The Home of Independent Games.** A free, simple place for indie and AI game developers to share their games. Runs entirely on Cloudflare:

| Part | Cloudflare service | Free tier |
|---|---|---|
| Website + API | Workers (+ Static Assets) | 100,000 requests a day |
| Database | D1 | 5 GB |
| Game files, covers, browser builds | R2 | 10 GB stored, **downloads are free** |
| Live chat | Durable Objects | included |
| Login emails | [Resend](https://resend.com) | 3,000 emails a month |

## Features

- **Store**: search and filter (play in browser, AI-made, coming soon, genre, sort) with a featured banner.
- **Game pages**: Play in browser, plus a download button that matches the visitor's computer.
- **Library**: played/added games, wishlist for upcoming games, your uploads.
- **Alpha/Beta testing**: developers can set a game to Alpha test or Beta test. Those games show in the Testing tab (not the main store), and their store page has a public tester chat that everyone can read. The chat closes when the game is set to Released.
- **Community**: live chat channels; devs can attach their game to a message.
- **Store page setup**: every game starts as a draft and only goes live once its store page is complete: title, short and full description, tags, cover, 3+ screenshots, controls, languages, age rating, a playable build (or a release date for upcoming games) and system requirements when there are downloads. Banner and trailer (YouTube/Vimeo) are optional. A live checklist shows what is missing, and the server enforces the same rules.
- **Uploads**: browser builds (.zip with index.html, or one .html) plus Windows games (.zip, .exe, .msi). For now GlitchBox supports browser and Windows games only. Files go straight into R2, big ones in 50 MB chunks, so multi-GB games are fine.
- **Login**: email + 6-digit code, no passwords, stays logged in for a year.
- **Windows app**: GlitchBox for Windows lives in the `desktop/` folder of this repository (see its README). When the site runs inside it, game pages get Install, Play, Update and Uninstall buttons, and `/download` offers the installer once CI has uploaded it to R2 under `desktop/`.

## Run it on your computer

Needs Node.js 20 or newer.

```bash
npm install
npm run db:migrate   # creates/updates the local database (run again after pulling new migrations)
npm run seed         # optional: 3 demo games + chat messages
npm run dev          # http://localhost:8787
```

Locally, login codes show on screen (`DEV_MODE=1` in `.dev.vars`), so you do not need email set up.

## Put it live on Cloudflare (about 15 minutes)

1. **Log in**: `npx wrangler login` (opens your browser).
2. **Create the database**: `npx wrangler d1 create glitchbox`. Copy the `database_id` it prints into `wrangler.jsonc` (replace `REPLACE_WITH_YOUR_D1_ID`).
3. **Create the file storage**: `npx wrangler r2 bucket create glitchbox-files`. (R2 needs to be switched on once in the Cloudflare dashboard; it asks for a card but the free tier costs nothing.)
4. **Set up the database tables**: `npm run db:migrate:remote`
5. **Email**: sign up at resend.com, add and verify your domain, create an API key, then run `npx wrangler secret put RESEND_API_KEY` and paste it. Change `MAIL_FROM` in `wrangler.jsonc` to an address on that domain, e.g. `GlitchBox <login@yourdomain.com>`.
6. **Deploy**: `npm run deploy`. You get a `*.workers.dev` address straight away.
7. **Your own domain** (optional): in the Cloudflare dashboard, Workers & Pages → glitchbox → Settings → Domains & Routes → Add custom domain.
8. **Demo games** (optional): `npm run seed -- --remote`.

To ship updates later, just run `npm run deploy` again.

## Supported formats

| Upload | Formats |
|---|---|
| Browser | `.zip` containing `index.html` (HTML5, Phaser, Unity WebGL, Godot Web, GameMaker, PICO-8, Construct...) or one `.html` file |
| Windows | `.zip` of the game folder (best: the app unpacks it and finds the .exe), `.exe`, `.msi` |

Unity WebGL builds compressed with Brotli or Gzip are served with the right headers. Godot 4 web exports should turn off "Thread Support".

## Security

- Login codes are hashed, expire after 10 minutes, allow 5 tries, and are rate limited per email and IP.
- Session tokens are random, stored hashed, in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` over HTTPS).
- Browser games are served under a `sandbox` Content-Security-Policy (an isolated origin), so an uploaded game cannot read cookies or act as the user. Side effect: games cannot use `localStorage` saves. To allow that later, serve `/play/` from a separate domain and add `allow-same-origin`.
- Every upload key is tied to a game the uploader owns, checked on each request.
- State-changing API calls need a custom header, which blocks cross-site form posts.

## Branding

Logos live in `public/brand/` (transparent PNG/WebP cut from the original artwork) and app icons in `public/icons/`. The colour palette (cyan `#22e6ff`, violet `#7c6cff`, magenta `#e040fb`) is set at the top of `public/style.css`.

## Layout

```
wrangler.jsonc        Cloudflare config (bindings for D1, R2, Durable Object, static assets)
src/index.js          API, auth, uploads, downloads, game hosting
src/chat.js           ChatHub Durable Object: live chat over WebSockets
migrations/           D1 database schema
public/               Front end (index.html, style.css, app.js) + PWA files
scripts/seed.mjs      Demo data
```

## Roadmap

- Reviews and ratings, screenshots and trailers, dev logs, following developers, moderation and reporting.
