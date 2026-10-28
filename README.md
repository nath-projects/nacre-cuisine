# Nacre — Déploiement 100% Gratuit sur GitHub Pages

Ce projet est une version **autonome et 100% gratuite** de **Nacre — L’atelier des recettes**, conçue spécialement pour être hébergée directement sur **GitHub Pages**, sans aucun abonnement payant ni dépendance externe.

---

## 🌟 Ce qui a changé

- **Aucune offre payante nécessaire** : ChatGPT prévoyait une offre payante Cloudflare Workers Paid pour le hachage des mots de passe. Cette contrainte a été entièrement supprimée.
- **Hébergement GitHub Pages direct** : Le site se compile sous forme de site statique haute performance (HTML, CSS, JS, Three.js) prêt à être servi par GitHub Pages.
- **Système de comptes & serveur autonome** : Le système pour les connexions et inscriptions s'exécute désormais directement et de manière sécurisée via la **Web Crypto API standard** et le stockage local du navigateur.
- **Toutes les fonctionnalités et l'interface sont conservées à l'identique** :
  - Création de compte avec identifiant, pseudo public, couleur et clé de secours
  - Connexion sécurisée avec vérification de mot de passe
  - Récupération de compte par clé secrète à usage unique
  - Carnets de recettes personnels et notes privées
  - Espace famille partagé avec carnet commun et invitations
  - Grand livre culinaire avec scène 3D
  - Liste de courses et minuteurs

---

## 🚀 1. Déployer sur GitHub Pages

### Étape 1 : Créer votre dépôt sur GitHub
1. Créez un nouveau dépôt sur [GitHub](https://github.com/new) (public ou privé).
2. Poussez tous les fichiers du dossier `nacre` dans la branche `main`.

### Étape 2 : Activer GitHub Pages
1. Dans votre dépôt GitHub, allez dans **Settings** (Paramètres) → **Pages**.
2. Dans la section **Build and deployment** :
   - Sous **Source**, sélectionnez **GitHub Actions**.

### Étape 3 : Lancement automatique
- Dès que vous poussez sur `main`, le workflow automatique `.github/workflows/deploy.yml` :
  1. Vérifie les types (`tsc --noEmit`)
  2. Lance la suite de tests (`pnpm test`)
  3. Compile le site dans `dist/` (`pnpm run build`)
  4. Déploie automatiquement sur votre adresse GitHub Pages (`https://<votre-pseudo>.github.io/<votre-depot>/`) !

**Coût total : 0 € (100% gratuit à vie).**

---

## 💻 2. Développement et test local

Sur votre ordinateur équipé de Node.js (v22 ou v24 conseillé) :

```sh
# Activer pnpm
corepack enable
corepack prepare pnpm@11.25.0 --activate

# Installer les dépendances
pnpm install

# Lancer le serveur local de test
pnpm run dev
```

Ouvrez ensuite `http://localhost:5173` dans votre navigateur.

---

## 🧪 3. Vérification et tests

Pour exécuter la vérification du code et la suite de tests automatisés :

```sh
pnpm run check
pnpm test
```

Tous les tests de comptes, mots de passe, sessions, recettes, carnets et géométrie 3D du livre sont validés.

---

## 🔒 4. Sauvegarde de vos données

Depuis la fenêtre de votre profil utilisateur, vous pouvez à tout moment exporter l'intégralité de vos recettes, carnets et membres de famille au format JSON (`window.nacreExportData()`) pour les sauvegarder ou les transférer sur un autre appareil.
