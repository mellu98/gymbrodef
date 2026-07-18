/**
 * Date matching and inference tests.
 * Standalone tests replicating the hasWorkoutSessionOnDate fallback logic
 * and inferNutritionDayType behavior.
 *
 * These operate on test data arrays (not localStorage).
 */
const test = require('node:test');
const assert = require('node:assert/strict');

// ── Inline copy of parseLocaleDateToDateKey (new helper from WI1-T2) ──

/**
 * Parse Italian locale date string "d/M/YYYY, HH:MM:SS" to "YYYY-MM-DD".
 * Returns empty string if parsing fails.
 */
function parseLocaleDateToDateKey(localeDate) {
  const match = String(localeDate || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return '';
  const [, day, month, year] = match;
  return year + '-' + month.padStart(2, '0') + '-' + day.padStart(2, '0');
}

// ── Inline hasWorkoutSessionOnDate logic (standalone, no localStorage) ──

/**
 * Simulates hasWorkoutSessionOnDate with a provided history array.
 * Mirrors the logic from WI1-T2: dateKey match first, then locale fallback.
 */
function hasWorkoutOnDate(history, dateKey) {
  if (!dateKey) return false;
  if (!Array.isArray(history)) return false;
  return history.some((entry) => {
    if (!entry) return false;
    // Fast path: dateKey field (new-format entries)
    if (entry.dateKey && typeof entry.dateKey === 'string') {
      return entry.dateKey === dateKey;
    }
    // Fallback: parse Italian locale date "d/M/YYYY, HH:MM:SS"
    return parseLocaleDateToDateKey(entry.date || '') === dateKey;
  });
}

// ── Inline inferNutritionDayType logic ──

function inferNutritionDayType(dateKey, storedValue, hasWorkout) {
  if (storedValue === 'training' || storedValue === 'rest') return storedValue;
  return hasWorkout ? 'training' : 'rest';
}

// ── parseLocaleDateToDateKey tests ────────────────────────────

test('parseLocaleDateToDateKey: standard Italian locale format', () => {
  assert.strictEqual(parseLocaleDateToDateKey('5/5/2026, 14:30:00'), '2026-05-05');
});

test('parseLocaleDateToDateKey: zero-padded day/month', () => {
  assert.strictEqual(parseLocaleDateToDateKey('05/05/2026, 00:00:00'), '2026-05-05');
});

test('parseLocaleDateToDateKey: mixed padding DD/M/YYYY', () => {
  assert.strictEqual(parseLocaleDateToDateKey('12/1/2026, 08:00:00'), '2026-01-12');
});

test('parseLocaleDateToDateKey: empty string returns empty', () => {
  assert.strictEqual(parseLocaleDateToDateKey(''), '');
});

test('parseLocaleDateToDateKey: garbage returns empty', () => {
  assert.strictEqual(parseLocaleDateToDateKey('garbage'), '');
});

// ── hasWorkoutOnDate tests ────────────────────────────────────

test('hasWorkoutOnDate: entry with dateKey matches', () => {
  const history = [{ dateKey: '2026-05-05', date: '5/5/2026, 14:30:00' }];
  assert.strictEqual(hasWorkoutOnDate(history, '2026-05-05'), true);
});

test('hasWorkoutOnDate: entry with different dateKey does not match', () => {
  const history = [{ dateKey: '2026-05-04', date: '4/5/2026, 10:00:00' }];
  assert.strictEqual(hasWorkoutOnDate(history, '2026-05-05'), false);
});

test('hasWorkoutOnDate: old-format entry with locale date matches via fallback', () => {
  const history = [{ date: '5/5/2026, 14:30:00' }];
  assert.strictEqual(hasWorkoutOnDate(history, '2026-05-05'), true);
});

test('hasWorkoutOnDate: old-format DD/M/YYYY matches ISO date', () => {
  const history = [{ date: '12/1/2026, 08:00:00' }];
  assert.strictEqual(hasWorkoutOnDate(history, '2026-01-12'), true);
});

test('hasWorkoutOnDate: entry with empty date and no dateKey returns false', () => {
  const history = [{ date: '' }];
  assert.strictEqual(hasWorkoutOnDate(history, '2026-05-05'), false);
});

test('hasWorkoutOnDate: empty history returns false', () => {
  assert.strictEqual(hasWorkoutOnDate([], '2026-05-05'), false);
});

test('hasWorkoutOnDate: null entry in history is skipped', () => {
  const history = [null];
  assert.strictEqual(hasWorkoutOnDate(history, '2026-05-05'), false);
});

test('hasWorkoutOnDate: empty dateKey returns false', () => {
  assert.strictEqual(hasWorkoutOnDate([{ dateKey: '2026-05-05' }], ''), false);
});

// ── inferNutritionDayType tests ───────────────────────────────

test('inferNutritionDayType: stored "training" has precedence', () => {
  assert.strictEqual(inferNutritionDayType('2026-05-05', 'training', false), 'training');
});

test('inferNutritionDayType: stored "rest" has precedence', () => {
  assert.strictEqual(inferNutritionDayType('2026-05-05', 'rest', true), 'rest');
});

test('inferNutritionDayType: empty stored value with workout present returns training', () => {
  assert.strictEqual(inferNutritionDayType('2026-05-05', '', true), 'training');
});

test('inferNutritionDayType: empty stored value with no workout returns rest', () => {
  assert.strictEqual(inferNutritionDayType('2026-05-05', '', false), 'rest');
});

test('inferNutritionDayType: garbage stored value delegates to workout check', () => {
  assert.strictEqual(inferNutritionDayType('2026-05-05', 'garbage', true), 'training');
  assert.strictEqual(inferNutritionDayType('2026-05-05', 'garbage', false), 'rest');
});
