# Contexte projet - JeuFPSComposer

Ce fichier sert de briefing rapide pour reprendre le projet sans historique de conversation.

## But du projet

`JeuFPSComposer` est un prototype de FPS multijoueur en navigateur, en vue premiere personne, avec une arene 5v5/room jusqu'a 10 joueurs.

Fonctionnalites principales actuelles :

- menu de connexion avec pseudo et liste des rooms ;
- rendu 3D avec Three.js ;
- serveur Express + Colyseus pour synchroniser les joueurs ;
- physique locale avec Rapier 3D ;
- armes : `AK47`, `Fusil a pompe`, `Sniper`, `Couteau` ;
- tirs, degats, morts, respawn, kill feed ;
- grenades avec pickups, lancer, rebonds, explosion ;
- HUD vie/munitions/grenade ;
- controles clavier/souris configurables ;
- controles tactiles mobiles ;
- bot de developpement active hors production.

## Stack technique

- Runtime : Node.js `>=22`
- Serveur : Express `4.x`, Colyseus `0.17`, WebSocket transport Colyseus
- Client : HTML/CSS/JavaScript modules ES natifs, sans bundler
- 3D : Three.js charge depuis CDN `unpkg`
- Physique : `@dimforge/rapier3d-compat`, servi localement via `/vendor/rapier/rapier.mjs`
- UI utilitaire : Tailwind CDN dans `public/index.html`
- Icones tactiles : Lucide charge depuis CDN `unpkg`
- Deploiement cible : serveur Node generique compatible avec `PORT`

## Commandes utiles

```bash
npm install
npm run dev
```

Le serveur demarre par defaut sur `http://localhost:3000`.

Scripts disponibles :

- `npm run dev` : lance `tsx watch server/src/index.ts`
- `npm run build` : compile le serveur TypeScript dans `dist/`
- `npm start` : lance `node dist/server/src/index.js`

Variables/env utiles :

- `PORT` : port HTTP, defaut `3000`
- `NODE_ENV=production` : desactive le bot de developpement par defaut
- `DEV_BOT=1` : force l'activation du bot de developpement

Endpoint de sante :

- `GET /health` -> `{ ok: true }`

## Architecture generale

Le projet n'utilise pas de bundler client : le serveur Colyseus/Express sert directement les fichiers statiques de `public/`, et `public/main.js` importe les modules client avec des chemins relatifs.

Flux simplifie :

1. `server/src/index.ts` lance Express, Colyseus et le transport WebSocket.
2. `public/index.html` charge le CSS, le SDK Colyseus local, les CDN et `public/main.js`.
3. `public/main.js` cree la scene Three.js, le contexte de jeu, les controllers, puis initialise Rapier.
4. Le client rejoint la room Colyseus via `public/js/net/socket-client.js`.
5. `server/src/FpsRoom.ts` gere joueurs, degats, respawn, grenades et broadcasts.

## Fichiers d'entree

- `server/src/index.ts` : backend HTTP, routes statiques, `/health`, `/api/rooms`, SDK Colyseus local.
- `server/src/FpsRoom.ts` : room Colyseus, joueurs, degats, respawn, grenades, bot de dev.
- `server/src/schema.ts` : schemas Colyseus synchronises.
- `public/index.html` : structure DOM complete de l'app, menu, HUD, pause, controles tactiles, canvas.
- `public/main.js` : composition des controllers, initialisation scene/physique/reseau, boucle `requestAnimationFrame`.
- `public/styles.css` : styles globaux, menu, HUD, effets, controles tactiles.
- `public/js/config.js` : constantes client centrales, touches par defaut, armes, grenade, taille map.
- `public/js/state.js` : etat runtime mutable du client.

## Modules client importants

### Jeu

- `public/js/game/context.js` : fabrique le contexte partage entre controllers.
- `public/js/game/player-controller.js` : mouvement, saut, jump pads, spawn safe, envoi des positions.
- `public/js/game/weapons-controller.js` : selection d'arme, munitions, reload, tir, recul, visee, melee.
- `public/js/game/grenades-controller.js` : pickups, lancer, simulation/effets grenade.
- `public/js/game/remote-players.js` : representation et interpolation des autres joueurs.

### Rendu

- `public/js/world/scene.js` : creation scene/camera/renderer/lumieres de base.
- `public/js/world/map-layout.js` : donnees declaratives de la map.
- `public/js/render/world-renderer.js` : construction visuelle de la map, props, pickups, jump pads.
- `public/js/render/effects.js` : impacts, bullets visuelles, muzzle flash, explosions, hitmarker/damage overlay.
- `public/js/weapons.js` : modeles 3D maison des armes en view model.

### Entrees utilisateur

- `public/js/input/keyboard-mouse.js` : pointer lock, souris, touches, tirs clavier/souris.
- `public/js/input/touch-controls.js` : joysticks et boutons mobiles.
- `public/js/input/keybinding-ui.js` : UI de remapping clavier + persistence localStorage.
- `public/js/input/camera-sensitivity.js` : reglages sensibilite camera.
- `public/js/input/fullscreen.js` : synchro plein ecran.

### Reseau/UI/Donnees

- `public/js/net/socket-client.js` : client Colyseus et dispatch des messages serveur.
- `public/js/ui/hud.js` : rooms, HUD, vie, munitions, grenade, kill feed, pause/death screen.
- `public/js/dom.js` : references DOM centralisees.
- `public/js/player-name.js` : pseudo et sanitation localStorage.
- `public/js/key-bindings.js` : persistence/normalisation des touches.
- `public/js/players/appearance.js` : apparence des joueurs distants.
- `public/js/physics/rapier-physics.js` : monde Rapier, collisions map, controller personnage, grenades physiques.

