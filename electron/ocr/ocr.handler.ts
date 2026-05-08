import { ipcMain, BrowserWindow, desktopCapturer, screen, nativeImage } from 'electron';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

export interface GridConfig {
  x: number;
  y: number;
  colWidths: number[];
  rowHeights: number[];
}

export interface GridRow {
  name: string;
  level: number | null;
  quantity: number | null;
  price: number | null;
  debugImages: [string, string, string, string]; // images prétraitées cols 0,1,3,4
  rawTexts:    [string, string, string, string]; // texte brut OCR cols 0,1,3,4
  stageImages?: { label: string; src: string }[][]; // étapes de preprocessing pour chaque colonne de la ligne 0 [nom, lvl, qté, prix]
}

// ── HTML de l'overlay grille ─────────────────────────────────────────────────

const GRID_OVERLAY_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; user-select: none; }
  body { background: transparent; cursor: default; }

  #grid-wrapper { position: absolute; }

  #grid-header {
    position: absolute;
    top: -28px; left: -2px; right: -2px;
    height: 28px;
    background: rgba(88,101,242,0.9);
    border-radius: 5px 5px 0 0;
    cursor: grab;
    display: flex;
    align-items: center;
    padding: 0 10px;
    font-family: sans-serif;
    font-size: 12px;
    color: white;
    font-weight: 500;
  }
  #grid-header:active { cursor: grabbing; }

  #grid {
    position: relative;
    border: 2px solid #5865f2;
    background: rgba(88,101,242,0.04);
  }

  #grid-lines {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: visible;
  }

  .v-line {
    position: absolute;
    top: 0; bottom: 0;
    width: 1px;
    background: rgba(88,101,242,0.35);
    pointer-events: none;
  }

  .h-line {
    position: absolute;
    left: 0; right: 0;
    height: 1px;
    background: rgba(88,101,242,0.35);
    pointer-events: none;
  }

  .col-sep {
    position: absolute;
    top: -2px; bottom: -2px;
    width: 10px;
    margin-left: -5px;
    cursor: ew-resize;
    background: transparent;
    z-index: 20;
    display: flex;
    align-items: stretch;
    justify-content: center;
  }
  .col-sep::after {
    content: '';
    width: 3px;
    background: rgba(88,101,242,0.6);
    border-radius: 2px;
    transition: background 0.1s;
  }
  .col-sep:hover::after, .col-sep.dragging::after { background: #8b98f8; }

  .row-sep {
    position: absolute;
    left: -2px; right: -2px;
    height: 10px;
    margin-top: -5px;
    cursor: ns-resize;
    background: transparent;
    z-index: 20;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: center;
  }
  .row-sep::after {
    content: '';
    height: 3px;
    background: rgba(88,101,242,0.6);
    border-radius: 2px;
    transition: background 0.1s;
  }
  .row-sep:hover::after, .row-sep.dragging::after { background: #8b98f8; }

  .resize-handle {
    position: absolute;
    width: 10px;
    height: 10px;
    background: #5865f2;
    border: 2px solid rgba(15,15,26,0.9);
    border-radius: 2px;
    z-index: 30;
  }
  .resize-handle:hover { background: #8b98f8; }

  #controls {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(15,15,26,0.95);
    border: 1px solid #3a3a5e;
    border-radius: 10px;
    padding: 10px 18px;
    display: flex;
    gap: 10px;
    align-items: center;
    font-family: sans-serif;
    font-size: 13px;
    color: #e2e2f0;
    white-space: nowrap;
    z-index: 100;
    box-shadow: 0 4px 24px rgba(0,0,0,0.5);
  }

  .ctrl-btn {
    background: #1a1a2e;
    border: 1px solid #3a3a5e;
    color: #e2e2f0;
    border-radius: 5px;
    padding: 4px 11px;
    cursor: pointer;
    font-size: 13px;
    line-height: 1.5;
  }
  .ctrl-btn:hover { background: #2a2a4e; border-color: #5865f2; }
  .ctrl-btn.primary { background: #5865f2; border-color: #5865f2; color: white; }
  .ctrl-btn.primary:hover { background: #6b75f5; }
  .ctrl-btn.cancel { border-color: #555; color: #888; }
  .ctrl-btn.cancel:hover { background: #2a2a3e; color: #e2e2f0; }

  .ctrl-count { min-width: 22px; text-align: center; font-weight: 600; color: #a0a0d0; }
  .ctrl-div { width: 1px; height: 20px; background: #3a3a5e; }
  .ctrl-lbl { color: #888; font-size: 12px; }

  #hint {
    position: fixed;
    top: 14px; left: 50%;
    transform: translateX(-50%);
    background: rgba(15,15,26,0.88);
    color: #888;
    padding: 6px 14px;
    border-radius: 6px;
    font-family: sans-serif;
    font-size: 11px;
    border: 1px solid #2a2a3e;
    pointer-events: none;
    white-space: nowrap;
  }
</style>
</head>
<body>
<div id="hint">Glissez la barre pour déplacer &nbsp;·&nbsp; Faites glisser les séparateurs pour redimensionner &nbsp;·&nbsp; Échap pour annuler</div>
<div id="grid-wrapper">
  <div id="grid-header">&#x283F; Grille OCR</div>
  <div id="grid"><div id="grid-lines"></div></div>
</div>
<div id="controls">
  <span class="ctrl-lbl">Colonnes</span>
  <button class="ctrl-btn" id="btn-col-minus">&#x2212;</button>
  <span class="ctrl-count" id="cols-count">0</span>
  <button class="ctrl-btn" id="btn-col-plus">+</button>
  <div class="ctrl-div"></div>
  <span class="ctrl-lbl">Lignes</span>
  <button class="ctrl-btn" id="btn-row-minus">&#x2212;</button>
  <span class="ctrl-count" id="rows-count">0</span>
  <button class="ctrl-btn" id="btn-row-plus">+</button>
  <div class="ctrl-div"></div>
  <button class="ctrl-btn primary" id="btn-save">Enregistrer</button>
  <button class="ctrl-btn cancel" id="btn-cancel">Annuler</button>
</div>
<script>
(function () {
  var cfg = __CONFIG_PLACEHOLDER__;
  var gx = cfg.x;
  var gy = cfg.y;
  var colWidths  = cfg.colWidths.slice();
  var rowHeights = cfg.rowHeights.slice();
  var MIN_SIZE = 20;

  var wrapper    = document.getElementById('grid-wrapper');
  var gridHeader = document.getElementById('grid-header');
  var grid       = document.getElementById('grid');
  var gridLines  = document.getElementById('grid-lines');

  function totalW() { return colWidths.reduce(function(a,b){return a+b;},0); }
  function totalH() { return rowHeights.reduce(function(a,b){return a+b;},0); }

  function positionWrapper() {
    wrapper.style.left = gx + 'px';
    wrapper.style.top  = gy + 'px';
  }

  function updateDimensions() {
    grid.style.width  = totalW() + 'px';
    grid.style.height = totalH() + 'px';
  }

  function updateSeparatorPositions() {
    var colSeps = grid.querySelectorAll('.col-sep');
    var cx = 0;
    for (var i = 0; i < colSeps.length; i++) {
      cx += colWidths[i];
      colSeps[i].style.left = cx + 'px';
    }
    var rowSeps = grid.querySelectorAll('.row-sep');
    var ry = 0;
    for (var i = 0; i < rowSeps.length; i++) {
      ry += rowHeights[i];
      rowSeps[i].style.top = ry + 'px';
    }
  }

  function updateGridLines() {
    gridLines.innerHTML = '';
    var cx = 0;
    for (var i = 0; i < colWidths.length - 1; i++) {
      cx += colWidths[i];
      var v = document.createElement('div');
      v.className = 'v-line';
      v.style.left = cx + 'px';
      gridLines.appendChild(v);
    }
    var ry = 0;
    for (var i = 0; i < rowHeights.length - 1; i++) {
      ry += rowHeights[i];
      var h = document.createElement('div');
      h.className = 'h-line';
      h.style.top = ry + 'px';
      gridLines.appendChild(h);
    }
  }

  function makeSep(type, index) {
    var sep = document.createElement('div');
    sep.className = type === 'col' ? 'col-sep' : 'row-sep';

    function reposition() {
      if (type === 'col') {
        var cx = 0; for (var i = 0; i <= index; i++) cx += colWidths[i];
        sep.style.left = cx + 'px';
      } else {
        var ry = 0; for (var i = 0; i <= index; i++) ry += rowHeights[i];
        sep.style.top = ry + 'px';
      }
    }
    reposition();

    sep.addEventListener('mousedown', function (e) {
      e.stopPropagation();
      sep.classList.add('dragging');
      var startPos = type === 'col' ? e.clientX : e.clientY;
      var initA = type === 'col' ? colWidths[index]   : rowHeights[index];
      var initB = type === 'col' ? colWidths[index+1] : rowHeights[index+1];

      function onMove(e) {
        var delta = (type === 'col' ? e.clientX : e.clientY) - startPos;
        var newA = initA + delta, newB = initB - delta;
        if (newA >= MIN_SIZE && newB >= MIN_SIZE) {
          if (type === 'col') { colWidths[index] = newA;   colWidths[index+1] = newB; }
          else                { rowHeights[index] = newA; rowHeights[index+1] = newB; }
          updateSeparatorPositions();
          updateGridLines();
        }
      }
      function onUp() {
        sep.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
    return sep;
  }

  function rebuildSeparators() {
    grid.querySelectorAll('.col-sep, .row-sep').forEach(function(el){el.remove();});
    for (var i = 0; i < colWidths.length  - 1; i++) grid.appendChild(makeSep('col', i));
    for (var i = 0; i < rowHeights.length - 1; i++) grid.appendChild(makeSep('row', i));
  }

  // ── Poignées de redimensionnement du cadre ─────────────────────────────────
  var HANDLE_DIRS    = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'];
  var HANDLE_CURSORS = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
                         nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize' };

  function buildHandles() {
    wrapper.querySelectorAll('.resize-handle').forEach(function(el){el.remove();});
    HANDLE_DIRS.forEach(function(dir) {
      var W = totalW(), H = totalH();
      var x = dir.indexOf('e') >= 0 ? W : dir.indexOf('w') >= 0 ? 0 : W / 2;
      var y = dir.indexOf('s') >= 0 ? H : dir.indexOf('n') >= 0 ? 0 : H / 2;
      var hEl = document.createElement('div');
      hEl.className = 'resize-handle';
      hEl.style.cursor = HANDLE_CURSORS[dir];
      hEl.style.left   = (x - 5) + 'px';
      hEl.style.top    = (y - 5) + 'px';

      hEl.addEventListener('mousedown', function(e) {
        e.stopPropagation();
        var startX = e.clientX, startY = e.clientY;
        var startGx = gx, startGy = gy;
        var initCols = colWidths.slice(), initRows = rowHeights.slice();
        var initW = colWidths.reduce(function(a,b){return a+b;},0);
        var initH = rowHeights.reduce(function(a,b){return a+b;},0);
        var hasN = dir.indexOf('n') >= 0, hasS = dir.indexOf('s') >= 0;
        var hasW = dir.indexOf('w') >= 0, hasE = dir.indexOf('e') >= 0;

        function onMove(e) {
          var dx = e.clientX - startX, dy = e.clientY - startY;

          if (hasE || hasW) {
            var rawW  = hasE ? initW + dx : initW - dx;
            var newW  = Math.max(colWidths.length * MIN_SIZE, rawW);
            var scaleW = newW / initW;
            colWidths = initCols.map(function(cw){ return Math.max(MIN_SIZE, Math.round(cw * scaleW)); });
            gx = hasW ? startGx + initW - colWidths.reduce(function(a,b){return a+b;},0) : startGx;
          }

          if (hasS || hasN) {
            var rawH  = hasS ? initH + dy : initH - dy;
            var newH  = Math.max(rowHeights.length * MIN_SIZE, rawH);
            var scaleH = newH / initH;
            rowHeights = initRows.map(function(rh){ return Math.max(MIN_SIZE, Math.round(rh * scaleH)); });
            gy = hasN ? startGy + initH - rowHeights.reduce(function(a,b){return a+b;},0) : startGy;
          }

          render();
        }
        function onUp() {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup',   onUp);
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);
      });

      wrapper.appendChild(hEl);
    });
  }

  function render() {
    updateDimensions();
    rebuildSeparators();
    updateGridLines();
    buildHandles();
    positionWrapper();
    document.getElementById('cols-count').textContent = colWidths.length;
    document.getElementById('rows-count').textContent = rowHeights.length;
  }

  // ── Déplacement de la grille ───────────────────────────────────────────────
  gridHeader.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    var ox = e.clientX - gx, oy = e.clientY - gy;
    function onMove(e) { gx = e.clientX - ox; gy = e.clientY - oy; positionWrapper(); }
    function onUp()    { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });

  // ── Contrôles colonnes / lignes ────────────────────────────────────────────
  document.getElementById('btn-col-minus').onclick = function () {
    if (colWidths.length <= 1) return;
    colWidths[colWidths.length - 2] += colWidths.pop();
    render();
  };
  document.getElementById('btn-col-plus').onclick = function () {
    var half = Math.max(MIN_SIZE, Math.round(colWidths[colWidths.length - 1] / 2));
    colWidths[colWidths.length - 1] -= half;
    colWidths.push(half);
    render();
  };
  document.getElementById('btn-row-minus').onclick = function () {
    if (rowHeights.length <= 1) return;
    rowHeights[rowHeights.length - 2] += rowHeights.pop();
    render();
  };
  document.getElementById('btn-row-plus').onclick = function () {
    var half = Math.max(MIN_SIZE, Math.round(rowHeights[rowHeights.length - 1] / 2));
    rowHeights[rowHeights.length - 1] -= half;
    rowHeights.push(half);
    render();
  };

  // ── Sauvegarde / annulation ────────────────────────────────────────────────
  document.getElementById('btn-save').onclick = function () {
    window.gridAPI.saveConfig({ x: gx, y: gy, colWidths: colWidths, rowHeights: rowHeights });
  };
  document.getElementById('btn-cancel').onclick = function () { window.gridAPI.cancel(); };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') window.gridAPI.cancel(); });

  render();
})();
</script>
</body>
</html>`;

// ── Handlers IPC ─────────────────────────────────────────────────────────────

export function registerOcrHandlers(): void {
  // Ouvre l'overlay grille et retourne la config sauvegardée (ou null si annulé)
  ipcMain.handle('ocr:openGridOverlay', (_event, existing?: GridConfig) => {
    return new Promise<GridConfig | null>((resolve) => {
      const display = screen.getPrimaryDisplay();
      const { width: sw, height: sh } = display.size;

      const cfg: GridConfig = existing ?? {
        x: Math.round((sw - 600) / 2),
        y: Math.round((sh - 320) / 2),
        colWidths:  [120, 120, 120, 120, 120],
        rowHeights: [36, 36, 36, 36, 36, 36, 36, 36, 36],
      };

      const html = GRID_OVERLAY_HTML.replace('__CONFIG_PLACEHOLDER__', JSON.stringify(cfg));
      const tmpHtml = path.join(os.tmpdir(), 'wakfu-craft-grid.html');
      fs.writeFileSync(tmpHtml, html, 'utf-8');

      const overlay = new BrowserWindow({
        width: sw, height: sh, x: 0, y: 0,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        webPreferences: {
          preload: path.join(__dirname, 'grid-preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
        },
      });

      overlay.loadFile(tmpHtml);

      let settled = false;
      const settle = (value: GridConfig | null) => {
        if (settled) return;
        settled = true;
        if (!overlay.isDestroyed()) overlay.close();
        resolve(value);
      };

      ipcMain.once('ocr:gridSaved',     (_e, saved: GridConfig) => settle(saved));
      ipcMain.once('ocr:gridCancelled', () => settle(null));
      overlay.on('closed', () => settle(null));
    });
  });

  // Capture toutes les cellules du tableau et retourne les lignes parsées
  ipcMain.handle('ocr:captureGrid', async (_event, grid: GridConfig) => {
    const display     = screen.getPrimaryDisplay();
    const scaleFactor = display.scaleFactor;
    const { width, height } = display.size;

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: Math.round(width * scaleFactor), height: Math.round(height * scaleFactor) },
    });
    if (!sources[0]) return null;
    const thumb = sources[0].thumbnail;

    const { createWorker, PSM } = await import('tesseract.js');
    const worker = await createWorker('eng');

    // Whitelist et PSM par colonne (index 0-4, colonne 2 ignorée)
    const COL_CFG: { whitelist: string; psm: typeof PSM[keyof typeof PSM] }[] = [
      { whitelist: '',            psm: PSM.SINGLE_LINE }, // 0 nom
      { whitelist: '0123456789',  psm: PSM.SINGLE_LINE }, // 1 niveau
      { whitelist: '',            psm: PSM.SINGLE_LINE }, // 2 ignorée
      { whitelist: '0123456789',  psm: PSM.SINGLE_LINE }, // 3 quantité
      { whitelist: '0123456789 ', psm: PSM.SINGLE_LINE }, // 4 prix
    ];

    try {
      // Précalcul des offsets X (colonnes) et Y (lignes) en pixels logiques
      const colX: number[] = [];
      let cx = 0;
      for (const w of grid.colWidths) { colX.push(grid.x + cx); cx += w; }

      const rowY: number[] = [];
      let ry = 0;
      for (const h of grid.rowHeights) { rowY.push(grid.y + ry); ry += h; }

      // Appels séquentiels : setParameters doit précéder son propre recognize
      const ocrCell = async (col: number, row: number, captureStages = false): Promise<{ text: string; image: string; stages?: { label: string; src: string }[] }> => {
        const { whitelist, psm } = COL_CFG[col];
        await worker.setParameters({
          tessedit_pageseg_mode:    psm,
          tessedit_char_whitelist:  whitelist,
        });
        const region = {
          x:      Math.round(colX[col] * scaleFactor),
          y:      Math.round(rowY[row] * scaleFactor),
          width:  Math.round(grid.colWidths[col]  * scaleFactor),
          height: Math.round(grid.rowHeights[row] * scaleFactor),
        };
        const rawPng = thumb.crop(region).toPNG();
        const stages = captureStages ? preprocessCellStages(rawPng) : undefined;
        const buf = preprocessCell(rawPng);
        const { data: { text } } = await worker.recognize(buf);
        return {
          text:  text.trim(),
          image: `data:image/png;base64,${buf.toString('base64')}`,
          stages,
        };
      };

      const results: GridRow[] = [];
      for (let r = 0; r < grid.rowHeights.length; r++) {
        // Col 2 (index 2) ignorée — appels séquentiels intentionnels
        const isFirstRow = r === 0;
        const cellName  = await ocrCell(0, r, isFirstRow);
        const cellLevel = await ocrCell(1, r, isFirstRow);
        const cellQty   = await ocrCell(3, r, isFirstRow);
        const cellPrice = await ocrCell(4, r, isFirstRow);
        results.push({
          name:     cellName.text,
          level:    parseInteger(cellLevel.text),
          quantity: parseInteger(cellQty.text),
          price:    parsePrice(cellPrice.text),
          debugImages: [cellName.image, cellLevel.image, cellQty.image, cellPrice.image],
          rawTexts:    [cellName.text,  cellLevel.text,  cellQty.text,  cellPrice.text],
          stageImages: isFirstRow ? [cellName.stages!, cellLevel.stages!, cellQty.stages!, cellPrice.stages!] : undefined,
        });
      }
      return results;
    } finally {
      await worker.terminate();
    }
  });

}

// ── Prétraitement image ───────────────────────────────────────────────────────

// Retourne les images intermédiaires à chaque étape pour debug (uniquement pour la cellule 0,0)
function preprocessCellStages(pngBuffer: Buffer): { label: string; src: string }[] {
  const toSrc = (buf: Buffer) => `data:image/png;base64,${buf.toString('base64')}`;

  const img = nativeImage.createFromBuffer(pngBuffer);
  const { width, height } = img.getSize();
  const scaled = img.resize({ width: width * 2, height: height * 2, quality: 'best' });
  const { width: sw, height: sh } = scaled.getSize();

  const bitmapGray = Buffer.from(scaled.toBitmap());
  for (let i = 0; i < bitmapGray.length; i += 4) {
    const gray = Math.round(0.114 * bitmapGray[i] + 0.587 * bitmapGray[i + 1] + 0.299 * bitmapGray[i + 2]);
    bitmapGray[i] = bitmapGray[i + 1] = bitmapGray[i + 2] = gray;
  }
  const grayPng = nativeImage.createFromBitmap(bitmapGray, { width: sw, height: sh }).toPNG();

  const bitmapBin = Buffer.from(scaled.toBitmap());
  for (let i = 0; i < bitmapBin.length; i += 4) {
    const gray = Math.round(0.114 * bitmapBin[i] + 0.587 * bitmapBin[i + 1] + 0.299 * bitmapBin[i + 2]);
    const val = gray >= 128 ? 0 : 255;
    bitmapBin[i] = bitmapBin[i + 1] = bitmapBin[i + 2] = val;
  }
  const binPng = nativeImage.createFromBitmap(bitmapBin, { width: sw, height: sh }).toPNG();

  return [
    { label: 'Original',        src: toSrc(pngBuffer) },
    { label: '×2 upscale',      src: toSrc(scaled.toPNG()) },
    { label: 'Niveaux de gris', src: toSrc(grayPng) },
    { label: 'Binarisé',        src: toSrc(binPng) },
  ];
}

// Texte clair sur fond sombre (UI Wakfu) → niveaux de gris + inversion + binarisation + ×2
// Donne à Tesseract du texte noir sur fond blanc avec une résolution suffisante.
function preprocessCell(pngBuffer: Buffer): Buffer {
  const img    = nativeImage.createFromBuffer(pngBuffer);
  const { width, height } = img.getSize();
  const scaled = img.resize({ width: width * 2, height: height * 2, quality: 'best' });
  const { width: sw, height: sh } = scaled.getSize();

  const bitmap = Buffer.from(scaled.toBitmap()); // BGRA copy
  for (let i = 0; i < bitmap.length; i += 4) {
    const gray = Math.round(0.114 * bitmap[i] + 0.587 * bitmap[i + 1] + 0.299 * bitmap[i + 2]);
    // Texte clair (gray ≥ 128) → noir ; fond sombre (gray < 128) → blanc
    const val = gray >= 128 ? 0 : 255;
    bitmap[i] = bitmap[i + 1] = bitmap[i + 2] = val;
  }
  return nativeImage.createFromBitmap(bitmap, { width: sw, height: sh }).toPNG();
}

// ── Parsing ──────────────────────────────────────────────────────────────────

function parseInteger(raw: string): number | null {
  const m = raw.replace(/\s+/g, '').match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

// ── Parsing du prix ──────────────────────────────────────────────────────────

// Les prix Wakfu sont toujours des entiers ; on supprime tout ce qui n'est pas un chiffre
// pour être robuste quelle que soit la façon dont Tesseract représente le séparateur de milliers.
function parsePrice(raw: string): number | null {
  const digits = raw.replace(/\D/g, '');
  return digits.length > 0 ? parseInt(digits, 10) : null;
}
