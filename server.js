const express = require('express');
const multer = require('multer');
const path = require('path');
const OpenAI = require('openai');

const app = express();
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
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 180000);
const CORS_ALLOWED_ORIGIN = (process.env.CORS_ALLOWED_ORIGIN || '').trim();
const MUSCLEWIKI_API_KEY = (process.env.MUSCLEWIKI_API_KEY || '').trim();
const MUSCLEWIKI_API_BASE_URL = (process.env.MUSCLEWIKI_API_BASE_URL || 'https://api.musclewiki.com').replace(/\/+$/, '');
const MUSCLEWIKI_TIMEOUT_MS = Math.max(3000, Number(process.env.MUSCLEWIKI_TIMEOUT_MS || 12000));
const PARSER_VERSION = 'pt-pdf-v1';
const GUIDE_VERSION = 'guide-mw-v1';
const GUIDE_PROVIDER = 'musclewiki';
const GUIDE_ATTRIBUTION = 'Powered by MuscleWiki';
const ROOT_DIR = __dirname;
const ICONS_DIR = path.join(ROOT_DIR, 'icons');
const GUIDE_MEDIA_DIR = path.join(ROOT_DIR, 'guide-media');

const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
app.use(express.json({ limit: '1mb' }));

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

const QUERY_ALIAS_RULES = [
  [/multipower/g, 'smith machine'],
  [/lat machine/g, 'lat pulldown'],
  [/pulley basso/g, 'seated cable row'],
  [/pulley/g, 'cable row'],
  [/rematore/g, 'row'],
  [/panca piana/g, 'flat bench press'],
  [/panca inclinata/g, 'incline bench press'],
  [/panca declinata/g, 'decline bench press'],
  [/distensioni/g, 'press'],
  [/croci/g, 'fly'],
  [/alzate laterali/g, 'lateral raise'],
  [/alzate frontali/g, 'front raise'],
  [/tirate al mento/g, 'upright row'],
  [/spinte spalle/g, 'shoulder press'],
  [/lento avanti/g, 'shoulder press'],
  [/french press/g, 'skull crusher'],
  [/push ?down/g, 'tricep pushdown'],
  [/tricipiti corda/g, 'rope tricep pushdown'],
  [/curl bilanciere/g, 'barbell curl'],
  [/curl manubri/g, 'dumbbell curl'],
  [/curl martello/g, 'hammer curl'],
  [/stacchi rumeni/g, 'romanian deadlift'],
  [/stacchi/g, 'deadlift'],
  [/hack squat/g, 'hack squat'],
  [/affondi/g, 'lunge'],
  [/polpacci/g, 'calf raise'],
  [/addome/g, 'abdominal'],
  [/trazioni/g, 'pull up']
];

