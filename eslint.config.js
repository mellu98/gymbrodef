import globals from 'globals';
import eslintJs from '@eslint/js';

export default [
  {
    // Browser files: app.js, sw.js
    files: ['assets/js/app.js', 'sw.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        AudioContext: 'readonly',
        Event: 'readonly',
        FileReader: 'readonly',
        HTMLInputElement: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        Intl: 'readonly',
        cache: 'readonly',
        clients: 'readonly',
        self: 'readonly',
        caches: 'readonly',
        ServiceWorkerGlobalScope: 'readonly'
      }
    },
    rules: {
      ...eslintJs.configs.recommended.rules,
      'no-console': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
      'eqeqeq': ['error', 'always'],
      'curly': ['error', 'multi-line'],
      'no-duplicate-case': 'error',
      'no-unreachable': 'error',
      'no-unsafe-negation': 'error'
    }
  },
  {
    // Node files: server.js, tests
    files: ['server.js', 'tests/**/*.test.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node
      }
    },
    rules: {
      ...eslintJs.configs.recommended.rules,
      'no-console': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
      'eqeqeq': ['error', 'always'],
      'curly': ['error', 'multi-line'],
      'no-duplicate-case': 'error',
      'no-unreachable': 'error',
      'no-unsafe-negation': 'error'
    }
  }
];
