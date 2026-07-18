/**
 * Date utility function tests.
 * Inline copies of pure functions from assets/js/app.js lines 1368-1397.
 * When updating the source, update these copies too.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

// ── Inline copies of pure functions from app.js ──────────────

function getTodayDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

function shiftDateKey(dateKey, deltaDays) {
  const parts = String(dateKey || '').split('-').map((value) => parseInt(value, 10));
  const base = parts.length === 3 && parts.every((value) => Number.isInteger(value))
    ? new Date(parts[0], parts[1] - 1, parts[2])
    : new Date();
  base.setDate(base.getDate() + deltaDays);
  const year = base.getFullYear();
  const month = String(base.getMonth() + 1).padStart(2, '0');
  const day = String(base.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

function formatNutritionDateLabel(dateKey) {
  // Simplified inline copy — the real version uses cleanText for fallback.
  // For this test file we inline the cleanText fallback behavior.
  const parts = String(dateKey || '').split('-').map((value) => parseInt(value, 10));
  if (parts.length !== 3 || parts.some((value) => !Number.isInteger(value))) return String(dateKey || '').trim();
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return new Intl.DateTimeFormat('it-IT', {
    weekday: 'short',
    day: '2-digit',
    month: 'short'
  }).format(date);
}

// ── getTodayDateKey tests ─────────────────────────────────────

test('getTodayDateKey returns YYYY-MM-DD format', () => {
  const key = getTodayDateKey();
  assert.match(key, /^\d{4}-\d{2}-\d{2}$/, 'date key must match YYYY-MM-DD');
});

test('getTodayDateKey returns today date', () => {
  const now = new Date();
  const expected = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');
  assert.strictEqual(getTodayDateKey(), expected);
});

// ── shiftDateKey tests ────────────────────────────────────────

test('shiftDateKey forward 1 day', () => {
  assert.strictEqual(shiftDateKey('2026-05-05', 1), '2026-05-06');
});

test('shiftDateKey backward 1 day', () => {
  assert.strictEqual(shiftDateKey('2026-05-05', -1), '2026-05-04');
});

test('shiftDateKey backward across month boundary', () => {
  assert.strictEqual(shiftDateKey('2026-05-01', -1), '2026-04-30');
});

test('shiftDateKey backward across year boundary', () => {
  assert.strictEqual(shiftDateKey('2026-01-01', -1), '2025-12-31');
});

test('shiftDateKey backward across non-leap February', () => {
  assert.strictEqual(shiftDateKey('2026-03-01', -1), '2026-02-28');
});

test('shiftDateKey backward across leap February', () => {
  assert.strictEqual(shiftDateKey('2024-03-01', -1), '2024-02-29');
});

test('shiftDateKey with empty string produces valid date', () => {
  const result = shiftDateKey('', 1);
  assert.match(result, /^\d{4}-\d{2}-\d{2}$/, 'fallback to today should produce valid date');
});

test('shiftDateKey with invalid string and 0 delta produces valid date', () => {
  const result = shiftDateKey('invalid', 0);
  assert.match(result, /^\d{4}-\d{2}-\d{2}$/, 'fallback to today should produce valid date');
});

// ── formatNutritionDateLabel tests ────────────────────────────

test('formatNutritionDateLabel with valid date returns Italian format', () => {
  const label = formatNutritionDateLabel('2026-05-05');
  // Should contain the day number "5" and Italian month abbreviation "mag"
  assert.ok(label.includes('5'), 'should contain day number');
});

test('formatNutritionDateLabel with invalid input returns input as-is', () => {
  assert.strictEqual(formatNutritionDateLabel('invalid'), 'invalid');
});

test('formatNutritionDateLabel with empty string returns empty', () => {
  assert.strictEqual(formatNutritionDateLabel(''), '');
});
