import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { SyncService } from '@services/sync.service';

@Component({
  selector: 'app-sync',
  imports: [],
  templateUrl: './sync.component.html',
  styleUrl: './sync.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SyncComponent implements OnInit {
  protected readonly sync = inject(SyncService);

  async ngOnInit(): Promise<void> {
    this.sync.checkVersion();
    await this.sync.loadLogPath();
  }

  startSync(): void {
    this.sync.downloadData();
  }

  onLogPathInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.sync.setLogPath(value);
  }

  detectLogPath(): void {
    this.sync.detectLogPath();
  }

  browseLogFile(): void {
    this.sync.browseLogFile();
  }
}
