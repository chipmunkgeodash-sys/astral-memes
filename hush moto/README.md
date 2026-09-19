# Hush Moto

Multiplayer now supports hosting and joining eight-rider servers, public server
discovery, unlisted room codes, remote bikes, name labels and minimap markers.
Astral redirects `/hush-moto` to the full game at `/hushmoto` on the same site.
The default connection uses Firebase automatically. See [MULTIPLAYER.md](MULTIPLAYER.md)
for setup, deployment, and the optional WebSocket relay.

An open-city 3D motorcycle sandbox that runs in the browser, with imported
motorcycles alongside the procedural city and original bike lineup.

## Play

Serve the project so the browser can load the GLB motorcycle and its textures:

```bash
npm run serve
```

then open <http://localhost:8123>.

Imported bikes show a loading screen while their GLB is being read, without
flashing the old generated model. Riding waits until the replacement is ready.
LBX and Ultra Bee are included in the hosted build and load automatically for
every player. No file import is required. Garage retains an optional personal
model replacement picker under a collapsed section; these overrides remain
specific to each browser and website address.

The latest physics fixes cover walking-speed reverse on all bikes, airborne
wheel braking, persistent landing/collision speed loss, slope-relative tyre
contact and suspension damping, and consistent simulation down to 15 FPS.
Hill riding no longer counts as a wheelie for stunt scoring or police.
Model corrections include chain alignment, radial tread blocks, twin-disc
carriers, road-bike seat heights and the Ultra Bee MY24's stock 90/90-19 rear tyre.

The garage now includes a lit 3D preview: drag to rotate and scroll to zoom.
Honda, Light Bee X, Stark and KTM use imported geometry; the remaining branded bikes have
individual procedural bodywork and finishes.
The city uses correctly scaled facade windows, leaf-and-branch tree canopies,
textured ground, reflective vehicle glass and softer shadows. Chase cameras
move inward when buildings or terrain obstruct the view.

Police patrol public roads, respond to witnessed dangerous riding, pursue and
search the last known location, and allow surrender when stopped nearby.
Settings includes a police toggle. Pedestrians walk to marked zebra crossings,
wait for a safe gap (and a red traffic signal at controlled junctions), cross
the road, and continue on the opposite sidewalk. Cars and patrols yield before
the crossing. Sidewalks now connect continuously between junction crossings.
Traffic drives up the bridge ramps, while the avenue passes underneath. The
two levels have separate route nodes, continuous ramp/deck heights and no
turns through the deck. Bridge approaches end before neighboring crossings.

