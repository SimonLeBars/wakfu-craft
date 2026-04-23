import { contextBridge, ipcRenderer } from 'electron';

// On expose uniquement les fonctions nécessaires à Angular
// via window.electronAPI — jamais de nodeIntegration directe
contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('db:ping'),
  checkVersion: () => ipcRenderer.invoke('sync:checkVersion'),
  downloadData: () => ipcRenderer.invoke('sync:downloadData'),
  onSyncProgress: (callback: (data: { file: string; status: string; count?: number }) => void) => {
    // Supprime l'ancien listener avant d'en ajouter un nouveau
    ipcRenderer.removeAllListeners('sync:progress');
    ipcRenderer.on('sync:progress', (_event, data) => callback(data));
  },
  debugReadFile: (filename: string) => ipcRenderer.invoke('debug:readFile', filename),
  getUserDataPath: () => ipcRenderer.invoke('debug:getUserDataPath'),
  searchItems:       (query: string, lang?: string) => ipcRenderer.invoke('items:search', query, lang),
  getRecipeByItemId: (itemId: number) => ipcRenderer.invoke('recipes:getByItemId', itemId),
  setPrice:        (itemId: number, price: number) => ipcRenderer.invoke('prices:setPrice', itemId, price),
  getLatestPrices: (itemIds: number[]) => ipcRenderer.invoke('prices:getLatestPrices', itemIds),
  getPriceHistory: (itemId: number) => ipcRenderer.invoke('prices:getHistory', itemId),
  ocr: {
    startSelection: ()                       => ipcRenderer.invoke('ocr:startSelection'),
    capture:        (region: unknown)        => ipcRenderer.invoke('ocr:capture', region),
  },
  sessions: {
    getAll:          ()                                                                                           => ipcRenderer.invoke('sessions:getAll'),
    create:          (name: string)                                                                               => ipcRenderer.invoke('sessions:create', name),
    rename:          (id: number, name: string)                                                                   => ipcRenderer.invoke('sessions:rename', id, name),
    delete:          (id: number)                                                                                 => ipcRenderer.invoke('sessions:delete', id),
    getItems:        (id: number)                                                                                 => ipcRenderer.invoke('sessions:getItems', id),
    addItem:         (sessionId: number, itemId: number, qty: number, parentId: number | null)                   => ipcRenderer.invoke('sessions:addItem', sessionId, itemId, qty, parentId),
    removeItem:      (sessionItemId: number)                                                                     => ipcRenderer.invoke('sessions:removeItem', sessionItemId),
    updateQty:       (sessionItemId: number, qty: number)                                                        => ipcRenderer.invoke('sessions:updateQty', sessionItemId, qty),
    getShoppingList: (sessionId: number)                                                                         => ipcRenderer.invoke('sessions:getShoppingList', sessionId),
    getCraftOrder:   (sessionId: number)                                                                         => ipcRenderer.invoke('sessions:getCraftOrder', sessionId),
  },
});