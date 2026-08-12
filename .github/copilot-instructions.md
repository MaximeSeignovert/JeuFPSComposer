Lire `AGENTS.md` en premier, puis `CONTEXTE_PROJET.md` pour l'architecture.

Contraintes clés :
- Client ES modules sans bundler dans `public/`
- Serveur Colyseus dans `server/src/FpsRoom.ts` (autorité gameplay)
- Map live = désert `DESERT_MAP_LAYOUT`, pas l'ancienne `map-layout.js`
- Aligner les constantes client (`public/js/config.js`) et serveur
- Mode actuel : FFA, pas 5v5
