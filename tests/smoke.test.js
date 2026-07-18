const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const indexPath = path.join(root, 'index.html');

function readIndexHtml() {
  assert.ok(fs.existsSync(indexPath), 'index.html should exist');
  return fs.readFileSync(indexPath, 'utf8');
}

function expectContains(html, needles) {
  for (const needle of needles) {
    assert.ok(
      html.includes(needle),
      `Expected index.html to contain ${needle}`,
    );
  }
}

test('app shell keeps the core mobile entry points', () => {
  const html = readIndexHtml();

  expectContains(html, [
    '<!DOCTYPE html>',
    '<html lang="it">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">',
    '<link rel="manifest" href="./app.webmanifest">',
    '<link rel="apple-touch-icon" href="./icons/hypercore-apple-touch-icon.png">',
    '<meta name="theme-color" content="#00e676">',
    '<div id="app">',
    '<div id="programs" class="app-section">',
    '<div id="home" class="app-section"',
    '<div id="progress" class="app-section">',
    '<div id="nutrition" class="app-section">',
    '<div id="coach" class="app-section">',
  ]);
});

if (process.env.EXPECT_EXTRACTED === '1') {
  test('extracted shell mode enforces external CSS and JS references', () => {
    const html = readIndexHtml();

    expectContains(html, [
      'assets/css/app.css',
      'assets/js/app.js',
    ]);

    assert.ok(!html.includes('<style>'), 'inline <style> block should be removed');
    assert.ok(!html.includes('loadPrograms();'), 'inline runtime bootstrap should be removed');
  });
} else {
  test.skip('extracted shell mode enforces external CSS and JS references', () => {});
}
