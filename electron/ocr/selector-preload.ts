import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('selectorAPI', {
  sendRegion: (region: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.send('ocr:regionSelected', region),
  cancel: () => ipcRenderer.send('ocr:regionCancelled'),
});
