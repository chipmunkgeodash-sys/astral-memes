# Hush Moto multiplayer

Astral's `/hush-moto` link redirects automatically to the full game at `/hushmoto`.
The Games card also opens `/hushmoto` directly; the game is not embedded in an iframe.
The older `/hush-moto-game/index.html` link remains supported.
Choose Multiplayer, enter a rider name, and host a server. Friends can refresh
the public list or enter the six-character code. Unlisted rooms require the code.
Rooms allow eight riders, including the host. No Astral login is required.

## Online connection

The default `firebase` connection uses Firebase Realtime Database in
`astral-memes-zentraa`, with anonymous Auth in a separate named Firebase app.
It does not replace the player's Astral login. Firebase Hosting needs no Node
relay for this connection. Restore automatic connection resets an old override.

Database rules restrict writes to each rider's own membership and pose, reserve
room closure for the host, validate bounded poses, and limit slots to eight.
The directory query returns at most 100 recent public rooms. Room codes help
friends find each other; they are not strong access-control secrets.

Leaving as host closes the room. Server-side onDisconnect hooks clean up rooms
and riders after connection loss (detection can take time for interrupted networks).
Reconnect and join explicitly after a loss. There is no host migration.
The directory opens automatically with the lobby and streams room and player-count changes live. Entries older than five minutes are excluded, allowing for background-tab timer throttling.

Poses publish at up to 10 Hz when changed, and remote bikes interpolate movement.
Traffic, police, checkpoints and stunt scores remain local. Riders pass through
each other. Pause stops your bike while other riders continue. Free Firebase
connection, storage and bandwidth quotas still apply; this is small-room free roam.

## Build and deploy

From the Astral project directory:

```sh
npm ci
npm --prefix "hush moto" ci
npm run build
```

The build includes the game's public asset allowlist. For local preview run
`npm run dev`, then open `http://localhost:5173/hush-moto`. The automatic
connection also works locally and uses the same online room directory.

After changing room rules, regenerate and deploy them before dependent clients:

```sh
npm --prefix "hush moto" run build:room-rules
npx firebase deploy --only database --project astral-memes-zentraa
npx firebase deploy --only hosting:c7mh9f9g2u,hosting:mq5bi2szqu,hosting:cw2exkq6jo --project astral-memes-zentraa
```

## Optional WebSocket relay

`npm run serve:hush` starts the standalone game and `/multiplayer` WebSocket
relay on port 8123. Enter `ws://localhost:8123/multiplayer` in Connection settings
to use it. For LAN play use the server computer's LAN address on every device.
Astral's Vite server also proxies `/multiplayer` to port 8123.

For a separately hosted relay, run `npm run serve:multiplayer` inside `hush moto`.
It respects `PORT` and exposes `/health`. Use one instance (rooms are in memory),
with HTTPS/WSS in front. Set `HUSH_MULTIPLAYER_URL` before building to override the
default, or enter the secure `wss://` URL in the lobby. All riders must use the
same service. This relay publishes snapshots at 20 Hz.

## Checks

`npm --prefix "hush moto" test` runs physics/model and WebSocket integration tests.
`npm --prefix "hush moto" run test:online` explicitly exercises the live Firebase
rules with temporary anonymous users and rooms, cleaning them up afterwards.
It verifies host/join, directory lookup, pose exchange, ownership, capacity bounds,
invalid input rejection and leaving. Browser checks cover the actual host/join
flow, remote rendering, Garage, Resume and Escape.

## Garage and city map

Eight bikes include the assembled user-supplied E Ride Pro SS 3.0 print kit.
Garage / Customize saves paint and electric upgrades per bike. Chi-inspired
battery and EBMX-inspired controller choices use fictional game tuning. Builds
carry across reloads and their appearance synchronizes with other riders.
Gas bikes support paint but cannot install electric upgrades.

Press M or use City map to view the full city and crew positions. Click the map
to set a waypoint (also shown on the minimap); Clear waypoint removes it. Map
atmosphere offers day, evening and night, saved on this device.

Tree and lamp hitboxes use trunk-sized circles. Glancing hits retain tangential
velocity, while repeated contact resolution removes corner overlap.
