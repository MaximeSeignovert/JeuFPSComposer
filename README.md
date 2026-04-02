# FPS 5v5 Three.js

FPS 1ere personne avec:
- lobby de rooms (affichage `x/10`)
- matchmaking 5v5 (2 equipes de 5)
- choix d'arme: `Fusil a pompe`, `Sniper`, `AK47`
- rendu Three.js
- backend WebSocket pour synchronisation

## Lancer en local

```bash
npm install
npm run dev
```

Puis ouvre `http://localhost:3000`.

## Deploy rapide sur Railway

1. Push ce projet sur GitHub.
2. Sur Railway: `New Project` -> `Deploy from GitHub repo`.
3. Railway detecte automatiquement Node.js.
4. Le service lance `npm start`.
5. Ouvre l'URL Railway generee.

Le fichier `railway.json` est deja configure avec healthcheck `/health`.

## Notes gameplay

- Clic dans le canvas: capture souris (pointer lock).
- Deplacement: `WASD`.
- Saut: `Espace`.
- Tir: `Clic gauche`.
- Maintenir clic gauche: tir continu.
- Effets de tir: flash de bouche, trajectoire de balle, impact visuel.
- Le jeu est un prototype multijoueur de base (lobby + synchro positions) pret a etendre (tir, degats, score, respawn).