function applyCors(req, res) {
  if (!CORS_ALLOWED_ORIGIN) return;
  const origin = req.headers.origin;
  if (!origin || origin === CORS_ALLOWED_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', origin || CORS_ALLOWED_ORIGIN);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
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

function normalizeText(value) {
  return cleanString(String(value ?? ''))
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function uniqStrings(values) {
  const seen = new Set();
  const output = [];
  values.forEach((value) => {
    const cleaned = cleanString(value);
    const key = normalizeText(cleaned);
    if (!cleaned || !key || seen.has(key)) return;
    seen.add(key);
    output.push(cleaned);
  });
  return output;
}

function getFirstDefinedValue(source, paths) {
  if (!source || typeof source !== 'object') return undefined;
  for (const pathEntry of paths) {
    const keys = pathEntry.split('.');
    let current = source;
    let valid = true;
    for (const key of keys) {
      if (!current || typeof current !== 'object' || !(key in current)) {
        valid = false;
        break;
      }
      current = current[key];
    }
    if (valid && current != null && current !== '') return current;
  }
  return undefined;
}

function toStringArray(value) {
  if (Array.isArray(value)) {
    return uniqStrings(value.flatMap((entry) => {
      if (typeof entry === 'string') return entry;
      if (entry && typeof entry === 'object') {
        return [
          getFirstDefinedValue(entry, ['name', 'label', 'value', 'title']),
          getFirstDefinedValue(entry, ['muscle', 'muscle_group'])
        ].filter(Boolean);
      }
      return [];
    }));
  }
  if (typeof value === 'string') {
    return uniqStrings(value.split(/[,;/|]/g));
  }
  return [];
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

function isMuscleWikiEnabled() {
  return Boolean(MUSCLEWIKI_API_KEY);
}

function buildMuscleWikiHeaders() {
  return {
    'X-API-Key': MUSCLEWIKI_API_KEY,
    Accept: 'application/json'
  };
}

function translateExerciseQuery(text) {
  let value = normalizeText(text);
  QUERY_ALIAS_RULES.forEach(([pattern, replacement]) => {
    value = value.replace(pattern, replacement);
  });
  return value.replace(/\s+/g, ' ').trim();
}

function buildGuideSearchQueries(exercise, dayLabel = '') {
  const base = cleanString(exercise?.name || '');
  const withContext = cleanString([exercise?.name || '', dayLabel || ''].filter(Boolean).join(' '));
  const translated = translateExerciseQuery(withContext || base);
  const simplified = translated
    .replace(/\b(machine|barbell|dumbbell|cable|smith|bench)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return uniqStrings([base, translated, simplified]).filter((query) => normalizeText(query).length >= 2).slice(0, 3);
}

function scoreGuideMatch(query, label, category = '', muscles = []) {
  const normalizedQuery = normalizeText(query);
  const normalizedLabel = normalizeText(label);
  if (!normalizedQuery || !normalizedLabel) return 0;
  if (normalizedQuery === normalizedLabel) return 0.99;
  if (normalizedLabel.includes(normalizedQuery)) return 0.9;
  if (normalizedQuery.includes(normalizedLabel) && normalizedLabel.length > 5) return 0.85;

  const queryTokens = normalizedQuery.split(' ').filter(Boolean);
  const labelTokens = new Set(normalizedLabel.split(' ').filter(Boolean));
  let overlap = 0;
  queryTokens.forEach((token) => {
    if (labelTokens.has(token)) overlap++;
  });

  const categoryText = normalizeText(category);
  if (categoryText && queryTokens.some((token) => categoryText.includes(token))) overlap += 0.5;

  const musclesText = normalizeText(muscles.join(' '));
  if (musclesText) {
    queryTokens.forEach((token) => {
      if (musclesText.includes(token)) overlap += 0.2;
    });
  }

  return Math.max(0, Math.min(0.95, overlap / Math.max(queryTokens.length, 1)));
}

function createProviderError(responseStatus, payload, fallbackMessage) {
  const detail = cleanString(
    typeof payload === 'string'
      ? payload
      : getFirstDefinedValue(payload, ['message', 'error', 'detail'])
  );
  const error = new Error(detail || fallbackMessage);
  error.statusCode = responseStatus === 401 || responseStatus === 403 ? 503 : 502;
  error.providerStatusCode = responseStatus;
  return error;
}

async function fetchMuscleWikiRaw(pathname, searchParams = null, accept = 'application/json', reqHeaders = {}) {
  if (!isMuscleWikiEnabled()) {
    const error = new Error('MUSCLEWIKI_API_KEY mancante sul server.');
    error.statusCode = 503;
    throw error;
  }

  const url = new URL(pathname, MUSCLEWIKI_API_BASE_URL + '/');
  if (searchParams && typeof searchParams === 'object') {
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value == null || value === '') return;
      url.searchParams.set(key, String(value));
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MUSCLEWIKI_TIMEOUT_MS);

  try {
    return await fetch(url, {
      headers: {
        ...buildMuscleWikiHeaders(),
        Accept: accept,
        ...reqHeaders
      },
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('MuscleWiki non risponde in tempo.');
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    const networkError = new Error('Impossibile contattare MuscleWiki in questo momento.');
    networkError.statusCode = 502;
    throw networkError;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchMuscleWikiJson(pathname, searchParams = null) {
  const response = await fetchMuscleWikiRaw(pathname, searchParams, 'application/json');
  let payload = null;
  try {
    payload = await response.json();
  } catch (_error) {
    payload = null;
  }

  if (!response.ok) {
    throw createProviderError(response.status, payload, 'Risposta non valida da MuscleWiki.');
  }

  return payload;
}

function normalizeSearchResult(item, query) {
  const id = String(getFirstDefinedValue(item, ['id', 'exercise_id', 'exerciseId']) || '').trim();
  const label = cleanString(
    getFirstDefinedValue(item, ['name', 'exercise_name', 'title', 'display_name', 'label']) || ''
  );
  const category = cleanString(
    getFirstDefinedValue(item, ['category', 'equipment', 'exercise_type', 'type']) || ''
  );
  const difficulty = cleanString(getFirstDefinedValue(item, ['difficulty', 'level']) || '');
  const force = cleanString(getFirstDefinedValue(item, ['force', 'mechanic']) || '');
  const muscles = uniqStrings([
    ...toStringArray(getFirstDefinedValue(item, ['muscles', 'muscle_groups', 'primary_muscles', 'primaryMuscles'])),
    ...toStringArray(getFirstDefinedValue(item, ['secondary_muscles', 'secondaryMuscles']))
  ]);

  return {
    id,
    label,
    category,
    difficulty,
    force,
    muscles,
    confidence: scoreGuideMatch(query, label, category, muscles)
  };
}

function extractSearchResults(payload, query) {
  const rawResults = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.results)
      ? payload.results
      : Array.isArray(payload?.data?.results)
        ? payload.data.results
        : Array.isArray(payload?.items)
          ? payload.items
          : [];

  const bestById = new Map();
  rawResults.forEach((item) => {
    const normalized = normalizeSearchResult(item, query);
    if (!normalized.id || !normalized.label) return;
    const existing = bestById.get(normalized.id);
    if (!existing || normalized.confidence > existing.confidence) {
      bestById.set(normalized.id, normalized);
    }
  });

  return [...bestById.values()].sort((left, right) => right.confidence - left.confidence);
}

async function searchMuscleWiki(query, limit = 5) {
  const primaryPayload = await fetchMuscleWikiJson('/search', { q: query, limit });
  let results = extractSearchResults(primaryPayload, query);

  if (!results.length) {
    const secondaryPayload = await fetchMuscleWikiJson('/exercises', { search: query, limit });
    results = extractSearchResults(secondaryPayload, query);
  }

  return results.slice(0, limit);
}

function serializeGuideAlternative(result) {
  return {
    id: result.id,
    label: result.label,
    category: result.category,
    difficulty: result.difficulty,
    force: result.force,
    muscles: result.muscles,
    confidence: Math.max(0, Math.min(1, Number(result.confidence) || 0))
  };
}

function createEmptyGuideMatch() {
  return {
    guideProvider: '',
    guideExerciseId: '',
    guideLabel: '',
    guideConfidence: 0,
    guideAlternatives: []
  };
}

async function matchExerciseGuide(exercise, dayLabel, searchCache) {
  if (!isMuscleWikiEnabled()) return createEmptyGuideMatch();

  const queries = buildGuideSearchQueries(exercise, dayLabel);
  const mergedById = new Map();

  for (let index = 0; index < queries.length; index++) {
    const query = queries[index];
    const cacheKey = normalizeText(query);
    let results = searchCache.get(cacheKey);
    if (!results) {
      results = await searchMuscleWiki(query, 5);
      searchCache.set(cacheKey, results);
    }

    results.forEach((result) => {
      const penalty = index * 0.05;
      const adjusted = { ...result, confidence: Math.max(0, result.confidence - penalty) };
      const existing = mergedById.get(adjusted.id);
      if (!existing || adjusted.confidence > existing.confidence) {
        mergedById.set(adjusted.id, adjusted);
      }
    });
  }

  const ranked = [...mergedById.values()].sort((left, right) => right.confidence - left.confidence).slice(0, 4);
  if (!ranked.length) return createEmptyGuideMatch();

  const best = ranked[0];
  const shouldAttach = best.confidence >= 0.42;

  return {
    guideProvider: shouldAttach ? GUIDE_PROVIDER : '',
    guideExerciseId: shouldAttach ? best.id : '',
    guideLabel: shouldAttach ? best.label : '',
    guideConfidence: shouldAttach ? best.confidence : 0,
    guideAlternatives: ranked.map(serializeGuideAlternative)
  };
}

async function enrichProgramWithGuides(candidateProgram) {
  if (!candidateProgram?.days?.length || !isMuscleWikiEnabled()) return candidateProgram;

  const cloned = cloneValue(candidateProgram);
  const searchCache = new Map();

  for (const day of cloned.days) {
    for (const exercise of day.exercises) {
      try {
        Object.assign(exercise, await matchExerciseGuide(exercise, day.label || day.name, searchCache));
      } catch (error) {
        console.warn('MuscleWiki match fallito per', exercise.name, error.message);
        Object.assign(exercise, createEmptyGuideMatch());
      }
    }
  }

  return cloned;
}

function normalizeStreamPath(value, kind) {
  const raw = cleanString(value);
  if (!raw) return '';

  let pathname = raw;
  try {
    const parsed = new URL(raw);
    pathname = parsed.pathname + (parsed.search || '');
  } catch (_error) {
    pathname = raw;
  }

  if (pathname.startsWith('/stream/videos/') && kind === 'video') return pathname;
  if (pathname.startsWith('/stream/images/') && kind === 'image') return pathname;

  if (kind === 'video' && /\.(mp4|webm)$/i.test(pathname)) {
    if (pathname.startsWith('/')) return pathname;
    return '/stream/videos/branded/' + path.basename(pathname);
  }

  if (kind === 'image' && /\.(png|jpe?g|gif|webp)$/i.test(pathname)) {
    if (pathname.startsWith('/')) return pathname;
    return '/stream/images/og_images/' + path.basename(pathname);
  }

  return '';
}

function buildGuideMediaProxyPath(streamPath) {
  return '/api/guide/media?path=' + encodeURIComponent(streamPath);
}

function pushMediaCandidate(target, kind, rawValue, labelHint = '') {
  if (!rawValue) return;

  if (typeof rawValue === 'string') {
    const streamPath = normalizeStreamPath(rawValue, kind);
    if (!streamPath) return;
    target.push({
      path: buildGuideMediaProxyPath(streamPath),
      label: cleanString(labelHint || (kind === 'video' ? 'Demo movimento' : 'Riferimento visivo'))
    });
    return;
  }

  if (Array.isArray(rawValue)) {
    rawValue.forEach((entry) => pushMediaCandidate(target, kind, entry, labelHint));
    return;
  }

  if (rawValue && typeof rawValue === 'object') {
    const localLabel = cleanString(
      getFirstDefinedValue(rawValue, ['label', 'title', 'name', 'view', 'gender']) || labelHint
    );

    [
      'url',
      'src',
      'path',
      'stream_url',
      'streamUrl',
      kind === 'video' ? 'video_url' : 'image_url',
      kind === 'video' ? 'videoUrl' : 'imageUrl',
      'file',
      'filename'
    ].forEach((key) => {
      if (key in rawValue) pushMediaCandidate(target, kind, rawValue[key], localLabel);
    });

    ['front', 'side', 'rear', 'male', 'female', 'videos', 'images', 'thumbnails', 'items'].forEach((key) => {
      if (key in rawValue) pushMediaCandidate(target, kind, rawValue[key], localLabel || key);
    });
  }
}

function dedupeMedia(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.path + '|' + item.label;
    if (!item.path || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeGuideSteps(detail) {
  const directSteps = getFirstDefinedValue(detail, ['steps', 'instructions', 'how_to', 'description']);
  if (Array.isArray(directSteps)) {
    return uniqStrings(directSteps);
  }
  if (typeof directSteps === 'string') {
    const cleaned = cleanString(directSteps);
    if (!cleaned) return [];
    return uniqStrings(cleaned.split(/\.\s+|•|\n|;/g));
  }
  return [];
}

async function fetchExerciseGuideDetail(exerciseId) {
  const detail = await fetchMuscleWikiJson('/exercises/' + encodeURIComponent(exerciseId), { detail: 'true' });
  let videos = [];
  let images = [];

  pushMediaCandidate(videos, 'video', getFirstDefinedValue(detail, ['videos', 'video_urls', 'videoUrls']));
  pushMediaCandidate(images, 'image', getFirstDefinedValue(detail, ['images', 'image_urls', 'imageUrls', 'bodymap_images', 'bodymapImages']));

  if (!videos.length) {
    try {
      const videoPayload = await fetchMuscleWikiJson('/exercises/' + encodeURIComponent(exerciseId) + '/videos');
      pushMediaCandidate(videos, 'video', videoPayload);
    } catch (error) {
      console.warn('MuscleWiki videos non disponibili per', exerciseId, error.message);
    }
  }

  return {
    provider: GUIDE_PROVIDER,
    providerVersion: GUIDE_VERSION,
    attribution: GUIDE_ATTRIBUTION,
    id: String(getFirstDefinedValue(detail, ['id', 'exercise_id', 'exerciseId']) || exerciseId),
    name: cleanString(getFirstDefinedValue(detail, ['name', 'exercise_name', 'title', 'display_name']) || ''),
    category: cleanString(getFirstDefinedValue(detail, ['category', 'equipment', 'exercise_type', 'type']) || ''),
    difficulty: cleanString(getFirstDefinedValue(detail, ['difficulty', 'level']) || ''),
    force: cleanString(getFirstDefinedValue(detail, ['force', 'mechanic']) || ''),
    primaryMuscles: toStringArray(getFirstDefinedValue(detail, ['primary_muscles', 'primaryMuscles', 'muscles'])),
    secondaryMuscles: toStringArray(getFirstDefinedValue(detail, ['secondary_muscles', 'secondaryMuscles'])),
    steps: normalizeGuideSteps(detail),
    videos: dedupeMedia(videos).slice(0, 2),
    images: dedupeMedia(images).slice(0, 2)
  };
}

async function buildMatchPayload(exercises) {
  const searchCache = new Map();
  return Promise.all((Array.isArray(exercises) ? exercises : []).map(async (exercise, index) => {
    const safeExercise = {
      name: cleanString(exercise?.name || ''),
      note: cleanString(exercise?.note || ''),
      dayLabel: cleanString(exercise?.dayLabel || exercise?.label || '')
    };
    const match = await matchExerciseGuide(safeExercise, safeExercise.dayLabel, searchCache);
    return {
      index,
      query: safeExercise.name,
      ...match
    };
  }));
}

function buildPdfImportRequest(model, filename, base64File, userPrompt) {
  return {
    model,
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
  };
}

function normalizeOpenAiError(error) {
  if (!error) return error;
  if (!error.statusCode && typeof error.status === 'number') error.statusCode = error.status;
  if (!error.statusCode && typeof error.code === 'number') error.statusCode = error.code;
  return error;
}

function shouldRetryPdfImportOnGpt41(error) {
  const message = cleanString(error?.message || '').toLowerCase();
  const statusCode = Number(error?.statusCode || 0);
  if (!message && !statusCode) return false;
  if (statusCode >= 500) return true;
  return [
    'temperature',
    'unsupported',
    'not supported',
    'input_file',
    'json_schema',
    'model',
    'timeout',
    'timed out'
  ].some((needle) => message.includes(needle));
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

  async function requestParse(model) {
    return client.responses.create(
      buildPdfImportRequest(model, filename, base64File, userPrompt),
      { timeout: OPENAI_TIMEOUT_MS }
    );
  }

  let response;
  try {
    response = await requestParse(OPENAI_MODEL);
  } catch (rawError) {
    const error = normalizeOpenAiError(rawError);
    const fallbackModel = 'gpt-4.1';
    if (OPENAI_MODEL !== fallbackModel && shouldRetryPdfImportOnGpt41(error)) {
      console.warn('PDF import fallback da', OPENAI_MODEL, 'a', fallbackModel, '-', error.message);
      response = await requestParse(fallbackModel);
    } else {
      throw error;
    }
  }

  if (!response.output_text) {
    const error = new Error('Risposta OpenAI vuota durante il parsing del PDF.');
    error.statusCode = 502;
    throw error;
  }

  const parsed = JSON.parse(response.output_text);
  return validateCandidateProgram(parsed, filename);
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
    guideVersion: GUIDE_VERSION,
    muscleWikiEnabled: isMuscleWikiEnabled()
  });
});

app.post('/api/import-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return sendJsonError(res, 400, 'Nessun PDF ricevuto.');
    }

    const parsed = await parseWorkoutPdf(req.file);
    const guidedProgram = await enrichProgramWithGuides(parsed.candidateProgram);
    res.json({
      candidateProgram: guidedProgram,
      warnings: parsed.warnings,
      confidence: parsed.confidence,
      sourceFilename: req.file.originalname,
      parserVersion: PARSER_VERSION,
      guideProvider: GUIDE_PROVIDER,
      guideVersion: GUIDE_VERSION,
      muscleWikiEnabled: isMuscleWikiEnabled()
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

app.get('/api/guide/search', async (req, res) => {
  try {
    const query = cleanString(req.query.q || req.query.query || '');
    if (!query) {
      return sendJsonError(res, 400, 'Inserisci un nome esercizio da cercare.');
    }

    const results = await searchMuscleWiki(query, 6);
    res.json({
      provider: GUIDE_PROVIDER,
      providerVersion: GUIDE_VERSION,
      attribution: GUIDE_ATTRIBUTION,
      query,
      results: results.map(serializeGuideAlternative)
    });
  } catch (error) {
    console.error('Guide search error:', error);
    sendJsonError(res, error.statusCode || 500, error.message || 'Ricerca guida non disponibile.');
  }
});

app.post('/api/guide/match-exercises', async (req, res) => {
  try {
    const exercises = Array.isArray(req.body?.exercises) ? req.body.exercises : [];
    if (!exercises.length) {
      return sendJsonError(res, 400, 'Invia almeno un esercizio da confrontare.');
    }

    const matches = await buildMatchPayload(exercises);
    res.json({
      provider: GUIDE_PROVIDER,
      providerVersion: GUIDE_VERSION,
      attribution: GUIDE_ATTRIBUTION,
      matches
    });
  } catch (error) {
    console.error('Guide match error:', error);
    sendJsonError(res, error.statusCode || 500, error.message || 'Match guide non disponibile.');
  }
});

app.get('/api/guide/exercise/:exerciseId', async (req, res) => {
  try {
    const exerciseId = cleanString(req.params.exerciseId);
    if (!exerciseId) {
      return sendJsonError(res, 400, 'ID esercizio non valido.');
    }

    const detail = await fetchExerciseGuideDetail(exerciseId);
    res.json(detail);
  } catch (error) {
    console.error('Guide detail error:', error);
    sendJsonError(res, error.statusCode || 500, error.message || 'Guida esercizio non disponibile.');
  }
});

app.get('/api/guide/media', async (req, res) => {
  try {
    const requestedPath = cleanString(req.query.path || '');
    if (!requestedPath.startsWith('/stream/videos/') && !requestedPath.startsWith('/stream/images/')) {
      return sendJsonError(res, 400, 'Media guida non valido.');
    }

    const response = await fetchMuscleWikiRaw(requestedPath, null, '*/*', req.headers.range ? { Range: req.headers.range } : {});
    if (!response.ok) {
      let payload = null;
      try {
        payload = await response.json();
      } catch (_error) {
        payload = null;
      }
      throw createProviderError(response.status, payload, 'Media MuscleWiki non disponibile.');
    }

    ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach((header) => {
      const value = response.headers.get(header);
      if (value) res.setHeader(header, value);
    });
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', 'inline');
    res.status(response.status);

    if (!response.body) {
      res.end();
      return;
    }

    if (typeof response.body.pipe === 'function') {
      response.body.pipe(res);
      return;
    }

    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error('Guide media error:', error);
    sendJsonError(res, error.statusCode || 500, error.message || 'Media guida non disponibile.');
  }
});

app.use('/icons', express.static(ICONS_DIR, { maxAge: '7d', index: false }));
app.use('/guide-media', express.static(GUIDE_MEDIA_DIR, { maxAge: '7d', index: false }));

[
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/programs.json', 'programs.json'],
  ['/exercise-media.json', 'exercise-media.json'],
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

