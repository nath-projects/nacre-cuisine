# Activer la création de recettes par IA sur Nacre — le tutoriel complet

Le site **https://nath-projects.github.io/nacre-cuisine/** est en ligne et fonctionne.
Tout marche déjà (comptes, carnets, notes, famille, liste de courses, 3D).
Une seule chose n'est pas encore branchée : la **création de recette par IA**,
parce qu'un site GitHub Pages ne peut pas garder une clé secrète.

Ce tutoriel branche l'IA en ~20 minutes, sans carte bancaire. Compte large :
0 €, et l'OpenRouter gratuit donne 50 recettes par jour.

Pourquoi c'est nécessaire : quand tu publies le site sur GitHub Pages, tout ce
qui s'y trouve est téléchargeable par n'importe qui. Si ta clé OpenRouter était
dans le site, n'importe qui la lirait dans son navigateur (F12), et des robots
la trouveraient en quelques heures. Elle serait utilisée à ta place puis
révoquée. La clé doit donc rester **sur un serveur** : c'est le rôle du petit
programme « Worker » ci-dessous. Il passe l'appel à OpenRouter à ta place ;
le site ne voit jamais la clé, seulement des recettes.

```
Visiteur → site GitHub Pages → Worker Cloudflare (clé secrète) → OpenRouter
```

---

## Étape 0 — Changer la clé OpenRouter (2 min, important)

La clé actuelle a été écrite dans une conversation : considère-la comme
publique. C'est gratuit :

1. Va sur <https://openrouter.ai/keys>
2. Supprime l'ancienne clé (icône corbeille)
3. « Create key », nom : `nacre`
4. Copie la nouvelle clé (`sk-or-v1-...`)

C'est cette clé que tu utiliseras à l'étape 3. Ne la colle nulle part sur
GitHub, ni dans un fichier du dépôt.

Vérifier que l'offre gratuite est bien active : <https://openrouter.ai/settings/credits>
doit afficher `Free tier` et des modèles gratuits. Sur cette offre, on est
limité à **50 requêtes/jour** (toutes personnes confondues) — largement assez
pour un usage perso ou familial, pas pour un site public.

---

## Étape 1 — Créer le compte Cloudflare (3 min)

1. Va sur <https://dash.cloudflare.com/sign-up>
2. Inscris-toi avec ton adresse e-mail, valide le lien reçu.
3. Aucun domaine ni carte bancaire nécessaires : l'offre gratuite suffit
   (100 000 requêtes/jour, largement plus que nécessaire).

---

## Étape 2 — Créer le projet sur ton ordinateur (5 min)

Ouvre un terminal **dans le dossier du projet**. Le plus simple :

1. Télécharge ton dépôt : <https://github.com/nath-projects/nacre-cuisine/archive/refs/heads/main.zip>
2. Décompresse-le, par exemple dans `C:\Users\Zetoon\Documents\nacre-cuisine`
3. Ouvre le dossier dans l'Explorateur, clique dans la barre d'adresse, tape
   `powershell` et valide : un terminal s'ouvre déjà dans le bon dossier.

Puis, dans ce terminal :

```powershell
# 1. installer les dépendances (une seule fois)
npm install

# 2. créer la base de données du Worker (gratuit)
npx wrangler d1 create nacre-db
```

La commande `wrangler d1 create` affiche un bloc avec une ligne :

```
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Copie cet identifiant** et remplace-le dans `wrangler.jsonc`, ligne 17 :

```jsonc
"database_id": "00000000-0000-4000-8000-000000000000",   // ← avant
"database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",   // ← après (le tien)
```

Puis crée les tables de cette base :

```powershell
npx wrangler d1 migrations apply nacre-db --remote
```

Réponds `y` aux demandes de confirmation (créer les tables).

---

## Étape 3 — Donner la clé au Worker (2 min)

```powershell
npx wrangler secret put OPENROUTER_API_KEY
```

Wrangler demande la valeur : colle ta clé de l'étape 0, puis Entrée.
Rien ne s'affiche pendant le collage, c'est normal.

Ensuite les origines autorisées à appeler le Worker (ton site). Édite
`wrangler.jsonc` pour ajouter une section `vars` juste avant
`"d1_databases"` :

```jsonc
  "vars": {
    "AI_ALLOWED_ORIGINS": "https://nath-projects.github.io"
  },
```

*(Sans ça, le worker refusera l'appel du site avec « Origine non autorisée ».)*

---

## Étape 4 — Publier le Worker (3 min)

```powershell
npx wrangler deploy
```

À la fin, Wrangler affiche l'adresse du Worker, par exemple :

```
https://nacre-cuisine.ton-compte.workers.dev
```

**Test immédiat** : ouvre simplement cette adresse dans ton navigateur
(`https://nacre-cuisine.ton-compte.workers.dev`). Tu dois voir du JSON avec
`"recipes"`, `"providers":{"openrouter":true,...}`. Si tu vois
`"openrouter":true`, la clé est bien en place. ✅

