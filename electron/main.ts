import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import type { SessionStep } from '@electron';
import * as path from 'path';
import { existsSync } from 'fs';
import { DatabaseService } from './database/db.service';
import { LogWatcher } from './log-watcher/log-watcher';
import { registerOcrHandlers } from './ocr/ocr.handler';
import url from 'url';

let mainWindow: BrowserWindow | null = null;
let db: DatabaseService;
const logWatcher = new LogWatcher();

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // En dev : pointe vers le serveur Angular
  // En prod : charge le build statique
  if (process.env['NODE_ENV'] === 'development') {
    mainWindow.loadURL('http://localhost:4200');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL(
      url.format({
        pathname: path.join(__dirname, '../dist/wakfu-craft/browser/index.html'),
        protocol: 'file:',
        slashes: true,
      }),
    );
  }
}

app.whenReady().then(() => {
  db = new DatabaseService();
  db.initialize();
  registerIpcHandlers(db);
  registerOcrHandlers();
  createWindow();

  // Démarre la surveillance du log si un chemin est déjà configuré
  const savedPath = db.getLogPath();
  if (mainWindow && savedPath && existsSync(savedPath)) {
    logWatcher.start(savedPath, mainWindow);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function registerIpcHandlers(db: DatabaseService): void {
  ipcMain.handle('db:ping', () => 'pong');

  // Récupère la version distante et la version locale
  ipcMain.handle('sync:checkVersion', async () => {
    const fetch = (await import('node-fetch')).default;
    const res = await fetch('https://wakfu.cdn.ankama.com/gamedata/config.json');
    const config = (await res.json()) as { version: string };
    const localVersion = db.getSetting('gamedata_version');
    return {
      remoteVersion: config.version,
      localVersion,
      needsUpdate: config.version !== localVersion,
    };
  });

  // Télécharge et importe tous les fichiers de données
  ipcMain.handle('sync:downloadData', async (_event) => {
    const fetch = (await import('node-fetch')).default;
    const app = (await import('electron')).app;
    const path = await import('path');
    const fs = await import('fs/promises');

    // 1. Récupère la version
    const configRes = await fetch('https://wakfu.cdn.ankama.com/gamedata/config.json');
    const config = (await configRes.json()) as { version: string };
    const version = config.version;
    const baseUrl = `https://wakfu.cdn.ankama.com/gamedata/${version}`;

    // 2. Dossier de cache local
    const cacheDir = path.join(app.getPath('userData'), 'gamedata', version);
    await fs.mkdir(cacheDir, { recursive: true });

    const files = [
      // 1. Items en premier — tout le reste en dépend
      'items',
      'jobsItems',
      // 2. Métadonnées
      'actions',
      'itemTypes',
      'equipmentItemTypes',
      'recipeCategories',
      // 3. Recettes — dans le bon ordre de dépendance
      'recipes', // crée les recettes (result_item_id encore vide)
      'recipeResults', // remplit result_item_id
      'recipeIngredients', // lie les ingrédients aux recettes
    ];
    const results: Record<string, number> = {};

    for (const file of files) {
      _event.sender.send('sync:progress', { file, status: 'downloading' });

      const filePath = path.join(cacheDir, `${file}.json`);

      // Télécharge seulement si pas déjà en cache
      try {
        await fs.access(filePath);
        _event.sender.send('sync:progress', { file, status: 'cached' });
      } catch {
        const res = await fetch(`${baseUrl}/${file}.json`);
        const text = await res.text();
        await fs.writeFile(filePath, text, 'utf-8');
        _event.sender.send('sync:progress', { file, status: 'downloaded' });
      }

      // Importe en base
      const raw = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(raw);
      const count = db.importData(file, data);
      results[file] = count;
      _event.sender.send('sync:progress', { file, status: 'imported', count });
    }

    db.setSetting('gamedata_version', version);
    return { version, results };
  });

  ipcMain.handle('debug:readFile', async (_event, filename: string) => {
    const fetch = (await import('node-fetch')).default;

    // Récupère la version d'abord
    const configRes = await fetch('https://wakfu.cdn.ankama.com/gamedata/config.json');
    const config = (await configRes.json()) as { version: string };

    // Fetch le fichier demandé
    const url = `https://wakfu.cdn.ankama.com/gamedata/${config.version}/${filename}.json`;
    const res = await fetch(url);
    const data = (await res.json()) as unknown;

    // Retourne les 2 premiers éléments
    return Array.isArray(data) ? data.slice(0, 2) : data;
  });

  ipcMain.handle('debug:getUserDataPath', () => app.getPath('userData'));

  ipcMain.handle('items:getTypes', () => db.getItemTypes());
  ipcMain.handle('xp:getCategories', () => db.getRecipeCategories());
  ipcMain.handle('profession:getLevels', () => db.getProfessionLevels());
  ipcMain.handle('profession:setLevels', (_e, levels: Record<number, number>) =>
    db.setProfessionLevels(levels),
  );
  ipcMain.handle('profession:getGuildXpBonus', () => db.getGuildXpBonus());
  ipcMain.handle('profession:setGuildXpBonus', (_e, bonus: number) => db.setGuildXpBonus(bonus));
  ipcMain.handle(
    'xp:getRecipesByCategoryAndLevel',
    (_e, categoryId: number, minLevel: number, maxLevel: number) =>
      db.getRecipesByCategoryAndLevel(categoryId, minLevel, maxLevel),
  );
  ipcMain.handle('xp:getRecipesByItemIds', (_e, itemIds: number[]) =>
    db.getRecipesByItemIds(itemIds),
  );

  // Recherche d'items par nom
  ipcMain.handle(
    'items:search',
    (
      _event,
      query: string,
      lang: string = 'fr',
      typeIds: number[] = [],
      minLevel?: number,
      maxLevel?: number,
      rarities: number[] = [],
    ) => {
      return db.searchItems(query, lang, typeIds, minLevel, maxLevel, rarities);
    },
  );

  ipcMain.handle('recipes:getAllByItemId', (_event, itemId: number) =>
    db.getRecipesByItemId(itemId),
  );

  ipcMain.handle('prices:setPrice', (_event, itemId: number, price: number) => {
    db.setPrice(itemId, price);
    return true;
  });

  ipcMain.handle('prices:setNotForSale', (_event, itemId: number) => {
    db.setNotForSale(itemId);
    return true;
  });

  ipcMain.handle('prices:getLatestPrices', (_event, itemIds: number[]) => {
    return db.getLatestPrices(itemIds);
  });

  ipcMain.handle('prices:getLatestPriceEntries', (_event, itemIds: number[]) => {
    return db.getLatestPriceEntries(itemIds);
  });

  ipcMain.handle('prices:getHistory', (_event, itemId: number) => {
    return db.getPriceHistory(itemId);
  });

  ipcMain.handle('prices:deleteEntry', (_event, id: number) => {
    db.deletePriceEntry(id);
  });

  ipcMain.handle('sessions:getAll', () => db.getSessions());
  ipcMain.handle('sessions:create', (_e, name: string) => db.createSession(name));
  ipcMain.handle('sessions:rename', (_e, id: number, name: string) => db.renameSession(id, name));
  ipcMain.handle('sessions:delete', (_e, id: number) => db.deleteSession(id));
  ipcMain.handle('sessions:getItems', (_e, id: number) => db.getSessionItems(id));
  ipcMain.handle(
    'sessions:addItem',
    (
      _e,
      sessionId: number,
      itemId: number,
      qty: number,
      recipeId: number | null,
      subRecipes: Record<number, number>,
    ) => db.addItemToSession(sessionId, itemId, qty, recipeId, subRecipes),
  );
  ipcMain.handle('sessions:removeItem', (_e, sessionItemId: number) =>
    db.removeItemFromSession(sessionItemId),
  );
  ipcMain.handle('sessions:updateQty', (_e, sessionItemId: number, qty: number) =>
    db.updateSessionItemQuantity(sessionItemId, qty),
  );
  ipcMain.handle('sessions:getTree', (_e, id: number) => db.getSessionTree(id));

  ipcMain.handle('sessions:setStep', (_e, id: number, step: string) =>
    db.setSessionStep(id, step as SessionStep),
  );

  ipcMain.handle('sessions:getPurchases', (_e, sessionId: number) =>
    db.getSessionPurchases(sessionId),
  );
  ipcMain.handle(
    'sessions:addPurchase',
    (_e, sessionId: number, itemId: number, unitPrice: number, quantity: number) =>
      db.addSessionPurchase(sessionId, itemId, unitPrice, quantity),
  );
  ipcMain.handle('sessions:deletePurchase', (_e, id: number) => db.deleteSessionPurchase(id));

  ipcMain.handle('sessions:getCraftsDone', (_e, sessionId: number) =>
    db.getSessionCraftsDone(sessionId),
  );
  ipcMain.handle('sessions:upsertCraftDone', (_e, sessionId: number, itemId: number, qty: number) =>
    db.upsertCraftDone(sessionId, itemId, qty),
  );

  ipcMain.handle('sessions:getListings', (_e, sessionId: number) =>
    db.getSessionListings(sessionId),
  );
  ipcMain.handle('sessions:getLastTaxRate', () => db.getLastTaxRate());
  ipcMain.handle(
    'sessions:addListing',
    (
      _e,
      sessionItemId: number,
      parentListingId: number | null,
      unitPrice: number,
      quantity: number,
      taxRate: number,
    ) => db.addSessionListing(sessionItemId, parentListingId, unitPrice, quantity, taxRate),
  );
  ipcMain.handle('sessions:deleteListing', (_e, id: number) => db.deleteSessionListing(id));

  ipcMain.handle('sessions:getSales', (_e, sessionId: number) => db.getSessionSales(sessionId));
  ipcMain.handle('sessions:addSale', (_e, listingId: number, quantity: number, soldAt?: string) =>
    db.addSessionSale(listingId, quantity, soldAt),
  );

  ipcMain.handle('sessions:getReport', (_e, sessionId: number) => db.getSessionReport(sessionId));

  // Settings — chemin du fichier de log
  ipcMain.handle('settings:getLogPath', () => db.getLogPath());
  ipcMain.handle('settings:setLogPath', (_e, p: string) => {
    db.setLogPath(p);
    if (mainWindow && existsSync(p)) logWatcher.start(p, mainWindow);
    else logWatcher.stop();
  });
  ipcMain.handle('settings:detectLogPath', () => {
    const candidate = path.join(
      app.getPath('appData'),
      'zaap',
      'gamesLogs',
      'wakfu',
      'logs',
      'wakfu_chat.log',
    );
    if (existsSync(candidate)) {
      db.setLogPath(candidate);
      if (mainWindow) logWatcher.start(candidate, mainWindow);
      return candidate;
    }
    return null;
  });
  ipcMain.handle('settings:openLogFileDialog', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Log', extensions: ['log'] }],
    });
    if (!result.canceled && result.filePaths[0]) {
      const p = result.filePaths[0];
      db.setLogPath(p);
      if (mainWindow) logWatcher.start(p, mainWindow);
      return p;
    }
    return null;
  });
}