**Custom Bobber · Blender** is a real creator-authored, textured GLB by
[Duhgless](https://duhgless.itch.io/another-psx-style-low-poly-bike), licensed
CC0. Its `.blend` source and textures are included in `assets/bikes/duhgless`.
It has separate steering and wheel pivots, suspension motion, an adjusted
rider pose and custom handling. It is a retro low-poly design.

**Honda CRF450R** now uses Jacobdesigns' Blender-authored 2022 CRF450 model
with embedded textures and its original armature (CC BY 4.0). Steering,
wheel spin and suspension are driven by the simulation; hands and boots
follow the imported rig's anchors.

**Light Bee X** uses the user's How2Random printable scale-model kit,
assembled into a GLB with surface materials and moving pivots. This is an
adapted scale replica, not factory CAD. Its Standard Digital File License
has not been cleared for public redistribution: keep this adaptation local
until the creator permits that use.

**Stark VARG** uses the supplied Blender frame/bodywork, with restored solid
materials because the source texture images were absent. Its missing wheels
are supplied by the game's existing Stark wheel geometry.

**KTM 1290 Super Duke R** uses Moon1376464's supplied stylized model, with the
original colour atlas, lit materials and articulated wheels and steering.
Both adaptations are CC BY 4.0. R1 remains a procedural approximation.
See each asset folder's `LICENSE.md` for sources.

**Ultra Bee** uses the user's Files3D.3mf MakerWorld display STL, with separated
moving assemblies, normalized wheel dimensions, new materials and rider anchors.
Its Standard Digital File License requires keeping this adaptation local;
publishing or redistributing it requires the creator's permission.

The eight bikes are all selectable. Throttle now opens progressively;
brake forces convert to wheel torque using tyre radius; supported tyre loads
sum to bike/rider weight. Airborne throttle/brakes exchange wheel angular
momentum with the chassis, and stoppie recovery settles through rotation.

The VARG now meters grounded motor torque against rear-tyre grip to prevent
an immediate burnout. Tyre forces use an implicit wheel-speed solve to remove
low-speed traction chatter. Surface-triggered camera rumble has been removed;
landings and collisions still create impact feedback. Collision probes follow
each bike's length, tyre ends and handlebar tips, with short movement sweeps
for thin obstacles and matching contact against traffic and police vehicles.

Grass and dirt contact now samples the triangles drawn by the terrain mesh,
including at low graphics quality, so the bike follows the visible ground.
Wheelie turns smoothly shift the rider's hips, torso, knees and gaze into the
turn while the handlebars/front wheel follow and the hands stay on the grips.
At jump lips, ground pitch comes from the tyre still touching the ramp instead
of the drop beneath the lifted wheel, preventing false "Looped out" crashes.
Wheelie steering builds rider lean before yaw and respects remaining rear-tyre
grip. Rear contact follows the wheel's rolling direction; chassis banking pivots
around the supporting tyre without twisting the rear wheel sideways. Storm Bee
has been removed from the garage and bike cycling; old saved selections use LBX.

## Controls

| Key | Action |
| --- | --- |
| `W` | Throttle |
| `SPACE` | Brake (front + rear) |
| `S` | Rear brake / reverse |
| `A` / `D` | Lean / steer |
| `SHIFT` (hold) | Pull back into a wheelie; sustained throttle can loop out |
| `CTRL` | Boost |
| `R` | Reset bike |
| `C` | Change camera (chase / close / first person / cinematic) |
| `N` | Next bike |
| `B` | Look back |
| `M` | Toggle minimap |
| `L` | Lock mouse for continuous free look |
| `H` | Horn |
| `ESC` | Pause menu |

Hold any mouse button on the game and move to look around. Every binding is
rebindable in **Settings → Controls**, and there are toggles for inverted lean,
inverted look, look sensitivity, shadows, quality and traffic density.

## The bikes

| Bike | Mass | Top speed | Notes |
| --- | --- | --- | --- |
| Sur-Ron Light Bee X | 60 kg | 75 km/h | Electric mini dirt, easiest to wheelie |
| Sur-Ron Ultra Bee | 85 kg | 90 km/h | Classic MY24, 12.5 kW, 74 V / 55 Ah |
| Stark VARG | 118 kg | ~140 km/h | Original MX Alpha, 80 hp, 6.5 kWh; speed is a gameplay estimate |
| Honda CRF450R | 111 kg | 140 km/h | Motocross five-speed |
| KTM 1290 Super Duke R | 200 kg | 290 km/h | Naked V-twin, 140 N·m |
| Yamaha YZF-R1 | 201 kg | 299 km/h | Supersport, revs to 14 500 |
| Custom Bobber · Blender | 220 kg | ~160 km/h | Imported CC0 model; estimated custom handling |

Gearing and aerodynamic drag are derived at load time from each bike's quoted
top speed, so every bike really does top out where its spec sheet says and gas
bikes sit near the redline in top gear when they get there.

Physics configurations use the real bikes' published dimensions (wheelbase,
wheel size, seat height, mass). Imported Honda, LBX, Ultra Bee, Stark and KTM wheels
are aligned to their physics axle locations. The procedural R1 has distinct
bodywork and frame details, with
rim diameter separated from tyre radius, drilled rotors, crossed spokes,
coil springs, control cables and model graphics. Sky reflections light the
metal parts. Ultra Bee uses the classic MY24 configuration; VARG uses the
original MX Alpha, not the newer MX 1.2.

