const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const exerciseCatalog = require('../lib/exercise-catalog');
const exerciseMatcher = require('../lib/exercise-matcher');

const FIXTURE_CATALOG = path.join(__dirname, 'fixtures', 'exercises.catalog.fixture.json');
const FIXTURE_ALIASES = path.join(__dirname, 'fixtures', 'exercise-aliases.it.fixture.json');

test.beforeEach(() => {
  exerciseCatalog.loadSync(FIXTURE_CATALOG, FIXTURE_ALIASES);
});

test('matchExercise: exact alias italian match', () => {
  const result = exerciseMatcher.matchExercise('panca piana');
  assert.strictEqual(result.catalogId, '0002');
  assert.strictEqual(result.confidence, 1);
  assert.strictEqual(result.matchedName, 'Panca piana con bilanciere');
  assert.strictEqual(result.status, 'auto');
});

test('matchExercise: exact english name match', () => {
  const result = exerciseMatcher.matchExercise('barbell bench press');
  assert.strictEqual(result.catalogId, '0002');
  assert.strictEqual(result.confidence, 1);
  assert.strictEqual(result.status, 'auto');
});

test('matchExercise: fuzzy typo still matches', () => {
  const result = exerciseMatcher.matchExercise('pnca piana');
  assert.strictEqual(result.catalogId, '0002');
  assert.ok(result.confidence >= 0.80, `expected confidence >= 0.80, got ${result.confidence}`);
  assert.strictEqual(result.status, 'auto');
});

test('matchExercise: uncertain match requires confirmation', () => {
  const result = exerciseMatcher.matchExercise('distensioni su panca');
  assert.strictEqual(result.catalogId, '0002');
  assert.ok(result.confidence >= 0.72 && result.confidence < 0.90, `expected 0.72-0.89, got ${result.confidence}`);
  assert.strictEqual(result.status, 'confirm');
  assert.ok(result.alternatives.length > 0);
});

test('matchExercise: unknown exercise returns custom', () => {
  const result = exerciseMatcher.matchExercise('xyzabc not an exercise');
  assert.strictEqual(result.catalogId, undefined);
  assert.ok(result.confidence < 0.72);
  assert.strictEqual(result.status, 'custom');
});

test('matchExercise: equipment compatibility penalizes mismatches', () => {
  const homeResult = exerciseMatcher.matchExercise('cable crossover', { userEquipment: 'home_gym' });
  const gymResult = exerciseMatcher.matchExercise('cable crossover', { userEquipment: 'palestra_completa' });
  assert.ok(homeResult.confidence < gymResult.confidence, 'home gym should penalize cable equipment');
});

test('matchExercise: focus muscles boost compatible matches', () => {
  const result = exerciseMatcher.matchExercise('chest press', { focusMuscles: ['chest'] });
  assert.ok(result.catalogId);
  assert.strictEqual(exerciseCatalog.getById(result.catalogId).target, 'pectorals');
});

test('matchSupersetItems: matches each superset item', () => {
  const items = [
    { name: 'panca piana', reps: '8' },
    { name: 'curl bilanciere', reps: '10' }
  ];
  const matched = exerciseMatcher.matchSupersetItems(items);
  assert.strictEqual(matched[0].catalogId, '0002');
  assert.strictEqual(matched[1].catalogId, '0009');
});

test('matchProgram: enriches exercises with catalog ids', () => {
  const program = {
    days: [{
      name: 'Day 1',
      exercises: [
        { name: 'panca piana', series: 3, reps: '8-10' },
        { name: 'curl bilanciere', series: 3, reps: '10' }
      ]
    }]
  };
  const enriched = exerciseMatcher.matchProgram(program);
  assert.strictEqual(enriched.days[0].exercises[0].catalogId, '0002');
  assert.strictEqual(enriched.days[0].exercises[0].canonicalName, 'Panca piana con bilanciere');
  assert.strictEqual(enriched.days[0].exercises[0].target, 'pectorals');
  assert.strictEqual(enriched.days[0].exercises[1].catalogId, '0009');
});

test('matchProgram: leaves custom exercises without catalogId', () => {
  const program = {
    days: [{
      name: 'Day 1',
      exercises: [
        { name: 'esercizio totalmente inventato', series: 3, reps: '10' }
      ]
    }]
  };
  const enriched = exerciseMatcher.matchProgram(program);
  const ex = enriched.days[0].exercises[0];
  assert.strictEqual(ex.catalogId, undefined);
  assert.ok(!ex.matchConfidence || ex.matchConfidence < 0.72);
});

test('tokenJaccard and charSimilarity helpers', () => {
  assert.strictEqual(exerciseMatcher.tokenJaccard('panca piana', 'panca piana'), 1);
  assert.ok(exerciseMatcher.charSimilarity('panca piana', 'pnca piana') > 0.85);
  assert.ok(exerciseMatcher.levenshtein('kitten', 'sitting') > 0);
});
