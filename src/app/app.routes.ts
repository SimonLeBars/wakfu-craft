import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'items', pathMatch: 'full' },
  { path: 'sync',    loadComponent: () => import('./features/sync/sync.component').then(m => m.SyncComponent) },
  { path: 'items',   loadComponent: () => import('./features/items/items.component').then(m => m.ItemsComponent) },
  { path: 'session', loadComponent: () => import('./features/session/session.component').then(m => m.SessionComponent) },
  { path: 'ocr',     loadComponent: () => import('./features/ocr/ocr-capture.component').then(m => m.OcrCaptureComponent) },
  { path: 'xp',      loadComponent: () => import('./features/xp-optimizer/xp-optimizer.component').then(m => m.XpOptimizerComponent) },
  { path: 'profile', loadComponent: () => import('./features/profession-profile/profession-profile.component').then(m => m.ProfessionProfileComponent) },
];