## Backend Colyseus

Constantes principales :

- room logique unique `fps_room`
- `ROOM_SIZE = 10`
- `MAX_HEALTH = 100`
- `RESPAWN_DELAY_MS = 3200`
- `RESPAWN_IMMUNITY_MS = 1800`
- `MAP_HALF_SIZE = 40`
- armes limitees par `WEAPON_DAMAGE_LIMITS`
- pickups grenades : `grenade-west`, `grenade-east`

Responsabilites serveur :

- cree une room Colyseus persistante au demarrage ;
- sert `public/` ;
- expose Rapier et le SDK Colyseus depuis `node_modules` ;
- expose `/api/rooms` pour le lobby ;
- tient la liste des joueurs dans `FpsRoom` ;
- assigne id, room, team/FFA, spawn, arme, vie ;
- valide/sanitise les positions et degats ;
- broadcast les updates joueurs, tirs, morts, respawns et grenades ;
- gere les pickups et respawns de grenades ;
- anime un bot de dev quand active.

## Protocole Colyseus

Messages client -> serveur principaux :

- `player:setName`
- `room:sync`
- `player:update`
- `player:shoot`
- `player:hit`
- `weapon:select`
- `grenade:pickup`
- `grenade:throw`
- `grenade:explode`

Messages room -> client principaux :

- `room:joined`
- `room:players`
- `room:error`
- `room:grenades`
- `player:update`
- `player:health`
- `player:grenadeInventory`
- `player:died`
- `player:respawn`
- `player:shoot`
- `grenade:thrown`
- `grenade:explode`

Le client rejoint la room via le SDK Colyseus puis dispatch ces messages dans `public/js/net/socket-client.js`.

## Donnees gameplay importantes

Les stats d'armes sont dans `public/js/config.js` :

- `ak47` : automatique, chargeur 20, degats 20.
- `shotgun` : 12 pellets, chargeur 5, courte portee.
- `sniper` : degats 100, chargeur 1, zoom FOV 28.
- `knife` : melee, degats 100, vitesse de deplacement augmentee.

La map est declaree dans `public/js/world/map-layout.js` :

- plateforme centrale ;
- rampes ;
- blocs de couverture ;
- caisses empilees ;
- piliers ;
- murs de limites ;
- jump pads ;
- props rotatifs.

La physique map doit rester coherente entre :

- rendu : `public/js/render/world-renderer.js`
- collisions : `public/js/physics/rapier-physics.js`
- donnees : `public/js/world/map-layout.js`

## Arborescence utile

`node_modules/` est volontairement exclu de cette vue.

```text
.
|-- .gitignore
|-- CONTEXTE_PROJET.md
|-- README.md
|-- package.json
|-- package-lock.json
|-- server.js
|-- codex-server.log
|-- codex-server.err.log
|-- public/
|   |-- index.html
|   |-- main.js
|   |-- styles.css
|   |-- js/
|   |   |-- config.js
|   |   |-- dom.js
|   |   |-- key-bindings.js
|   |   |-- player-name.js
|   |   |-- state.js
|   |   |-- weapons.js
|   |   |-- game/
|   |   |   |-- context.js
|   |   |   |-- grenades-controller.js
|   |   |   |-- player-controller.js
|   |   |   |-- remote-players.js
|   |   |   `-- weapons-controller.js
|   |   |-- input/
|   |   |   |-- camera-sensitivity.js
|   |   |   |-- fullscreen.js
|   |   |   |-- keybinding-ui.js
|   |   |   |-- keyboard-mouse.js
|   |   |   `-- touch-controls.js
|   |   |-- net/
|   |   |   `-- socket-client.js
|   |   |-- physics/
|   |   |   `-- rapier-physics.js
|   |   |-- players/
|   |   |   `-- appearance.js
|   |   |-- render/
|   |   |   |-- effects.js
|   |   |   `-- world-renderer.js
|   |   |-- ui/
|   |   |   `-- hud.js
|   |   `-- world/
|   |       |-- map-layout.js
|   |       `-- scene.js
|   `-- vendor/
|-- server/
|   `-- src/
|       |-- FpsRoom.ts
|       |-- index.ts
|       `-- schema.ts
`-- tests/
```

Notes :

- `tests/` et `public/vendor/` existent mais semblent vides actuellement.
- `codex-server.log` et `codex-server.err.log` sont des logs locaux, pas des sources.
- Le projet est sur la branche `main` et suit `origin/main`.

## Points d'attention pour une reprise

- Il n'y a actuellement pas de suite de tests declaree dans `package.json`.
- Les CDN Three.js, Tailwind et Lucide sont charges directement par le navigateur : une connexion internet est necessaire au runtime client.
- Le backend gameplay vit dans `server/src/FpsRoom.ts`; toute evolution reseau doit verifier le client Colyseus et les messages room.
- Les constantes existent parfois cote client et cote serveur : garder les valeurs synchronisees quand elles impactent le gameplay.
- Rapier est servi par Express depuis `node_modules`; ne pas casser la route `/vendor/rapier/rapier.mjs`.
- Les controles par defaut sont AZERTY (`zqsd`) et persistent via `localStorage`.
- Le bot de dev peut influencer les tests manuels locaux si `NODE_ENV` n'est pas `production`.
