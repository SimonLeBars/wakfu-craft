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

  ngOnInit(): void {
    this.sync.checkVersion();
  }

  startSync(): void {
    this.sync.downloadData();
  }
}
