const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, '..', 'data', 'exercises.catalog.json');
const ALIASES_PATH = path.join(__dirname, '..', 'data', 'exercise-aliases.it.json');

const EQUIPMENT_COMPATIBILITY = {
  bodyweight_home: new Set(['body weight', 'band']),
  home_gym: new Set(['body weight', 'band', 'dumbbell', 'kettlebell', 'medicine ball']),
  basic_gym: new Set(['body weight', 'band', 'dumbbell', 'kettlebell', 'medicine ball', 'barbell', 'cable', 'machine', 'smith machine', 'ez barbell']),
  palestra_completa: null // tutti
};

let catalogLoaded = false;
let exercises = [];
let exerciseById = new Map();
let aliasesById = new Map();

function loadSync(catalogPath, aliasesPath) {
  if (catalogLoaded && !catalogPath && !aliasesPath) return;

  const catPath = catalogPath || CATALOG_PATH;
  const aliPath = aliasesPath || ALIASES_PATH;

  let catalogData = { exercises: [] };
  let aliasesData = {};

  try {
    const raw = fs.readFileSync(catPath, 'utf8');
    catalogData = JSON.parse(raw);
  } catch (error) {
    console.warn('Catalogo esercizi non trovato o non valido:', error.message);
  }

  try {
    const raw = fs.readFileSync(aliPath, 'utf8');
    aliasesData = JSON.parse(raw);
  } catch (error) {
    console.warn('Alias italiani non trovati o non validi:', error.message);
  }

  exercises = (Array.isArray(catalogData) ? catalogData : catalogData.exercises || [])
    .filter((ex) => ex && ex.id && ex.name)
    .map((ex) => {
      const aliasEntry = aliasesData[ex.id] || {};
      return {
        id: String(ex.id),
        name: String(ex.name || ''),
        canonicalIt: String(aliasEntry.canonicalIt || ''),
        aliasesIt: Array.isArray(aliasEntry.aliases) ? aliasEntry.aliases.map(String) : [],
        bodyPart: String(ex.bodyPart || ex.body_part || ''),
        target: String(ex.target || ''),
        secondaryMuscles: Array.isArray(ex.secondaryMuscles || ex.secondary_muscles)
          ? (ex.secondaryMuscles || ex.secondary_muscles).map(String)
          : [],
        equipment: String(ex.equipment || ''),
        instructionsIt: String(ex.instructionsIt || ex.instructions_it || ''),
        instructionStepsIt: Array.isArray(ex.instructionStepsIt || ex.instruction_steps_it)
          ? (ex.instructionStepsIt || ex.instruction_steps_it).map(String)
          : [],
        image: String(ex.image || ''),
        video: String(ex.video || '')
      };
    });

  exerciseById = new Map();
  aliasesById = new Map();
  exercises.forEach((ex) => {
    exerciseById.set(ex.id, ex);
    aliasesById.set(ex.id, ex);
  });

  catalogLoaded = true;
}

function getAll() {
  loadSync();
  return exercises.slice();
}

function getById(id) {
  loadSync();
  return exerciseById.get(String(id)) || null;
}

function normalizeToken(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function searchableText(ex) {
  return [
    ex.name,
    ex.canonicalIt,
    ex.bodyPart,
    ex.target,
    ex.equipment,
    ...ex.aliasesIt,
    ...ex.secondaryMuscles
  ].map(normalizeToken).join(' ');
}

function search(query, options = {}) {
  loadSync();
  const tokens = normalizeToken(query)
    .split(' ')
    .filter((token) => token.length >= 2);

  if (!tokens.length) return [];

  const limit = Math.max(1, Math.min(50, options.limit || 20));
  const results = [];

  for (const ex of exercises) {
    const text = searchableText(ex);
    let matches = 0;
    for (const token of tokens) {
      if (text.includes(token)) matches++;
    }
    if (matches) {
      results.push({ exercise: ex, score: matches / tokens.length });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit).map((r) => r.exercise);
}

function isEquipmentCompatible(equipment, userEquipment) {
  if (!userEquipment) return true;
  const allowed = EQUIPMENT_COMPATIBILITY[userEquipment];
  if (!allowed) return true; // palestra_completa o valore sconosciuto
  return allowed.has(String(equipment || '').toLowerCase());
}

function normalizeMuscle(value) {
  return normalizeToken(value).replace(/s$/, '');
}

function isMuscleCompatible(ex, focusMuscles) {
  if (!Array.isArray(focusMuscles) || !focusMuscles.length) return true;
  const candidateTokens = new Set([
    normalizeMuscle(ex.target),
    normalizeMuscle(ex.bodyPart),
    ...ex.secondaryMuscles.map(normalizeMuscle)
  ]);
  return focusMuscles.some((focus) => {
    const focusToken = normalizeMuscle(focus);
    if (!focusToken) return false;
    for (const token of candidateTokens) {
      if (token.includes(focusToken) || focusToken.includes(token)) return true;
    }
    return false;
  });
}

function getShortlist(options = {}) {
  loadSync();
  const { userEquipment, focusMuscles, avoidExercises, limit = 60 } = options;

  const avoidTokens = (Array.isArray(avoidExercises) ? avoidExercises : [])
    .map(normalizeToken)
    .filter(Boolean);

  const candidates = [];
  for (const ex of exercises) {
    if (!isEquipmentCompatible(ex.equipment, userEquipment)) continue;
    if (!isMuscleCompatible(ex, focusMuscles)) continue;

    const searchable = searchableText(ex);
    const isAvoided = avoidTokens.some((token) => searchable.includes(token));
    if (isAvoided) continue;

    let score = 1;
    if (focusMuscles?.length) {
      const focusTokens = focusMuscles.map(normalizeMuscle).filter(Boolean);
      const targetNorm = normalizeMuscle(ex.target);
      if (focusTokens.some((ft) => targetNorm.includes(ft) || ft.includes(targetNorm))) {
        score += 2;
      }
      const bodyPartNorm = normalizeMuscle(ex.bodyPart);
      if (focusTokens.some((ft) => bodyPartNorm.includes(ft) || ft.includes(bodyPartNorm))) {
        score += 1;
      }
    }
    candidates.push({ exercise: ex, score });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit).map((c) => c.exercise);
}

function getAlternatives(id, options = {}) {
  loadSync();
  const source = exerciseById.get(String(id));
  if (!source) return [];

  const limit = Math.max(1, Math.min(20, options.limit || 5));
  const candidates = [];

  for (const ex of exercises) {
    if (ex.id === source.id) continue;
    let score = 0;
    if (ex.target && ex.target === source.target) score += 3;
    if (ex.bodyPart && ex.bodyPart === source.bodyPart) score += 2;
    if (ex.equipment && ex.equipment === source.equipment) score += 1;
    const sourceSecondary = new Set(source.secondaryMuscles);
    const commonSecondary = ex.secondaryMuscles.filter((m) => sourceSecondary.has(m)).length;
    score += commonSecondary;
    if (score > 0) candidates.push({ exercise: ex, score });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit).map((c) => c.exercise);
}

function getStats() {
  loadSync();
  return {
    total: exercises.length,
    withItalianName: exercises.filter((ex) => ex.canonicalIt).length
  };
}

module.exports = {
  loadSync,
  getAll,
  getById,
  search,
  getShortlist,
  getAlternatives,
  getStats,
  isEquipmentCompatible,
  isMuscleCompatible,
  normalizeToken
};
