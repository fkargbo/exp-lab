# ExP-Lab — Universal Feedback Layer

Canonical repo: **[github.com/fkargbo/exp-lab](https://github.com/fkargbo/exp-lab)**.

## HPUX-Prototypes (git submodule)

This package is wired into the **HPUX-Prototypes** monorepo at path **`exp-lab/`** as a **git submodule**. After cloning that repo, initialize submodules:

```bash
git submodule update --init --recursive
```

Then `cd exp-lab && npm install && npm run build` so **`exp-lab/dist/feedback-layer.js`** exists for local dev (`webpack.dev.js` serves it at `/feedback-layer.js`). Keep **`exp-lab/.env`** local (gitignored); it is not stored in git.

---

Single-file embed (`feedback-layer.js`) for collecting spatial feedback on any prototype: **C** toggles comment mode, click places a pin, drag draws a **region**. **No backend required:** without Supabase, pins persist in **`localStorage`** for this browser + prototype URL. With **Supabase**, pins sync in real time and you can add email alerts (Resend Edge Function).

## Quick start (local)

```bash
cd exp-lab
npm install
npm run dev
```

Open the dev URL — press **C** to enter feedback mode.

Build the IIFE bundle:

```bash
npm run build
```

Output: `dist/feedback-layer.js` (self-contained; includes React, Supabase client, Framer Motion, Lucide icons).

## Embed on any prototype

```html
<script src="https://<username>.github.io/<repo>/dist/feedback-layer.js" defer></script>
```

Use a **relative** path when the prototype and script live on the same GH Pages site:

```html
<script src="./dist/feedback-layer.js" defer></script>
```

### Environment variables

Copy `.env.example` to `.env` and add your Supabase project URL and anon key. Rebuild so `import.meta.env` is baked into the bundle:

```bash
cp .env.example .env
npm run build
```

Without Supabase env vars, feedback is still **saved locally** in the browser (`exp-lab-feedback:v1:*` keys). Add `.env` and rebuild when you want cloud sync, GitHub sign-in, and team realtime.

### Identity

- **GitHub**: Configure **GitHub** as an OAuth provider in Supabase Auth. Reviewers use **Sign in with GitHub** in the comment dialog; avatar and name come from `user_metadata`.

#### GitHub Pages: avoid redirect to `localhost`

Supabase only redirects the browser back to URLs you allow. The ExP-Lab bundle sends `redirectTo` as **`VITE_OAUTH_REDIRECT_ORIGIN` + current `pathname` + `search`** when that env var is set at build (GitHub Actions sets it to `https://<your-github-username>.github.io` by default). Otherwise it uses `window.location.origin` + path. If that final URL is **not** allow-listed, Supabase falls back to **Site URL** — often still `http://localhost:3000` — so you land on localhost with tokens in the hash.

Do all of the following in the Supabase dashboard (**Authentication → URL Configuration**):

1. **Redirect URLs** — add (at least) one line that matches your hosted app, for example:
   - `https://fkargbo.github.io/ux-prototypes/**`
2. **Site URL** — set to your real public entry, for example:
   - `https://fkargbo.github.io/ux-prototypes/`
   so even fallbacks are not `localhost`.
3. Keep local dev working, for example:
   - `http://localhost:3000/**`

Save, wait a minute, redeploy **`feedback-layer.js`** (parent repo Pages build runs `exp-lab` with the env vars above), hard-refresh the prototype, then try **Sign in with GitHub** again.

- **Guest**: If not signed in, the first comment asks for a **display name** (stored in `localStorage`).

### `project_id`

Computed as `location.hostname + location.pathname` (query/hash ignored) so each prototype route is scoped automatically.

### GitHub Pages SPA routing

Copy `public/404.html` into your Pages site (or use this package’s `dist/` after build). Set `BASE` inside `404.html` if the site uses a subpath (e.g. `/ExP-Lab/`). Your app’s `index.html` should read `sessionStorage.getItem('exp-lab-gh-pages-redirect')` and navigate accordingly (router-specific).

## Supabase

1. Create a project and run `supabase/migrations/20250510120000_feedback_pins.sql` (SQL Editor or CLI).
2. Enable **Realtime** for table `feedback_pins` (Database → Publications → `supabase_realtime`).
3. Enable **GitHub** provider under Authentication → Providers (redirect URL: your prototype origin).

### Email (Resend)

1. Deploy `supabase/functions/notify-feedback-owner` as an Edge Function.
2. Set secrets: `RESEND_API_KEY`, `NOTIFY_TO_EMAIL`, optional `RESEND_FROM_EMAIL`.
3. Create a **Database Webhook** on `feedback_pins` **INSERT** pointing at the function URL (or chain via Queues).

The handler expects a Supabase webhook-style JSON body with a `record` object.

## Architecture notes

- **Shadow DOM** hosts toast/dialog so styles stay isolated; **portaled** layers (`exp-lab-pin-root`, `exp-lab-interaction-root`) live on `document.body` for full-page coordinates — the same stylesheet is injected into `document.head` for those layers.
- Coordinates are stored as **percentages** of document width/height so pins survive resize.

## Testing inside this repo (Observability Agentic prototype)

The **Observability Agentic Troubleshooting AI** prototype loads ExP-Lab automatically when you open it (`prototype.lifecycle.ts` → `ensureExpLabFeedbackLayer`). It requests:

| Environment | Script URL |
|-------------|------------|
| **Local dev** (`npm start`) | `http://localhost:<port>/feedback-layer.js` |
| **GitHub Pages** | `https://<user>.github.io/<repo>/feedback-layer.js` (repo name is the path segment) |

**Dev server:** after `cd exp-lab && npm run build`, webpack serves **`exp-lab/dist/feedback-layer.js`** automatically (see `webpack.dev.js` — no need to copy into root `dist/` unless you prefer). Restart **`npm start`** if the dev server was already running before you built ExP-Lab.

Optional manual copy (e.g. for `sirv` without webpack):

```bash
cp exp-lab/dist/feedback-layer.js dist/feedback-layer.js
```

Then start the main app (`npm start` from the repo root). Open the **Observability Agentic Troubleshooting** prototype from the launcher, press **C** to toggle feedback mode.

Put **`VITE_SUPABASE_URL`** and **`VITE_SUPABASE_ANON_KEY`** in `exp-lab/.env` before `npm run build` so the copied bundle can save comments.

**Parent repo (e.g. `ux-prototypes`) on GitHub Actions:** set the same two values as **repository secrets** or as secrets on the **`github-pages` environment** (the deploy workflow’s `build` job uses that environment so the Vite build sees them). If they are missing at build time, the shipped `feedback-layer.js` stays in browser-only mode.

For production deploys, ensure **`feedback-layer.js`** is deployed alongside `index.html` (same folder as the main bundles), e.g. add `cp exp-lab/dist/feedback-layer.js dist/` to your publish step before `gh-pages`.

## License

MIT (match parent repo unless stated otherwise).
