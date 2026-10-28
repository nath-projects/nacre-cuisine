import assert from 'node:assert/strict';
import { handleLocalApiRequest } from '../lib/local-backend.ts';

async function call(pathname, body = null, method = body ? 'POST' : 'GET') {
  const req = new Request('http://localhost' + pathname, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const res = await handleLocalApiRequest(req);
  const data = await res.json();
  return { status: res.status, data };
}

let checks = 0;
function check(condition, label) {
  assert.ok(condition, label);
  console.log('PASS', label);
  checks++;
}

console.log('Testing Local Backend for GitHub Pages...');

// 1. Account registration tests
let r = await call('/api/account', { action: 'register', username: 'alice', name: 'Alice Chef', password: 'short' });
check(r.status === 400, 'Weak password (<12 chars) rejected');

r = await call('/api/account', { action: 'register', username: 'alice', name: 'Alice Chef', password: 'my-super-secret-pass-phrase-123!' });
check(r.status === 201 && !!r.data.recoveryCode, 'Alice registered successfully with recovery code');
const aliceRecovery = r.data.recoveryCode;

r = await call('/api/account', { action: 'register', username: 'ALICE', name: 'Other', password: 'another-password-123!' });
check(r.status === 409, 'Duplicate username case-insensitively rejected');

// 2. Account check
r = await call('/api/account');
check(r.status === 200 && r.data.account?.username === 'alice', 'Active session returns Alice account');

// 3. Logout
r = await call('/api/account', { action: 'logout' });
check(r.status === 200, 'Logout succeeds');

r = await call('/api/account');
check(r.status === 200 && r.data.account === null, 'After logout, account is null');

// 4. Login
r = await call('/api/account', { action: 'login', username: 'alice', password: 'wrong-password-123' });
check(r.status === 401, 'Wrong password rejected');

r = await call('/api/account', { action: 'login', username: 'ALICE', password: 'my-super-secret-pass-phrase-123!' });
check(r.status === 200, 'Case-insensitive login succeeds');

// 5. Password recovery
r = await call('/api/account', { action: 'recover', username: 'alice', recoveryCode: 'wrong-code', password: 'new-password-phrase-456!' });
check(r.status === 401, 'Invalid recovery code rejected');

r = await call('/api/account', { action: 'recover', username: 'alice', recoveryCode: aliceRecovery, password: 'new-password-phrase-456!' });
check(r.status === 200 && !!r.data.recoveryCode, 'Account recovered with new password and new recovery code');

r = await call('/api/account', { action: 'login', username: 'alice', password: 'new-password-phrase-456!' });
check(r.status === 200, 'Login with new recovered password succeeds');

// 6. Recipe API tests
r = await call('/api/nacre');
check(r.status === 200 && r.data.recipes.length >= 3, 'Default seeds recipes available in catalogue');

const recipePayload = {
  title: 'Tarte tatin aux pommes dorées',
  description: 'Une tarte renversée caramélisée comme dans nos souvenirs d’enfance.',
  category: 'Dessert',
  servings: 6,
  prep: 25,
  cook: 35,
  rest: 10,
  difficulty: 'Intermédiaire',
  ingredients: [
    { name: 'Pommes Golden', quantity: 1200, unit: 'g' },
    { name: 'Pâte feuilletée', quantity: 1, unit: 'rouleau' },
    { name: 'Sucre', quantity: 150, unit: 'g' },
    { name: 'Beurre', quantity: 60, unit: 'g' }
  ],
  equipment: ['Moule à manqué', 'Poêle'],
  steps: [
    { title: 'Éplucher les pommes', text: 'Pelez et coupez les pommes en gros quartiers réguliers.', minutes: 15 },
    { title: 'Caraméliser', text: 'Faites un caramel ambré avec le sucre et le beurre dans le moule.', minutes: 10 },
    { title: 'Cuire', text: 'Disposez les pommes, recouvrez de pâte et enfournez à 180°C pendant 35 minutes.', minutes: 35 }
  ],
  tips: 'Laissez tiédir 10 minutes avant de démouler.',
  tags: ['Automne', 'Dessert']
};

r = await call('/api/nacre', { action: 'publish', recipe: recipePayload });
check(r.status === 200 && !!r.data.id, 'Recipe published successfully');
const recipeId = r.data.id;

r = await call('/api/nacre');
check(r.data.recipes.some(rc => rc.id === recipeId && rc.author === 'Alice Chef'), 'Published recipe found in catalogue with author profile');

// 7. Books / Carnets
r = await call('/api/nacre', { action: 'book', name: 'Mes desserts favoris', color: '#65745f' });
check(r.status === 200 && !!r.data.id, 'Personal notebook created');
const bookId = r.data.id;

r = await call('/api/nacre', { action: 'entry', bookId, recipeId });
check(r.status === 200, 'Recipe added to personal notebook');

r = await call('/api/nacre');
check(r.data.books.some(b => b.id === bookId && b.recipeIds.includes(recipeId)), 'Notebook contains saved recipe');

// 8. Notes
r = await call('/api/nacre', { action: 'note', recipeId, text: 'Ajouter une pointe de cannelle.', cooked: true });
check(r.status === 200, 'Personal note saved');

r = await call('/api/nacre');
check(r.data.notes.some(n => n.recipeId === recipeId && n.text.includes('cannelle') && n.cooked === 1), 'Personal note retrieved');

// 9. Family
r = await call('/api/family', { action: 'create', name: 'Famille Gourmet' });
check(r.status === 201 && !!r.data.id, 'Family created');

r = await call('/api/family');
check(r.status === 200 && r.data.family?.name === 'Famille Gourmet' && r.data.family?.isOwner === true, 'Family retrieved');

r = await call('/api/family', { action: 'recipe', recipeId });
check(r.status === 200, 'Recipe added to shared family cookbook');

r = await call('/api/family');
check(r.data.family.recipeIds.includes(recipeId), 'Shared family cookbook has recipe');

r = await call('/api/family', { action: 'invite' });
check(r.status === 201 && !!r.data.code, 'Family invite code generated');

console.log(`\nAll ${checks} local backend checks passed successfully!`);
