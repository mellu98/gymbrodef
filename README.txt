MASSI GYM - PWA CON IMPORT PDF PT

Contenuto:
- index.html -> app principale
- programs.json -> schede bundled iniziali
- app.webmanifest -> configurazione PWA
- sw.js -> cache offline base
- icons/ -> icone app
- server.js -> server Node/Express che serve la PWA e l'endpoint PDF
- package.json -> dipendenze e script

Flusso schede:
- Le schede bundled restano in programs.json
- Le schede importate dal PDF vengono salvate in localStorage come schede utente
- Ogni import PDF crea una nuova scheda, senza sostituire quelle esistenti

Variabili ambiente backend:
- OPENAI_API_KEY -> obbligatoria per l'import PDF
- CORS_ALLOWED_ORIGIN -> opzionale, utile se frontend e backend non sono sullo stesso dominio
- OPENAI_MODEL -> opzionale, default gpt-4.1
- OPENAI_TIMEOUT_MS -> opzionale, default 180000
- MUSCLEWIKI_API_KEY -> opzionale, abilita match guida avanzato e dettagli esercizio
- MUSCLEWIKI_API_BASE_URL -> opzionale, default https://api.musclewiki.com

Avvio locale:
1. npm install
2. imposta OPENAI_API_KEY
3. opzionale: imposta MUSCLEWIKI_API_KEY
4. npm start
5. apri http://localhost:3000

Deploy su Render:
- deploy come Web Service Node, non piu` come semplice static site
- build command: npm install
- start command: npm start
- root: cartella del progetto

Endpoint:
- POST /api/import-pdf -> riceve multipart/form-data con file PDF
- GET /healthz -> healthcheck semplice
- GET /api/guide/search?q=... -> cerca un esercizio su MuscleWiki
- GET /api/guide/exercise/:id -> dettagli guida per l'esercizio selezionato
