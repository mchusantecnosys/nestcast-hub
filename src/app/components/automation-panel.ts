import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  computed,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AutomationService } from '../services/automation.service';
import { CastHubService } from '../services/cast-hub';
import {
  Routine,
  RoutineAction,
  DayOfWeek,
  ActionType,
  ActiveTimer,
  DndConfig,
} from '../models/scheduler.models';
import {
  DAY_KEYS,
  formatTimeRemaining,
  validateRoutine,
  validateTimerInput,
} from '../../utils/scheduler-logic';

@Component({
  selector: 'app-automation-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MatIconModule],
  template: `
    <div class="space-y-8 animate-fade-in">
      <!-- Sección 1: Modo "No Molestar" (DND) -->
      <section
        class="rounded-2xl border p-6 transition-all duration-200"
        [class.bg-white]="!hub.darkMode()"
        [class.border-slate-200]="!hub.darkMode()"
        [class.shadow-sm]="!hub.darkMode()"
        [class.bg-slate-900]="hub.darkMode()"
        [class.border-slate-800]="hub.darkMode()"
      >
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5"
          [class.border-slate-100]="!hub.darkMode()"
          [class.border-slate-800]="hub.darkMode()"
        >
          <div class="flex items-center gap-3">
            <div
              class="w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
              [class.bg-indigo-50]="!hub.darkMode() && !automation.isDndActive()"
              [class.text-indigo-600]="!hub.darkMode() && !automation.isDndActive()"
              [class.bg-indigo-950]="hub.darkMode() && !automation.isDndActive()"
              [class.text-indigo-400]="hub.darkMode() && !automation.isDndActive()"
              [class.bg-amber-500]="automation.isDndActive()"
              [class.text-white]="automation.isDndActive()"
            >
              <mat-icon>{{ automation.isDndActive() ? 'bedtime' : 'nights_stay' }}</mat-icon>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h2 class="text-base font-semibold tracking-tight">Modo No Molestar (DND)</h2>
                @if (automation.isDndActive()) {
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 animate-pulse">
                    <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    Activo Ahora (Tope {{ automation.dndConfig().maxVolume }}%)
                  </span>
                } @else if (automation.dndConfig().enabled) {
                  <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    Programado ({{ automation.dndConfig().startTime }} - {{ automation.dndConfig().endTime }})
                  </span>
                } @else {
                  <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    Desactivado
                  </span>
                }
              </div>
              <p class="text-xs mt-0.5 text-slate-500 dark:text-slate-400">
                Limita automáticamente el volumen máximo de todos los altavoces y bloquea frases TTS no urgentes.
              </p>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <button
              type="button"
              (click)="toggleDndEnabled()"
              class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
              [class.bg-indigo-600]="automation.dndConfig().enabled"
              [class.bg-slate-200]="!automation.dndConfig().enabled && !hub.darkMode()"
              [class.bg-slate-700]="!automation.dndConfig().enabled && hub.darkMode()"
              role="switch"
              [attr.aria-checked]="automation.dndConfig().enabled"
            >
              <span
                class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
                [class.translate-x-5]="automation.dndConfig().enabled"
                [class.translate-x-0]="!automation.dndConfig().enabled"
              ></span>
            </button>
            <span class="text-xs font-medium">
              {{ automation.dndConfig().enabled ? 'Habilitado' : 'Deshabilitado' }}
            </span>
          </div>
        </div>

        <!-- Formulario de configuración DND -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-5 mt-5">
          <div>
            <label class="block text-xs font-medium mb-1.5 text-slate-700 dark:text-slate-300">
              Hora de Inicio (Franja nocturna)
            </label>
            <input
              type="time"
              [ngModel]="dndForm.startTime"
              (ngModelChange)="dndForm.startTime = $event"
              class="w-full px-3 py-2 text-sm rounded-xl border transition-colors outline-none focus:ring-2 focus:ring-indigo-500"
              [class.bg-slate-50]="!hub.darkMode()"
              [class.border-slate-300]="!hub.darkMode()"
              [class.bg-slate-800]="hub.darkMode()"
              [class.border-slate-700]="hub.darkMode()"
            />
          </div>

          <div>
            <label class="block text-xs font-medium mb-1.5 text-slate-700 dark:text-slate-300">
              Hora de Fin (Reanudación)
            </label>
            <input
              type="time"
              [ngModel]="dndForm.endTime"
              (ngModelChange)="dndForm.endTime = $event"
              class="w-full px-3 py-2 text-sm rounded-xl border transition-colors outline-none focus:ring-2 focus:ring-indigo-500"
              [class.bg-slate-50]="!hub.darkMode()"
              [class.border-slate-300]="!hub.darkMode()"
              [class.bg-slate-800]="hub.darkMode()"
              [class.border-slate-700]="hub.darkMode()"
            />
          </div>

          <div>
            <div class="flex justify-between items-center mb-1.5">
              <label class="text-xs font-medium text-slate-700 dark:text-slate-300">
                Volumen Máximo Permitido
              </label>
              <span class="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                {{ dndForm.maxVolume }}%
              </span>
            </div>
            <input
              type="range"
              min="5"
              max="60"
              step="5"
              [ngModel]="dndForm.maxVolume"
              (ngModelChange)="dndForm.maxVolume = +$event"
              class="w-full accent-indigo-600 cursor-pointer"
            />
          </div>
        </div>

        <div class="flex justify-end gap-3 mt-4 pt-3 border-t"
          [class.border-slate-100]="!hub.darkMode()"
          [class.border-slate-800]="hub.darkMode()"
        >
          <button
            type="button"
            (click)="saveDndSettings()"
            class="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors cursor-pointer inline-flex items-center gap-1.5"
          >
            <mat-icon class="!w-4 !h-4 !text-base leading-none">save</mat-icon>
            <span>Guardar Configuración DND</span>
          </button>
        </div>
      </section>

      <!-- Sección 2: Temporizadores y Cuenta Regresiva Hablada -->
      <section
        class="rounded-2xl border p-6 transition-all duration-200"
        [class.bg-white]="!hub.darkMode()"
        [class.border-slate-200]="!hub.darkMode()"
        [class.shadow-sm]="!hub.darkMode()"
        [class.bg-slate-900]="hub.darkMode()"
        [class.border-slate-800]="hub.darkMode()"
      >
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5"
          [class.border-slate-100]="!hub.darkMode()"
          [class.border-slate-800]="hub.darkMode()"
        >
          <div class="flex items-center gap-3">
            <div
              class="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
            >
              <mat-icon>hourglass_top</mat-icon>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h2 class="text-base font-semibold tracking-tight">Temporizadores de Procedimientos</h2>
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  {{ automation.activeTimers().length }} / 10 activos
                </span>
              </div>
              <p class="text-xs mt-0.5 text-slate-500 dark:text-slate-400">
                Cuentas regresivas en servidor con avisos hablados por voz (sin pitidos) en puntos clave.
              </p>
            </div>
          </div>

          <button
            type="button"
            (click)="openNewTimerModal()"
            [disabled]="automation.activeTimers().length >= 10"
            class="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 cursor-pointer self-start sm:self-auto"
          >
            <mat-icon class="!w-4 !h-4 !text-base leading-none">add</mat-icon>
            <span>Nuevo Temporizador</span>
          </button>
        </div>

        <!-- Lista de Temporizadores Activos -->
        <div class="mt-5">
          @if (automation.activeTimers().length === 0) {
            <div class="py-8 text-center text-slate-400 dark:text-slate-500 border border-dashed rounded-xl border-slate-200 dark:border-slate-800">
              <mat-icon class="!w-8 !h-8 !text-3xl opacity-50 mb-1">alarm_off</mat-icon>
              <p class="text-sm">No hay temporizadores en curso.</p>
              <p class="text-xs text-slate-400 mt-1">Inicia uno para blanqueamientos, curaciones o alarmas clínicas.</p>
            </div>
          } @else {
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              @for (timer of automation.activeTimers(); track timer.id) {
                <div
                  class="rounded-xl border p-4 transition-all relative overflow-hidden"
                  [class.bg-slate-50]="!hub.darkMode()"
                  [class.border-slate-200]="!hub.darkMode()"
                  [class.bg-slate-800]="hub.darkMode()"
                  [class.border-slate-700]="hub.darkMode()"
                >
                  <!-- Indicador de barra de progreso superior -->
                  <div
                    class="absolute top-0 left-0 h-1 bg-emerald-500 transition-all duration-1000"
                    [style.width.%]="getTimerProgressPercent(timer)"
                  ></div>

                  <div class="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <span class="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                        <mat-icon class="!w-3.5 !h-3.5 !text-sm leading-none">speaker</mat-icon>
                        {{ timer.targetDeviceName || 'Altavoz' }}
                      </span>
                      <h3 class="text-sm font-bold tracking-tight text-slate-900 dark:text-white mt-0.5 line-clamp-1">
                        {{ timer.label }}
                      </h3>
                    </div>

                    <button
                      type="button"
                      (click)="cancelTimer(timer.id)"
                      class="text-slate-400 hover:text-rose-600 transition-colors p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                      title="Detener y descartar temporizador"
                    >
                      <mat-icon class="!w-4 !h-4 !text-base leading-none">close</mat-icon>
                    </button>
                  </div>

                  <!-- Cuenta regresiva grande -->
                  <div class="flex items-baseline justify-between my-3">
                    <span class="text-3xl font-extrabold font-mono tracking-tight text-slate-900 dark:text-white">
                      {{ getFormattedRemaining(timer) }}
                    </span>
                    <span class="text-xs text-slate-500 dark:text-slate-400">
                      Total: {{ timer.durationMinutes }} min
                    </span>
                  </div>

                  <!-- Puntos de aviso -->
                  <div class="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>Avisos de voz:</span>
                    @if (timer.alertPoints.length === 0) {
                      <span class="font-medium">Solo al terminar</span>
                    } @else {
                      @for (p of timer.alertPoints; track p) {
                        <span
                          class="px-1.5 py-0.5 rounded text-[10px] font-mono"
                          [class.bg-emerald-100]="timer.alertsFired.includes(p)"
                          [class.text-emerald-800]="timer.alertsFired.includes(p)"
                          [class.dark:bg-emerald-950]="timer.alertsFired.includes(p)"
                          [class.dark:text-emerald-300]="timer.alertsFired.includes(p)"
                          [class.bg-slate-200]="!timer.alertsFired.includes(p)"
                          [class.dark:bg-slate-700]="!timer.alertsFired.includes(p)"
                        >
                          {{ p }}m {{ timer.alertsFired.includes(p) ? '✓' : '' }}
                        </span>
                      }
                      <span class="font-mono text-[10px]">0m (fin)</span>
                    }
                  </div>
                </div>
              }
            </div>
          }
        </div>
      </section>

      <!-- Sección 3: Programador de Rutinas Recurrentes -->
      <section
        class="rounded-2xl border p-6 transition-all duration-200"
        [class.bg-white]="!hub.darkMode()"
        [class.border-slate-200]="!hub.darkMode()"
        [class.shadow-sm]="!hub.darkMode()"
        [class.bg-slate-900]="hub.darkMode()"
        [class.border-slate-800]="hub.darkMode()"
      >
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5"
          [class.border-slate-100]="!hub.darkMode()"
          [class.border-slate-800]="hub.darkMode()"
        >
          <div class="flex items-center gap-3">
            <div
              class="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
            >
              <mat-icon>schedule</mat-icon>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h2 class="text-base font-semibold tracking-tight">Rutinas y Campanas Automáticas</h2>
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                  {{ automation.routines().length }} configuradas
                </span>
              </div>
              <p class="text-xs mt-0.5 text-slate-500 dark:text-slate-400">
                Secuencias de acciones recurrentes ejecutadas autónomamente desde el servidor.
              </p>
            </div>
          </div>

          <button
            type="button"
            (click)="openNewRoutineModal()"
            class="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors cursor-pointer self-start sm:self-auto"
          >
            <mat-icon class="!w-4 !h-4 !text-base leading-none">add</mat-icon>
            <span>Nueva Rutina</span>
          </button>
        </div>

        <!-- Lista de Rutinas -->
        <div class="mt-5 space-y-4">
          @if (automation.routines().length === 0) {
            <div class="py-10 text-center text-slate-400 dark:text-slate-500 border border-dashed rounded-xl border-slate-200 dark:border-slate-800">
              <mat-icon class="!w-10 !h-10 !text-4xl opacity-50 mb-2">event_busy</mat-icon>
              <p class="text-sm font-medium">No hay rutinas creadas todavía.</p>
              <p class="text-xs text-slate-400 mt-1">Crea despertadores, avisos de cierre o cambios de ambiente.</p>
            </div>
          } @else {
            @for (routine of automation.routines(); track routine.id) {
              <div
                class="rounded-xl border p-4 sm:p-5 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                [class.bg-slate-50]="!hub.darkMode()"
                [class.border-slate-200]="!hub.darkMode()"
                [class.bg-slate-800]="hub.darkMode()"
                [class.border-slate-700]="hub.darkMode()"
                [class.opacity-70]="!routine.enabled"
              >
                <!-- Información principal -->
                <div class="space-y-2 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-2xl font-black font-mono tracking-tight text-blue-600 dark:text-blue-400">
                      {{ routine.time }}
                    </span>
                    <h3 class="text-base font-bold text-slate-900 dark:text-white">
                      {{ routine.name }}
                    </h3>
                    @if (!routine.enabled) {
                      <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                        Pausada
                      </span>
                    } @else if (routine.nextRunAt) {
                      <span class="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                        Próxima: {{ formatNextDate(routine.nextRunAt) }}
                      </span>
                    }
                  </div>

                  <!-- Días activos -->
                  <div class="flex items-center gap-1.5 flex-wrap">
                    @for (day of daysOfWeekList; track day.key) {
                      <span
                        class="w-6 h-6 rounded-md text-[11px] font-bold flex items-center justify-center transition-colors"
                        [class.bg-blue-600]="routine.days.includes(day.key)"
                        [class.text-white]="routine.days.includes(day.key)"
                        [class.bg-slate-200]="!routine.days.includes(day.key) && !hub.darkMode()"
                        [class.text-slate-400]="!routine.days.includes(day.key) && !hub.darkMode()"
                        [class.bg-slate-700]="!routine.days.includes(day.key) && hub.darkMode()"
                        [class.text-slate-500]="!routine.days.includes(day.key) && hub.darkMode()"
                      >
                        {{ day.label }}
                      </span>
                    }
                    <span class="text-xs text-slate-400 ml-2">
                      Destino: <strong class="text-slate-700 dark:text-slate-200">{{ formatTargetSpeakers(routine.targetDeviceIds) }}</strong>
                    </span>
                  </div>

                  <!-- Resumen de acciones en secuencia -->
                  <div class="flex items-center gap-1.5 flex-wrap text-xs pt-1">
                    <span class="text-slate-400 text-[11px]">Acciones ({{ routine.actions.length }}):</span>
                    @for (act of routine.actions; track act.id; let idx = $index) {
                      <span
                        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border"
                        [class.bg-white]="!hub.darkMode()"
                        [class.border-slate-200]="!hub.darkMode()"
                        [class.bg-slate-900]="hub.darkMode()"
                        [class.border-slate-700]="hub.darkMode()"
                      >
                        <mat-icon class="!w-3 !h-3 !text-xs leading-none text-blue-500">
                          {{ getActionIcon(act.type) }}
                        </mat-icon>
                        <span>{{ formatActionSummary(act) }}</span>
                        @if (act.type === 'tts' && act.urgent) {
                          <span class="text-[9px] font-bold text-rose-500 ml-0.5">Urgente</span>
                        }
                      </span>
                      @if (idx < routine.actions.length - 1) {
                        <span class="text-slate-400 text-[10px]">→</span>
                      }
                    }
                  </div>
                </div>

                <!-- Botones de control -->
                <div class="flex items-center gap-2 self-end md:self-center shrink-0">
                  <button
                    type="button"
                    (click)="toggleRoutine(routine)"
                    class="px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors cursor-pointer"
                    [class.bg-white]="!hub.darkMode()"
                    [class.border-slate-300]="!hub.darkMode()"
                    [class.hover:bg-slate-100]="!hub.darkMode()"
                    [class.bg-slate-700]="hub.darkMode()"
                    [class.border-slate-600]="hub.darkMode()"
                    [class.hover:bg-slate-600]="hub.darkMode()"
                  >
                    {{ routine.enabled ? 'Pausar' : 'Activar' }}
                  </button>

                  <button
                    type="button"
                    (click)="openEditRoutineModal(routine)"
                    class="px-3 py-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors cursor-pointer"
                  >
                    Editar
                  </button>

                  <button
                    type="button"
                    (click)="confirmDeleteRoutine(routine)"
                    class="p-1.5 text-slate-400 hover:text-rose-600 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                    title="Eliminar rutina"
                  >
                    <mat-icon class="!w-4 !h-4 !text-base leading-none">delete</mat-icon>
                  </button>
                </div>
              </div>
            }
          }
        </div>
      </section>

      <!-- Sección 4: Historial de Ejecuciones y Centro de Notificaciones -->
      <section
        class="rounded-2xl border p-6 transition-all duration-200"
        [class.bg-white]="!hub.darkMode()"
        [class.border-slate-200]="!hub.darkMode()"
        [class.shadow-sm]="!hub.darkMode()"
        [class.bg-slate-900]="hub.darkMode()"
        [class.border-slate-800]="hub.darkMode()"
      >
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4"
          [class.border-slate-100]="!hub.darkMode()"
          [class.border-slate-800]="hub.darkMode()"
        >
          <div class="flex items-center gap-3">
            <button
              type="button"
              (click)="activeSubTab.set('history')"
              class="text-sm font-bold pb-2 border-b-2 transition-colors cursor-pointer"
              [class.border-blue-600]="activeSubTab() === 'history'"
              [class.text-blue-600]="activeSubTab() === 'history'"
              [class.border-transparent]="activeSubTab() !== 'history'"
              [class.text-slate-500]="activeSubTab() !== 'history'"
            >
              Historial de Ejecuciones ({{ automation.history().length }})
            </button>
            <button
              type="button"
              (click)="activeSubTab.set('notifications')"
              class="text-sm font-bold pb-2 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5"
              [class.border-blue-600]="activeSubTab() === 'notifications'"
              [class.text-blue-600]="activeSubTab() === 'notifications'"
              [class.border-transparent]="activeSubTab() !== 'notifications'"
              [class.text-slate-500]="activeSubTab() !== 'notifications'"
            >
              <span>Notificaciones de Fallo</span>
              @if (automation.unreadErrorsCount() > 0) {
                <span class="w-4 h-4 rounded-full text-[10px] font-extrabold bg-rose-500 text-white flex items-center justify-center">
                  {{ automation.unreadErrorsCount() }}
                </span>
              }
            </button>
          </div>

          @if (activeSubTab() === 'history' && automation.history().length > 0) {
            <button
              type="button"
              (click)="clearAllHistory()"
              class="text-xs text-rose-600 hover:text-rose-700 font-semibold cursor-pointer"
            >
              Vaciar Historial Completo
            </button>
          } @else if (activeSubTab() === 'notifications' && automation.notifications().length > 0) {
            <button
              type="button"
              (click)="clearAllNotifications()"
              class="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-semibold cursor-pointer"
            >
              Descartar Todas
            </button>
          }
        </div>

        <div class="mt-4">
          @if (activeSubTab() === 'history') {
            @if (automation.history().length === 0) {
              <p class="text-xs text-slate-400 py-6 text-center">No hay registros de ejecuciones aún.</p>
            } @else {
              <div class="divide-y divide-slate-100 dark:divide-slate-800 max-h-96 overflow-y-auto">
                @for (entry of automation.history(); track entry.id) {
                  <div class="py-3 flex items-start justify-between gap-3 text-xs">
                    <div class="space-y-0.5">
                      <div class="flex items-center gap-2">
                        <span
                          class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase"
                          [class.bg-emerald-100]="entry.status === 'success'"
                          [class.text-emerald-800]="entry.status === 'success'"
                          [class.bg-amber-100]="entry.status === 'partial'"
                          [class.text-amber-800]="entry.status === 'partial'"
                          [class.bg-rose-100]="entry.status === 'failed'"
                          [class.text-rose-800]="entry.status === 'failed'"
                        >
                          {{ entry.status }}
                        </span>
                        <strong class="text-slate-800 dark:text-slate-200">{{ entry.routineName }}</strong>
                        <span class="text-slate-400 text-[11px]">{{ formatTimestamp(entry.executedAt) }}</span>
                      </div>
                      <p class="text-slate-500 dark:text-slate-400 text-[11px] line-clamp-2">
                        {{ entry.details }}
                      </p>
                    </div>

                    <button
                      type="button"
                      (click)="deleteHistoryItem(entry.id)"
                      class="text-slate-400 hover:text-rose-600 transition-colors p-1"
                      title="Eliminar registro"
                    >
                      <mat-icon class="!w-3.5 !h-3.5 !text-sm leading-none">delete</mat-icon>
                    </button>
                  </div>
                }
              </div>
            }
          } @else {
            @if (automation.notifications().length === 0) {
              <p class="text-xs text-slate-400 py-6 text-center">No hay notificaciones de error registradas.</p>
            } @else {
              <div class="space-y-3">
                @for (notif of automation.notifications(); track notif.id) {
                  <div
                    class="p-3.5 rounded-xl border flex items-start justify-between gap-3 transition-colors"
                    [class.bg-rose-50]="!hub.darkMode() && !notif.read"
                    [class.border-rose-200]="!hub.darkMode() && !notif.read"
                    [class.bg-rose-950/40]="hub.darkMode() && !notif.read"
                    [class.border-rose-900/50]="hub.darkMode() && !notif.read"
                    [class.bg-slate-50]="!hub.darkMode() && notif.read"
                    [class.border-slate-200]="!hub.darkMode() && notif.read"
                    [class.bg-slate-800]="hub.darkMode() && notif.read"
                    [class.border-slate-700]="hub.darkMode() && notif.read"
                  >
                    <div>
                      <div class="flex items-center gap-2">
                        <mat-icon class="!w-4 !h-4 !text-base text-rose-500 leading-none">error_outline</mat-icon>
                        <strong class="text-xs font-bold text-slate-900 dark:text-white">{{ notif.title }}</strong>
                        <span class="text-[10px] text-slate-400">{{ formatTimestamp(notif.timestamp) }}</span>
                      </div>
                      <p class="text-xs text-slate-600 dark:text-slate-300 mt-1">{{ notif.message }}</p>
                    </div>

                    <div class="flex items-center gap-1.5 shrink-0">
                      @if (!notif.read) {
                        <button
                          type="button"
                          (click)="markNotificationRead(notif.id)"
                          class="px-2 py-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
                        >
                          Marcar leída
                        </button>
                      }
                      <button
                        type="button"
                        (click)="dismissNotification(notif.id)"
                        class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
                        title="Descartar"
                      >
                        <mat-icon class="!w-4 !h-4 !text-base leading-none">close</mat-icon>
                      </button>
                    </div>
                  </div>
                }
              </div>
            }
          }
        </div>
      </section>

      <!-- MODAL 1: Nuevo Temporizador -->
      @if (showTimerModal()) {
        <div class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            class="w-full max-w-md rounded-2xl border p-6 shadow-2xl transition-all"
            [class.bg-white]="!hub.darkMode()"
            [class.border-slate-200]="!hub.darkMode()"
            [class.bg-slate-900]="hub.darkMode()"
            [class.border-slate-800]="hub.darkMode()"
          >
            <div class="flex items-center justify-between border-b pb-4 mb-4"
              [class.border-slate-100]="!hub.darkMode()"
              [class.border-slate-800]="hub.darkMode()"
            >
              <div class="flex items-center gap-2">
                <mat-icon class="text-emerald-500">alarm_add</mat-icon>
                <h3 class="text-base font-bold">Iniciar Temporizador</h3>
              </div>
              <button
                type="button"
                (click)="showTimerModal.set(false)"
                class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <mat-icon class="!w-5 !h-5 leading-none">close</mat-icon>
              </button>
            </div>

            <div class="space-y-4">
              <div>
                <label class="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                  Altavoz Destino *
                </label>
                <select
                  [(ngModel)]="newTimerForm.targetDeviceId"
                  class="w-full px-3 py-2 text-sm rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500"
                  [class.bg-slate-50]="!hub.darkMode()"
                  [class.border-slate-300]="!hub.darkMode()"
                  [class.bg-slate-800]="hub.darkMode()"
                  [class.border-slate-700]="hub.darkMode()"
                >
                  @for (dev of hub.devices(); track dev.id) {
                    <option [value]="dev.id">{{ dev.name }} ({{ dev.model }})</option>
                  }
                </select>
              </div>

              <div>
                <label class="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                  Procedimiento o Etiqueta (máx 60 caracteres)
                </label>
                <input
                  type="text"
                  [(ngModel)]="newTimerForm.label"
                  maxlength="60"
                  placeholder="ej. Blanqueamiento Consultorio 1"
                  class="w-full px-3 py-2 text-sm rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500"
                  [class.bg-slate-50]="!hub.darkMode()"
                  [class.border-slate-300]="!hub.darkMode()"
                  [class.bg-slate-800]="hub.darkMode()"
                  [class.border-slate-700]="hub.darkMode()"
                />
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                    Duración (minutos) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="480"
                    [(ngModel)]="newTimerForm.durationMinutes"
                    class="w-full px-3 py-2 text-sm rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                    [class.bg-slate-50]="!hub.darkMode()"
                    [class.border-slate-300]="!hub.darkMode()"
                    [class.bg-slate-800]="hub.darkMode()"
                    [class.border-slate-700]="hub.darkMode()"
                  />
                </div>

                <div>
                  <label class="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                    Idioma de Voz
                  </label>
                  <select
                    [(ngModel)]="newTimerForm.lang"
                    class="w-full px-3 py-2 text-sm rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500"
                    [class.bg-slate-50]="!hub.darkMode()"
                    [class.border-slate-300]="!hub.darkMode()"
                    [class.bg-slate-800]="hub.darkMode()"
                    [class.border-slate-700]="hub.darkMode()"
                  >
                    <option value="es">Español (ES)</option>
                    <option value="en">Inglés (EN)</option>
                    <option value="pt">Portugués (PT)</option>
                  </select>
                </div>
              </div>

              <div>
                <label class="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                  Puntos de Aviso Intermedio (minutos restantes, separados por coma)
                </label>
                <input
                  type="text"
                  [(ngModel)]="newTimerForm.alertPointsStr"
                  placeholder="ej. 10, 5, 1"
                  class="w-full px-3 py-2 text-sm rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  [class.bg-slate-50]="!hub.darkMode()"
                  [class.border-slate-300]="!hub.darkMode()"
                  [class.bg-slate-800]="hub.darkMode()"
                  [class.border-slate-700]="hub.darkMode()"
                />
                <div class="flex items-center gap-1.5 mt-1.5 text-[11px] text-slate-500">
                  <span>Atajos rápidos:</span>
                  <button
                    type="button"
                    (click)="newTimerForm.alertPointsStr = '5, 1'"
                    class="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 cursor-pointer"
                  >
                    5m, 1m
                  </button>
                  <button
                    type="button"
                    (click)="newTimerForm.alertPointsStr = '10, 5, 1'"
                    class="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 cursor-pointer"
                  >
                    10m, 5m, 1m
                  </button>
                  <button
                    type="button"
                    (click)="newTimerForm.alertPointsStr = ''"
                    class="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 cursor-pointer"
                  >
                    Ninguno
                  </button>
                </div>
              </div>

              @if (timerError()) {
                <div class="p-2.5 rounded-xl text-xs bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
                  {{ timerError() }}
                </div>
              }
            </div>

            <div class="flex justify-end gap-2.5 mt-6 pt-4 border-t"
              [class.border-slate-100]="!hub.darkMode()"
              [class.border-slate-800]="hub.darkMode()"
            >
              <button
                type="button"
                (click)="showTimerModal.set(false)"
                class="px-4 py-2 text-xs font-semibold rounded-xl border transition-colors cursor-pointer"
                [class.border-slate-300]="!hub.darkMode()"
                [class.border-slate-700]="hub.darkMode()"
              >
                Cancelar
              </button>
              <button
                type="button"
                (click)="submitNewTimer()"
                class="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors cursor-pointer"
              >
                Iniciar Temporizador
              </button>
            </div>
          </div>
        </div>
      }

      <!-- MODAL 2: Constructor / Editor de Rutina -->
      @if (showRoutineModal()) {
        <div class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div
            class="w-full max-w-2xl rounded-2xl border p-6 shadow-2xl transition-all my-8 max-h-[90vh] flex flex-col"
            [class.bg-white]="!hub.darkMode()"
            [class.border-slate-200]="!hub.darkMode()"
            [class.bg-slate-900]="hub.darkMode()"
            [class.border-slate-800]="hub.darkMode()"
          >
            <div class="flex items-center justify-between border-b pb-4 mb-4 shrink-0"
              [class.border-slate-100]="!hub.darkMode()"
              [class.border-slate-800]="hub.darkMode()"
            >
              <div class="flex items-center gap-2">
                <mat-icon class="text-blue-500">playlist_add</mat-icon>
                <h3 class="text-base font-bold">
                  {{ editingRoutineId() ? 'Editar Rutina' : 'Nueva Rutina Programada' }}
                </h3>
              </div>
              <button
                type="button"
                (click)="showRoutineModal.set(false)"
                class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <mat-icon class="!w-5 !h-5 leading-none">close</mat-icon>
              </button>
            </div>

            <div class="space-y-4 overflow-y-auto flex-1 pr-1">
              <!-- Nombre y Hora -->
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div class="sm:col-span-2">
                  <label class="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                    Nombre de la Rutina *
                  </label>
                  <input
                    type="text"
                    maxlength="80"
                    [(ngModel)]="routineForm.name"
                    placeholder="ej. Campana de Inicio de Jornada"
                    class="w-full px-3 py-2 text-sm rounded-xl border outline-none focus:ring-2 focus:ring-blue-500"
                    [class.bg-slate-50]="!hub.darkMode()"
                    [class.border-slate-300]="!hub.darkMode()"
                    [class.bg-slate-800]="hub.darkMode()"
                    [class.border-slate-700]="hub.darkMode()"
                  />
                </div>
                <div>
                  <label class="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                    Hora (24h) *
                  </label>
                  <input
                    type="time"
                    [(ngModel)]="routineForm.time"
                    class="w-full px-3 py-2 text-sm rounded-xl border outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    [class.bg-slate-50]="!hub.darkMode()"
                    [class.border-slate-300]="!hub.darkMode()"
                    [class.bg-slate-800]="hub.darkMode()"
                    [class.border-slate-700]="hub.darkMode()"
                  />
                </div>
              </div>

              <!-- Días de la semana -->
              <div>
                <label class="block text-xs font-semibold mb-1.5 text-slate-700 dark:text-slate-300">
                  Días de la Semana *
                </label>
                <div class="flex items-center gap-1.5 flex-wrap">
                  @for (day of daysOfWeekList; track day.key) {
                    <button
                      type="button"
                      (click)="toggleRoutineDay(day.key)"
                      class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
                      [class.bg-blue-600]="routineForm.days.includes(day.key)"
                      [class.text-white]="routineForm.days.includes(day.key)"
                      [class.bg-slate-100]="!routineForm.days.includes(day.key) && !hub.darkMode()"
                      [class.text-slate-600]="!routineForm.days.includes(day.key) && !hub.darkMode()"
                      [class.bg-slate-800]="!routineForm.days.includes(day.key) && hub.darkMode()"
                      [class.text-slate-400]="!routineForm.days.includes(day.key) && hub.darkMode()"
                    >
                      {{ day.full }}
                    </button>
                  }
                  <button
                    type="button"
                    (click)="selectAllDays()"
                    class="px-2.5 py-1 text-xs text-blue-600 dark:text-blue-400 font-semibold underline cursor-pointer ml-1"
                  >
                    Todos
                  </button>
                </div>
              </div>

              <!-- Altavoces Destino -->
              <div>
                <label class="block text-xs font-semibold mb-1.5 text-slate-700 dark:text-slate-300">
                  Altavoces Destino *
                </label>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <label
                    class="flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer"
                    [class.border-blue-500]="routineForm.targetDeviceIds.includes('all')"
                    [class.bg-blue-50]="!hub.darkMode() && routineForm.targetDeviceIds.includes('all')"
                    [class.bg-blue-950/40]="hub.darkMode() && routineForm.targetDeviceIds.includes('all')"
                  >
                    <input
                      type="checkbox"
                      [checked]="routineForm.targetDeviceIds.includes('all')"
                      (change)="toggleTargetSpeaker('all')"
                      class="accent-blue-600"
                    />
                    <strong class="font-bold">Todos los altavoces</strong>
                  </label>

                  @for (dev of hub.devices(); track dev.id) {
                    <label
                      class="flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer truncate"
                      [class.border-blue-500]="routineForm.targetDeviceIds.includes(dev.id)"
                      [class.bg-blue-50]="!hub.darkMode() && routineForm.targetDeviceIds.includes(dev.id)"
                      [class.bg-blue-950/40]="hub.darkMode() && routineForm.targetDeviceIds.includes(dev.id)"
                    >
                      <input
                        type="checkbox"
                        [checked]="routineForm.targetDeviceIds.includes(dev.id)"
                        (change)="toggleTargetSpeaker(dev.id)"
                        [disabled]="routineForm.targetDeviceIds.includes('all')"
                        class="accent-blue-600"
                      />
                      <span class="truncate">{{ dev.name }}</span>
                    </label>
                  }
                </div>
              </div>

              <!-- Constructor de Secuencia de Acciones (1 a 10) -->
              <div class="border-t pt-4"
                [class.border-slate-100]="!hub.darkMode()"
                [class.border-slate-800]="hub.darkMode()"
              >
                <div class="flex items-center justify-between mb-3">
                  <label class="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Secuencia de Acciones ({{ routineForm.actions.length }}/10)
                  </label>
                  <button
                    type="button"
                    (click)="addRoutineAction()"
                    [disabled]="routineForm.actions.length >= 10"
                    class="px-2.5 py-1 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 cursor-pointer inline-flex items-center gap-1"
                  >
                    <mat-icon class="!w-3.5 !h-3.5 !text-sm leading-none">add</mat-icon>
                    <span>Añadir Acción</span>
                  </button>
                </div>

                <div class="space-y-3">
                  @for (act of routineForm.actions; track act.id; let idx = $index) {
                    <div
                      class="p-3.5 rounded-xl border transition-all space-y-2.5"
                      [class.bg-slate-50]="!hub.darkMode()"
                      [class.border-slate-200]="!hub.darkMode()"
                      [class.bg-slate-800/80]="hub.darkMode()"
                      [class.border-slate-700]="hub.darkMode()"
                    >
                      <div class="flex items-center justify-between gap-2">
                        <div class="flex items-center gap-2">
                          <span class="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
                            {{ idx + 1 }}
                          </span>
                          <select
                            [(ngModel)]="act.type"
                            class="px-2.5 py-1 text-xs font-semibold rounded-lg border outline-none"
                            [class.bg-white]="!hub.darkMode()"
                            [class.border-slate-300]="!hub.darkMode()"
                            [class.bg-slate-900]="hub.darkMode()"
                            [class.border-slate-700]="hub.darkMode()"
                          >
                            <option value="tts">Voz TTS (Hablar)</option>
                            <option value="play_url">Reproducir Audio / Radio</option>
                            <option value="set_volume">Ajustar Volumen</option>
                            <option value="delay">Pausa / Espera</option>
                            <option value="mute">Silencio (Mute)</option>
                            <option value="media_control">Control (Stop / Pausa)</option>
                          </select>
                        </div>

                        <div class="flex items-center gap-1">
                          <button
                            type="button"
                            (click)="moveActionUp(idx)"
                            [disabled]="idx === 0"
                            class="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-20 cursor-pointer"
                            title="Mover arriba"
                          >
                            <mat-icon class="!w-3.5 !h-3.5 !text-sm leading-none">arrow_upward</mat-icon>
                          </button>
                          <button
                            type="button"
                            (click)="moveActionDown(idx)"
                            [disabled]="idx === routineForm.actions.length - 1"
                            class="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-20 cursor-pointer"
                            title="Mover abajo"
                          >
                            <mat-icon class="!w-3.5 !h-3.5 !text-sm leading-none">arrow_downward</mat-icon>
                          </button>
                          <button
                            type="button"
                            (click)="removeRoutineAction(idx)"
                            [disabled]="routineForm.actions.length <= 1"
                            class="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-20 cursor-pointer"
                            title="Eliminar acción"
                          >
                            <mat-icon class="!w-4 !h-4 !text-base leading-none">delete_outline</mat-icon>
                          </button>
                        </div>
                      </div>

                      <!-- Campos específicos según tipo -->
                      @if (act.type === 'tts') {
                        <div class="space-y-2">
                          <input
                            type="text"
                            [(ngModel)]="act.text"
                            placeholder="Frase a pronunciar por el altavoz..."
                            class="w-full px-3 py-1.5 text-xs rounded-lg border outline-none"
                            [class.bg-white]="!hub.darkMode()"
                            [class.border-slate-300]="!hub.darkMode()"
                            [class.bg-slate-900]="hub.darkMode()"
                            [class.border-slate-700]="hub.darkMode()"
                          />
                          <div class="flex items-center justify-between gap-3 text-xs">
                            <div class="flex items-center gap-2">
                              <span class="text-slate-500 text-[11px]">Idioma:</span>
                              <select
                                [(ngModel)]="act.lang"
                                class="px-2 py-0.5 text-xs rounded border"
                                [class.bg-white]="!hub.darkMode()"
                                [class.border-slate-300]="!hub.darkMode()"
                                [class.bg-slate-900]="hub.darkMode()"
                                [class.border-slate-700]="hub.darkMode()"
                              >
                                <option value="es">Español</option>
                                <option value="en">Inglés</option>
                                <option value="pt">Portugués</option>
                              </select>
                            </div>
                            <label class="flex items-center gap-1.5 cursor-pointer text-rose-600 dark:text-rose-400 font-semibold text-[11px]">
                              <input
                                type="checkbox"
                                [(ngModel)]="act.urgent"
                                class="accent-rose-600"
                              />
                              <span>Urgente (Salta modo No Molestar)</span>
                            </label>
                          </div>
                        </div>
                      } @else if (act.type === 'play_url') {
                        <div class="space-y-2">
                          <input
                            type="url"
                            [(ngModel)]="act.url"
                            placeholder="https://ice1.somafm.com/groovesalad-128-mp3"
                            class="w-full px-3 py-1.5 text-xs rounded-lg border outline-none font-mono"
                            [class.bg-white]="!hub.darkMode()"
                            [class.border-slate-300]="!hub.darkMode()"
                            [class.bg-slate-900]="hub.darkMode()"
                            [class.border-slate-700]="hub.darkMode()"
                          />
                          <input
                            type="text"
                            [(ngModel)]="act.title"
                            placeholder="Título descriptivo (ej. Radio Instrumental)"
                            class="w-full px-3 py-1.5 text-xs rounded-lg border outline-none"
                            [class.bg-white]="!hub.darkMode()"
                            [class.border-slate-300]="!hub.darkMode()"
                            [class.bg-slate-900]="hub.darkMode()"
                            [class.border-slate-700]="hub.darkMode()"
                          />
                        </div>
                      } @else if (act.type === 'set_volume') {
                        <div class="flex items-center gap-3">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="5"
                            [(ngModel)]="act.volume"
                            class="flex-1 accent-blue-600 cursor-pointer"
                          />
                          <span class="w-10 text-xs font-bold text-blue-600 dark:text-blue-400 font-mono text-right">
                            {{ act.volume ?? 30 }}%
                          </span>
                        </div>
                      } @else if (act.type === 'delay') {
                        <div class="flex items-center gap-2">
                          <span class="text-xs text-slate-500">Pausar durante</span>
                          <input
                            type="number"
                            min="1"
                            max="60"
                            [(ngModel)]="act.delaySeconds"
                            class="w-16 px-2 py-1 text-xs rounded border font-mono"
                            [class.bg-white]="!hub.darkMode()"
                            [class.border-slate-300]="!hub.darkMode()"
                            [class.bg-slate-900]="hub.darkMode()"
                            [class.border-slate-700]="hub.darkMode()"
                          />
                          <span class="text-xs text-slate-500">segundos antes de continuar</span>
                        </div>
                      } @else if (act.type === 'mute') {
                        <label class="flex items-center gap-2 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            [(ngModel)]="act.muted"
                            class="accent-blue-600"
                          />
                          <span>Activar silencio (Mute)</span>
                        </label>
                      } @else if (act.type === 'media_control') {
                        <div class="flex items-center gap-3 text-xs">
                          <label class="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="radio"
                              value="stop"
                              [(ngModel)]="act.mediaAction"
                              class="accent-blue-600"
                            />
                            <span>Detener completamente (Stop)</span>
                          </label>
                          <label class="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="radio"
                              value="pause"
                              [(ngModel)]="act.mediaAction"
                              class="accent-blue-600"
                            />
                            <span>Pausar reproducción</span>
                          </label>
                        </div>
                      }
                    </div>
                  }
                </div>
              </div>

              @if (routineError()) {
                <div class="p-2.5 rounded-xl text-xs bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
                  {{ routineError() }}
                </div>
              }
            </div>

            <div class="flex justify-end gap-2.5 mt-5 pt-4 border-t shrink-0"
              [class.border-slate-100]="!hub.darkMode()"
              [class.border-slate-800]="hub.darkMode()"
            >
              <button
                type="button"
                (click)="showRoutineModal.set(false)"
                class="px-4 py-2 text-xs font-semibold rounded-xl border transition-colors cursor-pointer"
                [class.border-slate-300]="!hub.darkMode()"
                [class.border-slate-700]="hub.darkMode()"
              >
                Cancelar
              </button>
              <button
                type="button"
                (click)="submitRoutineForm()"
                class="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors cursor-pointer"
              >
                {{ editingRoutineId() ? 'Guardar Cambios' : 'Crear Rutina' }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class AutomationPanel {
  readonly automation = inject(AutomationService);
  readonly hub = inject(CastHubService);

  readonly activeSubTab = signal<'history' | 'notifications'>('history');

  // DND Form
  dndForm: DndConfig = {
    enabled: false,
    startTime: '21:00',
    endTime: '07:00',
    maxVolume: 25,
  };

  // Modales
  readonly showTimerModal = signal<boolean>(false);
  readonly timerError = signal<string | null>(null);
  newTimerForm = {
    targetDeviceId: '',
    label: '',
    durationMinutes: 20,
    alertPointsStr: '5, 1',
    lang: 'es' as 'es' | 'en' | 'pt',
  };

  readonly showRoutineModal = signal<boolean>(false);
  readonly editingRoutineId = signal<string | null>(null);
  readonly routineError = signal<string | null>(null);

  routineForm: {
    name: string;
    time: string;
    days: DayOfWeek[];
    targetDeviceIds: string[];
    actions: RoutineAction[];
  } = {
    name: '',
    time: '08:00',
    days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    targetDeviceIds: ['all'],
    actions: [],
  };

  readonly daysOfWeekList: Array<{ key: DayOfWeek; label: string; full: string }> = [
    { key: 'mon', label: 'L', full: 'Lun' },
    { key: 'tue', label: 'M', full: 'Mar' },
    { key: 'wed', label: 'X', full: 'Mié' },
    { key: 'thu', label: 'J', full: 'Jue' },
    { key: 'fri', label: 'V', full: 'Vie' },
    { key: 'sat', label: 'S', full: 'Sáb' },
    { key: 'sun', label: 'D', full: 'Dom' },
  ];

  constructor() {
    // Sincronizar form DND reactivamente cuando cambie la configuración en el store
    effect(() => {
      const cfg = this.automation.dndConfig();
      this.dndForm = { ...cfg };
    });
  }

  async toggleDndEnabled(): Promise<void> {
    const updated = {
      ...this.automation.dndConfig(),
      enabled: !this.automation.dndConfig().enabled,
    };
    await this.automation.updateDnd(updated);
  }

  async saveDndSettings(): Promise<void> {
    if (this.dndForm.startTime === this.dndForm.endTime) {
      alert('La hora de inicio y fin de No Molestar no pueden ser iguales.');
      return;
    }
    await this.automation.updateDnd({ ...this.dndForm });
    alert('Configuración de No Molestar guardada correctamente.');
  }

  // Métodos Temporizadores
  openNewTimerModal(): void {
    const devices = this.hub.devices();
    this.newTimerForm = {
      targetDeviceId: devices[0]?.id || '',
      label: '',
      durationMinutes: 15,
      alertPointsStr: '5, 1',
      lang: 'es',
    };
    this.timerError.set(null);
    this.showTimerModal.set(true);
  }

  async submitNewTimer(): Promise<void> {
    this.timerError.set(null);
    const alertPoints = this.newTimerForm.alertPointsStr
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => !isNaN(n) && n > 0);

    const validation = validateTimerInput(
      this.newTimerForm.durationMinutes,
      alertPoints,
      this.newTimerForm.label,
      this.newTimerForm.lang
    );

    if (!validation.valid) {
      this.timerError.set(validation.error || 'Parámetros no válidos.');
      return;
    }

    try {
      await this.automation.startTimer({
        durationMinutes: this.newTimerForm.durationMinutes,
        targetDeviceId: this.newTimerForm.targetDeviceId,
        label: validation.cleanLabel,
        alertPoints: validation.cleanAlerts,
        lang: validation.cleanLang,
      });
      this.showTimerModal.set(false);
    } catch (err: any) {
      this.timerError.set(err.message || 'Error al iniciar temporizador.');
    }
  }

  async cancelTimer(id: string): Promise<void> {
    await this.automation.cancelTimer(id);
  }

  getTimerProgressPercent(timer: ActiveTimer): number {
    const now = this.automation.currentClientTimeMs();
    const start = new Date(timer.startedAt).getTime();
    const end = new Date(timer.endsAt).getTime();
    const total = end - start;
    if (total <= 0) return 100;
    const elapsed = now - start;
    return Math.min(100, Math.max(0, (elapsed / total) * 100));
  }

  getFormattedRemaining(timer: ActiveTimer): string {
    const now = this.automation.currentClientTimeMs();
    const end = new Date(timer.endsAt).getTime();
    const remainingSeconds = Math.max(0, Math.round((end - now) / 1000));
    return formatTimeRemaining(remainingSeconds);
  }

  // Métodos Rutinas
  openNewRoutineModal(): void {
    this.editingRoutineId.set(null);
    this.routineError.set(null);
    this.routineForm = {
      name: '',
      time: '08:00',
      days: ['mon', 'tue', 'wed', 'thu', 'fri'],
      targetDeviceIds: ['all'],
      actions: [
        {
          id: `act-${Date.now()}`,
          type: 'tts',
          text: 'Aviso programado',
          lang: 'es',
          urgent: false,
        },
      ],
    };
    this.showRoutineModal.set(true);
  }

  openEditRoutineModal(routine: Routine): void {
    this.editingRoutineId.set(routine.id);
    this.routineError.set(null);
    this.routineForm = {
      name: routine.name,
      time: routine.time,
      days: [...routine.days],
      targetDeviceIds: [...routine.targetDeviceIds],
      actions: routine.actions.map((a) => ({ ...a })),
    };
    this.showRoutineModal.set(true);
  }

  toggleRoutineDay(day: DayOfWeek): void {
    if (this.routineForm.days.includes(day)) {
      if (this.routineForm.days.length > 1) {
        this.routineForm.days = this.routineForm.days.filter((d) => d !== day);
      }
    } else {
      this.routineForm.days.push(day);
    }
  }

  selectAllDays(): void {
    this.routineForm.days = [...DAY_KEYS];
  }

  toggleTargetSpeaker(id: string): void {
    if (id === 'all') {
      this.routineForm.targetDeviceIds = ['all'];
      return;
    }

    let current = this.routineForm.targetDeviceIds.filter((d) => d !== 'all');
    if (current.includes(id)) {
      current = current.filter((d) => d !== id);
    } else {
      current.push(id);
    }

    if (current.length === 0) {
      current = ['all'];
    }
    this.routineForm.targetDeviceIds = current;
  }

  addRoutineAction(): void {
    if (this.routineForm.actions.length >= 10) return;
    this.routineForm.actions.push({
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      type: 'tts',
      text: '',
      lang: 'es',
      urgent: false,
    });
  }

  removeRoutineAction(index: number): void {
    if (this.routineForm.actions.length <= 1) return;
    this.routineForm.actions.splice(index, 1);
  }

  moveActionUp(index: number): void {
    if (index <= 0) return;
    const temp = this.routineForm.actions[index];
    this.routineForm.actions[index] = this.routineForm.actions[index - 1];
    this.routineForm.actions[index - 1] = temp;
  }

  moveActionDown(index: number): void {
    if (index >= this.routineForm.actions.length - 1) return;
    const temp = this.routineForm.actions[index];
    this.routineForm.actions[index] = this.routineForm.actions[index + 1];
    this.routineForm.actions[index + 1] = temp;
  }

  async submitRoutineForm(): Promise<void> {
    this.routineError.set(null);
    const validation = validateRoutine(this.routineForm);
    if (!validation.valid) {
      this.routineError.set(validation.error || 'Configuración no válida.');
      return;
    }

    try {
      const editId = this.editingRoutineId();
      if (editId) {
        await this.automation.updateRoutine(editId, this.routineForm);
      } else {
        await this.automation.createRoutine(this.routineForm);
      }
      this.showRoutineModal.set(false);
    } catch (err: any) {
      this.routineError.set(err.message || 'Error al guardar rutina.');
    }
  }

  async toggleRoutine(routine: Routine): Promise<void> {
    await this.automation.toggleRoutine(routine.id, !routine.enabled);
  }

  async confirmDeleteRoutine(routine: Routine): Promise<void> {
    const ok = window.confirm(`¿Estás seguro de que deseas eliminar la rutina "${routine.name}"?`);
    if (ok) {
      await this.automation.deleteRoutine(routine.id);
    }
  }

  formatTargetSpeakers(targetIds: string[]): string {
    if (targetIds.includes('all')) return 'Todos los altavoces';
    const names = targetIds.map((id) => {
      const dev = this.hub.devices().find((d) => d.id === id);
      return dev ? dev.name : id;
    });
    return names.join(', ') || 'Sin destino';
  }

  formatNextDate(isoString: string): string {
    try {
      const d = new Date(isoString);
      const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      const dayName = days[d.getDay()];
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${dayName} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return isoString;
    }
  }

  formatTimestamp(isoString: string): string {
    try {
      const d = new Date(isoString);
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    } catch {
      return isoString;
    }
  }

  getActionIcon(type: ActionType): string {
    switch (type) {
      case 'tts':
        return 'record_voice_over';
      case 'play_url':
        return 'radio';
      case 'set_volume':
        return 'volume_up';
      case 'delay':
        return 'hourglass_empty';
      case 'mute':
        return 'volume_off';
      case 'media_control':
        return 'stop_circle';
      default:
        return 'play_arrow';
    }
  }

  formatActionSummary(act: RoutineAction): string {
    switch (act.type) {
      case 'tts':
        return `Decir "${(act.text || '').slice(0, 25)}${(act.text?.length || 0) > 25 ? '...' : ''}"`;
      case 'play_url':
        return `Stream ${act.title || act.url || 'Audio'}`;
      case 'set_volume':
        return `Volumen ${act.volume}%`;
      case 'delay':
        return `Pausa ${act.delaySeconds || 1}s`;
      case 'mute':
        return act.muted ? 'Silenciar' : 'Quitar silencio';
      case 'media_control':
        return act.mediaAction === 'pause' ? 'Pausar' : 'Detener';
      default:
        return act.type;
    }
  }

  // Notificaciones & Historial
  async markNotificationRead(id: string): Promise<void> {
    await this.automation.markNotificationRead(id);
  }

  async dismissNotification(id: string): Promise<void> {
    await this.automation.dismissNotification(id);
  }

  async clearAllNotifications(): Promise<void> {
    await this.automation.clearNotifications();
  }

  async deleteHistoryItem(id: string): Promise<void> {
    await this.automation.deleteHistoryItem(id);
  }

  async clearAllHistory(): Promise<void> {
    const ok = window.confirm('¿Deseas vaciar todo el historial de ejecuciones?');
    if (ok) {
      await this.automation.clearHistory();
    }
  }
}
