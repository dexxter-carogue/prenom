# Générateur de Prénoms Français - API Hybride

Solution haute performance et enrichie pour l'exploration des prénoms français.

## Architecture
- **Backend** : Node.js / Express
- **DB** : SQLite3
- **Sources** : INSEE (Data.gouv), Wikipedia, BehindTheName, Wikidata

## Installation

1. `cd server`
2. `npm install`
3. Créer un fichier `.env` basé sur l'exemple fourni :
   ```env
   ADMIN_TOKEN=votre_token_secret
   BTN_API_KEY=votre_cle_behind_the_name
   ```
4. Lancer le serveur : `node index.js`

## Initialisation des données (Admin)

Pour importer les prénoms de l'INSEE (depuis 1900) :
```bash
curl -X POST http://localhost:3000/api/admin/update-insee \
     -H "x-admin-token: votre_token_secret"
```

## Endpoints API

- `GET /api/name?prenom=Jerome&sexe=M&enrich=1` : Détails, stats INSEE et enrichissements.
- `GET /api/suggest?startsWith=Ma&sexe=F&sort=recent` : Suggestions basées sur la popularité.
- `GET /api/random?gender=f&number=3` : Prénoms aléatoires.

## Cache & Rate Limiting
- Cache SQLite de 24h pour les APIs tierces.
- Rate limiter sur `/api/*` (400 req/heure).
- Timeouts de 7s sur les appels externes pour garantir la réactivité.
