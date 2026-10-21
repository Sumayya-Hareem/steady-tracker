// Zero-dependency "lint": parses every JS module so a typo can't ship.
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const roots = ['src', 'tests', 'scripts', 'sw.js'];
const files = [];
const walk = (p) => {
  if (statSync(p).isDirectory()) readdirSync(p).forEach((f) => walk(join(p, f)));
  else if (/\.(m?js)$/.test(p)) files.push(p);
};
roots.forEach(walk);

let bad = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (err) {
    bad += 1;
    console.error(`✗ ${f}\n${err.stderr}`);
  }
}
// Heuristic guard: no inline handlers or innerHTML sneaking back in.
for (const f of files.filter((x) => x.startsWith('src'))) {
  const text = readFileSync(f, 'utf8');
  if (/\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML/.test(text)) {
    bad += 1;
    console.error(`✗ ${f}: uses innerHTML-style DOM writes (use the h() helper)`);
  }
}
console.log(bad ? `${bad} problem(s)` : `OK: ${files.length} files parse cleanly`);
process.exit(bad ? 1 : 0);
