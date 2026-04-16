import { Injectable, signal } from '@angular/core';

export type SyncStatus = 'idle' | 'checking' | 'downloading' | 'done' | 'error';

export interface SyncProgress {
  file: string;
  status: 'downloading' | 'cached' | 'downloaded' | 'imported';
  count?: number;
}

export interface VersionInfo {
  remoteVersion: string;
  localVersion: string | null;
  needsUpdate: boolean;
}

@Injectable({ providedIn: 'root' })
export class SyncService {
  // Signals réactifs — Angular 17+ style
  readonly status = signal<SyncStatus>('idle');
  readonly versionInfo = signal<VersionInfo | null>(null);
  readonly progressLog = signal<SyncProgress[]>([]);
  readonly error = signal<string | null>(null);

  async checkVersion(): Promise<VersionInfo> {
    this.status.set('checking');
    try {
      const info = await window.electronAPI.checkVersion();
      this.versionInfo.set(info);
      this.status.set('idle');
      return info;
    } catch (e: unknown) {
      this.error.set(e instanceof Error ? e.message : String(e));
      this.status.set('error');
      throw e;
    }
  }

  async downloadData(): Promise<void> {
    this.status.set('downloading');
    this.progressLog.set([]);
    this.error.set(null);

    // Écoute les événements de progression depuis Electron
    window.electronAPI.onSyncProgress((data: SyncProgress) => {
      this.progressLog.update(log => [...log, data]);
    });

    try {
      const result = await window.electronAPI.downloadData();
      this.versionInfo.update(v => v ? { ...v, needsUpdate: false, localVersion: result.version } : v);
      this.status.set('done');
    } catch (e: unknown) {
      this.error.set(e instanceof Error ? e.message : String(e));
      this.status.set('error');
    }
  }
}
