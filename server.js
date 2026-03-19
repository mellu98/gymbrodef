const express = require('express');
const multer = require('multer');
const path = require('path');
const OpenAI = require('openai');

const app = express();
app.use(express.json({ limit: '1mb' }));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Carica un file PDF valido.'));
    }
    cb(null, true);
  }
});

const PORT = Number(process.env.PORT || 3000);
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1';
const OPENAI_ASSISTANT_MODEL = process.env.OPENAI_ASSISTANT_MODEL || 'gpt-5-nano';
const CORS_ALLOWED_ORIGIN = (process.env.CORS_ALLOWED_ORIGIN || '').trim();
const PARSER_VERSION = 'pt-pdf-v1';
const COACH_AI_VERSION = 'coach-ai-v1';
const ASSISTANT_CHAT_VERSION = 'assistant-overlay-v1';
const ROOT_DIR = __dirname;
const ICONS_DIR = path.join(ROOT_DIR, 'icons');

const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const IMPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'isWorkoutProgram',
    'isTextualPdf',
    'rejectionReason',
    'athleteName',
    'title',
    'subtitle',
    'weeks',
    'confidence',
    'warnings',
    'days'
  ],
  properties: {
    isWorkoutProgram: { type: 'boolean' },
    isTextualPdf: { type: 'boolean' },
    rejectionReason: { type: 'string' },
    athleteName: { type: 'string' },
    title: { type: 'string' },
    subtitle: { type: 'string' },
    weeks: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    warnings: {
      type: 'array',
      items: { type: 'string' }
    },
    days: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'label', 'exercises'],
        properties: {
          name: { type: 'string' },
          label: { type: 'string' },
          exercises: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'series', 'reps', 'note'],
              properties: {
                name: { type: 'string' },
                series: { type: 'integer', minimum: 1 },
                reps: { type: 'string' },
                repsPlan: {
                  type: 'array',
                  items: { type: 'string' }
                },
                note: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }
};

const COACH_PROGRAM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['candidateProgram', 'rationale', 'warnings', 'confidence'],
  properties: {
    candidateProgram: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'subtitle', 'weeks', 'days'],
      properties: {
        title: { type: 'string' },
        subtitle: { type: 'string' },
        weeks: { type: 'string' },
        days: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'label', 'exercises'],
            properties: {
              name: { type: 'string' },
              label: { type: 'string' },
              exercises: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['name', 'series', 'reps', 'note'],
                  properties: {
                    name: { type: 'string' },
                    series: { type: 'integer', minimum: 1 },
                    reps: { type: 'string' },
                    repsPlan: {
                      type: 'array',
                      items: { type: 'string' }
                    },
                    note: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    },
    rationale: {
      type: 'array',
      items: { type: 'string' }
    },
    warnings: {
      type: 'array',
      items: { type: 'string' }
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 }
  }
};

const COACH_REFINEMENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['candidateProgram', 'summary', 'rationale', 'warnings', 'confidence'],
  properties: {
    candidateProgram: COACH_PROGRAM_SCHEMA.properties.candidateProgram,
    summary: { type: 'string' },
    rationale: COACH_PROGRAM_SCHEMA.properties.rationale,
    warnings: COACH_PROGRAM_SCHEMA.properties.warnings,
    confidence: COACH_PROGRAM_SCHEMA.properties.confidence
  }
};

const SYSTEM_PROMPT = [
  'Sei un parser di schede allenamento in PDF per una PWA fitness.',
  'Leggi il PDF del personal trainer e restituisci solo i dati workout in JSON conforme allo schema.',
  'Il layout atteso contiene elementi come Nome, Obiettivo, Durata, Day 1..N e una lista di esercizi.',
  'Ignora blocchi informativi non workout come "INFORMAZIONI UTILI", saluti, cardio generico o note fuori dalla scheda.',
  'Correggi i caratteri corrotti o strani quando il significato e` evidente, per esempio virgolette al posto di simboli errati e parole tronche dovute a encoding.',
  'Per ogni esercizio separa nome, numero serie, reps e note.',
  'Mantieni interi i nomi esercizio, inclusi qualificatori finali come "alla Scott", "presa inversa", "al multipower", "su inclinata", "su panca 30".',
  'Non spostare parti del nome esercizio dentro le note se fanno ancora parte del movimento.',
  'Quando il PDF usa schemi reps diversi per serie, per esempio "2x8, 1x8/12", conserva reps in forma compatta e compila anche repsPlan serie-per-serie, per esempio ["8","8","8-12"].',
  'Se il PDF non e` una scheda workout o non e` leggibile come PDF testuale, segnalo chiaramente con i flag di rifiuto.',
  'Mantieni il testo in italiano quando presente nel documento.',
  'Non inventare giorni o esercizi mancanti: se qualcosa e` ambiguo, fai la miglior stima ma aggiungi un warning.'
].join(' ');

const CHAT_SYSTEM_PROMPT = [
  'Sei l\'Assistente AI rapido di Massi Gym, una mini chat flottante sempre disponibile durante la consultazione della scheda e durante il workout.',
  'Rispondi sempre in italiano con tono pratico, operativo e rassicurante.',
  'Sei specializzato in chiarimenti veloci su esercizi, ordine della scheda, recupero, gestione dei carichi, progressione settimana per settimana e dubbi rapidi durante l\'allenamento.',
  'Usa il contesto della schermata corrente quando presente, senza ripeterlo in blocco e senza inventare dati mancanti.',
  'Preferisci risposte brevi e subito utili: massimo 4-6 frasi o pochi punti essenziali salvo richiesta esplicita di approfondimento.',
  'Se manca un dato importante, dillo chiaramente e proponi il passo pratico successivo.',
  'Se il tema tocca dolore, infortunio, farmaci o aspetti medici, invita con calma a confrontarsi con un medico o professionista qualificato.'
].join(' ');

