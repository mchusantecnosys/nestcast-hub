import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { CastHubService } from '../services/cast-hub';
import { AutomationService } from '../services/automation.service';
import { AudioPreset, TtsEntry } from '../models/cast.models';

@Component({
  selector: 'app-control-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatIconModule],
  template: `
    @if (hub.selectedDevice(); as device) {
      <div class="space-y-8">
        <!-- Main Speaker Status & Transport Surface -->
        <section
          class="rounded-2xl border p-6 transition-colors"
          [class.bg-white]="!hub.darkMode()"
          [class.border-slate-200]="!hub.darkMode()"
          [class.bg-slate-900]="hub.darkMode()"
          [class.border-slate-800]="hub.darkMode()"
        >
          <div class="flex flex-wrap items-start justify-between gap-4 pb-6 border-b"
               [class.border-slate-100]="!hub.darkMode()"
               [class.border-slate-800]="hub.darkMode()">
            <div>
              <div class="flex items-center gap-2 text-xs font-medium"
                   [class.text-slate-500]="!hub.darkMode()"
                   [class.text-slate-400]="hub.darkMode()">
                <span>{{ device.model }}</span>
                <span aria-hidden="true">·</span>
                <span class="font-mono tabular-nums">{{ device.host }}</span>
                <span aria-hidden="true">·</span>
                <span>Cast Audio</span>
              </div>
              <h2 class="mt-1 text-2xl font-bold tracking-tight font-display">
                {{ device.name }}
              </h2>
            </div>

            <div class="flex items-center gap-2">
              <button
                type="button"
                (click)="hub.refreshStatus()"
                class="inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                [class.border-slate-200]="!hub.darkMode()"
                [class.bg-slate-50]="!hub.darkMode()"
                [class.text-slate-700]="!hub.darkMode()"
                [class.hover:bg-slate-100]="!hub.darkMode()"
                [class.border-slate-700]="hub.darkMode()"
                [class.bg-slate-800]="hub.darkMode()"
                [class.text-slate-200]="hub.darkMode()"
                [class.hover:bg-slate-700]="hub.darkMode()"
              >
                <mat-icon class="!text-base !w-4 !h-4 leading-none">sync</mat-icon>
                <span>Actualizar estado</span>
              </button>

              <button
                type="button"
                (click)="confirmRemoveDevice(device)"
                title="Quitar este altavoz de la lista"
                class="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-400 dark:hover:bg-rose-950/40"
              >
                <mat-icon class="!text-base !w-4 !h-4 leading-none">delete_outline</mat-icon>
                <span>Quitar del Hub</span>
              </button>
            </div>
          </div>

          <!-- 3-Column Telemetry Strip (Unboxed clean layout with hairline dividers) -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-6 py-5 border-b"
               [class.border-slate-100]="!hub.darkMode()"
               [class.border-slate-800]="hub.darkMode()">
            <div>
              <span class="block text-xs font-medium"
                    [class.text-slate-500]="!hub.darkMode()"
                    [class.text-slate-400]="hub.darkMode()">
                Estado del reproductor
              </span>
              <div class="mt-1 flex items-center gap-2">
                <mat-icon
                  class="!text-lg !w-4.5 !h-4.5 leading-none"
                  [class.text-emerald-600]="hub.currentStatus().player_state === 'PLAYING'"
                  [class.text-amber-600]="hub.currentStatus().player_state === 'PAUSED'"
                  [class.text-slate-400]="hub.currentStatus().player_state === 'IDLE'"
                  [class.text-rose-600]="hub.currentStatus().player_state === 'Sin conexión'"
                >
                  {{
                    hub.currentStatus().player_state === 'PLAYING'
                      ? 'graphic_eq'
                      : hub.currentStatus().player_state === 'PAUSED'
                        ? 'pause_circle'
                        : hub.currentStatus().player_state === 'Sin conexión'
                          ? 'error_outline'
                          : 'radio_button_checked'
                  }}
                </mat-icon>
                <strong class="font-mono text-sm font-semibold tabular-nums">
                  {{ hub.currentStatus().player_state }}
                </strong>
              </div>
            </div>

            <div>
              <span class="block text-xs font-medium"
                    [class.text-slate-500]="!hub.darkMode()"
                    [class.text-slate-400]="hub.darkMode()">
                Aplicación activa
              </span>
              <strong class="mt-1 block truncate text-sm font-semibold">
                {{ hub.currentStatus().app || 'Ninguna' }}
              </strong>
            </div>

            <div>
              <span class="block text-xs font-medium"
                    [class.text-slate-500]="!hub.darkMode()"
                    [class.text-slate-400]="hub.darkMode()">
                Reproduciendo ahora
              </span>
              <strong class="mt-1 block truncate text-sm font-semibold" [title]="hub.currentStatus().title || '—'">
                {{ hub.currentStatus().title || '—' }}
              </strong>
            </div>
          </div>

          <!-- Volume & Mute Bar -->
          <div class="py-6 border-b"
               [class.border-slate-100]="!hub.darkMode()"
               [class.border-slate-800]="hub.darkMode()">
            <div class="flex items-center justify-between mb-3">
              <label for="volume-slider" class="flex items-center gap-2 text-sm font-semibold">
                <mat-icon class="!text-lg !w-4.5 !h-4.5 leading-none text-blue-600">
                  {{ hub.currentStatus().muted ? 'volume_off' : 'volume_up' }}
                </mat-icon>
                <span>Volumen del altavoz</span>
              </label>
              <span class="font-mono text-sm font-semibold tabular-nums">
                {{ draggingVolume() ? pendingVolume() : hub.currentStatus().volume }}%
                @if (hub.currentStatus().muted) {
                  <span class="text-xs font-normal text-amber-600 ml-1">(Silenciado)</span>
                }
              </span>
            </div>

            <div class="flex flex-wrap sm:flex-nowrap items-center gap-4">
              <input
                id="volume-slider"
                type="range"
                min="0"
                max="100"
                step="1"
                aria-label="Volumen del altavoz"
                class="nest-slider w-full cursor-pointer"
                [class.bg-slate-200]="!hub.darkMode()"
                [class.bg-slate-700]="hub.darkMode()"
                [value]="draggingVolume() ? pendingVolume() : hub.currentStatus().volume"
                (input)="onVolumeInput($event)"
                (change)="onVolumeCommit($event)"
              />

              <button
                type="button"
                (click)="hub.toggleMute()"
                [disabled]="hub.busyAction() === 'mute'"
                class="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                [class.border-amber-500]="hub.currentStatus().muted"
                [class.bg-amber-50]="hub.currentStatus().muted && !hub.darkMode()"
                [class.text-amber-800]="hub.currentStatus().muted && !hub.darkMode()"
                [class.bg-amber-950]="hub.currentStatus().muted && hub.darkMode()"
                [class.text-amber-200]="hub.currentStatus().muted && hub.darkMode()"
                [class.border-slate-200]="!hub.currentStatus().muted && !hub.darkMode()"
                [class.text-slate-700]="!hub.currentStatus().muted && !hub.darkMode()"
                [class.hover:bg-slate-100]="!hub.currentStatus().muted && !hub.darkMode()"
                [class.border-slate-700]="!hub.currentStatus().muted && hub.darkMode()"
                [class.text-slate-200]="!hub.currentStatus().muted && hub.darkMode()"
                [class.hover:bg-slate-800]="!hub.currentStatus().muted && hub.darkMode()"
              >
                <mat-icon class="!text-base !w-4 !h-4 leading-none">
                  {{ hub.currentStatus().muted ? 'volume_up' : 'volume_off' }}
                </mat-icon>
                <span>{{ hub.currentStatus().muted ? 'Activar sonido' : 'Silenciar' }}</span>
              </button>
            </div>
          </div>

          <!-- Transport Controls -->
          <div class="pt-5">
            <span class="block text-xs font-medium mb-3"
                  [class.text-slate-500]="!hub.darkMode()"
                  [class.text-slate-400]="hub.darkMode()">
              Control de transporte Cast
            </span>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button
                type="button"
                (click)="hub.sendMediaAction('play')"
                [disabled]="hub.busyAction() === 'play'"
                class="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                [class.border-slate-200]="!hub.darkMode()"
                [class.hover:bg-slate-50]="!hub.darkMode()"
                [class.border-slate-700]="hub.darkMode()"
                [class.hover:bg-slate-800]="hub.darkMode()"
              >
                <mat-icon class="!text-base !w-4 !h-4 leading-none text-blue-600">play_arrow</mat-icon>
                <span>Reanudar</span>
              </button>

              <button
                type="button"
                (click)="hub.sendMediaAction('pause')"
                [disabled]="hub.busyAction() === 'pause'"
                class="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                [class.border-slate-200]="!hub.darkMode()"
                [class.hover:bg-slate-50]="!hub.darkMode()"
                [class.border-slate-700]="hub.darkMode()"
                [class.hover:bg-slate-800]="hub.darkMode()"
              >
                <mat-icon class="!text-base !w-4 !h-4 leading-none text-amber-600">pause</mat-icon>
                <span>Pausar</span>
              </button>

              <button
                type="button"
                (click)="hub.sendMediaAction('stop')"
                [disabled]="hub.busyAction() === 'stop'"
                class="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                [class.border-slate-200]="!hub.darkMode()"
                [class.hover:bg-slate-50]="!hub.darkMode()"
                [class.border-slate-700]="hub.darkMode()"
                [class.hover:bg-slate-800]="hub.darkMode()"
              >
                <mat-icon class="!text-base !w-4 !h-4 leading-none text-slate-500">stop</mat-icon>
                <span>Detener</span>
              </button>

              <button
                type="button"
                (click)="hub.sendMediaAction('quit')"
                [disabled]="hub.busyAction() === 'quit'"
                class="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                [class.border-slate-200]="!hub.darkMode()"
                [class.hover:bg-rose-50]="!hub.darkMode()"
                [class.hover:text-rose-700]="!hub.darkMode()"
                [class.border-slate-700]="hub.darkMode()"
                [class.hover:bg-rose-950]="hub.darkMode()"
                [class.hover:text-rose-200]="hub.darkMode()"
              >
                <mat-icon class="!text-base !w-4 !h-4 leading-none text-rose-600">close</mat-icon>
                <span>Cerrar app</span>
              </button>
            </div>
          </div>
        </section>

        <!-- Two-Column Workspace: Audio Stream & Presets + TTS Console -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
          <!-- Column 1: Stream URL & Quick Presets -->
          <section
            class="rounded-2xl border p-6 flex flex-col justify-between transition-colors"
            [class.bg-white]="!hub.darkMode()"
            [class.border-slate-200]="!hub.darkMode()"
            [class.bg-slate-900]="hub.darkMode()"
            [class.border-slate-800]="hub.darkMode()"
          >
            <div>
              <div class="flex items-center justify-between pb-4 border-b"
                   [class.border-slate-100]="!hub.darkMode()"
                   [class.border-slate-800]="hub.darkMode()">
                <div>
                  <h3 class="text-lg font-bold font-display">Streaming de Audio y Emisoras</h3>
                  <p class="text-xs mt-0.5"
                     [class.text-slate-500]="!hub.darkMode()"
                     [class.text-slate-400]="hub.darkMode()">
                    Envía radios por internet o archivos MP3/AAC/OGG directos al altavoz
                  </p>
                </div>
                <mat-icon class="text-blue-600">podcasts</mat-icon>
              </div>

              <!-- Quick Presets List -->
              <div class="mt-4">
                <span class="block text-xs font-semibold mb-2.5"
                      [class.text-slate-600]="!hub.darkMode()"
                      [class.text-slate-300]="hub.darkMode()">
                  Emisoras y sonidos predefinidos (1 clic)
                </span>
                <div class="divide-y border-y"
                     [class.divide-slate-100]="!hub.darkMode()"
                     [class.border-slate-100]="!hub.darkMode()"
                     [class.divide-slate-800]="hub.darkMode()"
                     [class.border-slate-800]="hub.darkMode()">
                  @for (preset of hub.presets(); track preset.id) {
                    <div class="py-3 flex items-center justify-between gap-3">
                      <div class="min-w-0">
                        <div class="flex items-center gap-2 text-xs"
                             [class.text-slate-500]="!hub.darkMode()"
                             [class.text-slate-400]="hub.darkMode()">
                          <span class="whitespace-nowrap shrink-0 font-medium">{{ preset.category }}</span>
                          <span aria-hidden="true">·</span>
                          <span class="truncate font-mono">{{ preset.subtitle }}</span>
                        </div>
                        <p class="text-sm font-semibold truncate mt-0.5">{{ preset.title }}</p>
                      </div>
                      <button
                        type="button"
                        (click)="playPreset(preset)"
                        [disabled]="hub.busyAction() === 'play-url'"
                        class="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <mat-icon class="!text-base !w-4 !h-4 leading-none">cast</mat-icon>
                        <span>Transmitir</span>
                      </button>
                    </div>
                  }
                </div>
              </div>
            </div>

            <!-- Custom URL Form -->
            <form [formGroup]="playForm" (ngSubmit)="submitCustomUrl()" class="mt-6 pt-4 border-t"
                  [class.border-slate-100]="!hub.darkMode()"
                  [class.border-slate-800]="hub.darkMode()">
              <label for="play-url-input" class="block text-xs font-semibold mb-2">
                Reproducir desde URL personalizada (HTTP / HTTPS)
              </label>
              <div class="flex flex-col sm:flex-row gap-2.5">
                <input
                  id="play-url-input"
                  type="url"
                  formControlName="url"
                  placeholder="https://ejemplo.com/stream.mp3"
                  class="flex-1 rounded-xl border px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  [class.bg-slate-50]="!hub.darkMode()"
                  [class.border-slate-200]="!hub.darkMode()"
                  [class.bg-slate-800]="hub.darkMode()"
                  [class.border-slate-700]="hub.darkMode()"
                />
                <button
                  type="submit"
                  [disabled]="hub.busyAction() === 'play-url'"
                  class="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <mat-icon class="!text-base !w-4 !h-4 leading-none">play_circle</mat-icon>
                  <span>Reproducir URL</span>
                </button>
              </div>
              @if (urlError()) {
                <p class="mt-1.5 text-xs text-rose-600 font-medium">{{ urlError() }}</p>
              }
            </form>
          </section>

          <!-- Column 2: Text-to-Speech (TTS) & Phrase History -->
          <section
            class="rounded-2xl border p-6 flex flex-col justify-between transition-colors"
            [class.bg-white]="!hub.darkMode()"
            [class.border-slate-200]="!hub.darkMode()"
            [class.bg-slate-900]="hub.darkMode()"
            [class.border-slate-800]="hub.darkMode()"
          >
            <div>
              <div class="flex items-center justify-between pb-4 border-b"
                   [class.border-slate-100]="!hub.darkMode()"
                   [class.border-slate-800]="hub.darkMode()">
                <div>
                  <h3 class="text-lg font-bold font-display">Consola de Voz (Text-to-Speech)</h3>
                  <p class="text-xs mt-0.5"
                     [class.text-slate-500]="!hub.darkMode()"
                     [class.text-slate-400]="hub.darkMode()">
                    Genera anuncios hablados con gTTS y envíalos por la red local al altavoz
                  </p>
                </div>
                <mat-icon class="text-blue-600">record_voice_over</mat-icon>
              </div>

              <!-- TTS Form -->
              <form [formGroup]="ttsForm" (ngSubmit)="submitTts()" class="mt-4 space-y-3">
                <div>
                  <label for="say-text-input" class="block text-xs font-semibold mb-1.5">
                    Mensaje para pronunciar en {{ device.name }}
                  </label>
                  <input
                    id="say-text-input"
                    type="text"
                    formControlName="text"
                    placeholder="Ej. Hola, la cena está lista o Paciente al consultorio 1"
                    class="w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    [class.bg-slate-50]="!hub.darkMode()"
                    [class.border-slate-200]="!hub.darkMode()"
                    [class.bg-slate-800]="hub.darkMode()"
                    [class.border-slate-700]="hub.darkMode()"
                  />
                  @if (ttsError()) {
                    <p class="mt-1 text-xs text-rose-600 font-medium">{{ ttsError() }}</p>
                  }
                </div>

                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div class="flex items-center gap-2">
                    <label for="say-lang-select" class="text-xs font-medium"
                           [class.text-slate-600]="!hub.darkMode()"
                           [class.text-slate-300]="hub.darkMode()">
                      Idioma:
                    </label>
                    <select
                      id="say-lang-select"
                      formControlName="lang"
                      class="rounded-xl border px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600"
                      [class.bg-slate-50]="!hub.darkMode()"
                      [class.border-slate-200]="!hub.darkMode()"
                      [class.bg-slate-800]="hub.darkMode()"
                      [class.border-slate-700]="hub.darkMode()"
                    >
                      <option value="es">Español (es)</option>
                      <option value="en">English (en)</option>
                      <option value="pt">Português (pt)</option>
                    </select>
                  </div>

                  <label class="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-rose-600 dark:text-rose-400">
                    <input
                      type="checkbox"
                      formControlName="urgent"
                      class="accent-rose-600"
                    />
                    <span>Urgente (Salta No Molestar)</span>
                  </label>

                  <button
                    type="submit"
                    [disabled]="hub.busyAction() === 'say'"
                    class="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <mat-icon class="!text-base !w-4 !h-4 leading-none">campaign</mat-icon>
                    <span>Decir en altavoz</span>
                  </button>
                </div>
              </form>

              <!-- TTS History & Favorites Filter -->
              <div class="mt-6 pt-4 border-t"
                   [class.border-slate-100]="!hub.darkMode()"
                   [class.border-slate-800]="hub.darkMode()">
                <div class="flex items-center justify-between gap-2 mb-3">
                  <span class="text-xs font-semibold"
                        [class.text-slate-600]="!hub.darkMode()"
                        [class.text-slate-300]="hub.darkMode()">
                    Biblioteca de frases ({{ filteredTts().length }})
                  </span>

                  <!-- Interactive Filter Segmented Control -->
                  <div class="flex items-center gap-1 p-1 rounded-lg"
                       [class.bg-slate-100]="!hub.darkMode()"
                       [class.bg-slate-800]="hub.darkMode()">
                    <button
                      type="button"
                      (click)="ttsFilter.set('all')"
                      class="px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      [class.bg-white]="ttsFilter() === 'all' && !hub.darkMode()"
                      [class.text-slate-900]="ttsFilter() === 'all' && !hub.darkMode()"
                      [class.shadow-xs]="ttsFilter() === 'all'"
                      [class.bg-slate-700]="ttsFilter() === 'all' && hub.darkMode()"
                      [class.text-white]="ttsFilter() === 'all' && hub.darkMode()"
                      [class.text-slate-500]="ttsFilter() !== 'all'"
                    >
                      Recientes
                    </button>
                    <button
                      type="button"
                      (click)="ttsFilter.set('favorites')"
                      class="px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      [class.bg-white]="ttsFilter() === 'favorites' && !hub.darkMode()"
                      [class.text-slate-900]="ttsFilter() === 'favorites' && !hub.darkMode()"
                      [class.shadow-xs]="ttsFilter() === 'favorites'"
                      [class.bg-slate-700]="ttsFilter() === 'favorites' && hub.darkMode()"
                      [class.text-white]="ttsFilter() === 'favorites' && hub.darkMode()"
                      [class.text-slate-500]="ttsFilter() !== 'favorites'"
                    >
                      Favoritas ({{ hub.favoriteTts().length }})
                    </button>
                  </div>
                </div>

                @if (filteredTts().length === 0) {
                  <p class="py-6 text-center text-xs"
                     [class.text-slate-500]="!hub.darkMode()"
                     [class.text-slate-400]="hub.darkMode()">
                    No hay frases guardadas en esta vista. Envía un mensaje de voz o marca una frase con estrella.
                  </p>
                } @else {
                  <div class="divide-y max-h-56 overflow-y-auto pr-1"
                       [class.divide-slate-100]="!hub.darkMode()"
                       [class.divide-slate-800]="hub.darkMode()">
                    @for (item of filteredTts(); track item.id) {
                      <div class="py-2.5 flex items-center justify-between gap-2">
                        <div class="min-w-0 flex-1">
                          <p class="text-xs font-medium truncate" [title]="item.text">
                            "{{ item.text }}"
                          </p>
                          <div class="flex items-center gap-1.5 text-[11px]"
                               [class.text-slate-500]="!hub.darkMode()"
                               [class.text-slate-400]="hub.darkMode()">
                            <span class="uppercase font-mono">{{ item.lang }}</span>
                            <span aria-hidden="true">·</span>
                            <span>{{ item.favorite ? 'Favorita' : 'Historial' }}</span>
                          </div>
                        </div>

                        <div class="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            (click)="replayPhrase(item)"
                            [attr.aria-label]="'Repetir frase ' + item.text"
                            title="Reproducir en altavoz"
                            class="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
                            [class.border-slate-200]="!hub.darkMode()"
                            [class.hover:bg-slate-100]="!hub.darkMode()"
                            [class.border-slate-700]="hub.darkMode()"
                            [class.hover:bg-slate-800]="hub.darkMode()"
                          >
                            <mat-icon class="!text-sm !w-3.5 !h-3.5 leading-none text-blue-600">volume_up</mat-icon>
                            <span>Decir</span>
                          </button>

                          <button
                            type="button"
                            (click)="hub.toggleFavoritePhrase(item.id)"
                            [attr.aria-label]="item.favorite ? 'Quitar de favoritas ' + item.text : 'Guardar en favoritas ' + item.text"
                            title="Alternar favorito"
                            class="p-1.5 rounded-lg transition-colors cursor-pointer"
                            [class.text-amber-500]="item.favorite"
                            [class.text-slate-400]="!item.favorite"
                          >
                            <mat-icon class="!text-base !w-4 !h-4 leading-none">
                              {{ item.favorite ? 'star' : 'star_border' }}
                            </mat-icon>
                          </button>
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>
            </div>
          </section>
        </div>
      </div>
    } @else {
      <!-- Empty State when no device is selected -->
      <section
        class="rounded-2xl border p-12 text-center"
        [class.bg-white]="!hub.darkMode()"
        [class.border-slate-200]="!hub.darkMode()"
        [class.bg-slate-900]="hub.darkMode()"
        [class.border-slate-800]="hub.darkMode()"
      >
        <mat-icon class="!text-4xl !w-10 !h-10 text-blue-600 mx-auto mb-3">speaker_group</mat-icon>
        <h2 class="text-xl font-bold font-display">Ningún altavoz Google Home Mini seleccionado</h2>
        <p class="mt-2 text-sm max-w-md mx-auto"
           [class.text-slate-600]="!hub.darkMode()"
           [class.text-slate-400]="hub.darkMode()">
          Pulsa en <strong>Buscar dispositivos</strong> en el panel lateral para descubrir tus altavoces mediante mDNS o ingresa su dirección IP local.
        </p>
        <div class="mt-6">
          <button
            type="button"
            (click)="hub.discoverDevices()"
            class="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <mat-icon class="!text-base !w-4 !h-4 leading-none">radar</mat-icon>
            <span>Buscar dispositivos ahora</span>
          </button>
        </div>
      </section>
    }
  `,
})
export class ControlPanel implements OnInit, OnDestroy {
  readonly hub = inject(CastHubService);
  readonly automation = inject(AutomationService);
  private readonly platformId = inject(PLATFORM_ID);
  private statusTimer: ReturnType<typeof setInterval> | null = null;

