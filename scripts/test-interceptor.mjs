// The browser interceptor must forward absolute URLs (our AI Worker) and keep
// handling only this site's own relative /api calls. Regression test for the
// 12/11/2026 bug: the Worker URL ends in /api/nacre, so it was swallowed and the
// generation request never left the page.
import { readFileSync } from 'node:fs';

let failures = 0;
function check(name, ok, info = '') {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (info ? ' → ' + info : ''));
  if (!ok) failures++;
}

const source = readFileSync(new URL('../lib/local-backend.ts', import.meta.url), 'utf8');

// Pull the predicate out of the interceptor and run it on sample URLs.
const isAbsoluteSrc = /const isAbsolute = (.+);/.exec(source)?.[1];
check('predicate found in source', !!isAbsoluteSrc, isAbsoluteSrc);
const isAbsolute = new Function('urlStr', `return ${isAbsoluteSrc};`);

const isLocalApiSrc = /const isLocalApi = ([^;]+);/.exec(source)?.[1]?.replace(/\s+/g, ' ');
const isLocalApi = new Function('urlStr', 'isAbsolute', `return ${isLocalApiSrc};`);

const cases = [
  ['https://nacre-cuisine.nath-projects.workers.dev/api/nacre', false, 'AI Worker call must go to the network'],
  ['https://example.com/api/nacre', false, 'any absolute URL is not ours'],
  ['//cdn.example.com/api/account', false, 'protocol-relative URL is not ours'],
  ['/api/nacre', true, 'relative bootstrap call stays local'],
  ['/api/account', true, 'relative account call stays local'],
  ['./api/nacre', true, 'dot-relative call stays local'],
  ['/api/unknown', false, 'unknown route is untouched'],
];

for (const [url, expectedLocal, why] of cases) {
  const local = isLocalApi(url, isAbsolute(url));
  check(`${url} → ${expectedLocal ? 'local' : 'network'}`, local === expectedLocal, why);
}

console.log(failures === 0 ? '\nAll interceptor checks passed!' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
