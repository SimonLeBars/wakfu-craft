import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { CaptureRegion } from '@electron';

interface CaptureResult {
  price: number | null;
  debugImage: string;
  rawText: string;
}

const STORAGE_KEY = 'ocr_region';

@Component({
  selector: 'app-ocr-capture',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  template: `
    <div class="ocr-page">
      <h2 class="ocr-title">Capture de prix par OCR</h2>
      <p class="ocr-desc">
        Configurez la zone de l'écran où le prix s'affiche dans l'HDV, puis
        cliquez sur <strong>Scanner</strong> pour extraire le prix automatiquement.
      </p>

      <!-- Zone configurée -->
      <section class="ocr-card">
        <h3>Zone de capture</h3>
        @if (savedRegion()) {
          <p class="region-info">
            {{ savedRegion()!.width }} × {{ savedRegion()!.height }} px
            &nbsp;—&nbsp; position ({{ savedRegion()!.x }}, {{ savedRegion()!.y }})
          </p>
        } @else {
          <p class="region-empty">Aucune zone configurée</p>
        }
        <button class="btn-primary" (click)="startSelection()">
          📐 Configurer la zone
        </button>
      </section>

      <!-- Capture -->
      <section class="ocr-card">
        <h3>Lecture du prix</h3>
        <button
          class="btn-scan"
          (click)="capture()"
          [disabled]="!savedRegion() || capturing()"
          [attr.aria-busy]="capturing()"
        >
          @if (capturing()) { ⏳ Analyse… } @else { 🔍 Scanner le prix }
        </button>

        @if (status()) {
          <p class="ocr-status" role="status" aria-live="polite">{{ status() }}</p>
        }

        @if (lastResult()) {
          <div class="ocr-result">
            @if (lastResult()!.price !== null) {
              Prix détecté : <strong>{{ lastResult()!.price! | number:'1.0-0' }} k</strong>
            } @else {
              <span class="ocr-miss">Aucun prix reconnu</span>
            }
          </div>
          <div class="ocr-debug">
            <p class="debug-label">Texte brut OCR : <code>{{ lastResult()!.rawText || '(vide)' }}</code></p>
            <p class="debug-label">Image traitée :</p>
            <img class="debug-img" [src]="lastResult()!.debugImage" alt="Zone capturée" />
          </div>
        }
      </section>
    </div>
  `,
  styles: [`
    .ocr-page {
      padding: 32px;
      max-width: 560px;
      color: #e2e2f0;
      font-family: sans-serif;
    }
    .ocr-title { margin: 0 0 8px; font-size: 1.5rem; }
    .ocr-desc  { color: #888; font-size: 0.9rem; margin-bottom: 28px; line-height: 1.5; }

    .ocr-card {
      background: #1a1a2e;
      border: 1px solid #2a2a3e;
      border-radius: 10px;
      padding: 20px;
      margin-bottom: 20px;

      h3 {
        margin: 0 0 14px;
        font-size: 0.85rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #a0a0d0;
      }
    }

    .region-info  { font-family: monospace; font-size: 0.9rem; color: #4ade80; margin-bottom: 14px; }
    .region-empty { color: #666; font-style: italic; margin-bottom: 14px; }

    .btn-primary {
      padding: 8px 16px;
      border-radius: 7px;
      border: 1px solid #3a3a5e;
      background: transparent;
      color: #e2e2f0;
      cursor: pointer;
      font-size: 0.9rem;
      transition: border-color 0.15s;
      &:hover { border-color: #5865f2; }
    }

    .btn-scan {
      padding: 10px 20px;
      border-radius: 7px;
      border: 1px solid #5865f2;
      background: transparent;
      color: #5865f2;
      cursor: pointer;
      font-size: 0.95rem;
      font-weight: 500;
      transition: all 0.15s;
      &:hover:not(:disabled) { background: #5865f2; color: white; }
      &:disabled { opacity: 0.45; cursor: not-allowed; }
    }

    .ocr-status { margin-top: 14px; font-size: 0.85rem; color: #888; }

    .ocr-result {
      margin-top: 16px;
      padding: 14px 18px;
      background: #0f0f1a;
      border-radius: 8px;
      border: 1px solid #2a2a3e;
      font-size: 1.05rem;
      color: #a0a0d0;
      strong { color: #4ade80; font-size: 1.3rem; }
    }
    .ocr-miss { color: #ef4444; font-style: italic; }

    .ocr-debug {
      margin-top: 14px;
      padding: 14px;
      background: #0f0f1a;
      border-radius: 8px;
      border: 1px solid #2a2a3e;
    }
    .debug-label {
      font-size: 0.8rem;
      color: #666;
      margin-bottom: 8px;
      code { color: #a0a0d0; background: #1a1a2e; padding: 2px 6px; border-radius: 4px; }
    }
    .debug-img {
      display: block;
      max-width: 100%;
      border: 1px solid #3a3a5e;
      border-radius: 4px;
      image-rendering: pixelated;
    }
  `],
})
export class OcrCaptureComponent {
  protected readonly savedRegion = signal<CaptureRegion | null>(this.loadRegion());
  protected readonly capturing   = signal(false);
  protected readonly lastResult  = signal<CaptureResult | null>(null);
  protected readonly status      = signal('');

  async startSelection(): Promise<void> {
    this.status.set('Sélectionnez la zone dans l\'overlay…');
    const region = await window.electronAPI.ocr.startSelection();
    if (region) {
      this.savedRegion.set(region);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(region));
      this.status.set('Zone enregistrée.');
    } else {
      this.status.set('Sélection annulée.');
    }
  }

  async capture(): Promise<void> {
    const region = this.savedRegion();
    if (!region) return;

    this.capturing.set(true);
    this.lastResult.set(null);
    this.status.set('Capture en cours…');

    try {
      const result = await window.electronAPI.ocr.capture(region);
      if (result) {
        this.lastResult.set(result);
        this.status.set('');
      } else {
        this.status.set('Erreur lors de la capture.');
      }
    } finally {
      this.capturing.set(false);
    }
  }

  private loadRegion(): CaptureRegion | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as CaptureRegion) : null;
    } catch {
      return null;
    }
  }
}
