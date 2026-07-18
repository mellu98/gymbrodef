HYPERCORE AI - PWA FITNESS CON COACH AI

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
- Il parser PDF v2 riconosce anche i blocchi superset come mini circuiti: esercizi in sequenza, pausa solo dopo l'ultimo, round tracciati come una singola card

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
- POST /api/ai/nutrition/intake -> legge profilo nutrizione + contesto allenamento e restituisce solo le domande mancanti per il piano alimentare
- POST /api/ai/nutrition/generate-plan -> genera una bozza di piano alimentare training/rest day compatibile con la sezione Nutrizione
- POST /api/ai/nutrition/refine-plan -> modifica una bozza nutrizione esistente in base a richieste testuali dell'utente
- GET /healthz -> healthcheck semplice

Coach AI fase 1:
- Il tab Coach non e` una chat libera: e` un wizard PT AI
- Il profilo utente viene salvato in localStorage con chiave massi_user_profile
- Il Coach AI legge scheda attiva, settimane, storico e progressi recenti
- La bozza generata resta prima nel tab Coach, dove puo' essere rifinita via chat
- Quando la bozza convince, si apre nello stesso editor/review usato per l'import PDF
- Le schede salvate dal Coach AI restano schede utente normali con origin = ai

Nutrition Coach AI:
- La sezione Nutrizione e` separata dall'allenamento ma usa comunque il contesto reale della scheda attiva e della frequenza recente
- Il profilo nutrizione viene salvato in localStorage con chiave massi_user_nutrition_profile
- I piani alimentari vengono salvati in localStorage con chiave massi_user_nutrition_plans
- Il tracking giornaliero viene salvato in localStorage con chiave massi_nutrition_log_v1
- Ogni piano distingue training day e rest day con pasti, cibi, grammi e target giornalieri
- La bozza del piano resta nella sezione Nutrizione e puo' essere rifinita via chat prima del salvataggio
- Solo un piano alimentare alla volta puo' essere attivo, ma quelli precedenti restano consultabili
- Il tracking v1 include checklist pasti, aderenza, peso, acqua e note per data reale

Assistente AI flottante:
- Il pulsante robot apre una mini chat overlay separata dal tab Coach
- La mini chat usa sessionStorage con chiave massi_overlay_assistant_v1
- I messaggi restano disponibili finche' l'app resta aperta, ma ripartono visivamente da zero quando la sessione della PWA/browser viene riaperta
- Il payload verso /api/chat include anche contesto automatico della schermata corrente, della scheda attiva e del workout in corso

CATALOGO ESERCIZI E MATCHING CANONICO

Architettura:
- I dati testuali del dataset open `hasaneyldrm/exercises-dataset` (1.324 esercizi) sono importati in `data/exercises.catalog.json`
- I nomi italiani curati e gli alias sono in `data/exercise-aliases.it.json`
- `lib/exercise-catalog.js` carica i file in memoria e offre ricerca, shortlist e alternative
- `lib/exercise-matcher.js` implementa un mini-RAG ibrido: normalizzazione testuale, alias italiani, exact match, fuzzy matching (Levenshtein + token-set), filtri per equipment e muscolo/body part

Flusso matching:
- Dopo import PDF e generazione Coach AI ogni esercizio viene passato al matcher
- Confidence >= 0.90: match automatico, catalogId salvato
- Confidence 0.72-0.89: match dubbio, mostrato nella preview per conferma
- Confidence < 0.72: esercizio personalizzato, nessun catalogId
- Nella preview import/Coach AI ogni esercizio mostra il badge match e un pulsante per cercare/confermare nel catalogo
- Nel Focus Mode, se esiste catalogId, compare la sezione "Come si esegue" con nome canonico, target, equipment, muscoli secondari e istruzioni italiane

Endpoint esercizi:
- GET /api/exercises/search?q=<query>
- GET /api/exercises/:id
- POST /api/exercises/match
- GET /api/exercises/:id/alternatives

Coach AI con catalogo:
- Prima di generare la scheda il Coach richiede una shortlist filtrata per equipment, focus muscolari ed esercizi da evitare
- La shortlist viene inclusa nel prompt di sistema per orientare il modello
- Dopo la risposta il backend esegue post-processing con il matcher per assegnare catalogId validi quando possibile

Dataset completo:
- La repo `hasaneyldrm/exercises-dataset` e' inclusa in `data/exercises-dataset/` con dati testuali, immagini e video.
- I file sono serviti pubblicamente dal server tramite la route statica `/exercises-dataset/`.

Attenzione licenza media:
- I dati testuali e la struttura del dataset sono rilasciati sotto MIT License.
- Le immagini in `data/exercises-dataset/images/` e i video in `data/exercises-dataset/videos/` sono © Gym visual (https://gymvisual.com/) e sono governati da `data/exercises-dataset/NOTICE.md`, NON dalla MIT. Clonare il dataset originale non concede diritti di ridistribuzione commerciale dei media.
- Il pulsante DEMO nel Focus Mode apre Google Immagini con il nome dell'esercizio.

Aggiornare il catalogo:
1. Clonare o scaricare https://github.com/hasaneyldrm/exercises-dataset
2. Copiare il contenuto nella cartella `data/exercises-dataset/`
3. Eseguire `node scripts/build-catalog.js`
4. Verificare con `node -e "console.log(require('./lib/exercise-catalog').getStats())"`

Retrocompatibilita:
- catalogId, matchConfidence, canonicalName, target, equipment, secondaryMuscles, instructionsIt sono campi opzionali
- Le schede gia' salvate in localStorage senza questi campi continuano a funzionare
- Lo schema legacy per fallback PDF resta invariato

