const exerciseCatalog = require('./exercise-catalog');

const STOPWORDS = new Set([
  // italiano
  'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una', 'di', 'del', 'della', 'dei', 'delle',
  'a', 'al', 'alla', 'ai', 'alle', 'da', 'dal', 'dalla', 'dai', 'dalle', 'in', 'nel', 'nella',
  'nei', 'nelle', 'con', 'su', 'sul', 'sulla', 'sui', 'sulle', 'per', 'tra', 'fra', 'e', 'o',
  'ma', 'se', 'come', 'che', 'chi', 'cui', 'cui', 'sono', 'sei', 'e', 'ho', 'ha', 'abbiamo',
  // inglese
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'among', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must'
]);

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value) {
  return normalizeText(value)
    .split(' ')
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

function levenshtein(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b.charAt(i - 1) === a.charAt(j - 1)
        ? matrix[i - 1][j - 1]
        : Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
    }
  }
  return matrix[b.length][a.length];
}

function charSimilarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (!maxLen) return 0;
  return 1 - levenshtein(a, b) / maxLen;
}

function tokensFuzzyMatch(tokenA, tokenB) {
  if (tokenA === tokenB) return true;
  if (tokenA.includes(tokenB) || tokenB.includes(tokenA)) return true;
  const maxLen = Math.max(tokenA.length, tokenB.length);
  if (maxLen <= 3) return false;
  const dist = levenshtein(tokenA, tokenB);
  return dist / maxLen <= 0.35;
}

function tokenJaccard(a, b) {
  const tokensA = Array.from(new Set(tokenize(a)));
  const tokensB = Array.from(new Set(tokenize(b)));
  if (!tokensA.length && !tokensB.length) return 0;

  let matches = 0;
  const matchedB = new Set();
  for (const tokenA of tokensA) {
    for (let i = 0; i < tokensB.length; i++) {
      if (matchedB.has(i)) continue;
      if (tokensFuzzyMatch(tokenA, tokensB[i])) {
        matches++;
        matchedB.add(i);
        break;
      }
    }
  }

  const unionSize = tokensA.length + tokensB.length - matches;
  return unionSize ? matches / unionSize : 0;
}

function nameSimilarity(input, candidateName) {
  const normalizedInput = normalizeText(input);
  const normalizedCandidate = normalizeText(candidateName);
  if (!normalizedInput || !normalizedCandidate) return 0;

  // exact match canonico
  if (normalizedInput === normalizedCandidate) return 1;

  const charSim = charSimilarity(normalizedInput, normalizedCandidate);
  const tokenJac = tokenJaccard(normalizedInput, normalizedCandidate);

  // partial substring boost
  let partialBoost = 0;
  if (normalizedCandidate.includes(normalizedInput)) {
    partialBoost = 0.15;
  } else if (normalizedInput.includes(normalizedCandidate)) {
    partialBoost = 0.1;
  }

  // se i token si sovrappiono quasi completamente, boost
  if (tokenJac >= 0.6) {
    return Math.min(1, 0.35 * charSim + 0.55 * tokenJac + partialBoost + 0.05);
  }
  return Math.min(1, 0.65 * charSim + 0.3 * tokenJac + partialBoost);
}

function isEquipmentCompatible(equipment, userEquipment) {
  return exerciseCatalog.isEquipmentCompatible(equipment, userEquipment);
}

function isMuscleCompatible(candidate, focusMuscles) {
  return exerciseCatalog.isMuscleCompatible(candidate, focusMuscles);
}

function matchExercise(inputName, options = {}) {
  if (!inputName || typeof inputName !== 'string') {
    return { catalogId: undefined, confidence: 0, matchedName: '', alternatives: [], status: 'custom' };
  }

  const catalog = exerciseCatalog.getAll();
  const normalizedInput = normalizeText(inputName);
  const inputTokens = tokenize(inputName);

  let best = null;

  for (const candidate of catalog) {
    const names = [candidate.name, candidate.canonicalIt, ...candidate.aliasesIt]
      .filter(Boolean)
      .filter((name, index, self) => self.indexOf(name) === index);

    let maxNameScore = 0;
    for (const name of names) {
      const score = nameSimilarity(inputName, name);
      if (score > maxNameScore) maxNameScore = score;
    }

    // bonus se alcuni token dell'input compaiono nel target/bodyPart/equipment
    if (inputTokens.length && maxNameScore > 0.3 && maxNameScore < 0.95) {
      const metaText = [candidate.target, candidate.bodyPart, candidate.equipment]
        .filter(Boolean)
        .map(normalizeText)
        .join(' ');
      const metaMatches = inputTokens.filter((token) => metaText.includes(token)).length;
      if (metaMatches / inputTokens.length >= 0.5) {
        maxNameScore = Math.min(0.94, maxNameScore + 0.08);
      }
    }

    let finalScore = maxNameScore;

    if (options.userEquipment && !isEquipmentCompatible(candidate.equipment, options.userEquipment)) {
      finalScore *= 0.7;
    }

    if (options.focusMuscles?.length && !isMuscleCompatible(candidate, options.focusMuscles)) {
      finalScore *= 0.85;
    }

    if (!best || finalScore > best.score) {
      best = { candidate, score: finalScore };
    }
  }

  if (!best) {
    return { catalogId: undefined, confidence: 0, matchedName: '', alternatives: [], status: 'custom' };
  }

  const confidence = Math.round(best.score * 100) / 100;
  const status = confidence >= 0.90 ? 'auto' : confidence >= 0.72 ? 'confirm' : 'custom';
  const matchedName = best.candidate.canonicalIt || best.candidate.name;

  const alternatives = status !== 'custom'
    ? exerciseCatalog.getAlternatives(best.candidate.id, { limit: 5 })
        .filter((alt) => alt.id !== best.candidate.id)
        .slice(0, 4)
    : [];

  return {
    catalogId: status === 'custom' ? undefined : best.candidate.id,
    confidence,
    matchedName,
    alternatives: alternatives.map((alt) => ({
      id: alt.id,
      name: alt.canonicalIt || alt.name,
      equipment: alt.equipment,
      target: alt.target
    })),
    status
  };
}

function matchSupersetItems(items, options = {}) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const match = matchExercise(item.name, options);
    return {
      ...item,
      ...(match.catalogId ? {
        catalogId: match.catalogId,
        matchConfidence: match.confidence,
        canonicalName: match.matchedName
      } : {})
    };
  });
}

function matchProgram(program, options = {}) {
  const safe = program && typeof program === 'object' ? program : {};
  const days = Array.isArray(safe.days) ? safe.days : [];

  days.forEach((day) => {
    if (!Array.isArray(day.exercises)) return;
    day.exercises.forEach((ex) => {
      const match = matchExercise(ex.name, options);
      if (match.catalogId) {
        ex.catalogId = match.catalogId;
        ex.matchConfidence = match.confidence;
        ex.canonicalName = match.matchedName;
        const details = exerciseCatalog.getById(match.catalogId);
        if (details) {
          ex.target = details.target;
          ex.equipment = details.equipment;
          ex.secondaryMuscles = details.secondaryMuscles;
          ex.instructionsIt = details.instructionsIt;
        }
      }
      if (Array.isArray(ex.supersetItems) && ex.supersetItems.length) {
        ex.supersetItems = matchSupersetItems(ex.supersetItems, options);
      }
    });
  });

  return safe;
}

module.exports = {
  matchExercise,
  matchSupersetItems,
  matchProgram,
  normalizeText,
  tokenize,
  levenshtein,
  charSimilarity,
  tokenJaccard
};
