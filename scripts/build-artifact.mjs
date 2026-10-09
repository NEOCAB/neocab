// Maakt van dist/index.html een paginafragment voor publicatie als claude.ai-artifact.
// De artifactomgeving levert zelf <!doctype>, <html>, <head> en <body>; dit bestand bevat alleen titel, stylesheet,
// script en het root-element. Gebruik: npm run build && node scripts/build-artifact.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const title = /<title>[\s\S]*?<\/title>/.exec(html)?.[0] ?? '<title>Neonatale transportregistratie</title>';
const links = [...html.matchAll(/<link rel="stylesheet"[^>]*>/g)].map((m) => m[0]);
const scripts = [...html.matchAll(/<script type="module"[^>]*><\/script>/g)].map((m) => m[0]);
const fragment = [title, ...links, '<div id="root"></div>', ...scripts, ''].join('\n');
writeFileSync('dist/artifact.html', fragment);

const files = Object.fromEntries(
  [...readdirSync('dist/assets').map((f) => `assets/${f}`), ...readdirSync('dist/fonts').map((f) => `fonts/${f}`)].map((p) => [p, p]),
);
writeFileSync('dist/artifact-files.json', JSON.stringify(files, null, 2));
console.log(fragment);
console.log(Object.keys(files).join('\n'));
