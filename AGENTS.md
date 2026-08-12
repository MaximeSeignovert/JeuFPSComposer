# AGENTS.md

Index pour tout agent IA (Cursor, Codex, Claude Code, Copilot, etc.).
Lire ce fichier en premier, puis `CONTEXTE_PROJET.md` seulement si le détail d'architecture manque.

## Projet

Prototype FPS navigateur, vue première personne, room unique jusqu'à 10 joueurs.

- Mode actuel : **FFA** (chacun pour soi). Le 5v5 est une intention produit, pas le gameplay live.
- Map live : arène désert **Qasr Al-Rih** (`DESERT_MAP_LAYOUT`).
- Client : modules ES natifs, **sans bundler**, Three.js 0.164 depuis unpkg.
- Serveur : Express + Colyseus 0.17 (TypeScript).
- Physique locale : Rapier 3D, servi via `/vendor/rapier/rapier.mjs`.
- Contrôles par défaut : **AZERTY** (`zqsd`), persistés dans `localStorage`.

## Commandes

```bash
npm install
npm run dev          # tsx watch server/src/index.ts → http://localhost:3000
npm test             # node:test sur server/src/dev-bot-ai.test.ts
npm run build && npm start
```

- `PORT` (défaut `3000`), `NODE_ENV=production` coupe le bot, `DEV_BOT=1` le force.
- `GET /health` → `{ ok: true }`.

## Où aller

| Sujet | Fichier |
| --- | --- |
| Composition client | `public/main.js` |
| Constantes client | `public/js/config.js` |
| État runtime client | `public/js/state.js` |
| Contexte partagé | `public/js/game/context.js` |
| Room / autorité | `server/src/FpsRoom.ts` |
| Schémas Colyseus | `server/src/schema.ts` |
| Messages réseau | `public/js/net/socket-client.js` |
| Map live | `public/js/world/desert-map-layout.js` |
| Rendu map | `public/js/render/desert-world-renderer.js` |
| Collisions | `public/js/physics/rapier-physics.js` |
| Nav bot | `server/src/dev-bot-ai.ts` |

Ne pas utiliser `public/js/world/map-layout.js` ni `public/js/render/world-renderer.js` : ce sont d'anciennes maps, plus branchées.

## Règles non négociables

1. **Pas de bundler client**, pas de React, pas de TypeScript côté `public/`.
2. Le client reste des **factories** `createX(ctx)` qui lisent `ctx` / `ctx.state` / `ctx.controllers`.
3. Toute constante de gameplay dupliquée client/serveur doit rester **alignée** (`config.js` ↔ `FpsRoom.ts`).
4. Changer la map implique **rendu + collisions + pickups/spawns + nav bot**.
5. Le serveur **valide** dégâts, armes, positions, grenades. Ne jamais faire confiance au client.
6. Ne pas committer binaires (`.fbx`, `.glb`, textures) sauf demande explicite.
7. UI joueur en français. Code et identifiants en anglais (`ak47`, `player:hit`, `fps_room`).
8. Tests automatisés : uniquement le bot pour l'instant. Étendre `server/src/*.test.ts` si la logique serveur change.

## Protocole (rappel)

Client → serveur : `player:setName`, `room:sync`, `player:update`, `player:shoot`, `player:hit`, `weapon:select`, `grenade:pickup`, `grenade:throw`, `grenade:explode`.

Serveur → client : `room:joined`, `room:players`, `room:error`, `room:grenades`, `player:update`, `player:health`, `player:grenadeInventory`, `player:died`, `player:respawn`, `player:shoot`, `grenade:thrown`, `grenade:explode`.

`team:select` est rejeté (FFA).
