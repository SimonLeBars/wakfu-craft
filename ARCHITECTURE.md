# WakfuCraft — Architecture

Application desktop Angular + Electron pour analyser la rentabilité du craft dans Wakfu.

---

## Table des matières

1. [Structure globale](#structure-globale)
2. [Routes (lazy-loaded)](#routes-lazy-loaded)
3. [Services Angular](#services-angular-srcappcoreservices)
   - [ItemService](#itemservice)
   - [PriceService](#priceservice)
   - [SessionService](#sessionservice)
   - [SyncService](#syncservice)
   - [ProfessionProfileService](#professionprofileservice)
   - [ProfitabilityService](#profitabilityservice)
   - [XpOptimizerService](#xpoptimizerservice)
   - [OcrStateService](#ocrstateservice)
4. [Flux de données (IPC)](#flux-de-données-ipc)
5. [Côté Electron](#côté-electron-electron)
   - [Processus principal](#processus-principal-maints)
   - [Preload](#preload-preloadts)
   - [DatabaseService](#databaseservice-databasedbservicets)
   - [Migrations](#migrations-databasemigrations)
   - [OCR](#ocr-ocrocr-handlerts)
6. [API externe — Wakfu CDN](#api-externe--wakfu-cdn)
7. [Gestion d'état](#gestion-détat)
8. [Styles](#styles-srcstyles)
9. [Outillage](#outillage)

---

## Structure globale

```
wakfu-craft/
├── src/                        # Application Angular (renderer)
│   ├── main.ts                 # Bootstrap Angular
│   ├── styles.scss             # Styles globaux (importe src/styles/)
│   ├── electron.d.ts           # Typages de l'API Electron exposée
│   └── app/
│       ├── app.ts / app.html   # Composant racine
│       ├── app.routes.ts       # Routes lazy-loaded
│       ├── app.config.ts       # Providers (router, locale fr)
│       ├── core/services/      # Services Angular
│       ├── features/           # Composants par fonctionnalité
│       └── shared/             # Pipes et composants réutilisables
├── electron/                   # Processus principal Electron
│   ├── main.ts                 # Fenêtre, IPC handlers (~25 canaux)
│   ├── preload.ts              # Context bridge → window.electronAPI
│   ├── database/
│   │   ├── db.service.ts       # Requêtes SQLite, import des données
│   │   ├── migrations.ts       # Chargeur de migrations
│   │   └── migrations/         # v1.sql … v7.sql
│   └── ocr/
│       ├── ocr.handler.ts      # Capture écran + Tesseract OCR
│       ├── grid-preload.ts     # Overlay de configuration de la grille
│       └── selector-preload.ts
├── public/                     # Assets statiques
├── dist/                       # Build Angular
├── dist-electron/              # Build Electron
└── electron-dist/              # Installeur NSIS final
```

---

## Routes (lazy-loaded)

| Route | Composant | Rôle |
|---|---|---|
| `/sync` | `SyncComponent` | Synchronisation des données Wakfu CDN |
| `/items` | `ItemsComponent` | Recherche d'items et consultation des recettes |
| `/session` | `SessionComponent` | Gestion des sessions de craft |
| `/ocr` | `OcrCaptureComponent` | Capture OCR des prix en jeu |
| `/xp` | `XpOptimizerComponent` | Optimisation de l'XP de craft |
| `/profile` | `ProfessionProfileComponent` | Niveaux des professions |

---

## Services Angular (`src/app/core/services/`)

### ItemService
Recherche et sélection d'items et de recettes.
- Signaux : `searchResults`, `selectedItem`, `availableRecipes`, `selectedRecipe`, `isLoading`, `craftModeIngredients`, `subRecipes`, `itemTypes`
- Computed : `typeTree`, `typeList`, `subtreeIdsMap`
- Recherche fuzzy via IPC avec filtres type / niveau / rareté

### PriceService
Historique et saisie des prix.
- Signaux : `prices`, `priceDates`, `notForSale`, `priceHistoryVersion`
- Stocke le dernier prix connu et l'historique complet par item

### SessionService
Gestion des sessions de craft persistantes.
- Signaux : `sessions`, `activeSession`, `sessionItems`, `shoppingList`, `craftOrder`
- `addItemTree()` — ajout récursif des sous-crafts avec relation parent/enfant

### SyncService
Téléchargement des données Wakfu depuis le CDN.
- Signaux : `status`, `versionInfo`, `progressLog`, `error`
- Écoute les événements `sync:progress` en IPC

### ProfessionProfileService
Niveaux de professions de l'utilisateur.
- Signaux : `levels`, `categories`
- Persisté en base via la table `settings`

### ProfitabilityService
Calcul réactif de la rentabilité d'une recette.
- `computed(() => result)` — marge, coût de revient, prix de vente, pièces manquantes
- Récursif : tient compte du craft mode sur les ingrédients

### XpOptimizerService
Sélection des recettes pour optimiser la montée en niveau.
- Signaux : `selectedCatId`, `playerLevel`, `sortMode`, `recipes`, `prices`, `dialogRow`
- Computed : `craftCategories`, `scanGroups`, `rows`
- Dialogue d'ajout avec gestion des sous-crafts et recettes bloquées

### OcrStateService
État de la grille OCR capturée.
- Signaux : `tableRows`, `editRows`, `savedCount`, `status`

---

## Flux de données (IPC)

```
Angular Component
  └── Service.method()
        └── window.electronAPI.xyz()   ← context bridge
              └── IPC channel
                    └── main.ts handler
                          └── DatabaseService (SQLite)
                                └── Résultat → Promise → Signal Angular
```

**Exemple — Recherche d'item :**
```
ItemsComponent → ItemService.search(query)
  → IPC: items:search(query, lang, typeIds, minLevel, maxLevel, rarities)
    → DatabaseService.searchItems() → SQL LIKE + fuzzy_match()
  → ItemService.searchResults.set(results)
```

**Exemple — Ajout récursif en session :**
```
SessionService.addItemTree(itemId, qty, craftIds, recipe, subRecipes)
  → Pour chaque ingrédient craftable :
    → IPC: sessions:addItem(sessionId, itemId, qty, parentId, recipeId)
      → INSERT craft_session_items (parent_item_id)
```

---

## Côté Electron (`electron/`)

### Processus principal (`main.ts`)
- Crée une `BrowserWindow` 1400×900
- Dev : charge `http://localhost:4200` ; Prod : charge `dist/…/index.html`
- Context isolation activée, pas d'accès Node depuis le renderer

### Preload (`preload.ts`)
- Expose `window.electronAPI` via `contextBridge`
- Enveloppe typée de tous les canaux IPC

### DatabaseService (`database/db.service.ts`)
- **SQLite via `better-sqlite3`** (synchrone, mode WAL)
- **Fonction SQL custom** `fuzzy_match()` — distance de Levenshtein pour la recherche tolérante aux fautes
- Import des données Wakfu CDN par transactions (items, recettes, types, catégories)
- `getCraftOrder()` — tri topologique des dépendances de craft
- `getShoppingList()` — agrégation des ingrédients (exclut les items craftés)

### Migrations (`database/migrations/`)
7 fichiers SQL appliqués séquentiellement, version stockée dans `settings.schema_version`.

Tables principales :

| Table | Contenu |
|---|---|
| `items` | Nom (JSON multilingue), type, niveau, rareté |
| `recipes` | Niveau, XP ratio, catégorie, item résultant |
| `recipe_ingredients` | Quantité par ingrédient |
| `item_types` | Hiérarchie de types (parent_id) |
| `recipe_categories` | Catégories de profession |
| `price_history` | Prix par item + timestamp + flag "hors vente" |
| `craft_sessions` | Sessions utilisateur |
| `craft_session_items` | Items de session (parent_item_id pour les sous-crafts) |
| `settings` | Clé/valeur (version gamedata, niveaux professions) |

### OCR (`ocr/ocr.handler.ts`)
- Overlay HTML draggable/redimensionnable pour configurer la grille de capture
- Capture via Electron `desktopCapturer`
- Prétraitement cellule : ×2 upscale, niveaux de gris, binarisation, whitelist Tesseract
- Tesseract.js en mode `SINGLE_LINE` avec whitelist chiffres pour les colonnes numériques

---

## API externe — Wakfu CDN

Base : `https://wakfu.cdn.ankama.com/gamedata/`

| Fichier | Contenu |
|---|---|
| `config.json` | Version actuelle du gamedata |
| `items.json` | Tous les items |
| `jobsItems.json` | Items craftables uniquement |
| `recipes.json` | Définitions des recettes |
| `recipeIngredients.json` | Liens recette → ingrédients |
| `recipeResults.json` | Liens recette → item produit |
| `itemTypes.json` | Hiérarchie de types |
| `recipeCategories.json` | Catégories de professions |

Les fichiers sont mis en cache dans `userData/gamedata/{version}/` après le premier téléchargement.

---

## Gestion d'état

- **Pas de NgRx / Redux** — uniquement des Signals Angular
- Chaque service expose des signaux en lecture pour les composants
- Les calculs dérivés utilisent `computed()` pour une réactivité fine
- Pattern type :

```typescript
readonly selectedItem = signal<WakfuItem | null>(null);
readonly profitability = computed(() => {
  // calcul réactif basé sur selectedItem(), prices(), etc.
});
```

---

## Styles (`src/styles/`)

- `_variables.scss` — couleurs (thème sombre), espacements, rayons, transitions
- `_mixins.scss` — mixins réutilisables (`card`, `input-base`, `btn-primary`, `recipe-tab`, `level-warn`, `sidebar-layout`, `price-input-group`, …)
- `_price.scss` / `_scan.scss` — primitives partagées pour les vues prix et OCR
- Tous les composants utilisent `ChangeDetectionStrategy.OnPush`

---

## Outillage

| Commande | Action |
|---|---|
| `npm start` | Serveur dev Angular (:4200) |
| `npm run electron:dev` | Angular dev + Electron en parallèle |
| `npm run electron:build` | Build production + installeur NSIS |
| `npm run electron:rebuild` | Recompile `better-sqlite3` pour Electron |
| `npm test` | Tests Vitest |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run format` | Prettier |

**Stack technique :**

| Couche | Technologie | Version |
|---|---|---|
| UI | Angular | 21 |
| Desktop | Electron | 41 |
| Base de données | SQLite (better-sqlite3) | 12 |
| OCR | Tesseract.js | 7 |
| Graphiques | Chart.js | 4 |
| Build | @angular/build + electron-builder | — |
| Installeur | NSIS (Windows) | — |
