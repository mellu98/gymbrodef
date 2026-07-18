# HyperCore AI — Piano Estetico "Top of the Top"

## Regole d'oro (valide per ogni fase)

1. **Data contract intoccabile**: le chiavi `massi_*` in localStorage NON si toccano mai
   - `massi_user_programs`, `massi_user_profile`, `massi_user_nutrition_profile`
   - `massi_user_nutrition_plans`, `massi_nutrition_log_v1`, `massi_state_<id>`
   - `massi_hist_<id>`, `massi_done_<id>`, `massi_overlay_assistant_v1`
2. **Performance non si negozia**: ogni effetto va testato su mobile mid-range. Jank > 16ms = eliminato.
3. **`prefers-reduced-motion` rispettato sempre**: micro-celebrazioni si disattivano automaticamente.
4. **Service worker bump ad ogni release**: v25 → v26 → v27... (file `sw.js` riga 1).
5. **Una fase alla volta, deploy dopo ogni fase**: feedback continuo, niente big-bang.
6. **Zero nuove dipendenze**: tutto vanilla CSS + JS, niente Tailwind, niente librerie.

---

## Stato attuale (già fatto)

- [x] `:focus-visible` globale — ring verde su tutti i controlli da tastiera
- [x] `prefers-reduced-motion` — animazioni vestibolari disattivate
- [x] Design tokens v1 in `:root` — colori, spacing, radius, z-index, typography
- [x] `transition:all` eliminato — proprietà specifiche ovunque
- [x] Bottom dock unificato a 5 tab con SVG inline — hamburger rimosso
- [x] Touch target ≥ 44px su pulsanti close e checkbox
- [x] FAB timer/assistente/finish non si sovrappongono
- [x] ESC chiude modali, Cmd+Enter invia messaggio assistente
- [x] `@layer` dichiarato per cascade controllata
- [x] Service worker cache v24 → v25

---

## Fase 0 — Direzione visiva (BLOCCANTE)

**Tempo**: mezza giornata | **Rischio**: nessuno | **File**: nessuno

Prima di ogni riga di codice, scegliere UNO stile tra:

- **A) Cinematic OLED** ← *raccomandato* — sfondo #000 puro, verde neon, grain SVG, Bebas 80-120px, accent metallici. Riferimenti: **Whoop**, **Future App**, **Tesla UI**
- **B) Athletic Brutalist** — colori primari saturi, layout asimmetrici, tipografia titanica. Riferimenti: **Nike Training Club**, **Gymshark**
- **C) Premium Cockpit** — dashboard telemetria, ring chart ovunque, numeri display. Riferimenti: **Strava Premium**, **Oura Ring**, **Garmin Connect**

**Raccomandazione**: A + tocchi di C. "HyperCore" suona tech/atletico.

**Deliverable**: 1 moodboard (10-15 screenshot da Mobbin/Dribbble) + 1 frase brand voice visiva.

---

## Fase 1 — Foundation v2 (token estesi)

**Tempo**: 2-4 ore | **Rischio**: 🟢 zero | **File**: `assets/css/app.css`

Aggiungere a `:root`:

```css
/* Color v2 */
--accent-2: #9d4edd;          /* viola per nutrizione/AI */
--accent-3: #ff6b35;          /* arancio per progressi/PR */
--g-glow: 0 0 24px rgba(0,230,118,.45);
--g-grad: linear-gradient(135deg, #00e676 0%, #00c853 50%, #00a843 100%);

/* Elevation 5-step */
--elev-1: 0 1px 2px rgba(0,0,0,.4), 0 0 0 1px rgba(255,255,255,.04);
--elev-2: 0 4px 12px rgba(0,0,0,.4), 0 0 0 1px rgba(255,255,255,.06);
--elev-3: 0 12px 28px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.08), inset 0 1px 0 rgba(255,255,255,.06);
--elev-4: 0 24px 56px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.09), inset 0 1px 0 rgba(255,255,255,.08);
--elev-5: 0 40px 80px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.12), inset 0 1px 0 rgba(255,255,255,.1);

/* Typography v2 */
--track-tight: -.02em;
--track-display: -.04em;
--track-uppercase: .18em;

/* Easing curves cinematic */
--ease-snap: cubic-bezier(.5, 0, .1, 1);
--ease-decel: cubic-bezier(.16, 1, .3, 1);
--ease-spring: cubic-bezier(.34, 1.56, .64, 1);
```

