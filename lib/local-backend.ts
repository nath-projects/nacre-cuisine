import { recipeSchema, type Recipe, type Book } from './recipe.ts';
import { seeds } from './seeds.ts';

// Local storage keys
const K_ACCOUNTS = 'nacre_local_accounts';
const K_PROFILES = 'nacre_local_profiles';
const K_SESSION = 'nacre_local_session';
const K_RECIPES = 'nacre_local_recipes';
const K_BOOKS = 'nacre_local_books';
const K_NOTES = 'nacre_local_notes';
const K_FAMILIES = 'nacre_local_families';
const K_FAMILY_MEMBERS = 'nacre_local_family_members';
const K_FAMILY_RECIPES = 'nacre_local_family_recipes';
const K_FAMILY_INVITES = 'nacre_local_family_invites';
const K_REPORTS = 'nacre_local_reports';

// Memory fallback when localStorage is unavailable (e.g. Node.js tests / SSR)
const memoryStore = new Map<string, string>();

function getItem(key: string): string | null {
  if (typeof localStorage !== 'undefined') {
    try {
      return localStorage.getItem(key);
    } catch {
      // Fallback to memory
    }
  }
  return memoryStore.get(key) || null;
}

function setItem(key: string, value: string): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, value);
      return;
    } catch {
      // Fallback to memory
    }
  }
  memoryStore.set(key, value);
}

function removeItem(key: string): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(key);
      return;
    } catch {
      // Fallback
    }
  }
  memoryStore.delete(key);
}

function getJSON<T>(key: string, fallback: T): T {
  const val = getItem(key);
  if (!val) return fallback;
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}

function setJSON(key: string, val: unknown): void {
  setItem(key, JSON.stringify(val));
}

// Cryptographic helpers using standard Web Crypto API (supported in all modern browsers & Node 20+)
function getCrypto(): Crypto {
  if (typeof window !== 'undefined' && window.crypto) return window.crypto;
  if (typeof globalThis !== 'undefined' && globalThis.crypto) return globalThis.crypto;
  throw new Error('Web Crypto API non disponible');
}

