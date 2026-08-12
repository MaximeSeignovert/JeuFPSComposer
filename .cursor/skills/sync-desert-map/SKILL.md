---
name: sync-desert-map
description: Keeps the Qasr Al-Rih desert map consistent across layout, renderer, Rapier collisions, grenade/spawn points, and bot navigation. Use when moving buildings, adding FBX props, changing MAP_HALF_SIZE, editing desert-map-layout.js, desert-world-renderer.js, rapier-physics.js, FpsRoom spawn/pickup points, or the development bot pathfinding.
---

# Synchroniser la map désert

Un changement visuel sans les autres couches casse collisions, hitscan, pickups ou le bot.

## Fichiers à tenir ensemble

| Couche | Fichier |
| --- | --- |
| Données | `public/js/world/desert-map-layout.js` |
| Rendu | `public/js/render/desert-world-renderer.js` |
| Physique | `public/js/physics/rapier-physics.js` |
| Spawns / grenades | `server/src/FpsRoom.ts` (`SPAWN_POINTS`, `GRENADE_PICKUP_POINTS`) |
| Nav / LOS bot | `server/src/dev-bot-ai.ts` |
| Tests nav | `server/src/dev-bot-ai.test.ts` |

## Procédure

1. Éditer l'entrée `assets[]` (ou `boundaryWall` / `buildingScale`) dans `DESERT_MAP_LAYOUT`.
2. `solid: true` seulement si le joueur et les balles doivent collide. Déco (awning, shutter, door) : souvent non solid.
3. Recaler spawns hors des nouveaux volumes, et pickups grenade dans des zones accessibles.
4. Mettre à jour `DESERT_NAVIGATION` (waypoints au sol, liens non obstrués) et `DESERT_BLOCKING_VOLUMES` (murs au sol, pas toits).
5. Lancer `npm test`.
6. Vérifier à la main : marcher autour du prop, tirer à travers, bot qui ne traverse pas le bâtiment.

## Éditeur localhost

F2 ouvre l'éditeur. « Copy selected config » produit un snippet à coller dans le layout. Rafraîchir ensuite : Rapier lit le layout, pas le gizmo live.

## Ne pas faire

- Réactiver `map-layout.js` / `world-renderer.js`.
- Déplacer un FBX uniquement dans le renderer.
- Oublier le bot : il utilisera encore l'ancien graphe.
