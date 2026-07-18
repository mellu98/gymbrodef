/**
 * One-shot migration script: replaces all mutable global variable references
 * with AppState.xxx property paths.
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'assets', 'js', 'app.js');
let code = fs.readFileSync(filePath, 'utf8');

// Normalize to LF for consistent processing
code = code.replace(/\r\n/g, '\n');

// Step 1: Replace the variable declarations with AppState
const oldDecls = `let PROGRAMS = [];
let bundledPrograms = [];
let currentProgram = null;
let currentProgramIndex = -1;
let currentDay = null;
let currentWeek = 1;
let currentTab = 'list';
let currentSection = 'plans';
let focusIdx = 0;
let programStateCache = {};
let deferredPrompt = null;
let importDraft = null;
let importMeta = null;
let importBusy = false;
let assistantOpen = false;
let assistantBusy = false;
let headerMenuOpen = false;
let nutritionSelectedDate = '';
let aiCoachState = {
  phase: 'idle',
  busy: false,
  error: '',
  status: '',
  questions: [],
  answers: {},
  rationale: [],
  warnings: [],
  confidence: 0,
  draftProgram: null,
  refineMessages: []
};
let nutritionAiState = {
  phase: 'idle',
  busy: false,
  error: '',
  status: '',
  questions: [],
  answers: {},
  rationale: [],
  warnings: [],
  confidence: 0,
  draftPlan: null,
  refineMessages: []
};
// Timer state
let timerInterval = null;
let timerTotal = 90;
let timerLeft = 90;
let timerRunning = false;
// Chrono state
let chronoInterval = null;
let chronoSecs = 0;
let chronoRunning = false;
// Neg timer
let negInterval = null;
let negLeft = 4;
let negRunning = false;
let negDur = 4;`;

const newDecls = `const AppState = {
  navigation: {
    section: 'plans',
    day: null,
    tab: 'list',
    focusIdx: 0
  },
  programs: {
    list: [],
    bundled: [],
    current: null,
    currentIndex: -1,
    currentWeek: 1,
    stateCache: {}
  },
  import: {
    draft: null,
    meta: null,
    busy: false
  },
  ai: {
    coach: {
      phase: 'idle',
      busy: false,
      error: '',
      status: '',
      questions: [],
      answers: {},
      rationale: [],
      warnings: [],
      confidence: 0,
      draftProgram: null,
      refineMessages: []
    },
    nutrition: {
      phase: 'idle',
      busy: false,
      error: '',
      status: '',
      questions: [],
      answers: {},
      rationale: [],
      warnings: [],
      confidence: 0,
      draftPlan: null,
      refineMessages: []
    }
  },
  timers: {
    rest: { interval: null, total: 90, left: 90, running: false },
    chrono: { interval: null, secs: 0, running: false },
    neg: { interval: null, left: 4, running: false, dur: 4 }
  },
  nutrition: {
    selectedDate: ''
  },
  ui: {
    assistantOpen: false,
    assistantBusy: false,
    headerMenuOpen: false,
    deferredPrompt: null
  }
};`;

if (!code.includes(oldDecls)) {
  console.error('ERROR: Could not find the old declarations block.');
  console.error('Looking for first line:');
  console.error(JSON.stringify(oldDecls.substring(0, 50)));
  console.error('File starts with:');
  console.error(JSON.stringify(code.substring(0, 100)));
  process.exit(1);
}

code = code.replace(oldDecls, newDecls);
console.log('Step 1: Replaced variable declarations with AppState object');

// Step 2: Find the end of the AppState block so we can skip it during replacements
const appStateStart = code.indexOf('const AppState = {');
// Find the closing }; after the ui block
const uiBlock = '  ui: {';
const uiBlockPos = code.indexOf(uiBlock, appStateStart);
const appStateEnd = code.indexOf('};', uiBlockPos) + 2;
console.log(`AppState block ends at char ${appStateEnd}`);

// Split code
const beforeAppState = code.substring(0, appStateStart);
const appStateBlock = code.substring(appStateStart, appStateEnd);
let afterAppState = code.substring(appStateEnd);

// Step 3: Replace all variable references in the AFTER portion only
const replacements = [
  // Longer/more-specific names FIRST to avoid partial matches
  ['currentProgramIndex', 'AppState.programs.currentIndex'],
  ['currentProgram', 'AppState.programs.current'],
  ['programStateCache', 'AppState.programs.stateCache'],
  ['bundledPrograms', 'AppState.programs.bundled'],
  ['currentWeek', 'AppState.programs.currentWeek'],
  ['currentSection', 'AppState.navigation.section'],
  ['currentDay', 'AppState.navigation.day'],
  ['currentTab', 'AppState.navigation.tab'],
  ['focusIdx', 'AppState.navigation.focusIdx'],
  ['importDraft', 'AppState.import.draft'],
  ['importMeta', 'AppState.import.meta'],
  ['importBusy', 'AppState.import.busy'],
  ['aiCoachState', 'AppState.ai.coach'],
  ['nutritionAiState', 'AppState.ai.nutrition'],
  ['timerInterval', 'AppState.timers.rest.interval'],
  ['timerTotal', 'AppState.timers.rest.total'],
  ['timerLeft', 'AppState.timers.rest.left'],
  ['timerRunning', 'AppState.timers.rest.running'],
  ['chronoInterval', 'AppState.timers.chrono.interval'],
  ['chronoSecs', 'AppState.timers.chrono.secs'],
  ['chronoRunning', 'AppState.timers.chrono.running'],
  ['negInterval', 'AppState.timers.neg.interval'],
  ['negLeft', 'AppState.timers.neg.left'],
  ['negRunning', 'AppState.timers.neg.running'],
  ['negDur', 'AppState.timers.neg.dur'],
  ['nutritionSelectedDate', 'AppState.nutrition.selectedDate'],
  ['assistantOpen', 'AppState.ui.assistantOpen'],
  ['assistantBusy', 'AppState.ui.assistantBusy'],
  ['headerMenuOpen', 'AppState.ui.headerMenuOpen'],
  ['deferredPrompt', 'AppState.ui.deferredPrompt'],
];

let totalReplacements = 0;

for (const [oldName, newName] of replacements) {
  const simpleRegex = new RegExp(`\\b${oldName}\\b`, 'g');
  const matches = afterAppState.match(simpleRegex);
  if (matches) {
    afterAppState = afterAppState.replace(simpleRegex, newName);
    totalReplacements += matches.length;
    console.log(`  ${oldName}: ${matches.length} replacements`);

    // Fix property keys: where newName appears as an object property key
    // (preceded by { or , with optional whitespace, followed by :)
    // e.g., "{ AppState.import.meta: ..." → "{ importMeta: ..."
    const escapedNew = newName.replace(/\./g, '\\.');
    const fixRegex = new RegExp(`([,{]\\s*)${escapedNew}\\s*:`, 'g');
    const fixed = afterAppState.match(fixRegex);
    if (fixed) {
      afterAppState = afterAppState.replace(fixRegex, `$1${oldName}:`);
      totalReplacements -= fixed.length;
      console.log(`    (fixed ${fixed.length} property key(s))`);
    }
  } else {
    console.log(`  ${oldName}: 0 replacements`);
  }
}

// Special: PROGRAMS (word boundary prevents matching PROGRAMS_URL etc.)
const programsRegex = /\bPROGRAMS\b/g;
const programsMatches = afterAppState.match(programsRegex);
if (programsMatches) {
  afterAppState = afterAppState.replace(programsRegex, 'AppState.programs.list');
  totalReplacements += programsMatches.length;
  console.log(`  PROGRAMS: ${programsMatches.length} replacements`);
}

// Reassemble
code = beforeAppState + appStateBlock + afterAppState;

fs.writeFileSync(filePath, code, 'utf8');
console.log(`\nTotal replacements: ${totalReplacements}`);
console.log('Done. Run syntax check next.');
