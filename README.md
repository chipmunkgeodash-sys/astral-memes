# Astral Memes — editable source

A working Vite + React rebuild of Astral Memes, reconstructed from the deployed
bundle after the original source was lost. **This is not the original code.**
Names, file layout and comments are inventions; the behaviour, styling, copy and
data model are recovered from the real build.

Firebase project: `astral-memes-zentraa`

## Run it

    npm install
    npm --prefix "hush moto" ci
    npm run dev

## Hush Moto and Studio

Hush Moto runs at `/hushmoto`, with multiplayer, motorcycle and rider customization,
trick combos, charging bays, and gas stations. Studio runs at `/studio` and includes
50 free creator tools. See [the feature list](STUDIO-FEATURES.md),
[Ride Lab controls](hush%20moto/RIDE-LAB.md), and
[multiplayer setup](hush%20moto/MULTIPLAYER.md).

Install dependencies in both folders before building a fresh checkout:

    npm ci
    npm --prefix "hush moto" ci
    npm run build

Run the checks with:

    npm run test:studio
    npm --prefix "hush moto" test

The build generates the public game files automatically. Firebase sign-in tokens,
local screenshots, dependency folders, and generated bundles are not committed.
Model creator credits and license notes are included alongside the assets.

## Deploy

`firebase-tools` is a devDependency, so `npm install` is all the setup there is.
Sign in once, create the sites once, then deploy as often as you like:

    npm run login          # browser sign-in; only when the token expires
    npm run sites:create   # one-off, and harmless to re-run
    npm run deploy         # builds all three bundles, ships all five sites

`npm run deploy:gateway` ships just the launchpad, which is the fast one when only
`portal/mirrors.js` changed.

On Windows, `deploy.cmd` does the whole sequence in one go, signing in first if
the token has lapsed. It is batch rather than PowerShell deliberately: where
script execution is disabled, `npm` resolves to `npm.ps1` and is refused, and
so is any `.ps1` wrapper. Plain `npm.cmd ...` works in that situation too.

`firebase.json` sends the member build in `dist/` to three hosting sites —
`c7mh9f9g2u`, `mq5bi2szqu` and `cw2exkq6jo` — so a filter that catches one
address does not take the app down. `astral-owner` gets `dist-admin/` and
`astral-launchpad` gets `dist-portal/`.

`astral-games1` and `astral-memes` are old addresses. They are no longer
deployed to and stay frozen on their last release.

Source maps (`*.map`) are built but not uploaded: they are only for debugging,
and every deploy stores a full copy of each site against the Hosting storage
quota. The games library in `dist/games` is most of that size, so keep the
number of sites the member build goes to small, and keep release history short
(Hosting → Release history → Release storage settings in the Firebase console).

When a new address is needed, create another site, add it to `firebase.json`,
and add it to the top of `portal/mirrors.js`:

    firebase hosting:sites:create <new-site-id>
    firebase deploy --only hosting:<new-site-id>

## The launchpad

`portal/` is a site of its own — a single page whose only job is to forward
you to whichever hostname is currently answering. Build and run it on its own:

    npm run dev:portal        # localhost:5275
    npm run build:portal      # -> dist-portal/
    firebase deploy --only hosting:astral-launchpad

It lives at `astral-launchpad.web.app`.

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

    firebase hosting:channel:deploy rebuild --only c7mh9f9g2u

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