const COACH_PROGRAM_SYSTEM_PROMPT = [
  'Sei il Coach AI di Massi Gym e lavori come un personal trainer pratico.',
  'Generi nuove schede palestra realistiche e progressive usando prima lo storico reale dell\'utente e poi le sue preferenze.',
  'Mantieni continuita` con le schede precedenti quando ha senso, a meno che il contesto chieda un cambio netto.',
  'Rispondi sempre in italiano e restituisci solo JSON valido conforme allo schema.',
  'La scheda deve essere adatta al livello dichiarato, all\'attrezzatura disponibile, alla durata media della seduta e ai giorni a settimana.',
  'Usa esercizi comprensibili e note brevi, concrete e non prolisse.',
  'Evita programmi estremi, volumi irrealistici o esercizi incompatibili con limitazioni e attrezzatura.',
  'Se alcuni dati sono mancanti, fai assunzioni prudenti e segnala quei punti in warnings.'
].join(' ');

const COACH_REFINEMENT_SYSTEM_PROMPT = [
  'Sei il Coach AI di Massi Gym nella fase di rifinitura bozza.',
  'Ricevi una scheda gia` generata e una richiesta di modifica in linguaggio naturale.',
  'Non rispondi con spiegazioni libere: restituisci solo JSON valido conforme allo schema.',
  'Il tuo compito e` aggiornare la bozza esistente nel modo piu` fedele possibile alla richiesta dell\'utente.',
  'Mantieni il programma realistico, coerente col profilo atleta, con lo storico e con l\'attrezzatura disponibile.',
  'Non stravolgere la scheda se l\'utente chiede una modifica locale: cambia solo cio` che serve.',
  'Nel campo summary descrivi in modo breve cosa hai cambiato concretamente.',
  'Nel campo rationale spiega perche` le modifiche hanno senso.',
  'Nel campo warnings segnala solo i punti che l\'utente dovrebbe ricontrollare prima di salvare.'
].join(' ');

