# WakfuCraft — Unofficial Crafting Assistant

> **Outil communautaire non officiel, non affilié à Ankama.**
> "Wakfu" est une marque déposée d'Ankama Games. Ce projet est indépendant et n'est ni sponsorisé, ni approuvé par Ankama.

---

## Objectif

WakfuCraft est une application de bureau conçue pour aider les joueurs de [Wakfu](https://www.wakfu.com) à analyser la rentabilité de leur craft.

Elle permet de :

- **Rechercher des items** et consulter leurs recettes de craft
- **Suivre les prix de l'HDV** via saisie manuelle *(la capture OCR de l'écran est en cours de développement — Work In Progress)*
- **Créer des sessions de craft** pour planifier plusieurs crafts en parallèle
- **Générer une liste de courses** agrégée avec le coût total estimé en kamas
- **Visualiser l'historique des prix** d'un ingrédient sous forme de graphique

Les données de jeu (items, recettes, catégories) sont téléchargées directement depuis le CDN public d'Ankama et stockées localement dans une base SQLite.

---

## Stack technique

| Couche | Technologie |
|--------|-------------|
| UI | Angular 21 (standalone, signals, OnPush) |
| Desktop | Electron 41 |
| Base de données | SQLite via better-sqlite3 |
| OCR | Tesseract.js |
| Graphiques | Chart.js |
| Données | CDN public Ankama (`wakfu.cdn.ankama.com`) |

---

## Installation (utilisateur final)

Téléchargez le fichier `.exe` depuis la [page Releases](../../releases) et lancez l'installeur.

Aucun prérequis — Node.js et les dépendances sont bundlés dans l'installeur.

> Au premier lancement de la fonctionnalité OCR, l'application télécharge les données de reconnaissance (~10 Mo) depuis internet. Les utilisations suivantes fonctionnent hors-ligne.

---

## Développement

### Prérequis

- Node.js 20+
- npm 11+

### Installation

```bash
npm install
npm run electron:rebuild   # compile better-sqlite3 pour Electron
```

### Lancer en mode développement

```bash
npm run electron:dev
```

### Build de production (génère l'installeur Windows)

```bash
npm run electron:build
```

L'installeur est généré dans `electron-dist/`.

> `electron:rebuild` est nécessaire avant chaque build de production pour s'assurer que `better-sqlite3` est compilé pour la bonne version d'Electron.

### Linting / formatage

```bash
npm run lint          # ESLint
npm run lint:fix      # ESLint avec auto-fix
npm run format        # Prettier
npm run format:check  # Vérification Prettier sans écriture
```

---

## Mentions légales

Ce projet est un outil communautaire gratuit et open source, publié sous licence MIT.

- Il ne redistribue aucun asset graphique ou sonore appartenant à Ankama.
- Il consomme uniquement des données publiques disponibles sans authentification depuis le CDN officiel de Wakfu.
- Il n'automatise aucune action dans le jeu.
- Il n'est pas monétisé.

"Wakfu" et les noms associés sont des marques déposées d'**Ankama Games**. Ce projet n'est en aucun cas affilié à, ou approuvé par, Ankama.
