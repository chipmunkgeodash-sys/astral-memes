// Makes the UGS library actually usable:
//   1. Unwraps Google Gadget XML (<Module>…<![CDATA[ html ]]>) into real HTML,
//      which is why roughly a third of the library rendered as nothing.
//   2. Strips adult, cam and scam links that were baked into some files by
//      whoever originally scraped them.
// Files that are still unsafe after stripping are deleted outright.

import { readdirSync, statSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.argv[2]);

const BLOCK = [
  'chaturbate', 'sexcams', 'jjgirls', 'pornhub', 'xvideos', 'xhamster',
  'onlyfans', 'camgirl', 'camsoda', 'stripchat', 'bongacams', 'escort',
  'jdrucker.com', 'masstortfinancing', 'adult-empire', 'sex.com'
];
const BLOCK_RE = new RegExp(BLOCK.map((b) => b.replace(/\./g, '[.]')).join('|'), 'i');

// The library wraps games three different ways: <Module> with a proper CDATA
// block, <Module> with an unterminated CDATA block, and <Module> followed by a
// bare document. Rather than special-case each, find where the real HTML starts
// and cut everything before it, then drop any XML tail.
// A file counts as a gadget if <Module> appears before any real markup —
// some have an XML declaration or a comment block ahead of it.
function isGadget(src) {
  const head = src.slice(0, 4000).replace(/<\?xml[^>]*\?>/gi, '').replace(/<!--[\s\S]*?(-->|--!>)/g, '');
  return /^\s*<Module\b/i.test(head);
}

function unwrapGadget(src) {
  if (!isGadget(src)) return src;

  const cdata = src.indexOf('<![CDATA[');
  let body = cdata === -1 ? src : src.slice(cdata + 9);

  const doc = body.search(/<!DOCTYPE\s+html|<html\b/i);
  if (doc > 0) body = body.slice(doc);

  // Trim the gadget's closing tags if the file bothered to include them.
  body = body.replace(/\s*\]\]>\s*(<\/Content>)?\s*(<\/Module>)?\s*$/i, '');
  body = body.trim();

  // Some entries are bare fragments with no document at all — they begin
  // mid-markup, sometimes with a stray closing tag. Strip the gadget preamble
  // and wrap what's left so a browser has something valid to parse.
  if (!/<html\b/i.test(body)) {
    body = body
      .replace(/^\s*<Module>/i, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/^\s*<\/(script|style|div|body|head)\s*>/i, '')
      .trim();
    body = `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n`
      + `<meta name="viewport" content="width=device-width, initial-scale=1">\n`
      + `</head>\n<body>\n${body}\n</body>\n</html>`;
  }

  return body;
}

function strip(html) {
  let out = html;
  // Whole anchors pointing at blocked hosts, link text and all.
  out = out.replace(/<a\b[^>]*href\s*=\s*["'][^"']*["'][^>]*>[\s\S]*?<\/a>/gi,
    (m) => (BLOCK_RE.test(m) ? '' : m));
  // Scripts, iframes and images sourced from blocked hosts.
  out = out.replace(/<(script|iframe|img)\b[^>]*>(?:[\s\S]*?<\/\1>)?/gi,
    (m, tag) => (BLOCK_RE.test(m) ? '' : m));
  // Bare link elements.
  out = out.replace(/<link\b[^>]*>/gi, (m) => (BLOCK_RE.test(m) ? '' : m));
  return out;
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.html?$/i.test(name)) out.push(p);
  }
  return out;
}

let unwrapped = 0;
let cleaned = 0;
let removed = 0;
const removedPaths = [];

// A handful of entries were never gadget-wrapped but still aren't documents —
// they start partway through the markup. Give them a shell so every file in the
// library is something a browser can load on its own.
function ensureDocument(html) {
  const head = html.slice(0, 4000)
    .replace(/<\?xml[^>]*\?>/gi, '')
    .replace(/<!--[\s\S]*?(-->|--!>)/g, '')
    .trim();
  if (/^(<!DOCTYPE|<html)/i.test(head)) return html;
  return `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n`
    + `<meta name="viewport" content="width=device-width, initial-scale=1">\n`
    + `</head>\n<body>\n${html.trim()}\n</body>\n</html>`;
}

let wrapped = 0;

for (const file of walk(ROOT)) {
  const original = readFileSync(file, 'utf8');
  let html = unwrapGadget(original);
  const wasGadget = html !== original;

  const before = html;
  html = ensureDocument(html);
  const wasWrapped = html !== before;
  if (wasWrapped) wrapped += 1;

  const hadBlocked = BLOCK_RE.test(html);
  if (hadBlocked) html = strip(html);

  // Still dirty after stripping? Not worth shipping.
  if (BLOCK_RE.test(html)) {
    unlinkSync(file);
    removed += 1;
    removedPaths.push(file.replace(ROOT, ''));
    continue;
  }

  if (wasGadget || hadBlocked || wasWrapped) {
    writeFileSync(file, html);
    if (wasGadget) unwrapped += 1;
    if (hadBlocked) cleaned += 1;
  }
}

console.log(`unwrapped from gadget XML: ${unwrapped}`);
console.log(`wrapped bare fragments:   ${wrapped}`);
console.log(`stripped unsafe links:     ${cleaned}`);
console.log(`deleted (still unsafe):    ${removed}`);
for (const p of removedPaths) console.log(`   removed ${p}`);
