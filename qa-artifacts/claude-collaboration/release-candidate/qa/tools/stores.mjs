// Broader static scan: resolve identifier first-args of store functions to their const string values (same file).
import { readdirSync, readFileSync } from 'node:fs';
const root = process.argv[2], dir = root + '/netlify/functions/';
const files = [...readdirSync(dir).filter(f => f.endsWith('.mjs')).map(f => dir + f), ...readdirSync(dir + 'lib').filter(f => f.endsWith('.mjs')).map(f => dir + 'lib/' + f)];
const reg = (await import(dir + 'lib/data-erasure.mjs')).ERASURE_REGISTRY;
const found = new Map();
for (const file of files) {
  const t = readFileSync(file, 'utf8'); const consts = {};
  for (const m of t.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*['"]([a-z][a-z0-9_]+)['"]/g)) consts[m[1]] = m[2];
  for (const m of t.matchAll(/(?<![.\w])(?:atomicUpdate|strictRead|put|get|del|remove|list|listJSON|boundedRecordKeys|rowsOf|getStore|casUpdate|readJSON|writeJSON)\(\s*(?:['"]([a-z][a-z0-9_]+)['"]|([A-Za-z_][A-Za-z0-9_]*))\s*,/g)) {
    const name = m[1] || consts[m[2]]; if (!name) continue;
    if (!found.has(name)) found.set(name, new Set()); found.get(name).add(file.replace(dir, ''));
  }
}
const missing = [...found].filter(([n]) => !Object.hasOwn(reg, n));
console.log(JSON.stringify({ storesFound: found.size, unregistered: missing.map(([n, f]) => ({ store: n, files: [...f] })) }, null, 1));
