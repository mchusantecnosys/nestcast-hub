import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { CastHubService } from '../services/cast-hub';
import { LocalPackageFile } from '../models/cast.models';

@Component({
  selector: 'app-local-bridge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatIconModule],
  template: `
    <div class="space-y-8">
      <!-- Connection Mode & LAN Bridge Configuration -->
      <section
        class="rounded-2xl border p-6 transition-colors"
        [class.bg-white]="!hub.darkMode()"
        [class.border-slate-200]="!hub.darkMode()"
        [class.bg-slate-900]="hub.darkMode()"
        [class.border-slate-800]="hub.darkMode()"
      >
        <div class="flex flex-wrap items-start justify-between gap-4 pb-5 border-b"
             [class.border-slate-100]="!hub.darkMode()"
             [class.border-slate-800]="hub.darkMode()">
          <div>
            <div class="flex items-center gap-2 text-xs font-medium"
                 [class.text-slate-500]="!hub.darkMode()"
                 [class.text-slate-400]="hub.darkMode()">
              <span>Arquitectura Fase 0</span>
              <span aria-hidden="true">·</span>
              <span class="font-mono tabular-nums">Flask + PyChromecast + gTTS</span>
              <span aria-hidden="true">·</span>
              <span>Puerto Local 5000</span>
            </div>
            <h2 class="mt-1 text-2xl font-bold tracking-tight font-display">
              Puente de Red Local y Paquete Python
            </h2>
          </div>

          <!-- Active Mode Selector -->
          <div class="flex items-center gap-1 p-1 rounded-xl border"
               [class.bg-slate-100]="!hub.darkMode()"
               [class.border-slate-200]="!hub.darkMode()"
               [class.bg-slate-800]="hub.darkMode()"
               [class.border-slate-700]="hub.darkMode()">
            <button
              type="button"
              (click)="hub.setConnectionMode('simulator')"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              [class.bg-blue-600]="hub.connectionMode() === 'simulator'"
              [class.text-white]="hub.connectionMode() === 'simulator'"
              [class.text-slate-600]="hub.connectionMode() !== 'simulator' && !hub.darkMode()"
              [class.text-slate-300]="hub.connectionMode() !== 'simulator' && hub.darkMode()"
            >
              <mat-icon class="!text-sm !w-3.5 !h-3.5 leading-none">science</mat-icon>
              <span>Simulador Interactivo</span>
            </button>
            <button
              type="button"
              (click)="applyLanBridge()"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              [class.bg-blue-600]="hub.connectionMode() === 'lan'"
              [class.text-white]="hub.connectionMode() === 'lan'"
              [class.text-slate-600]="hub.connectionMode() !== 'lan' && !hub.darkMode()"
              [class.text-slate-300]="hub.connectionMode() !== 'lan' && hub.darkMode()"
            >
              <mat-icon class="!text-sm !w-3.5 !h-3.5 leading-none">router</mat-icon>
              <span>Puente Flask Local</span>
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-5">
          <div>
            <h3 class="text-sm font-bold">Conectar este Hub a tu servidor Python local</h3>
            <p class="mt-1 text-xs leading-relaxed"
               [class.text-slate-600]="!hub.darkMode()"
               [class.text-slate-400]="hub.darkMode()">
              Para descubrir altavoces físicos por mDNS y enviarles archivos de voz por la subred Wi-Fi, ejecuta <code>python app.py</code> en tu PC y apunta el puente a su dirección local:
            </p>

            <div class="mt-4 flex flex-wrap sm:flex-nowrap gap-2.5">
              <label for="lan-url-input" class="sr-only">URL del servidor local Flask</label>
              <input
                id="lan-url-input"
                type="url"
                [formControl]="lanUrlControl"
                placeholder="http://localhost:5000"
                class="flex-1 rounded-xl border px-3.5 py-2 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600"
                [class.bg-slate-50]="!hub.darkMode()"
                [class.border-slate-200]="!hub.darkMode()"
                [class.bg-slate-800]="hub.darkMode()"
                [class.border-slate-700]="hub.darkMode()"
              />
              <button
                type="button"
                (click)="applyLanBridge()"
                class="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <mat-icon class="!text-base !w-4 !h-4 leading-none">link</mat-icon>
                <span>Usar endpoint local</span>
              </button>
            </div>
          </div>

          <div class="space-y-2 text-xs">
            <span class="block font-semibold">Comandos rápidos de instalación en tu PC (Python 3.10+):</span>
            <pre
              class="rounded-xl border p-3.5 font-mono text-xs overflow-x-auto leading-relaxed"
              [class.bg-slate-50]="!hub.darkMode()"
              [class.border-slate-200]="!hub.darkMode()"
              [class.bg-slate-950]="hub.darkMode()"
              [class.border-slate-800]="hub.darkMode()"
            >cd google-home-mini-web
python -m venv .venv
source .venv/bin/activate  # En Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
python app.py              # Escucha en http://0.0.0.0:5000</pre>
          </div>
        </div>
      </section>

      <!-- Downloadable & Inspectable Python Phase 0 Package -->
      <section
        class="rounded-2xl border p-6 transition-colors"
        [class.bg-white]="!hub.darkMode()"
        [class.border-slate-200]="!hub.darkMode()"
        [class.bg-slate-900]="hub.darkMode()"
        [class.border-slate-800]="hub.darkMode()"
      >
        <div class="flex flex-wrap items-center justify-between gap-4 pb-4 border-b"
             [class.border-slate-100]="!hub.darkMode()"
             [class.border-slate-800]="hub.darkMode()">
          <div>
            <h3 class="text-lg font-bold font-display">Archivos del Proyecto Local (google-home-mini-web)</h3>
            <p class="text-xs mt-0.5"
               [class.text-slate-500]="!hub.darkMode()"
               [class.text-slate-400]="hub.darkMode()">
              Inspecciona, copia o descarga cada archivo fuente original para ejecutar el backend Flask en tu red Wi-Fi
            </p>
          </div>

          @if (selectedFile(); as file) {
            <div class="flex items-center gap-2">
              <button
                type="button"
                (click)="copyFileContent(file)"
                class="inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                [class.border-slate-200]="!hub.darkMode()"
                [class.hover:bg-slate-50]="!hub.darkMode()"
                [class.border-slate-700]="hub.darkMode()"
                [class.hover:bg-slate-800]="hub.darkMode()"
              >
                <mat-icon class="!text-base !w-4 !h-4 leading-none">content_copy</mat-icon>
                <span>Copiar código</span>
              </button>

              <button
                type="button"
                (click)="downloadFile(file)"
                class="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <mat-icon class="!text-base !w-4 !h-4 leading-none">download</mat-icon>
                <span>Descargar {{ file.filename }}</span>
              </button>
            </div>
          }
        </div>

        <!-- File Selector Tabs -->
        <div class="flex flex-wrap items-center gap-1.5 py-4 border-b"
             [class.border-slate-100]="!hub.darkMode()"
             [class.border-slate-800]="hub.darkMode()">
          @for (file of hub.localFiles(); track file.filename; let idx = $index) {
            <button
              type="button"
              (click)="selectedFileIndex.set(idx)"
              class="px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              [class.bg-blue-600]="selectedFileIndex() === idx"
              [class.text-white]="selectedFileIndex() === idx"
              [class.bg-slate-100]="selectedFileIndex() !== idx && !hub.darkMode()"
              [class.text-slate-700]="selectedFileIndex() !== idx && !hub.darkMode()"
              [class.bg-slate-800]="selectedFileIndex() !== idx && hub.darkMode()"
              [class.text-slate-300]="selectedFileIndex() !== idx && hub.darkMode()"
            >
              {{ file.filename }}
            </button>
          }
        </div>

        @if (selectedFile(); as activeFile) {
          <div class="mt-4">
            <div class="flex items-center justify-between text-xs mb-2"
                 [class.text-slate-500]="!hub.darkMode()"
                 [class.text-slate-400]="hub.darkMode()">
              <span>{{ activeFile.description }}</span>
              <span class="font-mono">{{ activeFile.targetPath }}</span>
            </div>
            <pre
              class="rounded-xl border p-4 font-mono text-xs overflow-x-auto max-h-96 leading-relaxed"
              [class.bg-slate-50]="!hub.darkMode()"
              [class.border-slate-200]="!hub.darkMode()"
              [class.bg-slate-950]="hub.darkMode()"
              [class.border-slate-800]="hub.darkMode()"
            ><code>{{ activeFile.content }}</code></pre>
          </div>
        }
      </section>
    </div>
  `,
})
export class LocalBridge implements OnInit {
  readonly hub = inject(CastHubService);
  readonly lanUrlControl = new FormControl(this.hub.lanBridgeUrl(), { nonNullable: true });
  readonly selectedFileIndex = signal<number>(0);

  selectedFile(): LocalPackageFile | null {
    const files = this.hub.localFiles();
    return files[this.selectedFileIndex()] ?? null;
  }

  ngOnInit(): void {
    this.hub.loadLocalPythonPackage();
  }

  applyLanBridge(): void {
    this.hub.setConnectionMode('lan', this.lanUrlControl.value);
  }

  async copyFileContent(file: LocalPackageFile): Promise<void> {
    try {
      await navigator.clipboard.writeText(file.content);
      this.hub.showToast(`Contenido de ${file.filename} copiado al portapapeles`, 'success');
    } catch {
      this.hub.showToast('No se pudo copiar automáticamente', 'error');
    }
  }

  downloadFile(file: LocalPackageFile): void {
    const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.filename.replace(/\//g, '_');
    a.click();
    URL.revokeObjectURL(url);
    this.hub.showToast(`Descargando ${file.filename}`, 'info');
  }
}