function applyCors(req, res) {
  if (!CORS_ALLOWED_ORIGIN) return;
  const origin = req.headers.origin;
  if (!origin || origin === CORS_ALLOWED_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', origin || CORS_ALLOWED_ORIGIN);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
}

function sendJsonError(res, status, message, extra = {}) {
  res.status(status).json({ error: message, ...extra });
}

function cleanString(value) {
  if (typeof value !== 'string') return '';
  let cleaned = value
    .replace(/\u00a0/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[ÓÕ]/g, '"')
    .replace(/[Þ]/g, 'fi')
    .replace(/[ß]/g, 'fl')
    .replace(/\s+/g, ' ')
    .trim();
  cleaned = cleaned.replace(/ ?· ?/g, ' · ');
  return cleaned;
}

function normalizeRepToken(value) {
  return cleanString(String(value || ''))
    .replace(/(\d)\s*\/\s*(\d)/g, '$1-$2')
    .replace(/\s+/g, ' ')
    .trim();
}

function deriveRepsPlan(reps, series, explicitPlan = []) {
  const targetSeries = Math.max(1, parseInt(series, 10) || 1);
  const fromExplicit = (Array.isArray(explicitPlan) ? explicitPlan : []).map(normalizeRepToken).filter(Boolean);
  if (fromExplicit.length) {
    const plan = fromExplicit.slice(0, targetSeries);
    while (plan.length < targetSeries) plan.push(plan[plan.length - 1] || normalizeRepToken(reps) || '-');
    return plan;
  }

  const raw = normalizeRepToken(reps);
  if (!raw) return Array.from({ length: targetSeries }, () => '-');

  const commaParts = raw.split(/\s*,\s*/).map((part) => part.trim()).filter(Boolean);
  if (commaParts.length > 1) {
    const expanded = [];
    let valid = true;
    commaParts.forEach((part) => {
      const match = part.match(/^(?:(\d+)\s*x\s*)?(.+)$/i);
      if (!match || !normalizeRepToken(match[2])) {
        valid = false;
        return;
      }
      const count = Math.max(1, parseInt(match[1], 10) || 1);
      const token = normalizeRepToken(match[2]);
      for (let i = 0; i < count; i++) expanded.push(token);
    });
    if (valid && expanded.length) {
      const plan = expanded.slice(0, targetSeries);
      while (plan.length < targetSeries) plan.push(plan[plan.length - 1] || raw);
      return plan;
    }
  }

  const repeated = raw.match(/^(\d+)\s*x\s*(.+)$/i);
  if (repeated && normalizeRepToken(repeated[2])) {
    const count = Math.max(1, parseInt(repeated[1], 10) || 1);
    const token = normalizeRepToken(repeated[2]);
    if (count === targetSeries) {
      return Array.from({ length: targetSeries }, () => token);
    }
  }

  return Array.from({ length: targetSeries }, () => raw);
}

function slugify(value) {
  return cleanString(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'scheda-importata';
}

function filenameWithoutExt(filename) {
  return String(filename || 'scheda-importata').replace(/\.pdf$/i, '').trim();
}

function normalizeChatMessages(rawMessages) {
  return (Array.isArray(rawMessages) ? rawMessages : [])
    .map((message) => ({
      role: message?.role === 'assistant' ? 'assistant' : 'user',
      content: cleanString(message?.content || '')
    }))
    .filter((message) => message.content)
    .slice(-12);
}

function extractResponseText(response) {
  const direct = cleanString(response?.output_text || '');
  if (direct) return direct;

  const chunks = [];
  (Array.isArray(response?.output) ? response.output : []).forEach((item) => {
    if (item?.type !== 'message' || !Array.isArray(item.content)) return;
    item.content.forEach((part) => {
      if (part?.type === 'output_text') {
        const value = typeof part.text === 'string' ? part.text : part?.text?.value;
        if (typeof value === 'string') chunks.push(value);
      }
      if (part?.type === 'text') {
        const value = typeof part.text === 'string' ? part.text : part?.text?.value;
        if (typeof value === 'string') chunks.push(value);
      }
      if (part?.type === 'refusal') {
        const value = typeof part.refusal === 'string' ? part.refusal : part?.text;
        if (typeof value === 'string') chunks.push(value);
      }
    });
  });

  return cleanString(chunks.join('\n').trim());
}

function buildChatContextText(context) {
  if (!context || typeof context !== 'object') return '';
  const lines = [];
  if (cleanString(context.sectionLabel)) lines.push('Schermata attuale: ' + cleanString(context.sectionLabel));
  if (cleanString(context.programTitle)) lines.push('Scheda attiva: ' + cleanString(context.programTitle));
  if (cleanString(context.programSubtitle)) lines.push('Sottotitolo: ' + cleanString(context.programSubtitle));
  if (cleanString(context.weeksLabel)) lines.push('Durata indicata: ' + cleanString(context.weeksLabel));
  if (Number(context.currentWeek) > 0) lines.push('Settimana corrente: ' + Number(context.currentWeek));
  if (Number(context.completedDays) >= 0 && Number(context.totalDays) > 0) {
    lines.push('Giorni completati: ' + Number(context.completedDays) + '/' + Number(context.totalDays));
  }
  if (cleanString(context.currentDayLabel)) lines.push('Giorno attivo: ' + cleanString(context.currentDayLabel));
  if (cleanString(context.viewMode)) lines.push('Vista attuale: ' + cleanString(context.viewMode));
  if (Array.isArray(context.dayLabels) && context.dayLabels.length) {
    lines.push('Giorni scheda: ' + context.dayLabels.map(cleanString).filter(Boolean).join(', '));
  }
  if (context.currentExercise && typeof context.currentExercise === 'object' && cleanString(context.currentExercise.name)) {
    lines.push(
      'Esercizio focus: ' +
      cleanString(context.currentExercise.name) +
      ' · ' +
      Math.max(0, parseInt(context.currentExercise.series, 10) || 0) +
      ' serie · ' +
      cleanString(context.currentExercise.reps || '')
    );
  }
  if (context.nextExercise && typeof context.nextExercise === 'object' && cleanString(context.nextExercise.name)) {
    lines.push(
      'Prossimo esercizio: ' +
      cleanString(context.nextExercise.name) +
      ' · ' +
      Math.max(0, parseInt(context.nextExercise.series, 10) || 0) +
      ' serie · ' +
      cleanString(context.nextExercise.reps || '')
    );
  }
  if (Array.isArray(context.progressionSummary) && context.progressionSummary.length) {
    lines.push(
      'Progressi recenti: ' + context.progressionSummary.slice(0, 3).map((item) => {
        const exercise = cleanString(item?.exercise || '');
        const weight = cleanString(item?.lastWeight || '');
        const trend = cleanString(item?.trend || '');
        return [exercise, weight ? 'ultimo ' + weight + ' kg' : '', trend ? 'trend ' + trend : ''].filter(Boolean).join(' · ');
      }).filter(Boolean).join(' | ')
    );
  }
  if (Array.isArray(context.recentSessions) && context.recentSessions.length) {
    lines.push(
      'Ultime sessioni: ' + context.recentSessions.slice(0, 3).map((item) => {
        const label = cleanString(item?.day || '');
        const week = Math.max(0, parseInt(item?.week, 10) || 0);
        const date = cleanString(item?.date || '');
        return [label, week ? 'W' + week : '', date].filter(Boolean).join(' · ');
      }).filter(Boolean).join(' | ')
    );
  }
  return lines.join('\n');
}

function normalizeStringList(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(/[,;\n]+/);
  return source.map(cleanString).filter(Boolean).slice(0, 12);
}

function normalizeAiProfile(rawProfile, context = null) {
  const safe = rawProfile && typeof rawProfile === 'object' ? rawProfile : {};
  const inferredDays = Math.max(
    0,
    parseInt(safe.daysPerWeek, 10) || 0,
    parseInt(context?.currentProgram?.daysCount, 10) || 0,
    parseInt(context?.recentPrograms?.[0]?.daysCount, 10) || 0
  );

  return {
    name: cleanString(safe.name || ''),
    goal: cleanString(safe.goal || ''),
    experience: cleanString(safe.experience || ''),
    daysPerWeek: inferredDays,
    sessionLength: cleanString(safe.sessionLength || ''),
    equipment: cleanString(safe.equipment || ''),
    focusAreas: normalizeStringList(safe.focusAreas || []),
    avoidExercises: normalizeStringList(safe.avoidExercises || []),
    limitations: cleanString(safe.limitations || ''),
    notes: cleanString(safe.notes || '')
  };
}

function normalizeAiContext(rawContext) {
  const safe = rawContext && typeof rawContext === 'object' ? rawContext : {};
  return {
    currentProgram: safe.currentProgram && typeof safe.currentProgram === 'object' ? {
      id: cleanString(safe.currentProgram.id || ''),
      title: cleanString(safe.currentProgram.title || ''),
      subtitle: cleanString(safe.currentProgram.subtitle || ''),
      weeks: cleanString(safe.currentProgram.weeks || ''),
      daysCount: Math.max(0, parseInt(safe.currentProgram.daysCount, 10) || 0),
      currentWeek: Math.max(0, parseInt(safe.currentProgram.currentWeek, 10) || 0),
      completedDaysThisWeek: Math.max(0, parseInt(safe.currentProgram.completedDaysThisWeek, 10) || 0),
      totalDaysThisWeek: Math.max(0, parseInt(safe.currentProgram.totalDaysThisWeek, 10) || 0),
      dayLabels: (Array.isArray(safe.currentProgram.dayLabels) ? safe.currentProgram.dayLabels : []).map(cleanString).filter(Boolean).slice(0, 10)
    } : null,
    recentPrograms: (Array.isArray(safe.recentPrograms) ? safe.recentPrograms : []).slice(0, 4).map((program) => ({
      id: cleanString(program?.id || ''),
      title: cleanString(program?.title || ''),
      subtitle: cleanString(program?.subtitle || ''),
      weeks: cleanString(program?.weeks || ''),
      daysCount: Math.max(0, parseInt(program?.daysCount, 10) || 0),
      totalSessions: Math.max(0, parseInt(program?.totalSessions, 10) || 0),
      totalCompletedDays: Math.max(0, parseInt(program?.totalCompletedDays, 10) || 0),
      origin: cleanString(program?.origin || '')
    })),
    historySummary: (Array.isArray(safe.historySummary) ? safe.historySummary : []).slice(0, 8).map((entry) => ({
      date: cleanString(entry?.date || ''),
      week: Math.max(0, parseInt(entry?.week, 10) || 0),
      day: cleanString(entry?.day || ''),
      exercisesDone: Math.max(0, parseInt(entry?.exercisesDone, 10) || 0)
    })),
    progressionSummary: (Array.isArray(safe.progressionSummary) ? safe.progressionSummary : []).slice(0, 10).map((entry) => ({
      day: cleanString(entry?.day || ''),
      exercise: cleanString(entry?.exercise || ''),
      lastWeight: cleanString(entry?.lastWeight || ''),
      trend: ['up', 'same', 'down', 'new'].includes(entry?.trend) ? entry.trend : 'same',
      week: Math.max(0, parseInt(entry?.week, 10) || 0)
    }))
  };
}

function buildCoachContextText(profile, context) {
  const lines = [];
  if (profile.name) lines.push('Nome atleta: ' + profile.name);
  if (profile.goal) lines.push('Obiettivo principale: ' + profile.goal);
  if (profile.experience) lines.push('Livello: ' + profile.experience);
  if (profile.daysPerWeek) lines.push('Giorni richiesti a settimana: ' + profile.daysPerWeek);
  if (profile.sessionLength) lines.push('Durata media seduta: ' + profile.sessionLength + ' minuti');
  if (profile.equipment) lines.push('Attrezzatura disponibile: ' + profile.equipment);
  if (profile.focusAreas.length) lines.push('Focus desiderati: ' + profile.focusAreas.join(', '));
  if (profile.avoidExercises.length) lines.push('Esercizi da evitare: ' + profile.avoidExercises.join(', '));
  if (profile.limitations) lines.push('Limitazioni o fastidi: ' + profile.limitations);
  if (profile.notes) lines.push('Note utente: ' + profile.notes);

  if (context.currentProgram?.title) {
    lines.push('Scheda attiva: ' + context.currentProgram.title);
    if (context.currentProgram.subtitle) lines.push('Sottotitolo scheda attiva: ' + context.currentProgram.subtitle);
    if (context.currentProgram.weeks) lines.push('Durata scheda attiva: ' + context.currentProgram.weeks);
    if (context.currentProgram.daysCount) lines.push('Giorni nella scheda attiva: ' + context.currentProgram.daysCount);
    if (context.currentProgram.currentWeek) {
      lines.push(
        'Settimana corrente: ' + context.currentProgram.currentWeek +
        ' con ' + context.currentProgram.completedDaysThisWeek + '/' + context.currentProgram.totalDaysThisWeek + ' giorni completati'
      );
    }
    if (context.currentProgram.dayLabels.length) lines.push('Split attuale: ' + context.currentProgram.dayLabels.join(', '));
  }

  if (context.recentPrograms.length) {
    lines.push('Schede recenti: ' + context.recentPrograms.map((program) => {
      return [
        program.title || 'Scheda',
        program.daysCount ? program.daysCount + ' giorni' : '',
        program.totalSessions ? program.totalSessions + ' sessioni' : '',
        program.origin === 'ai' ? 'origine AI' : 'origine PT'
      ].filter(Boolean).join(' · ');
    }).join(' | '));
  }

  if (context.progressionSummary.length) {
    lines.push('Progressi recenti: ' + context.progressionSummary.map((item) => {
      return [
        item.exercise || 'Esercizio',
        item.day || '',
        item.lastWeight ? 'ultimo picco ' + item.lastWeight + ' kg' : '',
        item.trend === 'up' ? 'trend in salita' : item.trend === 'down' ? 'trend in calo' : item.trend === 'same' ? 'trend stabile' : 'nuovo riferimento'
      ].filter(Boolean).join(' · ');
    }).join(' | '));
  }

  if (context.historySummary.length) {
    lines.push('Ultime sessioni: ' + context.historySummary.map((entry) => {
      return [
        entry.day || 'Sessione',
        entry.week ? 'week ' + entry.week : '',
        entry.exercisesDone ? entry.exercisesDone + ' esercizi completati' : '',
        entry.date || ''
      ].filter(Boolean).join(' · ');
    }).join(' | '));
  }

  return lines.join('\n');
}

function createAiIntakeQuestions(profile, context) {
  const questions = [];
  if (!profile.goal) {
    questions.push({
      id: 'goal',
      label: 'Obiettivo',
      question: 'Qual e` l\'obiettivo principale del prossimo blocco?',
      type: 'select',
      options: [
        { value: 'ipertrofia', label: 'Ipertrofia' },
        { value: 'ricomposizione', label: 'Ricomposizione' },
        { value: 'dimagrimento', label: 'Dimagrimento' },
        { value: 'forza', label: 'Forza' }
      ]
    });
  }
  if (!profile.experience) {
    questions.push({
      id: 'experience',
      label: 'Livello',
      question: 'Con che livello vuoi che il Coach AI ragioni?',
      type: 'select',
      options: [
        { value: 'principiante', label: 'Principiante' },
        { value: 'intermedio', label: 'Intermedio' },
        { value: 'avanzato', label: 'Avanzato' }
      ]
    });
  }
  if (!profile.daysPerWeek) {
    questions.push({
      id: 'daysPerWeek',
      label: 'Giorni a settimana',
      question: 'Quanti giorni vuoi allenarti nel prossimo blocco?',
      type: 'select',
      options: [2, 3, 4, 5, 6].map((value) => ({ value: String(value), label: String(value) }))
    });
  }
  if (!profile.sessionLength) {
    questions.push({
      id: 'sessionLength',
      label: 'Durata seduta',
      question: 'Quanto deve durare mediamente ogni allenamento?',
      type: 'select',
      options: [
        { value: '45-60', label: '45-60 min' },
        { value: '60-75', label: '60-75 min' },
        { value: '75-90', label: '75-90 min' }
      ]
    });
  }
  if (!profile.equipment) {
    questions.push({
      id: 'equipment',
      label: 'Attrezzatura',
      question: 'Con che attrezzatura deve essere costruita la scheda?',
      type: 'select',
      options: [
        { value: 'palestra_completa', label: 'Palestra completa' },
        { value: 'basic_gym', label: 'Palestra essenziale' },
        { value: 'home_gym', label: 'Home gym' }
      ]
    });
  }
  if (!profile.focusAreas.length && !context.currentProgram && !context.recentPrograms.length) {
    questions.push({
      id: 'focusAreas',
      label: 'Focus muscolari',
      question: 'Se vuoi, dimmi i gruppi muscolari su cui vuoi spingere di piu`.',
      type: 'text',
      placeholder: 'Per esempio: petto, dorso, spalle'
    });
  }
  return questions.slice(0, 6);
}

function normalizeDraftProgramForAi(rawProgram) {
  const normalized = normalizeCandidateProgram({
    athleteName: '',
    title: rawProgram?.title || '',
    subtitle: rawProgram?.subtitle || '',
    weeks: rawProgram?.weeks || '',
    confidence: 0.8,
    warnings: [],
    days: Array.isArray(rawProgram?.days) ? rawProgram.days : []
  }, 'coach-ai-draft');

  if (!normalized.days.length) {
    const error = new Error('Bozza Coach AI non valida o vuota.');
    error.statusCode = 400;
    throw error;
  }

  return {
    title: cleanString(rawProgram?.title || normalized.title || 'Coach AI · Nuova scheda'),
    subtitle: cleanString(rawProgram?.subtitle || normalized.subtitle || 'Scheda generata dal Coach AI'),
    weeks: cleanString(rawProgram?.weeks || normalized.weeks || '5 settimane'),
    days: normalized.days
  };
}

function buildCoachRefinementHistoryText(messages) {
  return normalizeChatMessages(messages).map((message) => {
    return (message.role === 'assistant' ? 'Coach AI' : 'Utente') + ': ' + cleanString(message.content);
  }).join('\n');
}

function validateAiGeneratedProgram(result, profile) {
  const safe = result && typeof result === 'object' ? result : {};
  const normalized = normalizeCandidateProgram({
    athleteName: '',
    title: safe.candidateProgram?.title || '',
    subtitle: safe.candidateProgram?.subtitle || '',
    weeks: safe.candidateProgram?.weeks || '',
    confidence: safe.confidence,
    warnings: Array.isArray(safe.warnings) ? safe.warnings : [],
    days: Array.isArray(safe.candidateProgram?.days) ? safe.candidateProgram.days : []
  }, 'coach-ai');

  if (!normalized.days.length) {
    const error = new Error('Il Coach AI non ha generato giorni di allenamento validi.');
    error.statusCode = 502;
    throw error;
  }

  if (profile.daysPerWeek && normalized.days.length !== profile.daysPerWeek) {
    normalized.warnings.push('La bozza generata ha ' + normalized.days.length + ' giorni invece dei ' + profile.daysPerWeek + ' richiesti: controllala prima di salvarla.');
  }

  return {
    candidateProgram: {
      id: '',
      title: cleanString(safe.candidateProgram?.title || normalized.title || 'Coach AI · Nuova scheda'),
      subtitle: cleanString(safe.candidateProgram?.subtitle || '') || 'Scheda generata dal Coach AI',
      weeks: normalized.weeks || '5 settimane',
      days: normalized.days
    },
    rationale: (Array.isArray(safe.rationale) ? safe.rationale : []).map(cleanString).filter(Boolean).slice(0, 6),
    warnings: normalized.warnings,
    confidence: Math.max(0, Math.min(1, Number(safe.confidence) || 0))
  };
}

function validateAiRefinedProgram(result, profile) {
  const validated = validateAiGeneratedProgram(result, profile);
  return {
    ...validated,
    summary: cleanString(result?.summary || 'Bozza aggiornata.')
  };
}

function normalizeCandidateProgram(raw, filename) {
  const athleteName = cleanString(raw.athleteName);
  const title = cleanString(raw.title) || filenameWithoutExt(filename);
  const subtitle = cleanString(raw.subtitle) || (athleteName ? athleteName + ' · PDF PT importato' : 'PDF PT importato');
  const weeks = cleanString(raw.weeks);
  const warnings = Array.isArray(raw.warnings) ? raw.warnings.map(cleanString).filter(Boolean) : [];
  const confidence = Math.max(0, Math.min(1, Number(raw.confidence) || 0));
  const days = Array.isArray(raw.days) ? raw.days.map((day, dayIndex) => {
    const exercises = Array.isArray(day.exercises) ? day.exercises.map((exercise, exerciseIndex) => ({
      name: cleanString(exercise.name) || 'Esercizio ' + (exerciseIndex + 1),
      series: Math.max(1, Number.parseInt(exercise.series, 10) || 1),
      reps: normalizeRepToken(String(exercise.reps ?? '')),
      repsPlan: deriveRepsPlan(exercise.reps, exercise.series, exercise.repsPlan),
      note: cleanString(exercise.note)
    })).filter((exercise) => exercise.name && exercise.reps) : [];
    return {
      name: cleanString(day.name) || 'Day ' + (dayIndex + 1),
      label: cleanString(day.label),
      exercises
    };
  }).filter((day) => day.exercises.length > 0) : [];

  return {
    athleteName,
    title,
    subtitle,
    weeks,
    confidence,
    warnings,
    days
  };
}

function validateCandidateProgram(parsed, originalFilename) {
  if (!parsed.isWorkoutProgram) {
    const reason = cleanString(parsed.rejectionReason) || 'Questo PDF non sembra contenere una scheda di allenamento valida.';
    const error = new Error(reason);
    error.statusCode = 422;
    throw error;
  }

  if (!parsed.isTextualPdf) {
    const error = new Error('Questo PDF non e` testuale o non e` leggibile bene. Usa un PDF esportato dal PT, non una scansione.');
    error.statusCode = 422;
    throw error;
  }

  const candidate = normalizeCandidateProgram(parsed, originalFilename);

  if (!candidate.days.length) {
    const error = new Error('Non sono riuscito a trovare giorni di allenamento nel PDF.');
    error.statusCode = 422;
    throw error;
  }

  candidate.days.forEach((day, dayIndex) => {
    if (!day.exercises.length) {
      const error = new Error('Il giorno ' + (dayIndex + 1) + ' non contiene esercizi validi.');
      error.statusCode = 422;
      throw error;
    }
    day.exercises.forEach((exercise, exerciseIndex) => {
      if (!exercise.name) {
        const error = new Error('Manca il nome di un esercizio nel giorno ' + (dayIndex + 1) + '.');
        error.statusCode = 422;
        throw error;
      }
      if (!Number.isInteger(exercise.series) || exercise.series < 1) {
        const error = new Error('Serie non valide per ' + exercise.name + ' nel giorno ' + (dayIndex + 1) + '.');
        error.statusCode = 422;
        throw error;
      }
      if (!exercise.reps) {
        const error = new Error('Ripetizioni mancanti per ' + exercise.name + ' nel giorno ' + (dayIndex + 1) + '.');
        error.statusCode = 422;
        throw error;
      }
      exercise.note = cleanString(exercise.note);
      exercise.name = cleanString(exercise.name) || 'Esercizio ' + (exerciseIndex + 1);
    });
  });

  return {
    candidateProgram: {
      id: '',
      title: candidate.title || filenameWithoutExt(originalFilename),
      subtitle: candidate.subtitle || 'PDF PT importato',
      weeks: candidate.weeks,
      days: candidate.days
    },
    confidence: candidate.confidence,
    warnings: candidate.warnings
  };
}

async function parseWorkoutPdf(file) {
  if (!client) {
    const error = new Error('OPENAI_API_KEY mancante sul server.');
    error.statusCode = 500;
    throw error;
  }

  const base64File = file.buffer.toString('base64');
  const filename = cleanString(file.originalname) || 'scheda-pt.pdf';
  const userPrompt = [
    'Estrai questa scheda PDF in formato compatibile con una app palestra.',
    'Usa il nome file come contesto: ' + filename + '.',
    'Restituisci giorni, label dei day, esercizi, serie, reps, repsPlan, note, durata del ciclo e nome atleta se presente.',
    'Se trovi righe miste nome+serie+note, separale correttamente.',
    'Se trovi righe come "2x8, 1x8/12", il nome esercizio deve restare completo e repsPlan deve esplodere le serie in ordine.',
    'Se il documento non e` una scheda workout o e` una scansione/foto difficilmente leggibile, rifiuta.',
    'Ogni day deve avere un name tipo "Day 1" e una label leggibile.'
  ].join(' ');

  const response = await client.responses.create({
    model: OPENAI_MODEL,
    temperature: 0,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: SYSTEM_PROMPT
          }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_file',
            filename,
            file_data: 'data:application/pdf;base64,' + base64File
          },
          {
            type: 'input_text',
            text: userPrompt
          }
        ]
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'pt_workout_program_import',
        strict: true,
        schema: IMPORT_SCHEMA
      }
    }
  });

  if (!response.output_text) {
    const error = new Error('Risposta OpenAI vuota durante il parsing del PDF.');
    error.statusCode = 502;
    throw error;
  }

  const parsed = JSON.parse(response.output_text);
  return validateCandidateProgram(parsed, filename);
}

