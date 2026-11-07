// Dark mode helper. Rewrites the light-only colour literals in src/styles.css into theme
// tokens (--k-xxxxxx) and regenerates the dark values for them in src/theme.css.
//   node scripts/theme-dark.mjs
// Re-run it after adding CSS with new hex colours, so dark mode picks them up.
// Rules: light text colours (white on teal buttons or on photos), faint glass highlights and
// black overlays/shadows stay as they are, because they sit on photos or solid brand colour in
// both themes. Everything else flips lightness while keeping its hue.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cssPath = path.join(root, 'src/styles.css'),
  themePath = path.join(root, 'src/theme.css');
let css = await readFile(cssPath, 'utf8');

function parse(hex) {
  let h = hex.slice(1);
  if (h.length <= 4) h = [...h].map((c) => c + c).join('');
  const n = (i) => parseInt(h.slice(i, i + 2), 16) / 255;
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) : 1 };
}
function toHsl({ r, g, b }) {
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    l = (max + min) / 2,
    d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}
function fromHsl({ h, s, l }, a) {
  const c = (1 - Math.abs(2 * l - 1)) * s,
    x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
    m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  const hx = (v) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0');
  return '#' + hx(r + m) + hx(g + m) + hx(b + m) + (a < 1 ? hx(a) : '');
}
// Dark counterpart for one colour, given the kind of property it paints.
function darken(hex, kind) {
  const c = parse(hex),
    hsl = toHsl(c);
  let { l, s } = hsl;
  if (kind === 'border') l = l > 0.6 ? 0.2 + (1 - l) * 0.5 : l < 0.35 ? 1 - l * 0.7 : l;
  else if (kind === 'text') l = l < 0.45 ? 0.92 - l * 0.4 : l;
  else if (l > 0.75) {
    // Light surfaces become the dark palette: white cards sit just above the page, and
    // tinted panels keep a hint of their colour. Near-greys take the app's green-grey hue.
    const warm = s > 0.45 && (hsl.h < 60 || hsl.h > 300);
    if (l >= 0.97) l = 0.11;
    else if (l >= 0.93) l = 0.075;
    else l = 0.13;
    s = warm ? 0.3 : Math.min(s, 0.18);
    if (!warm) hsl.h = 168;
  } else if (l < 0.3) l = Math.max(l, 0.2); // dark panels with white text stay dark
  return fromHsl({ h: hsl.h, s, l }, c.a);
}
function keep(hex, prop) {
  const c = parse(hex),
    { l } = toHsl(c);
  if (/^(color|fill|stroke|-webkit-text-fill-color|caret-color)$/.test(prop) && l > 0.7)
    return true;
  if (c.a < 0.5) return true; // faint glass on photos, or a shadow
  if (l < 0.12 && /shadow|filter/.test(prop)) return true;
  if (c.r + c.g + c.b < 0.05) return true; // black overlays
  if (/^(--photo-filter|--shadow)$/.test(prop)) return true;
  return false;
}
function kindOf(prop) {
  if (/border|outline|column-rule/.test(prop)) return 'border';
  if (/^(color|fill|stroke|-webkit-text-fill-color|caret-color|text-decoration-color)$/.test(prop))
    return 'text';
  return 'surface';
}

const tokens = new Map();
// Only touch declarations outside :root token blocks; tokens get their own dark values below.
css = css.replace(
  /([{;]\s*)(--?[a-zA-Z-]+|[a-z-]+)(\s*:\s*)([^;{}]+)/g,
  (all, pre, prop, sep, value) => {
    if (prop.startsWith('--')) return all;
    const out = value.replace(
      /var\(--k-[0-9a-f]+-[a-z]\)|#[0-9a-fA-F]{3,8}\b|\bwhite\b/g,
      (hex) => {
        if (hex.startsWith('var(')) return hex;
        if (hex === 'white') hex = '#fff';
        if (![3, 4, 6, 8].includes(hex.length - 1) || keep(hex, prop)) return hex;
        const kind = kindOf(prop),
          name = `--k-${hex.slice(1).toLowerCase()}-${kind[0]}`;
        tokens.set(name, { hex: hex.toLowerCase(), dark: darken(hex, kind) });
        return `var(${name})`;
      },
    );
    return pre + prop + sep + out;
  },
);
// Tokens that were already rewritten on an earlier run.
for (const m of css.matchAll(/var\((--k-([0-9a-f]+)-([bst]))\)/g)) {
  if (tokens.has(m[1])) continue;
  const hex = '#' + m[2],
    kind = { b: 'border', s: 'surface', t: 'text' }[m[3]];
  tokens.set(m[1], { hex, dark: darken(hex, kind) });
}
const sorted = [...tokens].sort(([a], [b]) => a.localeCompare(b));
const light = sorted.map(([k, v]) => `  ${k}: ${v.hex};`).join('\n'),
  dark = sorted.map(([k, v]) => `  ${k}: ${v.dark};`).join('\n');
const base = await readFile(themePath, 'utf8').catch(() => '');
const head = base.split('/* generated:tokens */')[0];
await writeFile(
  themePath,
  `${head}/* generated:tokens */\n:root {\n${light}\n}\n:root[data-theme='dark'] {\n${dark}\n}\n@media (prefers-color-scheme: dark) {\n  :root:not([data-theme='light']) {\n${dark.replaceAll('\n', '\n  ').replace(/^/, '  ')}\n  }\n}\n`,
);
await writeFile(cssPath, css);
console.log(`${tokens.size} colour tokens written to src/theme.css`);
