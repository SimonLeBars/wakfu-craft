import { ipcMain, BrowserWindow, desktopCapturer, screen } from 'electron';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

export interface CaptureRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ── HTML de l'overlay de sélection ──────────────────────────────────────────

const SELECTOR_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; }
  body { cursor: crosshair; background: rgba(0,0,0,0.35); user-select: none; }
  #hint {
    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
    background: rgba(15,15,26,0.92); color: #e2e2f0;
    padding: 10px 20px; border-radius: 8px;
    font-family: sans-serif; font-size: 14px;
    border: 1px solid #3a3a5e; pointer-events: none; white-space: nowrap;
  }
  #selection {
    position: absolute;
    border: 2px solid #5865f2;
    background: rgba(88,101,242,0.12);
    display: none;
  }
  #coords {
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: rgba(15,15,26,0.92); color: #888;
    padding: 6px 14px; border-radius: 6px;
    font-family: monospace; font-size: 12px;
    pointer-events: none; display: none;
  }
</style>
</head>
<body>
<div id="hint">Cliquez et glissez pour sélectionner la zone de prix &nbsp;·&nbsp; Échap pour annuler</div>
<div id="selection"></div>
<div id="coords"></div>
<script>
  let startX = 0, startY = 0, selecting = false;
  const sel    = document.getElementById('selection');
  const coords = document.getElementById('coords');

  document.addEventListener('mousedown', e => {
    startX = e.clientX; startY = e.clientY; selecting = true;
    sel.style.cssText += ';display:block;left:' + startX + 'px;top:' + startY + 'px;width:0;height:0';
    coords.style.display = 'block';
  });

  document.addEventListener('mousemove', e => {
    if (!selecting) return;
    const x = Math.min(e.clientX, startX), y = Math.min(e.clientY, startY);
    const w = Math.abs(e.clientX - startX), h = Math.abs(e.clientY - startY);
    sel.style.left = x + 'px'; sel.style.top = y + 'px';
    sel.style.width = w + 'px'; sel.style.height = h + 'px';
    coords.textContent = x + ', ' + y + '  —  ' + w + ' × ' + h + ' px';
  });

  document.addEventListener('mouseup', e => {
    if (!selecting) return;
    selecting = false;
    const region = {
      x: Math.min(e.clientX, startX), y: Math.min(e.clientY, startY),
      width: Math.abs(e.clientX - startX), height: Math.abs(e.clientY - startY),
    };
    if (region.width > 5 && region.height > 5) window.selectorAPI.sendRegion(region);
    else window.selectorAPI.cancel();
  });

  document.addEventListener('keydown', e => { if (e.key === 'Escape') window.selectorAPI.cancel(); });
</script>
</body>
</html>`;

// ── Handlers IPC ─────────────────────────────────────────────────────────────

export function registerOcrHandlers(): void {
  // Ouvre l'overlay de sélection et retourne la région choisie (ou null si annulé)
  ipcMain.handle('ocr:startSelection', () => {
    return new Promise<CaptureRegion | null>((resolve) => {
      const { width, height } = screen.getPrimaryDisplay().size;

      // Écrit le HTML dans un fichier temporaire pour que le preload fonctionne
      const tmpHtml = path.join(os.tmpdir(), 'wakfu-craft-selector.html');
      fs.writeFileSync(tmpHtml, SELECTOR_HTML, 'utf-8');

      const overlay = new BrowserWindow({
        width, height, x: 0, y: 0,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        webPreferences: {
          preload: path.join(__dirname, 'selector-preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
        },
      });

      overlay.loadFile(tmpHtml);

      let settled = false;
      const settle = (value: CaptureRegion | null) => {
        if (settled) return;
        settled = true;
        if (!overlay.isDestroyed()) overlay.close();
        resolve(value);
      };

      ipcMain.once('ocr:regionSelected',  (_e, region: CaptureRegion) => settle(region));
      ipcMain.once('ocr:regionCancelled', () => settle(null));
      overlay.on('closed', () => settle(null));
    });
  });

  // Capture l'écran, recadre la région et extrait le prix via OCR
  ipcMain.handle('ocr:capture', async (_event, region: CaptureRegion) => {
    const display     = screen.getPrimaryDisplay();
    const scaleFactor = display.scaleFactor;
    const { width, height } = display.size;

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width:  Math.round(width  * scaleFactor),
        height: Math.round(height * scaleFactor),
      },
    });

    const source = sources[0];
    if (!source) return null;

    // Passage en pixels physiques (HiDPI)
    const scaled = {
      x:      Math.round(region.x      * scaleFactor),
      y:      Math.round(region.y      * scaleFactor),
      width:  Math.round(region.width  * scaleFactor),
      height: Math.round(region.height * scaleFactor),
    };

    const cropped    = source.thumbnail.crop(scaled);
    const buffer     = cropped.toPNG();
    const debugImage = `data:image/png;base64,${buffer.toString('base64')}`;

    const { createWorker, PSM } = await import('tesseract.js');
    // 'eng' reconnaît mieux K/M ; PSM.SINGLE_LINE = zone de texte sur une seule ligne
    const worker = await createWorker('eng');
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
    const { data: { text } } = await worker.recognize(buffer);
    await worker.terminate();

    return { price: parsePrice(text.trim()), debugImage, rawText: text.trim() };
  });
}

// ── Parsing du prix ──────────────────────────────────────────────────────────

// Regex pour un nombre avec séparateur d'espace à la française : "19 998", "1 234 567", "40"
const FR_NUMBER = /\d{1,3}(?:\s\d{3})*(?:[.,]\d+)?/g;

function parsePrice(raw: string): number | null {
  // Normalise les espaces, passe en minuscule
  const text = raw.replace(/\s+/g, ' ').toLowerCase().trim();

  // 1. Nombre suivi de l'icône kama (¥) ou d'un suffixe K/M
  //    ex: "19 998 ¥"  |  "12 k"  |  "1.5m"
  const withUnit = text.match(
    /(\d{1,3}(?:\s\d{3})*(?:[.,]\d+)?)\s*([¥ykm])/
  );
  if (withUnit) {
    const num    = parseFloat(withUnit[1].replace(/\s/g, '').replace(',', '.'));
    const suffix = withUnit[2];
    if (!isNaN(num)) {
      let value = num;
      if (suffix === 'k') value *= 1_000;
      if (suffix === 'm') value *= 1_000_000;
      // ¥ / y = icône kama → valeur déjà en kamas bruts
      return Math.round(value);
    }
  }

  // 2. Pas d'unité reconnue — collecte tous les nombres FR et prend le dernier
  //    Le prix est toujours la dernière valeur numérique de la ligne HDV
  //    ex: "Baie de Gargousier 40  16  19 998 ¥" → [40, 16, 19998] → dernier = 19998
  const nums: number[] = [];
  let m: RegExpExecArray | null;
  FR_NUMBER.lastIndex = 0;
  while ((m = FR_NUMBER.exec(text)) !== null) {
    const n = parseFloat(m[0].replace(/\s/g, '').replace(',', '.'));
    if (!isNaN(n) && n > 0) nums.push(n);
  }
  if (nums.length === 0) return null;

  return Math.round(nums[nums.length - 1]);
}