Model references: [Ultra Bee MY24](https://sur-ron.co.uk/ultra-bee/),
[Stark VARG MX](https://www.starkfuture.com/products/stark-varg-1),
[Light Bee X](https://en.sur-ron.id/Light-Bee-X.html). Regional and model-year specs
vary; centre of gravity, tyre grip, rider assistance and VARG gearing are
gameplay estimates rather than measured manufacturer simulation data.

During a wheelie, use **A/D** to curve left or right and **S** to lower the
front. Feather **W/SHIFT** for balance. Keeping both held makes the rider lean
farther back and reduces automatic recovery, so looping is much easier.
The VARG needs shorter throttle pulses because of its much greater power.

All eight bikes now have their own visible mechanical features, including
cast wheels and twin front discs on the road bikes, the Super Duke's orange
trellis and single-sided swingarm, the R1's fixed full fairing and clip-ons,
and the CRF's number plate, radiator shrouds and single-cylinder engine.
Tank surfaces are curved lofts. Model names and trim details are recreations;
the procedural models remain approximations, not exact scanned replicas.
Additional dimensional references: [Yamaha R1 specifications](https://cdn2.yamaha-motor.eu/prod/product-assets/2024/YZF1000R1/Factsheets/2024-YZF1000R1_en.pdf),
[Honda CRF manual](https://cdn.powersports.honda.com/documentum/MWOM/ml.remawmom.amker2525omen.pdf),
and [KTM technical specifications](https://www.ktm.com/en-ph/models/naked-bike/2023-ktm-1290-superdukerevo/technical-specifications.html).

## People and police

Riders have tapered limbs, two-bone elbow/knee posing, riding-suit panels,
boot buckles, and road or MX helmets. Pedestrians have adult proportions,
separate skin/hair/clothing, animated arms and legs, sidewalk walking routes,
short pauses, head turns and reactions to approaching bikes. Their body parts
are instanced to keep crowded streets practical in the browser.

Four police cruisers patrol the city street graph. A patrol must actually see
an offense for about 1.3 seconds before starting a pursuit: riding above
90 km/h on public asphalt, a moving wheelie on public asphalt, or riding fast
within 5 metres of a pedestrian. Buildings and distance block detection;
stunts in the stunt park do not count as road wheelies. These are game rules.

- **Pursuit:** red/blue lightbars, directional sirens, road routing and up to
  three wanted stars. Avenue traffic moves to the outer lane for pursuing cars.
- **Escape:** break line of sight. Police search the last seen position and
  give up after 14 seconds without sighting you. They stay on the city roads;
  the highway ring and off-road areas offer escape routes.
- **Surrender:** stop within 11 metres of a visible patrol for 3 seconds.
  After a brief busted state, you are released with a grace period.
- Blue dots on the minimap show patrols. The top panel shows observation,
  pursuit, search and surrender progress. Police can be disabled in Settings.

Police do not teleport to the player. Resetting the bike preserves a pursuit;
restarting the ride clears it. The system is a game AI, not a full traffic-law
or emergency-driving simulation.

## How the physics works

A single-track (bicycle) model, stepped at a fixed 240 Hz:

- **Tyres** — per-axle slip angles feed a lateral force model bounded by a
  friction circle, so longitudinal use eats cornering grip. The rear wheel has
  its own angular state, giving real wheelspin, lockup and burnouts.
- **Steering** — `A`/`D` ask for a *cornering rate*, not a bar angle. A rider
  controller (P + I, gains scaled by steering sensitivity `v/L`) works out the
  lock needed and trims it, exactly as a rider countersteers. The cornering
  force still comes entirely from the tyres, so slides and grip loss behave
  normally — it only replaces the rider's hands. Steady-state cornering uses
  77–91 % of available grip and the lean angle stays within ~3° of
  `atan(a_lat / g)`.
- **Wheelies** — a unilateral contact constraint about whichever contact patch
  is the pivot. The front lifts when the required front load goes negative, so
  wheelies emerge from the torque balance rather than being animated. A
  limited-authority rider controller shifts weight with SHIFT, with reduced
  throttle correction and recovery as the rider commits. Rear-contact turns
  use a simplified rider lean/camber controller, limited by the rear tyre's
  remaining grip; an airborne front tyre contributes no cornering force.
  Rear braking recovers a moderate wheelie. Push past ~77° and you loop out.
- **Stoppies** — the same constraint about the front contact, with the rider
  easing the front brake as the rear comes up. The rear returns through a
  continuous rotation and suspension impact, rather than snapping level.
- **Airborne pitch** — accelerating or braking the wheels exchanges angular
  momentum with the chassis. A stopped wheel cannot keep generating torque.
- **Throttle and brakes** — a progressive throttle filters keyboard steps;
  brake capacities are tyre forces converted to wheel torque by wheel radius.
- **Suspension** — the chassis lags the wheel target through a spring-damper;
  visible fork and swingarm travel is deviation from the static sag.
- **Airborne** — free pitch/roll/yaw integration with air control, and a
  landing test on vertical speed plus pitch/roll mismatch against the ground.

## Development

```bash
npm install     # once
npm run build   # bundle src/ -> dist/game.js
npm test        # deterministic physics and model checks
npm run watch   # rebuild on change
npm run serve   # static server on :8123
```

### QA harness

With the server running, open <http://localhost:8123/tools/browser-smoke.html>
for unobstructed side/front-quarter model inspection and a live frame-rate
consistency check at 15, 20, 30, 60 and 120 FPS.

`tools/qa.js` is a headless test harness. It is **not** loaded by the game —
inject it from the devtools console:

```js
var s = document.createElement('script'); s.src = 'tools/qa.js'; document.head.appendChild(s);
```

It drives `Bike.step()` directly at a fixed 240 Hz (and takes the frame loop
away from `requestAnimationFrame`) so results are deterministic. Useful calls:

- `QA.perf(id)` — 0–60, 0–100, top speed vs spec, braking distance
- `QA.wheelie(id)` — lift time, hold duration, release, brake-down, loop-out
- `QA.grip(id, kmh)` — steady-state cornering on a flat plane: lateral g, lean
  angle vs ideal, turn radius, percentage of grip used
- `QA.jump(id)`, `QA.stoppie(id)`, `QA.soak(seconds)` — stability fuzzing
- `QA.ramps()` — asserts every ramp's mesh matches its collision surface
- `QA.worldScan()`, `QA.spawnCheck()`, `QA.traffic(seconds)`
- `QA.all()` — the lot

## Layout

```
index.html        HUD, menus, styling
src/core.js       math, noise, spatial hash, safe storage
src/roadnet.js    road network, lane graph, traffic lights
src/world.js      terrain bake, ground/collision queries, all world meshes
src/bikephysics.js single-track vehicle dynamics + bike specs
src/parts.js      rounded boxes, lathes, tubes, merge-by-material batcher
src/bikemodel.js  procedural bikes (frame, bodywork, wheels, drivetrain)
src/rider.js      articulated rider
src/humanoid.js   tapered body geometry and two-bone joint posing
src/pedestrians.js instanced animated sidewalk pedestrians
src/traffic.js    AI cars + pedestrians
src/police.js     patrol, witness detection, pursuit, search and surrender
src/camera.js     chase / close / first-person / cinematic + free look
src/effects.js    tyre marks, dust, sparks, exhaust
src/audio.js      fully synthesised engine, tyre, wind and impact audio
src/stunts.js     trick detection, combo chaining, scoring
src/ui.js         HUD rendering, minimap, menus
src/main.js       bootstrap, fixed-step loop, checkpoints
tools/qa.js       headless QA harness (not shipped)
```


## Firebase release

Live game: https://hush-moto.web.app/
Project: `hush-moto-20260919` (Hush Moto).

Run `npm test`, `npm run build:hosting`, then `npx firebase-tools deploy --only hosting --project hush-moto-20260919`.
The hosting build copies only an explicit public asset list and includes creator credits.
The hosting build includes the supplied LBX and Ultra Bee GLBs. Garage can also import prepared lbx.glb and ultra.glb replacements into browser storage.
Steering is inverted by default. Shift wheelies, Ctrl boosts, and S applies rear brake to recover a fender scrape.
