import { Component, OnInit, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  protected readonly title = signal('wakfu-craft');

  ngOnInit(): void {
    window.electronAPI.checkVersion().then(v => console.log(v));
    window.electronAPI.debugReadFile('jobsItems').then(d => console.log(JSON.stringify(d, null, 2)));
  }
}
