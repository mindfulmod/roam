// The app's script files, in the order the build joins them into one script (after Leaflet and
// the data). They share one scope, exactly as one file would. Used by build.mjs and lint.mjs.
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FEATURE_FILES = [
  'src/budget.js',
  'src/theme.js',
  'src/share.js',
  'src/story.js',
  'src/social.js',
  'src/backend.js',
  'src/account.js',
  'src/log.js',
  'src/triplog.js',
  'src/tlphotos.js',
  'src/tlcatch.js',
  'src/tlstory.js',
  'src/edit.js',
  'src/choose.js',
];
// src/app/ holds the core of the app as numbered parts, joined in name order after the rest.
export const APP_FILES = readdirSync(path.join(root, 'src/app'))
  .filter((f) => f.endsWith('.js'))
  .sort()
  .map((f) => 'src/app/' + f);
export const SCRIPT_FILES = [...FEATURE_FILES, ...APP_FILES];