Grain overlay tramite `body::before` con SVG noise inline (mix-blend-mode: overlay, opacity .04) — texture visibile ma non invadente.

**Deliverable**: tokens v2 + grain overlay + body true black opzionale.

---

## Fase 2 — Componenti hero

**Tempo**: 2-3 giorni | **Rischio**: 🟢 zero | **File**: `assets/css/app.css`, `assets/js/app.js`

### 2.1 Bottom dock — "magic indicator"
Pill verde che scivola tra tab attivi con FLIP animation (Web Animations API, `getBoundingClientRect()`). ~80 righe JS, zero librerie.

### 2.2 Cards con depth reale
- Border gradient animato (`conic-gradient` che ruota su hover)
- Inner glow `inset 0 0 60px rgba(0,230,118,.04)` di base
- Hover: `transform: perspective(800px) rotateX(2deg) rotateY(-2deg) scale(1.02)`
- Active: scale-down + glow pulse

### 2.3 Bottoni 3 varianti
- **Primary** `.btn-primary`: gradient verde + glow + shimmer shimmer al hover
- **Ghost** `.btn-ghost`: outline + fill on hover
- **Destructive** `.btn-danger`: amber glow, conferma a 2-step

### 2.4 Header scroll-aware
Listener su `#app` scroll: `.hdr.shrunk` riduce padding + logo 44px→32px, `backdrop-filter` intensifica. Reverse on scroll-up.

### 2.5 Input con floating label
`<label>` che fluttua sopra l'input quando focused/filled. `transform: translateY` + `font-size` animati. Stato errore con shake keyframe.

**Deliverable**: 5 componenti rifatti, visivamente drammaticamente migliorati.

---

## Fase 3 — Identità per sezione

**Tempo**: 4-5 giorni | **Rischio**: 🟡 basso | **File**: `assets/css/app.css`, `assets/js/app.js`

### 3.1 Schede (Programs)
- Grid bento asimmetrica: scheda ATTIVA 2x, le altre 1x
- Card attiva: halo verde pulsante + gradient border animato
- Mini-preview dei prossimi 3 esercizi visibile sulla card

### 3.2 Settimana (Today)
- Backdrop **time-of-day aware**: alba (5-9) viola, giorno (9-18) verde, sera (18-22) ambra, notte (22-5) blu deep
- Numero giorno gigante (Bebas 120px, weight 200) come lockscreen iOS
- 3 ring concentrici stile Apple Activity per completamento serie/giorno/settimana

### 3.3 Nutrizione
- Cockpit con 4 ring chart SVG animati con `stroke-dashoffset` (calorie, proteine, carbo, grassi)
- Pasti come timeline verticale stile Strava activity feed
- Background virato verso `--accent-2` (viola)

### 3.4 Progressi
- Sparkline SVG dinamiche per ogni esercizio principale
- PR badge animato (SVG SMIL) quando batti record
- Heatmap 12 settimane stile GitHub contributions
- Background virato verso `--accent-3` (arancio)

### 3.5 Coach AI
- Chat bubble premium: typing dots animati, message slide-in con stagger delay
- Suggestion chips sotto il composer
- Avatar AI (cerchio con ondulazione SVG) durante thinking

**Deliverable**: 5 sezioni con identità visiva propria e differenziata.

---

## Fase 4 — Workout Session (L'EROE)

**Tempo**: 1 settimana | **Rischio**: 🟡 medio (DOM sessione, no dati) | **File**: `assets/js/app.js`, `assets/css/app.css`

Questa è la schermata dove l'utente passa più tempo. Deve essere IMMERSIVA.

