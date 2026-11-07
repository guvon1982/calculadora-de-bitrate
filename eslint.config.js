// Configuração do ESLint (revisor automático de JavaScript).
// O plugin "html" permite revisar o <script> que fica dentro do index.html.
const js = require('@eslint/js');
const html = require('eslint-plugin-html');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/**'] },
  js.configs.recommended,
  {
    files: ['**/*.html'],
    plugins: { html },
    languageOptions: { sourceType: 'script', globals: globals.browser },
  },
  {
    files: ['**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
];