async function createCoachReply(messages, context) {
  if (!client) {
    const error = new Error('OPENAI_API_KEY mancante sul server.');
    error.statusCode = 500;
    throw error;
  }

  const normalizedMessages = normalizeChatMessages(messages);
  if (!normalizedMessages.length) {
    const error = new Error('Invia almeno un messaggio all\'assistente AI.');
    error.statusCode = 400;
    throw error;
  }

  const input = [
    {
      role: 'system',
      content: CHAT_SYSTEM_PROMPT
    }
  ];

  const contextText = buildChatContextText(context);
  if (contextText) {
    input.push({
      role: 'system',
      content: 'Contesto attuale utente:\n' + contextText
    });
  }

  normalizedMessages.forEach((message) => {
    input.push({
      role: message.role,
      content: message.content
    });
  });

  const modelsToTry = Array.from(new Set([
    OPENAI_ASSISTANT_MODEL,
    'gpt-4.1-nano',
    'gpt-4.1-mini'
  ].filter(Boolean)));

  for (const model of modelsToTry) {
    const request = {
      model,
      input,
      max_output_tokens: 260
    };

    if (model.startsWith('gpt-5')) {
      request.reasoning = { effort: 'minimal' };
      request.text = { verbosity: 'low' };
    }

    const response = await client.responses.create(request);

    const reply = extractResponseText(response);
    if (reply) {
      return { reply, model };
    }

    console.warn('Assistant returned empty text, trying fallback if available.', {
      model,
      outputTypes: (Array.isArray(response?.output) ? response.output : []).map((item) => item?.type).filter(Boolean)
    });
  }

  const error = new Error('Risposta assistente vuota.');
  error.statusCode = 502;
  throw error;
}