### 4.1 Pre-workout countdown
- Countdown 3-2-1 a tutto schermo, Bebas 180px
- Haptic `vibrate([100,100,100])` a ogni numero
- Skip con tap ovunque

### 4.2 Active session: Focus Mode
- Solo l'esercizio corrente in primo piano, gli altri con `opacity: .3 blur(4px)`
- Progress bar → "energy bar" verde→giallo→rosso (quantità energia rimasta)
- Numero serie attuale GIGANTE al centro (Bebas 96px)
- Kg input con stepper ±2.5kg, bottoni 60px

### 4.3 Set completed — micro-celebration
- Check che scoppia con 6-8 particelle SVG che si espandono e svaniscono
- `navigator.vibrate(50)` medium impact
- Numero serie che incrementa con bounce (spring easing)
- Opzione sound: tic acustico (`AudioContext` Web API)

### 4.4 Rest timer ridisegnato
- Ring più dramatic: `stroke-width: 6px`, gradient lungo il path SVG
- Sfondo che si tinge di blu durante il rest (`background-color` transizione lenta)
- Vibration a 5", 3", 1" e a fine
- Tap sul ring centrale = +15" quick-add
- Dismiss con swipe down

### 4.5 PR detected in live
- Confronto: "Ultima volta 80kg × 8 → Oggi 82.5kg × 8 = NUOVO PR"
- Badge "PR" con `scale` + `rotate` spring animation
- Auto-save in storico PR

### 4.6 Session end — report cinematico
- Stats reveal sequenziale con number counters da 0
  - "Tempo totale", "Volume sollevato (kg)", "PR battuti", "Calorie stimate"
- Share button: genera `<canvas>` 1080×1920 condivisibile su Instagram Story
- CTA "Inizia il recupero" → apre sezione nutrizione con focus su pasto post-workout

**Deliverable**: 6 momenti della sessione trasformati. Questa è la fase che vale da sola il +25% wow.

---

## Fase 5 — Empty states & onboarding

**Tempo**: 2 giorni | **Rischio**: 🟢 zero | **File**: `assets/js/app.js`, `assets/css/app.css`

### 5.1 Illustrazioni custom SVG
- 5 illustrazioni line-art (una per sezione vuota), accent verde
- Animazione self-draw al primo render (`stroke-dasharray` + `stroke-dashoffset`)

### 5.2 First-run experience
- Welcome screen: logo HyperCore animato (glow → pulse → settle, 6 frame SVG SMIL)
- 3 slide onboarding: cosa fa l'app / come importare il PDF / come iniziare
- Skip-able in 1 tap
- Persistito in `massi_onboarding_done` (nuova chiave safe)

### 5.3 Install prompt premium
- UI custom per `beforeinstallprompt` — NO banner browser nativo
- Spiega: "Timer in lockscreen · Accesso offline · Notifiche fine riposo"
- Design bottom sheet animato

**Deliverable**: 5 illustrazioni + onboarding + install prompt premium.

---

## Fase 6 — Motion choreography

**Tempo**: 3 giorni | **Rischio**: 🟡 basso | **File**: `assets/js/app.js`, `assets/css/app.css`

### 6.1 Page transitions con shared element
Tap su scheda → il titolo si anima dalla card alla nuova schermata (FLIP). Vanilla: `getBoundingClientRect()` + `Web Animations API`. Zero librerie.

### 6.2 Stagger entry per grid
Card che entrano sequenzialmente con delay incrementale via CSS custom property `--i`:
```css
.program-card { animation-delay: calc(var(--i, 0) * 30ms); }
```
Settato via JS `card.style.setProperty('--i', index)`.

### 6.3 Number counters
Tutti i numeri grossi (kg, serie, %, calorie) animati con `requestAnimationFrame` da 0 al valore target in 600ms con easing.

### 6.4 Skeleton shimmer
Durante chiamate AI (`/api/ai/generate-program`, `/api/ai/nutrition/generate-plan`): skeleton con shimmer gradient animato invece del testo statico "Caricamento...".

