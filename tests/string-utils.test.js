/**
 * String utility function tests.
 * Inline copies of pure functions from assets/js/app.js lines 72-107.
 * When updating the source, update these copies too.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

// ── Inline copies of pure functions from app.js ──────────────

function repairText(value) {
  if (typeof value !== 'string') return value;
  if (!/[ÃÂâð]/.test(value)) return value;
  try { return decodeURIComponent(escape(value)); } catch(e) { return value; }
}

function cleanText(value) {
  return repairText(String(value ?? ''))
    .replace(/ /g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[ÓÕ]/g, '"')
    .replace(/Þ/g, 'fi')
    .replace(/ß/g, 'fl')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function slugify(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'scheda-importata';
}

// ── cleanText tests ───────────────────────────────────────────

test('cleanText: plain string passes through', () => {
  assert.strictEqual(cleanText('hello'), 'hello');
});

test('cleanText: null returns empty string', () => {
  assert.strictEqual(cleanText(null), '');
});

test('cleanText: undefined returns empty string', () => {
  assert.strictEqual(cleanText(undefined), '');
});

test('cleanText: number is coerced to string', () => {
  assert.strictEqual(cleanText(42), '42');
});

test('cleanText: trims leading and trailing whitespace', () => {
  assert.strictEqual(cleanText('  spaces  '), 'spaces');
});

test('cleanText: collapses multiple spaces into one', () => {
  assert.strictEqual(cleanText('multi   word'), 'multi word');
});

test('cleanText: replaces non-breaking space with regular space', () => {
  // NBSP in the middle of a string gets replaced with regular space
  assert.strictEqual(cleanText('hello world'), 'hello world');
});

test('cleanText: replaces smart quotes with straight quotes', () => {
  assert.strictEqual(cleanText('“quoted”'), '"quoted"');
});

// ── escapeHtml tests ──────────────────────────────────────────

test('escapeHtml: escapes angle brackets', () => {
  assert.strictEqual(escapeHtml('<script>'), '&lt;script&gt;');
});

test('escapeHtml: escapes double quotes', () => {
  assert.strictEqual(escapeHtml('a="b"'), 'a=&quot;b&quot;');
});

test('escapeHtml: escapes single quotes', () => {
  assert.strictEqual(escapeHtml("it's"), "it&#039;s");
});

test('escapeHtml: normal text passes through', () => {
  assert.strictEqual(escapeHtml('normal'), 'normal');
});

test('escapeHtml: null returns empty string', () => {
  assert.strictEqual(escapeHtml(null), '');
});

// ── repairText tests ──────────────────────────────────────────

test('repairText: normal string passes through unchanged', () => {
  assert.strictEqual(repairText('normal text'), 'normal text');
});

test('repairText: non-string value passes through', () => {
  assert.strictEqual(repairText(123), 123);
});

test('repairText: fixes single mojibake encoding', () => {
  // "cafÃ©" is a single-encoded mojibake of "café"
  const result = repairText('cafÃ©');
  assert.strictEqual(result, 'café');
});

// ── slugify tests ─────────────────────────────────────────────

test('slugify: replaces slashes with dashes', () => {
  assert.strictEqual(slugify('Push/Pull/Legs'), 'push-pull-legs');
});

test('slugify: trims and lowercases', () => {
  assert.strictEqual(slugify('  Hello World  '), 'hello-world');
});

test('slugify: empty string returns default', () => {
  assert.strictEqual(slugify(''), 'scheda-importata');
});
