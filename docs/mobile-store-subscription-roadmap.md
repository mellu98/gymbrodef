# Gym Bro Massi: Roadmap Mobile, Store e Subscription

## Obiettivo

Portare l'app dallo stato attuale di PWA monolitica a un prodotto mobile pubblicabile su Play Store e App Store, vendibile in abbonamento, con una parte nutrizione affidabile e abbastanza robusta da reggere utenti paganti.

## Punto di partenza reale

- Il frontend vive quasi tutto in `index.html`.
- Il backend vive quasi tutto in `server.js`.
- Molto stato utente e` salvato solo in `localStorage` e `sessionStorage`.
- Le feature AI dipendono dal backend ma la continuita` utente dipende ancora troppo dal browser.
- Non ci sono test, lint o veri gate di release.
- La nutrizione e` una delle aree piu` delicate per logica, sicurezza percepita e valore premium.

## Scelta consigliata di delivery

### Percorso raccomandato

Percorso `wrapper-first` con Capacitor, non rewrite immediata.

### Perche`

- La documentazione ufficiale di Capacitor dice che puo` essere inserito in un progetto web esistente e usato per target iOS e Android.
- La base attuale e` web-first; riscrivere subito in React Native o Flutter aumenterebbe molto tempi e rischio.
- Apple e Google richiedono un'integrazione store-grade per abbonamenti e gestione entitlement, quindi il nodo critico non e` solo "fare l'app mobile", ma rifondare stato, account e billing.

### Quando rivalutare

Rivalutare il wrapper-first solo se emergono blocchi seri su:

- performance della sessione workout
- gestione tastiera e overlay complessi
- billing nativo
- deep link e restore
- UX troppo fragile su dispositivi reali

## Architettura target

### Frontend target

```text
client/
  assets/
    css/
    icons/
  app/
    state/
    router/
    storage/
    api/
  features/
    programs/
    session/
    progress/
    coach/
    nutrition/
    import/
    billing/
    auth/
  shared/
    ui/
    utils/
```

### Backend target

```text
server/
  app.js
  routes/
    health.js
    chat.js
    ai-programs.js
    ai-nutrition.js
    import-pdf.js
    billing.js
    auth.js
  services/
    openai/
    billing/
    nutrition/
    programs/
  domain/
    schemas/
    validators/
    normalizers/
  jobs/
    subscription-events/
```

### Principi chiave

- Il client non deve essere la fonte di verita` per dati premium o entitlement.
- Il server deve diventare autorita` per account, billing, restore, sync e storico critico.
- `localStorage` deve restare solo cache o fallback temporaneo, non base prodotto.
- Coach AI e nutrizione AI devono restare server-side.

## Roadmap in fasi

## Now

### Fase 0: Stabilizzazione del web core

Obiettivo: togliere i rischi strutturali piu` grossi senza spezzare l'app.

Deliverable:

- estrarre CSS e JS da `index.html`
- dividere il frontend per domini: programs, session, progress, coach, nutrition, import
- centralizzare stato e navigazione
- ridurre handler inline e uso massivo di `innerHTML`
- introdurre lint e smoke test minimi
- correggere i bug logici gia` emersi, in particolare il mismatch date tra workout history e logica nutrizione
- rendere il service worker meno fragile negli update

Exit criteria:

