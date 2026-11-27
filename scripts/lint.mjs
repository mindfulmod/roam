// Lints the app as the browser runs it: every script file joined in build order into one
// scope, so a name used in one file and defined in another is fine, and a typo or a leftover
// is caught. Problems are reported against the original file and line.
//   node scripts/lint.mjs        (also run by npm test and on every pull request)
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import globals from 'globals';
import { SCRIPT_FILES } from './app-files.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rules = {
  'no-undef': 'error',
  'no-unused-vars': ['error', { vars: 'all', args: 'none', caughtErrors: 'none' }],
  'no-redeclare': ['error', { builtinGlobals: false }],
  'no-dupe-keys': 'error',
  'no-duplicate-case': 'error',
  'no-unreachable': 'error',
  'no-self-assign': 'error',
  'no-const-assign': 'error',
  'no-unsafe-finally': 'error',
  'no-cond-assign': ['error', 'except-parens'],
  'use-isnan': 'error',
  'valid-typeof': 'error',
};
const lint = (sourceType, extra) =>
  new ESLint({
    overrideConfigFile: true,
    overrideConfig: {
      languageOptions: { ecmaVersion: 2024, sourceType, globals: { ...globals.browser, ...extra } },
      rules,
    },
  });

// The app: one joined script. Leaflet (L) and the data (DATA) come before it in the build.
const files = await Promise.all(
  SCRIPT_FILES.map(async (f) => ({ f, text: await readFile(path.join(root, f), 'utf8') })),
);
const starts = [];
let joined = '';
for (const { f, text } of files) {
  starts.push({ f, line: joined.split('\n').length });
  joined += text.endsWith('\n') ? text : text + '\n';
}
const where = (line) => {
  const s = starts.findLast((x) => x.line <= line);
  return `${s.f}:${line - s.line + 1}`;
};
const out = [];
const [app] = await lint('script', { L: 'readonly', DATA: 'readonly' }).lintText(joined);
for (const m of app.messages) out.push(`${where(m.line)}  ${m.message} (${m.ruleId})`);
// The offline helper runs on its own, as a service worker.
const [sw] = await lint('script', { ...globals.serviceworker, __CORE__: 'readonly' }).lintFiles([
  path.join(root, 'src/sw.js'),
]);
for (const m of sw.messages) out.push(`src/sw.js:${m.line}  ${m.message} (${m.ruleId})`);

for (const line of out) console.log(line);
console.log(`${SCRIPT_FILES.length + 1} files linted, ${out.length} problems`);
if (out.length) process.exit(1);
