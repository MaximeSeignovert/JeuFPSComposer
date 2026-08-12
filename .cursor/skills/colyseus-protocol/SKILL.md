---
name: colyseus-protocol
description: Adds or changes a Colyseus room message end-to-end (FpsRoom handler, schema if needed, socket-client send/onMessage, and the controller that consumes it). Use when adding network events, hits, weapons, grenades, health, respawn, or any client/server gameplay sync.
---

# Protocole Colyseus

Tout nouveau message doit exister des deux côtés dans le même tour de code.

## Côté serveur

1. Si l'état synchronisé change, étendre `server/src/schema.ts` (`PlayerState`, pickups, etc.).
2. Dans `FpsRoom.onCreate`, `this.onMessage("domaine:action", ...)`.
3. Valider payload : types, bornes, arme autorisée, rate-limit si c'est un update fréquent (`PLAYER_UPDATE_MIN_*`).
4. Diffuser avec `this.broadcast(...)` ou `client.send(...)` selon que tout le monde doit voir.

## Côté client

1. Envoi : méthode dédiée dans `public/js/net/socket-client.js` (`room.send(type, payload)`).
2. Réception : `nextRoom.onMessage("domaine:action", ...)` **et** branche dans `handleMessage`.
3. Le controller gameplay (`weapons`, `grenades`, `player`, `hud`, `remotePlayers`) consomme le message. Le socket ne fait pas de 3D.

## Nommage

`domaine:action` en camelCase anglais : `player:hit`, `grenade:throw`, `weapon:select`.

## Constantes

Si dégâts, fuse, blast, range : aligner `public/js/config.js` et les `const` de `FpsRoom.ts`.

## Ne pas faire

- Envoyer un hit et appliquer les HP uniquement en local.
- Réintroduire `team:select` sans changer le mode FFA volontairement.
- Utiliser le schema Colyseus comme seul canal si le jeu s'appuie déjà sur les messages custom (le code actuel mixe schema + messages).