### 6.5 Haptic feedback strategico
```js
// Scale: leggero → medio → forte → pattern
vibrate(10)              // tap selezione
vibrate(50)              // set completata
vibrate([100, 50, 100]) // PR raggiunto
vibrate([50, 50, 50])   // errore
```

**Deliverable**: 5 sistemi di motion coordinati. L'app sente "viva".

---

## Fase 7 — Iconografia professionale

**Tempo**: 1 giorno | **Rischio**: 🟢 zero | **File**: `index.html`, `assets/css/app.css`, `assets/js/app.js`

### 7.1 Phosphor Duotone
Scarica da [phosphoricons.com](https://phosphoricons.com) gli SVG variante **duotone**. Stroke primario + fill con opacity `.2` nello stesso path. Look premium istantaneo, peso < 2KB per icon.

Icone necessarie: folder, calendar, leaf, chart-line, robot, check-circle, x, timer, fire, trophy, barbell, arrow-left, plus, trash, sparkle.

### 7.2 Brand mark HyperCore animato
Logo con animazione idle (pulse ogni 4s, `opacity: .6 → 1`) e animazione attiva (glow intensifica durante AI thinking, verde → bianco → verde).

### 7.3 Icon active state nel dock
Quando un tab è attivo, micro-animazione specifica:
- **Schede**: cartella che "si apre" (path morph leggero)
- **Settimana**: calendario che mostra il giorno corrente
- **Nutrizione**: foglia che pulsa
- **Progressi**: grafico che "completa"
- **Coach**: cerchio AI che respira

**Deliverable**: ~20 icone duotone + brand mark animato + active states dock.

---

## Fase 8 — Theming & polish finale

**Tempo**: 1-2 giorni | **Rischio**: 🟢 zero | **File**: `assets/css/app.css`, `assets/js/app.js`

### 8.1 3 dark variants
Persistiti in `massi_theme_pref` (nuova chiave safe, non altera dati esistenti):
- **OLED True Black**: `--bg: #000000`, contrast massimo
- **Dark Cool** (default attuale): `--bg: #060606` con blue tint
- **Dark Warm**: `--bg: #0a0806` con amber tint

Selector su `<html data-theme="oled|cool|warm">`.

### 8.2 Accessibility audit finale
- Lighthouse a11y → target 100/100
- Screen reader walk-through (VoiceOver iOS + NVDA Windows)
- Contrast ratio WCAG AAA su tutto il testo ≤ 14px

### 8.3 Performance audit
- Lighthouse performance → target 95+
- LCP < 2s, CLS < 0.05, TBT < 200ms
- Verifica CSS critical path (niente layout shift al caricamento dock)

**Deliverable**: 3 temi + audit certificati.

---

## Riepilogo e priorità

| Fase | Tempo | Wow gain | Priorità |
|------|-------|----------|----------|
| 0. Direzione visiva | 0.5 gg | — | 🔴 BLOCCANTE |
| 1. Foundation v2 | 0.5 gg | +5% | 🟠 Alta |
| 2. Componenti hero | 2-3 gg | +20% | 🔴 Critica |
| 3. Identità sezioni | 4-5 gg | +15% | 🟠 Alta |
| **4. Workout session** | **1 sett** | **+25%** | 🔴 **MAX** |
| 5. Empty/onboarding | 2 gg | +5% | 🟡 Media |
| 6. Motion choreography | 3 gg | +15% | 🔴 Critica |
| 7. Iconografia | 1 gg | +5% | 🟠 Alta |
| 8. Theming/polish | 1-2 gg | +10% | 🟡 Media |

**Totale**: ~3-4 settimane part-time, ~2 settimane full-time.

---

## Da dove iniziare

**Subito → Fase 0 + Fase 1 + Fase 4.1-4.2**

Perché? La sessione di workout è dove l'utente passa il 70% del tempo nell'app. Se rendi epica quella schermata, anche se il resto è ancora vecchio, l'app si percepisce premium. Le altre fasi cascadono nel tempo.

Quando sei pronto: "iniziamo Fase 0" → costruiamo il moodboard con riferimenti precisi e decidiamo la direzione visiva definitiva.
