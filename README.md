# Astral Memes — editable source

A working Vite + React rebuild of Astral Memes, reconstructed from the deployed
bundle after the original source was lost. **This is not the original code.**
Names, file layout and comments are inventions; the behaviour, styling, copy and
data model are recovered from the real build.

Firebase project: `astral-memes-zentraa`

## Run it

    npm install
    npm run dev

## Deploy

    npm run build
    firebase deploy --only hosting

`firebase.json` points both `astral-games1` and `astral-memes` at `dist/` —
the same member build on two hosting sites, so a filter that catches one
address does not take the app down — and the `astral-memes-zentraa` site at
`player/` (the sandboxed game-player shim).

`astral-games1` is the current primary. `astral-memes` is the original address
and is filtered on some networks; it stays deployed for anyone it still works
for. When a new address is needed, create another site, deploy `dist/` to it,
and add it to the top of `portal/mirrors.js`:

    firebase hosting:sites:create astral-games2
    firebase deploy --only hosting:astral-games2

## The gateway

`portal/` is a site of its own — a single page whose only job is to forward
you to whichever hostname is currently answering. Build and run it on its own:

    npm run dev:portal        # localhost:5275
    npm run build:portal      # -> dist-portal/
    firebase deploy --only hosting:astral-gateway

It lives at `astral-gateway.web.app`. That site does not exist until someone
creates it, which is a one-off:

    firebase hosting:sites:create astral-gateway

It shares nothing with `src/` — no Firebase, no session, no games folder — so
it builds to about 48 kB gzipped and loads on a bad connection. On open it
sends a `no-cors` request to each address and shows which ones came back, then
points ENTER at the one that answered, preferring whichever door you got
through last (remembered in `localStorage`).

The list of addresses lives in `portal/mirrors.js`, and that is the only file
to touch when one changes. A green dot means the browser got *a* response, not
that the real page loaded — a network answering with its own block page still
reads as reachable.

`npm run build:all` produces all three bundles (`dist/`, `dist-admin/`,
`dist-portal/`).

**Deploy to a preview channel first** to compare against the live app:

    firebase hosting:channel:deploy rebuild --only astral-memes

## What was recovered exactly

- **`src/styles.css`** — the original stylesheet, byte-for-byte. 195 semantic
  class names survived minification, so the rebuild looks identical.
- **All UI copy** — 753 strings lifted from the bundle.
- **The Firestore data model** — collection names taken from the bundle's call
  sites, so this build reads and writes the same live data:
  `accounts`, `usernames`, `wallets`, `roles`, `challenges`, `challengeEntries`,
  `polls`, `posts`, `messages`, `announcements`, `storeItems`, `redemptions`,
  `paidContent`.
- **Permission keys** — `accessAdmin`, `moderateMemes`, `accessPaidGames`,
  `accessEarlyFeatures`, `manageAnnouncements`.
- **The game decryption path** — AES-GCM, 12-byte IV prefix, base64 key read
  from `paidContent/games.key`. Identical to the original.
- **`public/games/` and `public/proxy/`** — copied from the deploy untouched.
  1578 encrypted games, plus Ultraviolet / Bare-Mux / Epoxy.

## What changed on purpose

- **Login is username + password.** No email. The `usernames` collection maps a
  name to a synthetic address so Firebase Auth stays happy.
- **Owners can grant coins.** Admin → Members → Add coins, on any account, up or
  down, with an audit row written to `redemptions` (`type: "ownerGrant"`).
- **Challenge winners are shown.** Ended challenges display a winner banner and
  a ranked FINAL RESULTS leaderboard.
- **Source maps are on** (`vite.config.js`). The original shipped none, which is
  the entire reason this rebuild had to exist. Leave them on.

## Still to do

- **Security rules are not in this repo.** They live only in the Firebase
  console. Export them before changing anything:
  console.firebase.google.com → Firestore Database → Rules, and Storage → Rules.
- `paidContent/games` must contain a base64 `key` field or the game library
  stays locked.
- Owner accounts are whatever has `owner: true` on their `accounts` document.