async function generateAiProgram(profileInput, contextInput, answersInput) {
  if (!client) {
    const error = new Error('OPENAI_API_KEY mancante sul server.');
    error.statusCode = 500;
    throw error;
  }

  const context = normalizeAiContext(contextInput);
  const profile = normalizeAiProfile({ ...(profileInput || {}), ...(answersInput || {}) }, context);
  const missingQuestions = createAiIntakeQuestions(profile, context);
  if (missingQuestions.length) {
    const error = new Error('Mancano ancora alcune informazioni prima di generare la scheda.');
    error.statusCode = 422;
    error.questions = missingQuestions;
    throw error;
  }

  const response = await client.responses.create({
    model: OPENAI_MODEL,
    max_output_tokens: 2800,
    input: [
      {
        role: 'system',
        content: [
          { type: 'input_text', text: COACH_PROGRAM_SYSTEM_PROMPT }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: [
              'Usa il seguente contesto per generare una nuova scheda JSON compatibile con Massi Gym.',
              '',
              'Profilo e memoria utente:',
              buildCoachContextText(profile, context),
              '',
              'Regole operative:',
              '- crea ' + profile.daysPerWeek + ' giorni di allenamento',
              '- tieni le sedute realistiche per una durata media di ' + profile.sessionLength + ' minuti',
              '- se esiste gia` una scheda attiva, continua il filo logico di quel lavoro salvo segnali contrari',
              '- favorisci esercizi comprensibili e adatti a ' + profile.equipment,
              '- mantieni note brevi e pratiche',
              '- il campo weeks deve essere una stringa leggibile, per esempio "5 settimane" o "6 settimane"',
              '- title e subtitle devono far capire che si tratta di una nuova scheda Coach AI'
            ].join('\n')
          }
        ]
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'coach_ai_program_generation',
        strict: true,
        schema: COACH_PROGRAM_SCHEMA
      }
    }
  });

  if (!response.output_text) {
    const error = new Error('Risposta Coach AI vuota.');
    error.statusCode = 502;
    throw error;
  }

  const parsed = JSON.parse(response.output_text);
  return validateAiGeneratedProgram(parsed, profile);
}

