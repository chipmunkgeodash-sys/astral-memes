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

`firebase.json` points the `astral-memes` site at `dist/` and the
`astral-memes-zentraa` site at `player/` (the sandboxed game-player shim).

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
