# Nacre — l'IA, la clé OpenRouter et le déploiement

État au 12 novembre 2026. Ce fichier décrit ce qui a été changé, ce qui a été
testé pour de vrai, et ce qu'il reste à faire avant que la création de recettes
par IA fonctionne sur le site public.

## 1. La clé OpenRouter : testée, et où elle va

Clé fournie par le propriétaire du projet, testée en direct sur l'API
OpenRouter (`GET /api/v1/key` puis des appels de génération réels) :

- compte en offre gratuite, clé valide, `usage: 0`
- **limite réelle : 50 requêtes/jour sur les modèles `:free`** (`free_model_daily_requests: used 0, limit 50`)

Modèles `:free` testés avec le vrai schéma de recette de Nacre
(`lib/recipe.ts`) et le vrai prompt de l'atelier :

| Modèle | Résultat | Durée |
|---|---|---|
| `nvidia/nemotron-3.5-super-vl:free` | **3/3 recettes valides** | ~20–36 s |
| `dots-studio/dots-3-note-preview:free` | 1/3 valide (les autres : `finish_reason: length`) | ~22–42 s |
| `google/gemma-4-31b-it:free` | 429 upstream (saturé) | — |
| `thinkingmachines/inkling-2-small:free` | 403 hors région | — |
| `baidu/ernie-5.5-flash-preview:free` | JSON tronqué (`length`) | — |
| `liquid/lfm-3-1.7b:free` | JSON tronqué (`length`) | — |

Deux constats importants, qui ont dicté le code :

1. Ces modèles **réfléchissent avant de répondre** : avec `max_tokens: 3000`
   la réponse est coupée en plein JSON. Il faut ~8000 tokens pour obtenir une
   recette complète.
2. Ils sont **lents** (20–40 s). Les anciens délais (45 s) étaient trop courts
   et l'ancien prompt n'imposait aucune concision.

La clé ne doit **jamais** être dans le dépôt : il est public, et GitHub Pages
sert des fichiers statiques que n'importe qui peut lire (la clé serait visible
dans le navigateur de chaque visiteur, et récupérable par des robots en
quelques heures). Elle va donc dans les secrets du Worker.

## 2. Ce qui a été corrigé dans le code

Le problème de fond : `lib/local-backend.ts` (la version GitHub Pages)
prétendait avoir une IA. `action === 'generate'` renvoyait une **recette
factice codée en dur** (« Ingrédient principal selon votre choix ») marquée
`ai:local`, et `/api/nacre` répondait `providers: { google: true, groq: true }`
en permanence, donc l'interface affichait « Assistant disponible » même sans
aucune clé.

- `lib/ai-config.ts` (nouveau) : lit `public/ai-config.json` au chargement.
  Contient seulement l'adresse du Worker et les modèles — **aucune clé**.
- `lib/ai-client.ts` (nouveau) : appelle le Worker, valide la recette avec
  `recipeSchema`, traduit les échecs en messages français (`not_configured`,
  `quota`, `timeout`, `rate_limited`, `incomplete`, `provider`, `network`).
- `lib/local-backend.ts` :
  - le faux générateur est supprimé ; `generate` passe par le Worker ;
  - quota réel de 20 créations/jour par compte, en `localStorage`, incrémenté
    seulement après une génération réussie ;
  - `providers` décrit l'état réel (`openrouter`, `endpoint`, `model`) ;
  - les erreurs du Worker ne fuitent plus de texte brut dans la page.
- `app/api/nacre/route.ts` (le Worker, qui détient les clés) :
  - provider `openrouter` ajouté en premier, avec la liste de modèles de
    `OPENROUTER_MODELS` essayés à la suite ;
  - `max_tokens: 8000`, délai 60 s, contrôle de `finish_reason: length` et
    validation du schéma avant d'accepter une recette ;
  - raisons d'échec explicites (`quota`, `rate_limited`, `incomplete`, `timeout`) ;
  - CORS limité aux origines de `AI_ALLOWED_ORIGINS`, pour que le site statique
    puisse appeler ce Worker sans ouvrir la génération à tout Internet.
- `components/Nacre.tsx` : le sélecteur ne propose plus « Google Gemini /
  Groq » (non configurés) mais l'assistant réellement branché ; le bouton
  « Imaginer ma recette » est désactivé et explique pourquoi quand aucun
  atelier n'est connecté ; la fenêtre « À propos » dit la vérité sur l'état.
- `public/ai-config.json` (nouveau) : `aiEndpoint` vide = mode sans IA.
- `.dev.vars.example` : variables OpenRouter + `AI_ALLOWED_ORIGINS` documentées.

## 3. Ce qu'il reste à faire (côté propriétaire du projet)

Tant que `public/ai-config.json` a `aiEndpoint: ""`, le site publié n'a **pas**
d'IA : il le dit clairement au lieu de faire semblant. Pour l'activer :

1. Déployer le Worker avec la clé en secret (jamais dans un fichier versionné) :

   ```sh
   npx wrangler secret put OPENROUTER_API_KEY
   npx wrangler deploy
   ```

2. Renseigner son adresse et les origines autorisées :

   ```json
   // public/ai-config.json
   { "aiEndpoint": "https://nacre-cuisine.<compte>.workers.dev/api/nacre", "model": "nvidia/nemotron-3.5-super-vl:free", "models": ["nvidia/nemotron-3.5-super-vl:free", "dots-studio/dots-3-note-preview:free"] }
   ```

   et côté Worker : `AI_ALLOWED_ORIGINS=https://nath-projects.github.io`.

3. La clé ayant circulé dans une conversation, la révoquer et en créer une
   nouvelle sur <https://openrouter.ai/keys> est recommandé.

À 50 générations/jour pour la clé entière, c'est un plafond **global**, pas par
utilisateur : c'est suffisant pour un atelier personnel ou familial, pas pour
un site ouvert au public.

## 4. Vérifications faites

- `tsc --noEmit` : à relancer après installation propre des dépendances.
- Suite de tests existante : 24 vérifications passaient avant les changements ;
  les nouveaux tests IA (Worker simulé, quota, absence de configuration) sont
  dans `scripts/test-ai.mjs`.
