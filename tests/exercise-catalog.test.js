const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const exerciseCatalog = require('../lib/exercise-catalog');

const FIXTURE_CATALOG = path.join(__dirname, 'fixtures', 'exercises.catalog.fixture.json');
const FIXTURE_ALIASES = path.join(__dirname, 'fixtures', 'exercise-aliases.it.fixture.json');

test.beforeEach(() => {
  exerciseCatalog.loadSync(FIXTURE_CATALOG, FIXTURE_ALIASES);
});

test('catalog loads fixture and returns stats', () => {
  const stats = exerciseCatalog.getStats();
  assert.strictEqual(stats.total, 10);
  assert.strictEqual(stats.withItalianName, 10);
});

test('getById returns exercise with merged aliases', () => {
  const ex = exerciseCatalog.getById('0002');
  assert.ok(ex);
  assert.strictEqual(ex.name, 'barbell bench press');
  assert.strictEqual(ex.canonicalIt, 'Panca piana con bilanciere');
  assert.ok(ex.aliasesIt.includes('panca piana'));
});

test('getById returns null for unknown id', () => {
  const ex = exerciseCatalog.getById('9999');
  assert.strictEqual(ex, null);
});

test('search finds by canonical italian name', () => {
  const results = exerciseCatalog.search('panca piana');
  assert.ok(results.length > 0);
  assert.ok(results.some((r) => r.id === '0002'));
});

test('search finds by target and body part', () => {
  const results = exerciseCatalog.search('chest pectorals');
  assert.ok(results.length >= 3);
  assert.ok(results.every((r) => r.target === 'pectorals'));
});

test('getShortlist filters by equipment', () => {
  const results = exerciseCatalog.getShortlist({ userEquipment: 'home_gym' });
  assert.ok(results.length > 0);
  assert.ok(results.every((r) => ['body weight', 'band', 'dumbbell', 'kettlebell', 'medicine ball'].includes(r.equipment)));
});

test('getShortlist filters by equipment and focus muscles', () => {
  const results = exerciseCatalog.getShortlist({ userEquipment: 'basic_gym', focusMuscles: ['chest'], limit: 10 });
  assert.ok(results.length > 0);
  assert.ok(results.every((r) => r.target === 'pectorals' || r.bodyPart === 'chest'));
});

test('getShortlist excludes avoided exercises', () => {
  const results = exerciseCatalog.getShortlist({ userEquipment: 'palestra_completa', avoidExercises: ['barbell'] });
  assert.ok(!results.some((r) => r.name.includes('barbell')));
});

test('getAlternatives returns related exercises', () => {
  const alts = exerciseCatalog.getAlternatives('0002');
  assert.ok(alts.length > 0);
  assert.ok(alts.every((alt) =>
    alt.target === 'pectorals' ||
    alt.bodyPart === 'chest' ||
    alt.equipment === 'barbell' ||
    alt.secondaryMuscles.some((m) => ['triceps', 'delts'].includes(m))
  ));
});

test('isEquipmentCompatibility maps correctly', () => {
  assert.strictEqual(exerciseCatalog.isEquipmentCompatible('body weight', 'bodyweight_home'), true);
  assert.strictEqual(exerciseCatalog.isEquipmentCompatible('barbell', 'home_gym'), false);
  assert.strictEqual(exerciseCatalog.isEquipmentCompatible('barbell', 'palestra_completa'), true);
});

test('isMuscleCompatibility matches focus muscles', () => {
  const ex = exerciseCatalog.getById('0002');
  assert.strictEqual(exerciseCatalog.isMuscleCompatible(ex, ['chest']), true);
  assert.strictEqual(exerciseCatalog.isMuscleCompatible(ex, ['quads']), false);
});