  readonly draggingVolume = signal<boolean>(false);
  readonly pendingVolume = signal<number>(45);
  readonly urlError = signal<string | null>(null);
  readonly ttsError = signal<string | null>(null);
  readonly ttsFilter = signal<'all' | 'favorites'>('all');

  readonly filteredTts = computed(() => {
    const list = this.hub.ttsHistory();
    return this.ttsFilter() === 'favorites' ? list.filter((i) => i.favorite) : list;
  });

  readonly playForm = new FormGroup({
    url: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  readonly ttsForm = new FormGroup({
    text: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    lang: new FormControl<'es' | 'en' | 'pt'>('es', { nonNullable: true }),
    urgent: new FormControl<boolean>(false, { nonNullable: true }),
  });

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.statusTimer = setInterval(() => {
        if (!this.draggingVolume() && this.hub.selectedDeviceId()) {
          this.hub.refreshStatus();
        }
      }, 3000);
    }
  }

  ngOnDestroy(): void {
    if (this.statusTimer) {
      clearInterval(this.statusTimer);
    }
  }

  onVolumeInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.draggingVolume.set(true);
    this.pendingVolume.set(Number(target.value));
  }

  async onVolumeCommit(event: Event): Promise<void> {
    const target = event.target as HTMLInputElement;
    const val = Number(target.value);
    try {
      await this.hub.setVolume(val);
    } finally {
      this.draggingVolume.set(false);
    }
  }

  async playPreset(preset: AudioPreset): Promise<void> {
    this.urlError.set(null);
    await this.hub.playStreamUrl(preset.url, preset.title);
  }

  async submitCustomUrl(): Promise<void> {
    const rawUrl = this.playForm.controls.url.value.trim();
    if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
      this.urlError.set('Ingresa una URL http:// o https:// válida (mp3, aac, radio en streaming).');
      return;
    }
    this.urlError.set(null);
    await this.hub.playStreamUrl(rawUrl);
  }

  async submitTts(): Promise<void> {
    const text = this.ttsForm.controls.text.value.trim();
    const lang = this.ttsForm.controls.lang.value;
    const urgent = this.ttsForm.controls.urgent.value;

    if (!text) {
      this.ttsError.set('Escribe la frase que deseas pronunciar en el altavoz.');
      return;
    }

    if (this.automation.isDndActive() && !urgent) {
      this.ttsError.set(
        'El modo No Molestar está activo. Marca la casilla "Urgente" si necesitas que el altavoz lo reproduzca ahora.'
      );
      return;
    }

    this.ttsError.set(null);
    const ok = await this.hub.speakText(text, lang);
    if (ok) {
      this.ttsForm.controls.text.setValue('');
      this.ttsForm.controls.urgent.setValue(false);
    }
  }

  async replayPhrase(item: TtsEntry): Promise<void> {
    await this.hub.speakText(item.text, item.lang);
  }

  async confirmRemoveDevice(device: { id: string; name: string }): Promise<void> {
    const confirmed = window.confirm(
      `¿Estás seguro de que deseas quitar "${device.name}" de la lista de altavoces?`
    );
    if (confirmed) {
      await this.hub.removeDevice(device.id);
    }
  }
}
