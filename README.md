# FPS 5v5 Three.js

FPS 1ere personne avec:
- lobby de rooms (affichage `x/10`)
- matchmaking 5v5 (2 equipes de 5)
- choix d'arme: `Fusil a pompe`, `Sniper`, `AK47`, `Couteau`
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
- Couteau: attaque au corps a corps de tres pres, one-shot.
- Effets de tir: flash de bouche, trajectoire de balle, impact visuel.
- Le jeu est un prototype multijoueur de base (lobby + synchro positions) pret a etendre (tir, degats, score, respawn).
