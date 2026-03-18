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
const CORS_ALLOWED_ORIGIN = (process.env.CORS_ALLOWED_ORIGIN || '').trim();
const PARSER_VERSION = 'pt-pdf-v1';
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
                note: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }
};

const SYSTEM_PROMPT = [
  'Sei un parser di schede allenamento in PDF per una PWA fitness.',
  'Leggi il PDF del personal trainer e restituisci solo i dati workout in JSON conforme allo schema.',
  'Il layout atteso contiene elementi come Nome, Obiettivo, Durata, Day 1..N e una lista di esercizi.',
  'Ignora blocchi informativi non workout come "INFORMAZIONI UTILI", saluti, cardio generico o note fuori dalla scheda.',
  'Correggi i caratteri corrotti o strani quando il significato e` evidente, per esempio virgolette al posto di simboli errati e parole tronche dovute a encoding.',
  'Per ogni esercizio separa nome, numero serie, reps e note.',
  'Se il PDF non e` una scheda workout o non e` leggibile come PDF testuale, segnalo chiaramente con i flag di rifiuto.',
  'Mantieni il testo in italiano quando presente nel documento.',
  'Non inventare giorni o esercizi mancanti: se qualcosa e` ambiguo, fai la miglior stima ma aggiungi un warning.'
].join(' ');

const CHAT_SYSTEM_PROMPT = [
  'Sei il coach AI interno di una app palestra chiamata Massi Gym.',
  'Rispondi sempre in italiano, con tono pratico, chiaro e motivante.',
  'Aiuta su lettura schede, gestione settimane, progressione dei carichi, organizzazione allenamenti e dubbi fitness generali.',
  'Non inventare dati personali o risultati di salute non forniti.',
  'Se la domanda tocca temi medici, infortuni, farmaci o dolore, invita con calma a sentire un medico o professionista qualificato.',
  'Mantieni risposte brevi ma utili: massimo 6-8 frasi salvo richiesta esplicita di approfondimento.',
  'Quando hai contesto sulla scheda attiva, usalo in modo naturale senza elencarlo tutto ogni volta.'
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

function buildChatContextText(context) {
  if (!context || typeof context !== 'object') return '';
  const lines = [];
  if (cleanString(context.programTitle)) lines.push('Scheda attiva: ' + cleanString(context.programTitle));
  if (cleanString(context.programSubtitle)) lines.push('Sottotitolo: ' + cleanString(context.programSubtitle));
  if (cleanString(context.weeksLabel)) lines.push('Durata indicata: ' + cleanString(context.weeksLabel));
  if (Number(context.currentWeek) > 0) lines.push('Settimana corrente: ' + Number(context.currentWeek));
  if (Number(context.completedDays) >= 0 && Number(context.totalDays) > 0) {
    lines.push('Giorni completati: ' + Number(context.completedDays) + '/' + Number(context.totalDays));
  }
  if (Array.isArray(context.dayLabels) && context.dayLabels.length) {
    lines.push('Giorni scheda: ' + context.dayLabels.map(cleanString).filter(Boolean).join(', '));
  }
  return lines.join('\n');
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
      reps: cleanString(String(exercise.reps ?? '')),
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
    'Restituisci giorni, label dei day, esercizi, serie, reps, note, durata del ciclo e nome atleta se presente.',
    'Se trovi righe miste nome+serie+note, separale correttamente.',
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
    const error = new Error('Invia almeno un messaggio al coach AI.');
    error.statusCode = 400;
    throw error;
  }

  const input = [
    {
      role: 'system',
      content: [
        { type: 'input_text', text: CHAT_SYSTEM_PROMPT }
      ]
    }
  ];

  const contextText = buildChatContextText(context);
  if (contextText) {
    input.push({
      role: 'system',
      content: [
        { type: 'input_text', text: 'Contesto attuale utente:\n' + contextText }
      ]
    });
  }

  normalizedMessages.forEach((message) => {
    input.push({
      role: message.role,
      content: [
        { type: 'input_text', text: message.content }
      ]
    });
  });

  const response = await client.responses.create({
    model: OPENAI_MODEL,
    input,
    max_output_tokens: 500
  });

  const reply = cleanString(response.output_text || '');
  if (!reply) {
    const error = new Error('Risposta chat vuota.');
    error.statusCode = 502;
    throw error;
  }

  return reply;
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
  res.json({ ok: true, parserVersion: PARSER_VERSION });
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
    const reply = await createCoachReply(req.body?.messages, req.body?.context);
    res.json({
      reply,
      model: OPENAI_MODEL
    });
  } catch (error) {
    console.error('Chat error:', error);
    const statusCode = error.statusCode || 500;
    const message = statusCode >= 500
      ? 'Chat non disponibile in questo momento. Riprova tra poco.'
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
