// Vérifie la classification des erreurs du client IA (sans réseau) :
// un délai dépassé doit être 'timeout', pas 'network'.
import { generateRecipeWithAi } from '../lib/ai-client.ts';

let failures = 0;
function check(name, ok, info = '') {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (info ? ' → ' + info : ''));
  if (!ok) failures++;
}

// 1. Endpoint qui ne répond jamais : délai court → timeout
const hanging = await generateRecipeWithAi(
  'https://10.255.255.1/api/nacre',
  'Une recette de test assez longue pour passer la validation.',
  300,
).then(() => null, e => e);
check('endpoint muet → timeout', hanging?.reason === 'timeout', hanging?.reason);

// 2. Endpoint qui n'existe pas (DNS) → network
const dead = await generateRecipeWithAi(
  'https://ce-domaine-nexiste-vraiment-pas-nacre.invalid/api/nacre',
  'Une recette de test assez longue pour passer la validation.',
  5000,
).then(() => null, e => e);
check('hôte inexistant → network', dead?.reason === 'network', dead?.reason);

// 3. Endpoint vide → not_configured
const empty = await generateRecipeWithAi('', 'Une recette de test assez longue.').then(() => null, e => e);
check('endpoint vide → not_configured', empty?.reason === 'not_configured', empty?.reason);

// 4. Les messages restent en français et distincts
check('messages distincts', hanging?.message !== dead?.message, (hanging?.message || '') + ' / ' + (dead?.message || ''));

console.log(failures === 0 ? '\nAll error-classification checks passed!' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
