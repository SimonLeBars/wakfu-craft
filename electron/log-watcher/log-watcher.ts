import * as fs from 'fs';
import { BrowserWindow } from 'electron';
import { parseLine, PendingKamas, PendingCraft } from './log-parser';

// Polling interval en ms — fs.watch est peu fiable sur Windows pour les
// fichiers écrits par des processus Java (Wakfu).
const POLL_INTERVAL_MS = 500;

export class LogWatcher {
  private watchedPath: string | null = null;
  private fileOffset = 0;
  private pendingKamas: PendingKamas | null = null;
  private pendingCraft: PendingCraft | null = null;
  private remainder = '';

  start(logPath: string, win: BrowserWindow): void {
    this.stop();
    this.pendingKamas = null;
    this.pendingCraft = null;
    this.remainder = '';
    this.watchedPath = logPath;

    try {
      this.fileOffset = fs.statSync(logPath).size;
    } catch {
      this.fileOffset = 0;
    }

    // fs.watchFile (polling) est fiable sur Windows même pour des fichiers
    // écrits par des processus tiers (Java, etc.)
    fs.watchFile(logPath, { interval: POLL_INTERVAL_MS, persistent: false }, () => {
      this.readNewLines(logPath, win);
    });
  }

  stop(): void {
    if (this.watchedPath) {
      fs.unwatchFile(this.watchedPath);
      this.watchedPath = null;
    }
  }

  private readNewLines(logPath: string, win: BrowserWindow): void {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(logPath);
    } catch {
      return;
    }

    // File was rotated/truncated
    if (stat.size < this.fileOffset) {
      this.fileOffset = 0;
      this.remainder = '';
      this.pendingKamas = null;
      this.pendingCraft = null;
    }

    const bytesToRead = stat.size - this.fileOffset;
    if (bytesToRead <= 0) return;

    const buf = Buffer.alloc(bytesToRead);
    const fd = fs.openSync(logPath, 'r');
    fs.readSync(fd, buf, 0, bytesToRead, this.fileOffset);
    fs.closeSync(fd);
    this.fileOffset = stat.size;

    const chunk = this.remainder + buf.toString('utf-8');
    const lines = chunk.split('\n');
    // Keep last partial line in remainder
    this.remainder = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const result = parseLine(trimmed, this.pendingKamas, this.pendingCraft);
      this.pendingKamas = result.pendingKamas;
      this.pendingCraft = result.pendingCraft;
      if (result.emit) win.webContents.send('log:gameEvent', result.emit);
      if (result.emitCraft) win.webContents.send('log:craftEvent', result.emitCraft);
      if (result.emitXp) win.webContents.send('log:xpEvent', result.emitXp);
    }
  }
}
