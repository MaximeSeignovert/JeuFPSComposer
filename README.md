# FPS Three.js + Colyseus

FPS 1ere personne avec:
- menu d'accueil unique avec pseudo et bouton `Jouer`
- room jusqu'a 10 joueurs, mode actuel **FFA** (le 5v5 reste une intention)
- trois classes d'arme: `Fusil a pompe`, `Sniper`, `AK47`
- deux slots permanents par classe: arme principale et `Couteau`
- un slot `Grenade` dynamique est ajouté lors d'un ramassage
- map desert Qasr Al-Rih
- rendu Three.js
- backend Colyseus pour les rooms et la synchronisation

Contexte pour agents IA : `AGENTS.md` (index) et `CONTEXTE_PROJET.md` (briefing).

## Lancer en local

```bash
npm install
npm run dev
```

Puis ouvre `http://localhost:3000`.

## Build / production

```bash
npm run build
npm start
```

Le serveur respecte `PORT` si la variable est fournie. L'endpoint `GET /health`
retourne `{ ok: true }`.

## Notes gameplay

- Clic dans le canvas: capture souris (pointer lock).
- Deplacement: `ZQSD` (AZERTY, remappable).
- Saut: `Espace`.
- Tir: `Clic gauche`.
- Maintenir clic gauche: tir continu.
- Changer de slot: molette bas pour le suivant, molette haut pour le precedent.
- Le HUD en bas a droite affiche tous les slots actuellement disponibles et met en evidence l'arme equipee.
- Couteau: attaque au corps a corps de tres pres, one-shot.
- Grenade: `G` l'equipe, maintenir le clic charge la puissance et relacher lance.
- Sur mobile, le bouton de changement d'arme parcourt les slots.
- Effets de tir: flash de bouche, trajectoire de balle, impact visuel.
- Prototype jouable : lobby, tirs, degats, score, respawn, grenades, bot de dev.
