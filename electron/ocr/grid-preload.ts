import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('gridAPI', {
  saveConfig: (config: object) => ipcRenderer.send('ocr:gridSaved', config),
  cancel: () => ipcRenderer.send('ocr:gridCancelled'),
});
