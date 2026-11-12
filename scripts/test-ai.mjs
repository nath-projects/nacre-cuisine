import assert from 'node:assert/strict';
import { handleLocalApiRequest } from '../lib/local-backend.ts';
import { aiFailure } from '../lib/ai-client.ts';

// A stand-in for the AI Worker (app/api/nacre/route.ts): no network, no key.
let workerCalls = 0;
let workerMode = 'ok';
const validRecipe = {
  title: 'Poêlée de courgettes à la feta',
  description: 'Un dîner d’été rapide et frais.',
  category: 'Plat',
  servings: 2,
  prep: 10,
  cook: 15,
  rest: 0,
  difficulty: 'Facile',
  ingredients: [
    { name: 'Courgettes', quantity: 2, unit: 'pièces' },
    { name: 'Feta', quantity: 100, unit: 'g' },
  ],
  equipment: ['Poêle'],
  steps: [{ title: 'Saisir', text: 'Faites dorer les courgettes à feu vif.', minutes: 8 }],
  tips: 'Servez tiède.',
  tags: ['Été'],
};

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString();
  if (url.endsWith('ai-config.json')) {
    return new Response(JSON.stringify({ aiEndpoint: 'https://worker.test/api/nacre', model: 'test/model:free', models: ['test/model:free'] }), { status: 200 });
  }
  if (url.startsWith('https://worker.test/')) {
    workerCalls++;
    if (workerMode === 'error') {
      return new Response(JSON.stringify({ error: 'L’assistant IA est momentanément indisponible. Aucun brouillon n’a été publié.', reason: 'provider' }), { status: 502 });
    }
    return new Response(JSON.stringify({ recipe: validRecipe, provider: 'openrouter', model: 'test/model:free' }), { status: 200 });
  }
  return realFetch(input, init);
};

const call = async (pathname, body = null, method = body ? "POST" : "GET") => {
  const req = new Request('http://localhost' + pathname, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const res = await handleLocalApiRequest(req);
  return { status: res.status, data: await res.json() };
};

let checks = 0;
function check(condition, label) {
  assert.ok(condition, label);
  console.log('PASS', label);
  checks++;
}

console.log('Testing AI generation wiring...');

// 0. ai-client maps worker failures to French, non-leaky messages
for (const reason of ['not_configured', 'quota', 'timeout', 'rate_limited', 'incomplete', 'provider', 'network']) {
  const failure = aiFailure(reason);
  check(failure.reason === reason && failure.message.length > 20, `aiFailure(${reason}) has a user-facing message`);
}

// 1. Without a session, generation is refused before any AI call
let r = await call('/api/nacre', { action: 'generate', prompt: 'Une tarte aux pommes de saison' });
check(r.status === 401 && workerCalls === 0, 'Generate without account is rejected (401) and calls no AI');

// 2. Register, set a profile
r = await call('/api/account', { action: 'register', username: 'chef-ia', name: 'Chef IA', password: 'my-super-secret-pass-phrase-123!' });
check(r.status === 201, 'Account created for AI tests');

r = await call('/api/nacre', { action: 'profile', name: 'Chef IA', color: '#65745f' });
check(r.status === 200, 'Profile saved');

// 3. Providers reflect the ai-config endpoint
r = await call('/api/nacre');
check(r.data.providers?.openrouter === true && r.data.providers?.endpoint === 'https://worker.test/api/nacre', 'providers reports the configured AI endpoint');
check(r.data.providers?.model === 'test/model:free', 'providers reports the configured model');

// 4. A too-short prompt never reaches the AI
r = await call('/api/nacre', { action: 'generate', prompt: 'tarte' });
check(r.status === 400 && workerCalls === 0, 'Short prompt rejected before any AI call');

// 5. Successful generation publishes a real recipe tagged ai:openrouter
r = await call('/api/nacre', { action: 'generate', prompt: 'Un dîner rapide aux courgettes et à la feta' });
check(r.status === 200 && !!r.data.id && workerCalls === 1, 'Generation calls the AI worker once and returns an id');
check(r.data.provider === 'openrouter', 'Generation reports the provider used');

r = await call('/api/nacre');
const generated = r.data.recipes.find((x) => x.id === r.data.recipes[0]?.id && x.source === 'ai:openrouter');
check(!!generated, 'Generated recipe is published with source ai:openrouter');
check(generated?.title === validRecipe.title && generated?.author === 'Chef IA', 'Generated recipe keeps AI content and the author profile');

// 6. An AI failure publishes nothing and explains why
workerMode = 'error';
const before = (await call('/api/nacre')).data.recipes.length;
r = await call('/api/nacre', { action: 'generate', prompt: 'Une autre idée de dîner végétarien' });
check(r.status === 502 && r.data.reason === 'provider', 'AI failure returns 502 with a reason');
check(!/https?:|Error:|fetch/i.test(r.data.error), 'AI failure message leaks no technical detail');
const after = (await call('/api/nacre')).data.recipes.length;
check(before === after, 'Failed generation publishes no recipe');
workerMode = 'ok';

// 7. The daily quota stops generation (20/day) and is only counted on success
for (let i = 0; i < 19; i++) {
  r = await call('/api/nacre', { action: 'generate', prompt: 'Une recette de saison numéro ' + i });
  assert.equal(r.status, 200, 'generation ' + i + ' should succeed');
}
const callsAtQuota = workerCalls;
r = await call('/api/nacre', { action: 'generate', prompt: 'Une recette de trop pour aujourd’hui' });
check(r.status === 429 && r.data.reason === 'quota', 'The 21st generation of the day is refused (429 quota)');
check(workerCalls === callsAtQuota, 'Refused generation does not call the AI');

globalThis.fetch = realFetch;
console.log(`\nAll ${checks} AI checks passed successfully!`);
