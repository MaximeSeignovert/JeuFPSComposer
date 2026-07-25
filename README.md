# FPS 5v5 Three.js

FPS 1ere personne avec:
- lobby de rooms (affichage `x/10`)
- matchmaking 5v5 (2 equipes de 5)
- trois classes d'arme: `Fusil a pompe`, `Sniper`, `AK47`
- deux slots permanents par classe: arme principale et `Couteau`
- un slot `Grenade` dynamique est ajouté lors d'un ramassage
- rendu Three.js
- backend Colyseus pour les rooms et la synchronisation

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
- Deplacement: `WASD`.
- Saut: `Espace`.
- Tir: `Clic gauche`.
- Maintenir clic gauche: tir continu.
- Changer de slot: molette bas pour le suivant, molette haut pour le precedent.
- Le HUD en bas a droite affiche tous les slots actuellement disponibles et met en evidence l'arme equipee.
- Couteau: attaque au corps a corps de tres pres, one-shot.
- Grenade: `G` l'equipe, maintenir le clic charge la puissance et relacher lance.
- Sur mobile, le bouton de changement d'arme parcourt les slots.
- Effets de tir: flash de bouche, trajectoire de balle, impact visuel.
- Le jeu est un prototype multijoueur de base (lobby + synchro positions) pret a etendre (tir, degats, score, respawn).
