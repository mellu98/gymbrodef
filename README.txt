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
- OPENAI_API_KEY -> obbligatoria per import PDF e Coach AI
- CORS_ALLOWED_ORIGIN -> opzionale, utile se frontend e backend non sono sullo stesso dominio
- OPENAI_MODEL -> opzionale, default gpt-4.1, usato per generazione schede del Coach AI
- OPENAI_PDF_MODEL -> opzionale, default gpt-5.1, usato dal parser PDF; fallback automatici: gpt-5.4 poi gpt-4.1
- OPENAI_ASSISTANT_MODEL -> opzionale, default gpt-5-nano, usato dalla mini chat flottante Assistente AI

Avvio locale:
1. npm install
2. imposta OPENAI_API_KEY
3. npm start
4. apri http://localhost:3000

Deploy su Render:
- deploy come Web Service Node, non piu` come semplice static site
- build command: npm install
- start command: npm start
- root: cartella del progetto

Endpoint:
- POST /api/import-pdf -> riceve multipart/form-data con file PDF
- POST /api/chat -> mini assistente AI rapido, contestuale alla schermata corrente
- POST /api/ai/intake -> legge profilo + contesto e restituisce solo le domande mancanti per creare una nuova scheda
- POST /api/ai/generate-program -> genera una scheda JSON compatibile con l'app partendo da profilo, storico e risposte finali
- POST /api/ai/refine-program -> modifica una bozza Coach AI esistente in base a richieste testuali dell'utente
- GET /healthz -> healthcheck semplice

Coach AI fase 1:
- Il tab Coach non e` una chat libera: e` un wizard PT AI
- Il profilo utente viene salvato in localStorage con chiave massi_user_profile
- Il Coach AI legge scheda attiva, settimane, storico e progressi recenti
- La bozza generata resta prima nel tab Coach, dove puo' essere rifinita via chat
- Quando la bozza convince, si apre nello stesso editor/review usato per l'import PDF
- Le schede salvate dal Coach AI restano schede utente normali con origin = ai

Assistente AI flottante:
- Il pulsante robot apre una mini chat overlay separata dal tab Coach
- La mini chat usa sessionStorage con chiave massi_overlay_assistant_v1
- I messaggi restano disponibili finche' l'app resta aperta, ma ripartono visivamente da zero quando la sessione della PWA/browser viene riaperta
- Il payload verso /api/chat include anche contesto automatico della schermata corrente, della scheda attiva e del workout in corso