async function refineAiProgram(profileInput, contextInput, candidateProgramInput, messagesInput, requestInput) {
  if (!client) {
    const error = new Error('OPENAI_API_KEY mancante sul server.');
    error.statusCode = 500;
    throw error;
  }

  const requestText = cleanString(requestInput || '');
  if (!requestText) {
    const error = new Error('Scrivi cosa vuoi cambiare nella bozza.');
    error.statusCode = 400;
    throw error;
  }

  const context = normalizeAiContext(contextInput);
  const profile = normalizeAiProfile(profileInput, context);
  const draftProgram = normalizeDraftProgramForAi(candidateProgramInput);
  const chatHistory = buildCoachRefinementHistoryText(messagesInput);

  const response = await client.responses.create({
    model: OPENAI_MODEL,
    max_output_tokens: 2800,
    input: [
      {
        role: 'system',
        content: [
          { type: 'input_text', text: COACH_REFINEMENT_SYSTEM_PROMPT }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: [
              'Aggiorna la seguente bozza Coach AI senza rompere il formato JSON compatibile con Massi Gym.',
              '',
              'Profilo e memoria utente:',
              buildCoachContextText(profile, context),
              '',
              'Bozza attuale:',
              JSON.stringify(draftProgram, null, 2),
              '',
              'Cronologia breve della rifinitura:',
              chatHistory || 'Nessuna cronologia precedente.',
              '',
              'Richiesta finale dell\'utente:',
              requestText,
              '',
              'Regole operative:',
              '- modifica la bozza esistente, non crearne una totalmente diversa salvo richiesta esplicita',
              '- mantieni la scheda pratica e coerente con obiettivo, livello, attrezzatura e durata seduta',
              '- se l\'utente chiede piu` priorita` a un gruppo muscolare, aumenta focus e volume in modo realistico',
              '- evita spiegazioni prolisse nelle note degli esercizi',
              '- summary deve dire in breve cosa hai cambiato davvero'
            ].join('\n')
          }
        ]
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'coach_ai_program_refinement',
        strict: true,
        schema: COACH_REFINEMENT_SCHEMA
      }
    }
  });

  if (!response.output_text) {
    const error = new Error('Risposta Coach AI vuota durante la rifinitura.');
    error.statusCode = 502;
    throw error;
  }

  const parsed = JSON.parse(response.output_text);
  return validateAiRefinedProgram(parsed, profile);
}