*(Si tu vois une erreur D1, reviens à l'étape 2 : identifiant de base ou
migrations.)*

---

## Étape 5 — Brancher le site sur le Worker (3 min)

Dans le dossier du projet, édite **`public/ai-config.json`** et mets l'adresse
de ton Worker suivie de `/api/nacre` :

```json
{
  "aiEndpoint": "https://nacre-cuisine.ton-compte.workers.dev/api/nacre",
  "model": "nvidia/nemotron-3.5-super-vl:free",
  "models": [
    "nvidia/nemotron-3.5-super-vl:free",
    "dots-studio/dots-3-note-preview:free"
  ]
}
```

Renvoie tout sur GitHub :

```powershell
git add public/ai-config.json wrangler.jsonc
git commit -m "Activer l'IA : adresse du Worker"
git push
```

Attends ~2 minutes que GitHub Actions termine (onglet **Actions** du dépôt,
les deux workflows doivent être verts), puis ouvre
<https://nath-projects.github.io/nacre-cuisine/>.

---

## Étape 6 — Vérifier que ça marche (2 min)

1. En bas du site, l'onglet **« À propos et connexion IA »** doit afficher
   `OpenRouter : connecté · modèle nvidia/nemotron-3.5-super-vl…`.
2. Clique **« Créer une recette »**.
3. En bas à droite : `Assistant disponible`, et le bouton
   **« Imaginer ma recette »** est actif.
4. Écris par exemple : « J'ai des courgettes, de la feta et envie d'un dîner
   qui sent l'été », règle 2 personnes / 30 min, puis clique.

**Patiente 20 à 40 secondes** : c'est normal, ces modèles gratuits
« réfléchissent » avant de répondre. La recette s'ouvre ensuite comme une
vraie page du grand livre, signée à ton pseudo, avec la mention « créée avec
l'IA ». Les 20 créations du jour par compte sont comptées côté site.

---

## Si ça ne marche pas — le message affiché et sa solution

| Message sur le site | Cause | Solution |
|---|---|---|
| « Création IA non configurée » | `aiEndpoint` vide ou pas encore redéployé | Étape 5, puis attends le déploiement GitHub Actions |
| « Impossible de joindre l'assistant IA » | adresse du Worker fausse, ou Worker non publié | Ouvre l'adresse du Worker dans le navigateur : elle doit répondre du JSON |
| « L'assistant IA est momentanément indisponible » | le Worker a répondu une erreur : clé refusée ou base absente | `npx wrangler tail` dans le terminal montre l'erreur réelle |
| « L'assistant est très sollicité » | limite OpenRouter atteinte (50/jour ou 20/min) | attends une minute, ou demain |
| « Vos 20 créations du jour sont utilisées » | quota du site | revient demain, ou augmente `AI_DAILY_LIMIT` dans `lib/local-backend.ts` |
| « La recette reçue était incomplète » | le modèle a été coupé | réessaie ; le Worker bascule déjà sur le 2ᵉ modèle |
| Le site dit « Origine non autorisée » | `AI_ALLOWED_ORIGINS` absent | Étape 3, puis `npx wrangler deploy` |

Commande utile pour voir ce qui se passe côté serveur en direct :

```powershell
npx wrangler tail
```

---

## Les limites à connaître

- **50 créations/jour pour toute la clé** (offre gratuite OpenRouter). Ce n'est
  pas 50 par personne : c'est le plafond global du site.
- **20 créations/jour par compte** sur le site (garde-fou intégré).
- **20 à 40 secondes par recette**, parfois une erreur : les modèles gratuits
  sont lents et parfois saturés. Le Worker essaie automatiquement le 2ᵉ modèle.
- Sans carte bancaire, tu ne peux pas lever ces limites. Si un jour tu veux un
  site ouvert à beaucoup de monde, il faudra soit plusieurs clés OpenRouter,
  soit un petit crédit payant chez OpenRouter.
- **Sauvegarde ta clé** : `npx wrangler secret put OPENROUTER_API_KEY` remplace
  la précédente. Pour la supprimer : `npx wrangler secret delete OPENROUTER_API_KEY`.

---

## Ce qui est déjà fait, et où le retrouver

- `lib/ai-config.ts` — lit `public/ai-config.json` (adresse + modèles, jamais de clé)
- `lib/ai-client.ts` — appelle le Worker, valide la recette, traduit les erreurs
- `app/api/nacre/route.ts` — le Worker : OpenRouter, bascule de modèles,
  contrôle de longueur, CORS vers ton site
- `lib/local-backend.ts` — plus de faux générateur, quota réel, état IA honnête
- `components/Nacre.tsx` — l'interface dit la vérité sur l'IA
- `scripts/test-ai.mjs` — 22 vérifications automatiques (`npm test`)
- `AI-NOTES.md` — résultats des tests réels sur les modèles gratuits

Tout est déjà poussé sur `main` : il ne te reste que les étapes 0 à 5 ci-dessus.
