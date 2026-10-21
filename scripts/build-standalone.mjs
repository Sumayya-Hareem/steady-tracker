// Builds dist/steady-standalone.html: the whole app (CSS + all ES modules) in ONE
// file that works when double-clicked (file://), where browsers block <script type="module">.
// Zero dependencies. Each module is wrapped in its own function scope with a tiny
// require(), so identically named helpers in different files can't collide.
//
//   node scripts/build-standalone.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = 'src/main.js';
const modules = new Map(); // id (path relative to root) -> transformed source
const order = [];

function transform(src, id) {
  const deps = [];
  // import { a, b as c } from './x.js';   |   import './x.js';
  src = src.replace(/^import\s+(?:\{([^}]*)\}\s+from\s+)?['"](\.[^'"]+)['"];?[ \t]*$/gm, (_, names, spec) => {
    const dep = relative(root, resolve(root, dirname(id), spec)).split('\\').join('/');
    deps.push(dep);
    if (!names) return `__require(${JSON.stringify(dep)});`;
    const parts = names.split(',').map((n) => n.trim()).filter(Boolean).map((n) => n.replace(/\s+as\s+/, ': '));
    return `const { ${parts.join(', ')} } = __require(${JSON.stringify(dep)});`;
  });
  const exported = [];
  src = src.replace(/^export\s+(async\s+function|function|const|let|class)\s+([A-Za-z0-9_$]+)/gm, (_, kind, name) => {
    exported.push(name);
    return `${kind} ${name}`;
  });
  if (/^\s*export\s*\{/m.test(src) || /^\s*export\s+default/m.test(src)) throw new Error(`${id}: unsupported export form`);
  if (/^\s*import\s/m.test(src)) throw new Error(`${id}: unsupported import form`);
  const tail = exported.length ? `\n__exports.${exported.join(' = __exports.')} = undefined;\n` : '';
  // assign real values after declarations (functions are hoisted; consts are set at module end)
  const assign = exported.map((n) => `__exports.${n} = ${n};`).join('\n');
  return { code: `${src}\n${assign}\n`, deps, tail };
}

function visit(id) {
  if (modules.has(id)) return;
  modules.set(id, null); // cycle guard
  const { code, deps } = transform(readFileSync(join(root, id), 'utf8'), id);
  deps.forEach(visit);
  modules.set(id, code);
  order.push(id);
}
visit(ENTRY);

const defs = order.map((id) => `__define(${JSON.stringify(id)}, function (__require, __exports) {\n${modules.get(id)}\n});`).join('\n\n');
const runtime = `(function () {
'use strict';
var __defs = {}, __cache = {};
function __define(id, fn) { __defs[id] = fn; }
function __require(id) {
  if (__cache[id]) return __cache[id];
  var exp = (__cache[id] = {});
  __defs[id](__require, exp);
  return exp;
}
${defs}
__require(${JSON.stringify(ENTRY)});
})();`;

let html = readFileSync(join(root, 'index.html'), 'utf8');
const css = readFileSync(join(root, 'css/styles.css'), 'utf8');
html = html
  .replace(/<link rel="stylesheet" href="css\/styles.css">/, () => `<style>\n${css}\n</style>`)
  .replace(/<link rel="manifest"[^>]*>\n?/, '')
  .replace(/<div id="file-warning"[\s\S]*?<\/div>\n<script>if \(location.protocol === 'file:'\)[^\n]*<\/script>\n/, '') // only the modular build needs the warning
  .replace(/<script type="module" src="src\/main.js"><\/script>/, () => `<script>\n${runtime.replace(/<\/script>/gi, '<\\/script>')}\n</script>`);

// icons: inline as data URIs so the single file is self-contained
for (const name of ['icon-192.png']) {
  const b64 = readFileSync(join(root, 'icons', name)).toString('base64');
  html = html.split(`icons/${name}`).join(`data:image/png;base64,${b64}`);
}
// the JS refers to icons/icon-192.png too (brand + welcome logo)
const logo = `data:image/png;base64,${readFileSync(join(root, 'icons/icon-192.png')).toString('base64')}`;
html = html.split("'icons/icon-192.png'").join(`'${logo}'`);

mkdirSync(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist/steady-standalone.html');
writeFileSync(out, html);
console.log(`Wrote ${relative(root, out)} (${(html.length / 1024).toFixed(0)} KB, ${order.length} modules)`);
