# Contexte projet - JeuFPSComposer

Briefing détaillé. Index court : `AGENTS.md`.

## But du projet

Prototype de FPS multijoueur en navigateur, vue première personne, room jusqu'à 10 joueurs.

Intention produit (README) : matchmaking 5v5. **Gameplay actuel : FFA** (`team: "ffa"`, `team:select` rejeté).

Fonctionnalités live :

- menu pseudo + choix d'arme + bouton Jouer ;
- Three.js, physique Rapier locale, serveur Express + Colyseus ;
- classes `AK47`, `Fusil a pompe`, `Sniper`, chacune avec `Couteau` ;
- tirs, dégâts validés serveur, morts, respawn, kill feed, immunité spawn ;
- grenades (pickups, charge, lancer, rebonds, explosion) ;
- HUD vie / munitions / slots d'armes ;
- contrôles AZERTY configurables + tactile mobile ;
- map désert Qasr Al-Rih (kit FBX) ;
- bot de développement hors production.

## Stack

- Node.js `>=22`
- Serveur : Express 4, Colyseus 0.17, WebSocket transport
- Client : HTML/CSS/JS modules ES, **sans bundler**
- 3D : Three.js `0.164.1` (unpkg)
- Physique : `@dimforge/rapier3d-compat` via `/vendor/rapier/rapier.mjs`
- UI : Tailwind CDN + CSS maison (`public/styles.css`)
- Tests : `node:test` via `tsx --test` (bot uniquement)

## Commandes

```bash
npm install
npm run dev      # tsx watch server/src/index.ts
npm test         # server/src/dev-bot-ai.test.ts
npm run build    # tsc → dist/
npm start        # node dist/server/src/index.js
```

Env : `PORT` (3000), `NODE_ENV=production` (coupe le bot), `DEV_BOT=1` (force le bot).
Santé : `GET /health` → `{ ok: true }`.

## Architecture

Le serveur sert `public/` en statique. `public/main.js` importe des modules relatifs.

1. `server/src/index.ts` : Express + Colyseus + WS, crée la room `fps_room`.
2. `public/index.html` : DOM, CDN, SDK Colyseus local (`/vendor/game-net.js`), `main.js`.
3. `public/main.js` : scène, `createGameContext`, controllers, Rapier, boucle RAF.
4. `public/js/net/socket-client.js` : join + dispatch messages.
5. `server/src/FpsRoom.ts` : autorité joueurs, dégâts, respawn, grenades, bot.

## Fichiers d'entrée

- `server/src/index.ts` — HTTP, static, `/health`, `/api/rooms`, vendor Rapier/SDK
- `server/src/FpsRoom.ts` — room, validation, broadcasts, bot
- `server/src/schema.ts` — `PlayerState`, pickups, grenades actives
- `server/src/dev-bot-ai.ts` — graphe de nav désert + LOS
- `public/index.html` — menu, HUD, pause, tactile, canvas
- `public/main.js` — composition
- `public/js/config.js` — constantes client
- `public/js/state.js` — état runtime
- `public/js/game/context.js` — objet `ctx` partagé

## Modules client

### Jeu

- `game/player-controller.js` — move, saut, échelles, envoi positions
- `game/weapons-controller.js` — slots, munitions, tir, recul, visée, melee
- `game/grenades-controller.js` — pickups, lancer, simu / effets
- `game/remote-players.js` — interpolation des autres joueurs

### Rendu / monde

- `world/scene.js` — camera / renderer / lumières
- `world/desert-map-layout.js` — **map live** (données)
- `render/desert-world-renderer.js` — **map live** (FBX + textures)
- `render/effects.js` — impacts, tracers, muzzle, explosions, overlays
- `render/menu-camera.js` — caméra menu tant que non joined
- `weapons.js` — view model 1P

Ancienne map **non branchée** : `world/map-layout.js`, `render/world-renderer.js`.

### Input / net / UI

- `input/keyboard-mouse.js`, `touch-controls.js`, `keybinding-ui.js`, `camera-sensitivity.js`, `fullscreen.js`
- `net/socket-client.js`
- `ui/hud.js`, `dom.js`, `player-name.js`, `key-bindings.js`
- `audio/sound-controller.js`
- `players/appearance.js`
- `physics/rapier-physics.js`

## Backend

Constantes utiles (`FpsRoom.ts`) :

- `ROOM_SIZE = 10`, `MAX_HEALTH = 100`
- `RESPAWN_DELAY_MS = 3200`, `RESPAWN_IMMUNITY_MS = 1800`
- armes bornées par `WEAPON_DAMAGE_LIMITS`
- pickups : `grenade-bazaar`, `grenade-west`, `grenade-caravanserai`
- bot : `DEV_BOT=1` ou non-production

Le serveur sanitise noms, positions, dégâts, armes, vitesse de grenade.

## Protocole

Client → serveur : `player:setName`, `room:sync`, `player:update`, `player:shoot`, `player:hit`, `weapon:select`, `grenade:pickup`, `grenade:throw`, `grenade:explode`.

Serveur → client : `room:joined`, `room:players`, `room:error`, `room:grenades`, `player:update`, `player:health`, `player:grenadeInventory`, `player:died`, `player:respawn`, `player:shoot`, `grenade:thrown`, `grenade:explode`.

`team:select` → `room:error` (FFA).

## Gameplay

Stats client dans `WEAPON_STATS` (`config.js`) : ak47 auto 20 dmg / 20 balles, shotgun 12 pellets, sniper 100 dmg / FOV 28, knife melee 100.

Slots : `[primaire, knife]` + grenade temporaire. Molette et bouton mobile cyclent. `G` équipe la grenade. Clic maintenu charge le lancer.

Map : `buildingScale`, `boundaryWall` (limit 40), assets FBX `solid` pour collisions. Physique, rendu et layout doivent rester alignés. Nav bot dans `dev-bot-ai.ts`.

## Arborescence (sources)

```text
.
|-- AGENTS.md
|-- CONTEXTE_PROJET.md
|-- package.json
|-- public/
|   |-- index.html
|   |-- main.js
|   |-- styles.css
|   |-- js/          # modules client
|   `-- assets/      # FBX + textures (binaires, hors contexte agent)
`-- server/src/
    |-- index.ts
    |-- FpsRoom.ts
    |-- schema.ts
    |-- dev-bot-ai.ts
    `-- dev-bot-ai.test.ts
```

## Points d'attention

- Pas de suite de tests client. `npm test` couvre la nav/LOS du bot.
- CDN Three/Tailwind/Lucide : internet requis au runtime client.
- Toute évolution réseau : `FpsRoom` + `socket-client.js`.
- Constantes souvent dupliquées client/serveur : les aligner.
- Ne pas casser `/vendor/rapier/rapier.mjs` ni `/vendor/game-net.js`.
- Le bot fausse les tests manuels locaux si `NODE_ENV` n'est pas `production`.
