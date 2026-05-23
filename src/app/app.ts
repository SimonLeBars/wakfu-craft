import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LogWatcherService } from '@services/log-watcher.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  protected readonly title = signal('wakfu-craft');

  private readonly logWatcher = inject(LogWatcherService);

  ngOnInit(): void {
    this.logWatcher.start();
  }
}