app.use((req, res, next) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

app.get('/healthz', (_req, res) => {
  res.json({
    ok: true,
    parserVersion: PARSER_VERSION,
    coachAiVersion: COACH_AI_VERSION,
    assistantChatVersion: ASSISTANT_CHAT_VERSION,
    assistantModel: OPENAI_ASSISTANT_MODEL
  });
});

app.post('/api/import-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return sendJsonError(res, 400, 'Nessun PDF ricevuto.');
    }

    const parsed = await parseWorkoutPdf(req.file);
    res.json({
      candidateProgram: parsed.candidateProgram,
      warnings: parsed.warnings,
      confidence: parsed.confidence,
      sourceFilename: req.file.originalname,
      parserVersion: PARSER_VERSION
    });
  } catch (error) {
    console.error('PDF import error:', error);
    const statusCode = error.statusCode || 500;
    const message = statusCode >= 500
      ? 'Import PDF non disponibile in questo momento. Riprova tra poco.'
      : error.message;
    sendJsonError(res, statusCode, message);
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const chat = await createCoachReply(req.body?.messages, req.body?.context);
    res.json({
      reply: chat.reply,
      model: chat.model
    });
  } catch (error) {
    console.error('Chat error:', error);
    const statusCode = error.statusCode || 500;
    const message = statusCode >= 500
      ? 'Assistente AI non disponibile in questo momento. Riprova tra poco.'
      : error.message;
    sendJsonError(res, statusCode, message);
  }
});