- `index.html` non contiene piu` tutta la logica applicativa
- i flussi principali sono separati per modulo
- l'app regge modifiche senza regressioni facili su altre sezioni

### Fase 1: Fondazioni di prodotto

Obiettivo: preparare il terreno per utenti reali e paganti.

Deliverable:

- account utente
- sync minimo tra dispositivi
- backend per profilo utente, programmi, storico e piano nutrizione attivo
- telemetria base: analytics, error logging, release tagging
- environment separation: local, staging, production

Exit criteria:

- reinstallare l'app o cambiare device non significa perdere tutto
- gli errori critici sono osservabili
- esiste una base per entitlement e restore

## Next

### Fase 2: Mobile shell e beta tecnica

Obiettivo: entrare davvero su dispositivo come app mobile.

Deliverable:

- integrazione Capacitor
- progetto Android e iOS configurato
- build locali e firma base
- test su device reali per:
  - sessione allenamento
  - overlay AI
  - import PDF
  - tastiera
  - safe areas
  - aggiornamenti app

Exit criteria:

- esistono build installabili su Android e iPhone
- i flussi core funzionano bene su device reali, non solo nel browser desktop

### Fase 3: Subscription core

Obiettivo: monetizzazione corretta e review-safe.

Deliverable:

- definizione feature `free` e `premium`
- SKU mensile e annuale
- backend entitlement model
- acquisto, restore, rinnovo, scadenza, grace period, cancellazione
- paywall iniziale
- supporto customer-facing per billing issues

Feature premium consigliate:

- AI coach
- nutrizione avanzata
- import PDF
- insights storici avanzati
- sync e backup
- libreria premium di programmi

Exit criteria:

- il pagamento sblocca feature premium in modo affidabile
- il restore funziona
- un utente pagante non perde accesso dopo reinstall o cambio device

## Later

### Fase 4: Nutrition system hardening

Obiettivo: rendere la nutrizione una vera leva premium, non un blocco fragile di AI.

Deliverable:

- modello dati nutrizione separato
- onboarding nutrizione strutturato
- campi obbligatori chiari:
  - goal
  - allergie
  - esclusioni
  - stile alimentare
  - frequenza allenamento
  - meal cadence
- logica coerente per giorni training e rest
- refinement che conserva i vincoli precedenti
- messaggi di fallback chiari quando AI fallisce
- guardrail per evitare output estremi o incoerenti

Exit criteria:

- la generazione nutrizione e` spiegabile e raffinabile
- la nutrizione non rompe lo stato quando aggiorni o ricalcoli un piano
- l'utente capisce sempre da quali input nasce il piano

### Fase 5: Store readiness e launch ops

Obiettivo: passare da beta tecnica a prodotto pubblicabile.

Deliverable:

- privacy policy, support page, legal terms
- store listing assets
- review notes per Apple
- data safety per Google
- beta interna e poi beta esterna
- checklist release e rollback
- smoke test di release

Exit criteria:

- l'app ha tutti gli asset e i documenti per la submission
- la release candidate supera i gate funzionali e di privacy

## Modello business consigliato

### Free

- tracking allenamenti base
- un programma starter
- storico limitato

### Premium

- AI coach
- nutrizione personalizzata
- import PDF
- storico e insight avanzati
- sync e backup
- multi-program library

### Piani iniziali

- mensile
- annuale

Trial solo se l'onboarding riesce a dimostrare valore entro i primi minuti o primi giorni.

## Stream nutrizione dedicato

La nutrizione deve avere una roadmap propria, non essere trattata come una sottosezione del coach.

Priorita` nutrizione:

1. correggere la logica training/rest
2. separare stato onboarding, piano attivo, log giornaliero e refinement
3. definire guardrail di sicurezza e fallback UX
4. rendere la nutrizione una feature premium basata su continuita` e personalizzazione
5. spostare nel backend almeno piano attivo, storico chiave e regole di entitlement

## Must-fix prima degli store

- persistenza browser-only per dati importanti
- nessun vero gate di quality
- `index.html` e `server.js` troppo monolitici
- cache PWA potenzialmente stantia
- flussi AI senza abbastanza hardening operativo
- billing e restore ancora assenti
- nutrizione ancora troppo accoppiata alla logica generale

## Cose da non costruire ancora

- nuove feature grandi nel coach
- nuove schermate marketing in app
- piani subscription multipli complessi
- esperimenti pricing avanzati
- redesign totale UI

Prima va chiusa la base: modularita`, sync, mobile shell, billing e nutrizione affidabile.

## Ordine pratico consigliato

1. Refactor frontend e bug fix strutturali
2. Account, sync, backend persistence
3. Capacitor e device testing
4. Billing ed entitlement backend
5. Nutrition hardening
6. Beta chiusa
7. Store submission

## Fonti ufficiali usate per la direzione proposta

- [Capacitor Docs](https://capacitorjs.com/docs)
- [Google Play Billing Overview](https://developer.android.com/google/play/billing/)
- [Google Play Subscriptions](https://developer.android.com/google/play/billing/subscriptions)
- [Apple Auto-renewable Subscriptions](https://developer.apple.com/app-store/subscriptions/)