export async function hashPassword(password: string, saltHex?: string): Promise<string> {
  const c = getCrypto();
  const salt = saltHex || Array.from(c.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  const encoder = new TextEncoder();
  let buffer: ArrayBuffer = encoder.encode(`nacre-salt:${salt}:${password}`).buffer as ArrayBuffer;
  // Fast and robust client-side hashing rounds
  for (let i = 0; i < 5000; i++) {
    buffer = await c.subtle.digest('SHA-256', buffer);
  }
  const hex = Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `local-v1$${salt}$${hex}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'local-v1') return false;
  const salt = parts[1];
  const expectedHex = parts[2];
  const computed = await hashPassword(password, salt);
  return computed.split('$')[2] === expectedHex;
}

export function generateToken(byteCount = 32): string {
  const bytes = getCrypto().getRandomValues(new Uint8Array(byteCount));
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function normalizeUsername(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function checkUsername(value: unknown): string {
  const name = normalizeUsername(value);
  if (!/^[a-z0-9][a-z0-9_.-]{2,29}$/.test(name)) {
    throw Object.assign(new Error('Identifiant : 3 à 30 lettres minuscules, chiffres, points, tirets ou underscores.'), { status: 400 });
  }
  return name;
}

export function checkPassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) {
    throw Object.assign(new Error('Utilisez un mot de passe de 12 à 128 caractères.'), { status: 400 });
  }
  return value;
}

// Session state
export function getActiveSession(): { accountId: string; expires: number; authVersion: number } | null {
  const session = getJSON<{ accountId: string; expires: number; authVersion: number } | null>(K_SESSION, null);
  if (!session) return null;
  if (session.expires < Date.now()) {
    removeItem(K_SESSION);
    return null;
  }
  return session;
}

export function getCurrentAccount(): { id: string; username: string } | null {
  const session = getActiveSession();
  if (!session) return null;
  const accounts = getJSON<Array<{ id: string; username: string; authVersion: number }>>(K_ACCOUNTS, []);
  const found = accounts.find(a => a.id === session.accountId);
  if (!found || found.authVersion !== session.authVersion) {
    removeItem(K_SESSION);
    return null;
  }
  return { id: found.id, username: found.username };
}

function requireCurrentAccount(): { id: string; username: string } {
  const acc = getCurrentAccount();
  if (!acc) throw Object.assign(new Error('Connectez-vous à votre compte Nacre.'), { status: 401 });
  return acc;
}

// Route handlers
export async function handleLocalApiRequest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const urlStr = typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString();
  const url = new URL(urlStr, 'http://localhost');
  const pathname = url.pathname;
  const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();

  let body: any = {};
  if (method === 'POST') {
    if (init?.body) {
      if (typeof init.body === 'string') {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = {};
        }
      }
    } else if (input instanceof Request) {
      try {
        const text = await input.clone().text();
        body = JSON.parse(text);
      } catch {
        body = {};
      }
    }
  }

  const jsonRes = (data: unknown, status = 200) => {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    });
  };

  const errorRes = (e: any) => {
    const status = e.status || 500;
    return jsonRes({ error: e.message || 'Une erreur est survenue.' }, status);
  };

  try {
    // -------------------------------------------------------------------------
    // 1. ACCOUNT API: /api/account
    // -------------------------------------------------------------------------
    if (pathname.endsWith('/api/account')) {
      if (method === 'GET') {
        const acc = getCurrentAccount();
        return jsonRes({ account: acc });
      }

      if (method === 'POST') {
        const action = body.action;

        // LOGOUT
        if (action === 'logout') {
          removeItem(K_SESSION);
          return jsonRes({ ok: true });
        }

        // REGISTER
        if (action === 'register') {
          const username = checkUsername(body.username);
          const password = checkPassword(body.password);
          const name = typeof body.name === 'string' ? body.name.trim() : '';
          if (name.length < 2 || name.length > 30) {
            throw Object.assign(new Error('Le pseudo public doit comporter 2 à 30 caractères.'), { status: 400 });
          }
          const color = typeof body.color === 'string' && /^#[a-f0-9]{6}$/i.test(body.color) ? body.color : '#65745f';

          const accounts = getJSON<Array<any>>(K_ACCOUNTS, []);
          if (accounts.some(a => a.username === username)) {
            throw Object.assign(new Error('Cet identifiant est indisponible.'), { status: 409 });
          }

          const id = getCrypto().randomUUID();
          const passwordHash = await hashPassword(password);
          const recoveryCode = generateToken(32);
          const recoveryHash = await hashPassword(recoveryCode);

          const newAccount = {
            id,
            username,
            passwordHash,
            recoveryHash,
            authVersion: 1,
            created: Date.now()
          };
          accounts.push(newAccount);
          setJSON(K_ACCOUNTS, accounts);

          // Save profile
          const profiles = getJSON<Record<string, any>>(K_PROFILES, {});
          profiles[id] = { id, name, color };
          setJSON(K_PROFILES, profiles);

          // Start session
          setJSON(K_SESSION, {
            accountId: id,
            authVersion: 1,
            expires: Date.now() + 14 * 86400000
          });

          return jsonRes({ ok: true, recoveryCode }, 201);
        }

        // LOGIN
        if (action === 'login') {
          const username = normalizeUsername(body.username);
          if (typeof body.password !== 'string' || body.password.length > 128) {
            throw Object.assign(new Error('Identifiant ou mot de passe incorrect.'), { status: 401 });
          }

          const accounts = getJSON<Array<any>>(K_ACCOUNTS, []);
          const acc = accounts.find(a => a.username === username);
          if (!acc) {
            // Fake verification to prevent timing attack enumeration
            await verifyPassword('dummy-password', 'local-v1$0123456789abcdef$00');
            throw Object.assign(new Error('Identifiant ou mot de passe incorrect.'), { status: 401 });
          }

          const valid = await verifyPassword(body.password, acc.passwordHash);
          if (!valid) {
            throw Object.assign(new Error('Identifiant ou mot de passe incorrect.'), { status: 401 });
          }

          // Start session
          setJSON(K_SESSION, {
            accountId: acc.id,
            authVersion: acc.authVersion || 1,
            expires: Date.now() + 14 * 86400000
          });

          return jsonRes({ ok: true });
        }

        // RECOVER
        if (action === 'recover') {
          const username = normalizeUsername(body.username);
          const password = checkPassword(body.password);
          const code = typeof body.recoveryCode === 'string' ? body.recoveryCode.trim() : '';

          const accounts = getJSON<Array<any>>(K_ACCOUNTS, []);
          const acc = accounts.find(a => a.username === username);
          if (!acc) {
            throw Object.assign(new Error('Identifiant ou code de récupération incorrect.'), { status: 401 });
          }

          const validCode = await verifyPassword(code, acc.recoveryHash);
          if (!validCode) {
            throw Object.assign(new Error('Identifiant ou code de récupération incorrect.'), { status: 401 });
          }

          const newRecovery = generateToken(32);
          acc.passwordHash = await hashPassword(password);
          acc.recoveryHash = await hashPassword(newRecovery);
          acc.authVersion = (acc.authVersion || 1) + 1;
          setJSON(K_ACCOUNTS, accounts);

          // Clear sessions on password reset
          removeItem(K_SESSION);

          return jsonRes({ ok: true, recoveryCode: newRecovery });
        }

        // PASSWORD CHANGE
        if (action === 'password') {
          const user = requireCurrentAccount();
          const password = checkPassword(body.password);
          if (typeof body.currentPassword !== 'string' || body.currentPassword.length > 128) {
            throw Object.assign(new Error('Mot de passe actuel incorrect.'), { status: 401 });
          }

          const accounts = getJSON<Array<any>>(K_ACCOUNTS, []);
          const acc = accounts.find(a => a.id === user.id);
          if (!acc || !await verifyPassword(body.currentPassword, acc.passwordHash)) {
            throw Object.assign(new Error('Mot de passe actuel incorrect.'), { status: 401 });
          }

          acc.passwordHash = await hashPassword(password);
          acc.authVersion = (acc.authVersion || 1) + 1;
          setJSON(K_ACCOUNTS, accounts);

          // Refresh session
          setJSON(K_SESSION, {
            accountId: acc.id,
            authVersion: acc.authVersion,
            expires: Date.now() + 14 * 86400000
          });

          return jsonRes({ ok: true });
        }

        throw Object.assign(new Error('Action inconnue.'), { status: 400 });
      }
    }

    // -------------------------------------------------------------------------
    // 2. NACRE API: /api/nacre (recipes, books, notes, profile)
    // -------------------------------------------------------------------------
    if (pathname.endsWith('/api/nacre')) {
      const user = getCurrentAccount();

      if (method === 'GET') {
        const storedRecipes = getJSON<Recipe[]>(K_RECIPES, []);
        const allRecipes = [...storedRecipes, ...seeds];

        let myBooks: any[] = [];
        let myNotes: any[] = [];
        let userProfile: any = null;

        if (user) {
          const profiles = getJSON<Record<string, any>>(K_PROFILES, {});
          userProfile = profiles[user.id] || { id: user.id, name: user.username, color: '#65745f' };

          const books = getJSON<Book[]>(K_BOOKS, []);
          myBooks = books.filter((b: any) => b.owner === user.id);

          const notes = getJSON<Array<{ owner: string; recipeId: string; text: string; cooked: number }>>(K_NOTES, []);
          myNotes = notes.filter(n => n.owner === user.id);
        }

        return jsonRes({
          recipes: allRecipes,
          books: myBooks,
          notes: myNotes,
          user: user ? {
            id: user.id,
            username: user.username,
            name: userProfile?.name || user.username,
            color: userProfile?.color || '#65745f'
          } : null,
          providers: { google: true, groq: true }
        });
      }

      if (method === 'POST') {
        if (!user) {
          throw Object.assign(new Error('Connectez-vous pour enregistrer vos recettes.'), { status: 401 });
        }
        const action = body.action;

        // PROFILE UPDATE
        if (action === 'profile') {
          const name = typeof body.name === 'string' ? body.name.trim().slice(0, 30) : '';
          if (name.length < 2) throw Object.assign(new Error('Choisissez un pseudo de 2 à 30 caractères.'), { status: 400 });
          const color = typeof body.color === 'string' && /^#[a-f0-9]{6}$/i.test(body.color) ? body.color : '#65745f';

          const profiles = getJSON<Record<string, any>>(K_PROFILES, {});
          profiles[user.id] = { id: user.id, name, color };
          setJSON(K_PROFILES, profiles);
          return jsonRes({ ok: true });
        }

        // CREATE BOOK
        if (action === 'book') {
          const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : '';
          if (!name) throw Object.assign(new Error('Donnez un nom au carnet.'), { status: 400 });
          const color = typeof body.color === 'string' && /^#[a-f0-9]{6}$/i.test(body.color) ? body.color : '#65745f';
          const id = getCrypto().randomUUID();

          const books = getJSON<any[]>(K_BOOKS, []);
          books.push({
            id,
            owner: user.id,
            name,
            color,
            recipeIds: [],
            created: Date.now()
          });
          setJSON(K_BOOKS, books);
          return jsonRes({ id });
        }

        // ADD / REMOVE ENTRY IN BOOK
        if (action === 'entry') {
          const bookId = String(body.bookId || '');
          const recipeId = String(body.recipeId || '');
          const remove = !!body.remove;

          const books = getJSON<any[]>(K_BOOKS, []);
          const book = books.find(b => b.id === bookId && b.owner === user.id);
          if (!book) throw Object.assign(new Error('Carnet introuvable.'), { status: 404 });

          const exists = seeds.some(r => r.id === recipeId) || getJSON<any[]>(K_RECIPES, []).some(r => r.id === recipeId);
          if (!exists) throw Object.assign(new Error('Recette introuvable.'), { status: 404 });

          if (!Array.isArray(book.recipeIds)) book.recipeIds = [];
          if (remove) {
            book.recipeIds = book.recipeIds.filter((id: string) => id !== recipeId);
          } else {
            if (!book.recipeIds.includes(recipeId)) book.recipeIds.push(recipeId);
          }
          setJSON(K_BOOKS, books);
          return jsonRes({ ok: true });
        }

        // DELETE BOOK
        if (action === 'deleteBook') {
          const bookId = String(body.bookId || '');
          let books = getJSON<any[]>(K_BOOKS, []);
          const book = books.find(b => b.id === bookId && b.owner === user.id);
          if (!book) throw Object.assign(new Error('Carnet introuvable.'), { status: 404 });

          books = books.filter(b => b.id !== bookId);
          setJSON(K_BOOKS, books);
          return jsonRes({ ok: true });
        }

        // SAVE NOTE
        if (action === 'note') {
          const recipeId = String(body.recipeId || '');
          const text = typeof body.text === 'string' ? body.text.slice(0, 3000) : '';
          const cooked = body.cooked ? 1 : 0;

          const notes = getJSON<any[]>(K_NOTES, []);
          const existing = notes.find(n => n.owner === user.id && n.recipeId === recipeId);
          if (existing) {
            existing.text = text;
            existing.cooked = cooked;
          } else {
            notes.push({ owner: user.id, recipeId, text, cooked });
          }
          setJSON(K_NOTES, notes);
          return jsonRes({ ok: true });
        }

        // REPORT RECIPE
        if (action === 'report') {
          const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
          if (reason.length < 5) throw Object.assign(new Error('Précisez le motif du signalement.'), { status: 400 });

          const reports = getJSON<any[]>(K_REPORTS, []);
          reports.push({
            id: getCrypto().randomUUID(),
            owner: user.id,
            recipeId: String(body.recipeId || ''),
            reason,
            created: Date.now()
          });
          setJSON(K_REPORTS, reports);
          return jsonRes({ ok: true });
        }

        // DELETE RECIPE
        if (action === 'deleteRecipe') {
          const id = String(body.recipeId || '');
          let recipes = getJSON<any[]>(K_RECIPES, []);
          const found = recipes.find(r => r.id === id && r.owner === user.id);
          if (!found) throw Object.assign(new Error('Recette introuvable.'), { status: 404 });

          recipes = recipes.filter(r => r.id !== id);
          setJSON(K_RECIPES, recipes);

          // Clean up in books
          const books = getJSON<any[]>(K_BOOKS, []);
          books.forEach(b => {
            if (Array.isArray(b.recipeIds)) b.recipeIds = b.recipeIds.filter((rid: string) => rid !== id);
          });
          setJSON(K_BOOKS, books);

          // Clean up in notes
          let notes = getJSON<any[]>(K_NOTES, []);
          notes = notes.filter(n => n.recipeId !== id);
          setJSON(K_NOTES, notes);

          // Clean up in family recipes
          let famRecipes = getJSON<any[]>(K_FAMILY_RECIPES, []);
          famRecipes = famRecipes.filter(fr => fr.recipeId !== id);
          setJSON(K_FAMILY_RECIPES, famRecipes);

          return jsonRes({ ok: true });
        }

        // PUBLISH / UPDATE / GENERATE RECIPE
        if (action === 'publish' || action === 'update' || action === 'generate') {
          const profiles = getJSON<Record<string, any>>(K_PROFILES, {});
          const profile = profiles[user.id] || { name: user.username, color: '#65745f' };

          let data: any = body.recipe;
          let source = 'personal';
          let existing: any = null;

          if (action === 'update') {
            const recipes = getJSON<any[]>(K_RECIPES, []);
            existing = recipes.find(r => r.id === String(body.recipeId || '') && r.owner === user.id);
            if (!existing) throw Object.assign(new Error('Recette introuvable.'), { status: 404 });
            source = existing.source || 'personal';
          }

          if (action === 'generate') {
            const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
            if (prompt.length < 5) throw Object.assign(new Error('Décrivez un peu plus votre envie.'), { status: 400 });

            // Creative recipe generator fallback
            source = 'ai:local';
            data = {
              title: prompt.slice(0, 50).replace(/[.?!\n].*$/, '') || 'Nouvelle création culinaire',
              description: `Une recette inspirée de votre envie : ${prompt.slice(0, 150)}.`,
              category: 'Plat',
              servings: 2,
              prep: 15,
              cook: 20,
              rest: 0,
              difficulty: 'Facile',
              ingredients: [
                { name: 'Ingrédient principal selon votre choix', quantity: 200, unit: 'g' },
                { name: 'Huile d’olive', quantity: 2, unit: 'c. à soupe' },
                { name: 'Sel et poivre', quantity: 0, unit: 'au goût' }
              ],
              equipment: ['Poêle', 'Couteau de chef'],
              steps: [
                { title: 'Mise en place', text: 'Préparez tous vos ingrédients et découpez-les soigneusement.', minutes: 5 },
                { title: 'Cuisson', text: 'Chauffez la poêle à feu moyen et faites dorer doucement les ingrédients.', minutes: 15 },
                { title: 'Finition', text: 'Ajustez l’assaisonnement, dressez sur une belle assiette et dégustez chaud.', minutes: 0 }
              ],
              tips: 'N’hésitez pas à ajuster les herbes fraîches et épices selon vos préférences.',
              tags: ['Création']
            };
          }

          const parsed = recipeSchema.safeParse(data);
          if (!parsed.success) {
            throw Object.assign(new Error('La recette est incomplète. Vérifiez les ingrédients, les étapes et les quantités.'), { status: 400 });
          }

          const id = existing?.id || getCrypto().randomUUID();
          const recipes = getJSON<any[]>(K_RECIPES, []);
          const record: Recipe = {
            ...parsed.data,
            id,
            owner: user.id,
            author: profile.name || user.username,
            color: profile.color || '#65745f',
            created: existing?.created || Date.now(),
            source,
            parentId: existing?.parentId || (body.parentId ? String(body.parentId) : undefined)
          };

          if (existing) {
            const idx = recipes.findIndex(r => r.id === id);
            if (idx >= 0) recipes[idx] = record;
          } else {
            recipes.unshift(record);
          }
          setJSON(K_RECIPES, recipes);
          return jsonRes({ id });
        }

        throw Object.assign(new Error('Action inconnue.'), { status: 400 });
      }
    }

    // -------------------------------------------------------------------------
    // 3. FAMILY API: /api/family
    // -------------------------------------------------------------------------
    if (pathname.endsWith('/api/family')) {
      const user = requireCurrentAccount();
      const families = getJSON<any[]>(K_FAMILIES, []);
      const members = getJSON<any[]>(K_FAMILY_MEMBERS, []);
      const familyRecipes = getJSON<any[]>(K_FAMILY_RECIPES, []);
      const invites = getJSON<any[]>(K_FAMILY_INVITES, []);
      const profiles = getJSON<Record<string, any>>(K_PROFILES, {});
      const accounts = getJSON<any[]>(K_ACCOUNTS, []);

      // Find user's active family
      const membership = members.find(m => m.userId === user.id);
      const userFamily = membership ? families.find(f => f.id === membership.familyId) : null;

      if (method === 'GET') {
        const pending = invites
          .filter(i => i.targetId === user.id && !i.usedBy && i.expires > Date.now())
          .map(i => {
            const fam = families.find(f => f.id === i.familyId);
            const ownerProf = profiles[fam?.owner || ''];
            return {
              id: i.id,
              expires: i.expires,
              familyName: fam?.name || 'Famille',
              invitedBy: ownerProf?.name || 'Un proche'
            };
          });

        if (!userFamily) {
          return jsonRes({ family: null, pending });
        }

        const familyMembers = members
          .filter(m => m.familyId === userFamily.id)
          .map(m => {
            const acc = accounts.find(a => a.id === m.userId);
            const prof = profiles[m.userId];
            return {
              id: m.userId,
              username: acc?.username || '',
              name: prof?.name || acc?.username || 'Membre',
              color: prof?.color || '#65745f',
              joined: m.joined
            };
          });

        const recipeIds = familyRecipes
          .filter(fr => fr.familyId === userFamily.id)
          .map(fr => fr.recipeId);

        const familyInvites = userFamily.owner === user.id ? invites
          .filter(i => i.familyId === userFamily.id && !i.usedBy && i.expires > Date.now())
          .map(i => {
            const targetAcc = accounts.find(a => a.id === i.targetId);
            return {
              id: i.id,
              expires: i.expires,
              target: targetAcc?.username || null
            };
          }) : [];

        return jsonRes({
          family: {
            ...userFamily,
            members: familyMembers,
            recipeIds,
            invites: familyInvites,
            isOwner: userFamily.owner === user.id
          },
          pending
        });
      }

      if (method === 'POST') {
        const action = body.action;

        // CREATE FAMILY
        if (action === 'create') {
          if (userFamily) throw Object.assign(new Error('Vous faites déjà partie d’une famille.'), { status: 409 });
          const name = typeof body.name === 'string' ? body.name.trim() : '';
          if (name.length < 2 || name.length > 60) throw Object.assign(new Error('Le nom doit comporter 2 à 60 caractères.'), { status: 400 });

          const id = getCrypto().randomUUID();
          families.push({
            id,
            name,
            owner: user.id,
            created: Date.now()
          });
          members.push({
            userId: user.id,
            familyId: id,
            joined: Date.now()
          });
          setJSON(K_FAMILIES, families);
          setJSON(K_FAMILY_MEMBERS, members);
          return jsonRes({ id }, 201);
        }

        // JOIN / ACCEPT INVITATION
        if (action === 'join' || action === 'accept') {
          if (userFamily) throw Object.assign(new Error('Quittez votre famille actuelle avant d’en rejoindre une autre.'), { status: 409 });
          const code = typeof body.code === 'string' ? body.code.trim() : '';
          const inviteId = typeof body.inviteId === 'string' ? body.inviteId : '';

          const invite = invites.find(i => {
            if (i.usedBy || i.expires <= Date.now()) return false;
            if (action === 'join') return i.code === code;
            return i.id === inviteId && i.targetId === user.id;
          });

          if (!invite || (invite.targetId && invite.targetId !== user.id)) {
            throw Object.assign(new Error('Invitation invalide, expirée ou réservée à un autre compte.'), { status: 404 });
          }

          invite.usedBy = user.id;
          members.push({
            userId: user.id,
            familyId: invite.familyId,
            joined: Date.now()
          });
          setJSON(K_FAMILY_INVITES, invites);
          setJSON(K_FAMILY_MEMBERS, members);
          return jsonRes({ ok: true });
        }

        // DECLINE
        if (action === 'decline') {
          const inviteId = String(body.inviteId || '');
          const filtered = invites.filter(i => !(i.id === inviteId && i.targetId === user.id));
          setJSON(K_FAMILY_INVITES, filtered);
          return jsonRes({ ok: true });
        }

        if (!userFamily) throw Object.assign(new Error('Créez ou rejoignez une famille.'), { status: 404 });

        // LEAVE
        if (action === 'leave') {
          if (userFamily.owner === user.id) throw Object.assign(new Error('Transmettez le rôle de responsable avant de quitter la famille.'), { status: 400 });
          const filtered = members.filter(m => !(m.userId === user.id && m.familyId === userFamily.id));
          setJSON(K_FAMILY_MEMBERS, filtered);
          return jsonRes({ ok: true });
        }

        // ADD / REMOVE RECIPE IN FAMILY
        if (action === 'recipe') {
          const rid = String(body.recipeId || '');
          const exists = seeds.some(r => r.id === rid) || getJSON<any[]>(K_RECIPES, []).some(r => r.id === rid);
          if (!exists) throw Object.assign(new Error('Recette introuvable.'), { status: 404 });

          let famRecipes = getJSON<any[]>(K_FAMILY_RECIPES, []);
          if (body.remove) {
            famRecipes = famRecipes.filter(fr => !(fr.familyId === userFamily.id && fr.recipeId === rid));
          } else {
            if (!famRecipes.some(fr => fr.familyId === userFamily.id && fr.recipeId === rid)) {
              famRecipes.push({ familyId: userFamily.id, recipeId: rid, addedBy: user.id, created: Date.now() });
            }
          }
          setJSON(K_FAMILY_RECIPES, famRecipes);
          return jsonRes({ ok: true });
        }

        // OWNER RESTRICTED ACTIONS
        if (userFamily.owner !== user.id) {
          throw Object.assign(new Error('Cette action est réservée au responsable de la famille.'), { status: 403 });
        }

        // CREATE INVITATION
        if (action === 'invite') {
          let targetId: string | null = null;
          if (body.username) {
            const targetUsername = checkUsername(body.username);
            const targetAccount = accounts.find(a => a.username === targetUsername);
            if (!targetAccount) throw Object.assign(new Error('Compte introuvable. Votre proche peut créer son compte, ou vous pouvez lui donner un code.'), { status: 404 });
            if (members.some(m => m.userId === targetAccount.id)) throw Object.assign(new Error('Ce compte appartient déjà à une famille.'), { status: 409 });
            targetId = targetAccount.id;
          }

          const code = generateToken(16);
          const id = getCrypto().randomUUID();
          const expires = Date.now() + 72 * 3600000;

          invites.push({
            id,
            familyId: userFamily.id,
            code,
            targetId,
            created: Date.now(),
            expires
          });
          setJSON(K_FAMILY_INVITES, invites);
          return jsonRes({ id, code, expires }, 201);
        }

        // REVOKE INVITATION
        if (action === 'revoke') {
          const inviteId = String(body.inviteId || '');
          const filtered = invites.filter(i => !(i.id === inviteId && i.familyId === userFamily.id));
          setJSON(K_FAMILY_INVITES, filtered);
          return jsonRes({ ok: true });
        }

        // REMOVE MEMBER
        if (action === 'remove') {
          const uid = String(body.userId || '');
          if (uid === user.id) throw Object.assign(new Error('Choisissez un autre membre.'), { status: 400 });
          const filtered = members.filter(m => !(m.userId === uid && m.familyId === userFamily.id));
          setJSON(K_FAMILY_MEMBERS, filtered);
          return jsonRes({ ok: true });
        }

        // TRANSFER OWNERSHIP
        if (action === 'transfer') {
          const uid = String(body.userId || '');
          if (uid === user.id) throw Object.assign(new Error('Choisissez un autre membre.'), { status: 400 });
          if (!members.some(m => m.userId === uid && m.familyId === userFamily.id)) {
            throw Object.assign(new Error('Membre introuvable.'), { status: 404 });
          }
          userFamily.owner = uid;
          setJSON(K_FAMILIES, families);
          return jsonRes({ ok: true });
        }

        throw Object.assign(new Error('Action inconnue.'), { status: 400 });
      }
    }

    return jsonRes({ error: 'Route introuvable' }, 404);
  } catch (e: any) {
    return errorRes(e);
  }
}

// Global interceptor for browser environments (GitHub Pages)
if (typeof window !== 'undefined' && !(window as any).__nacreBackendInstalled) {
  (window as any).__nacreBackendInstalled = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const urlStr = typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString();
    if (urlStr.includes('/api/account') || urlStr.includes('/api/nacre') || urlStr.includes('/api/family')) {
      return handleLocalApiRequest(input, init);
    }
    return originalFetch(input, init);
  };

  // Handy helpers for user data export & import
  (window as any).nacreExportData = () => {
    const data = {
      accounts: getJSON(K_ACCOUNTS, []),
      profiles: getJSON(K_PROFILES, {}),
      recipes: getJSON(K_RECIPES, []),
      books: getJSON(K_BOOKS, []),
      notes: getJSON(K_NOTES, []),
      families: getJSON(K_FAMILIES, []),
      familyMembers: getJSON(K_FAMILY_MEMBERS, []),
      familyRecipes: getJSON(K_FAMILY_RECIPES, [])
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nacre-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  (window as any).nacreImportData = (jsonString: string) => {
    try {
      const data = JSON.parse(jsonString);
      if (data.accounts) setJSON(K_ACCOUNTS, data.accounts);
      if (data.profiles) setJSON(K_PROFILES, data.profiles);
      if (data.recipes) setJSON(K_RECIPES, data.recipes);
      if (data.books) setJSON(K_BOOKS, data.books);
      if (data.notes) setJSON(K_NOTES, data.notes);
      if (data.families) setJSON(K_FAMILIES, data.families);
      if (data.familyMembers) setJSON(K_FAMILY_MEMBERS, data.familyMembers);
      if (data.familyRecipes) setJSON(K_FAMILY_RECIPES, data.familyRecipes);
      window.location.reload();
    } catch {
      alert('Fichier d’import invalide.');
    }
  };
}