app.post('/api/ai/intake', async (req, res) => {
  try {
    const context = normalizeAiContext(req.body?.context);
    const profile = normalizeAiProfile(req.body?.profile, context);
    res.json({
      questions: createAiIntakeQuestions(profile, context),
      coachAiVersion: COACH_AI_VERSION
    });
  } catch (error) {
    console.error('Coach AI intake error:', error);
    const statusCode = error.statusCode || 500;
    const message = statusCode >= 500
      ? 'Coach AI non disponibile in questo momento. Riprova tra poco.'
      : error.message;
    sendJsonError(res, statusCode, message);
  }
});

app.post('/api/ai/generate-program', async (req, res) => {
  try {
    const generated = await generateAiProgram(req.body?.profile, req.body?.context, req.body?.answers);
    res.json({
      ...generated,
      parserVersion: COACH_AI_VERSION
    });
  } catch (error) {
    console.error('Coach AI generate error:', error);
    const statusCode = error.statusCode || 500;
    const message = statusCode >= 500
      ? 'Generazione scheda non disponibile in questo momento. Riprova tra poco.'
      : error.message;
    sendJsonError(res, statusCode, message, error.questions ? { questions: error.questions } : {});
  }
});

app.post('/api/ai/refine-program', async (req, res) => {
  try {
    const refined = await refineAiProgram(
      req.body?.profile,
      req.body?.context,
      req.body?.candidateProgram,
      req.body?.messages,
      req.body?.request
    );
    res.json({
      ...refined,
      parserVersion: COACH_AI_VERSION
    });
  } catch (error) {
    console.error('Coach AI refine error:', error);
    const statusCode = error.statusCode || 500;
    const message = statusCode >= 500
      ? 'Rifinitura bozza non disponibile in questo momento. Riprova tra poco.'
      : error.message;
    sendJsonError(res, statusCode, message);
  }
});

app.use('/icons', express.static(ICONS_DIR, { maxAge: '7d', index: false }));

[
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/programs.json', 'programs.json'],
  ['/app.webmanifest', 'app.webmanifest'],
  ['/sw.js', 'sw.js'],
  ['/README.txt', 'README.txt']
].forEach(([route, filename]) => {
  app.get(route, (_req, res) => {
    res.sendFile(path.join(ROOT_DIR, filename));
  });
});

app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return sendJsonError(res, 413, 'Il PDF supera il limite di 10 MB.');
  }
  if (error) {
    const message = error.message || 'Errore interno del server.';
    const statusCode = error.statusCode || 400;
    return sendJsonError(res, statusCode, message);
  }
  return sendJsonError(res, 500, 'Errore interno del server.');
});

app.listen(PORT, () => {
  console.log('Massi Gym server attivo su http://localhost:' + PORT);
});
