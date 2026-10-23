import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  computed,
  ViewChild,
  AfterViewInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AutomationService } from '../services/automation.service';
import { CastHubService } from '../services/cast-hub';
import { timeStringToMinutes } from '../../utils/scheduler-logic';

@Component({
  selector: 'app-day-timeline',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <section
      class="w-full my-6 select-none"
      aria-label="Línea temporal de 24 horas: actividades del día y franja No molestar"
    >
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-sm font-semibold tracking-tight text-[var(--ink)]">
          Hoy en la casa
        </h2>
        <div class="flex items-center gap-4 text-xs text-[var(--muted)]">
          @if (automation.dndConfig().enabled) {
            <span class="inline-flex items-center gap-1.5">
              <span class="w-3 h-2.5 border border-[var(--edge)] hatch-pattern rounded-xs inline-block"></span>
              <span>No molestar ({{ automation.dndConfig().startTime }} - {{ automation.dndConfig().endTime }}) · {{ automation.isDndActive() ? 'activo ahora' : 'en espera' }}</span>
            </span>
          }
          <span class="inline-flex items-center gap-1.5 text-[var(--accent)] font-semibold">
            <span class="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse"></span>
            <span>Ahora {{ currentTimeFormatted() }}</span>
          </span>
        </div>
      </div>

      <!-- Contenedor con scroll horizontal en móviles (mínimo 760px) -->
      <div
        #scrollContainer
        class="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-xs transition-colors py-3 px-4"
      >
        <div class="relative min-w-[760px] h-20">
          <!-- Marcas de horas cada 3 horas (00, 03, 06, 09, 12, 15, 18, 21, 24) -->
          <div class="absolute top-0 inset-x-0 flex justify-between text-[11px] font-medium text-[var(--muted)] pointer-events-none">
            @for (h of hourMarkers; track h.hour) {
              <div class="flex flex-col items-center" [style.left.%]="h.percent" style="position: absolute; transform: translateX(-50%);">
                <span>{{ h.label }}</span>
                <span class="w-px h-2 bg-[var(--line)] mt-1"></span>
              </div>
            }
          </div>

          <!-- Pista base horizontal -->
          <div class="absolute top-7 inset-x-0 h-4 rounded-full bg-[var(--chalk)] border border-[var(--line)] overflow-hidden">
            <!-- Franjas No Molestar (Hatched fabric) -->
            @if (automation.dndConfig().enabled) {
              @for (band of dndBands(); track $index) {
                <div
                  class="absolute top-0 bottom-0 hatch-pattern border-x border-[var(--edge)]/40 transition-all"
                  [style.left.%]="band.left"
                  [style.width.%]="band.width"
                  title="No molestar activo"
                ></div>
              }
            }
          </div>

          <!-- Ticks de Rutinas programadas (alturas alternas para evitar choques) -->
          @for (r of routineTicks(); track r.id; let idx = $index) {
            <div
              class="absolute top-7 flex flex-col items-center z-10 transition-transform group cursor-pointer"
              [style.left.%]="r.percent"
              style="transform: translateX(-50%);"
              [title]="r.name + ' (' + r.time + ')'"
            >
              <!-- Marca vertical de la rutina -->
              <span
                class="w-1 rounded-full bg-[var(--ink)]"
                [style.height.px]="idx % 2 === 0 ? 16 : 24"
              ></span>

              <!-- Etiqueta de hora y nombre -->
              <div
                class="flex flex-col items-center text-center mt-0.5 whitespace-nowrap pointer-events-none"
                [style.transform]="idx % 2 === 0 ? 'translateY(0)' : 'translateY(6px)'"
              >
                <span class="text-[11px] font-bold text-[var(--ink)] leading-tight">{{ r.time }}</span>
                <span class="text-[10px] text-[var(--muted)] font-medium max-w-[85px] truncate">
                  {{ r.name }}
                </span>
              </div>
            </div>
          }

          <!-- Línea de luz "AHORA" -->
          <div
            class="absolute top-1 bottom-0 flex flex-col items-center z-20 pointer-events-none"
            [style.left.%]="nowPercent()"
            style="transform: translateX(-50%);"
          >
            <!-- Badge "ahora" -->
            <span class="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[var(--accent)] text-white shadow-xs">
              ahora
            </span>
            <!-- Línea vertical de luz de acento -->
            <span class="w-[2.5px] h-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]"></span>
          </div>
        </div>
      </div>
    </section>
  `,
})
export class DayTimeline implements AfterViewInit {
  readonly automation = inject(AutomationService);
  readonly hub = inject(CastHubService);

  @ViewChild('scrollContainer') scrollContainer?: ElementRef<HTMLDivElement>;

  readonly hourMarkers = [
    { hour: 0, label: '00', percent: 0 },
    { hour: 3, label: '03', percent: (3 / 24) * 100 },
    { hour: 6, label: '06', percent: (6 / 24) * 100 },
    { hour: 9, label: '09', percent: (9 / 24) * 100 },
    { hour: 12, label: '12', percent: (12 / 24) * 100 },
    { hour: 15, label: '15', percent: (15 / 24) * 100 },
    { hour: 18, label: '18', percent: (18 / 24) * 100 },
    { hour: 21, label: '21', percent: (21 / 24) * 100 },
    { hour: 24, label: '24', percent: 100 },
  ];

  readonly nowPercent = computed(() => {
    const time = this.automation.currentClientTimeMs();
    const d = new Date(time);
    const mins = d.getHours() * 60 + d.getMinutes();
    return Math.min(100, Math.max(0, (mins / 1440) * 100));
  });

  readonly currentTimeFormatted = computed(() => {
    const time = this.automation.currentClientTimeMs();
    const d = new Date(time);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  readonly dndBands = computed(() => {
    const dnd = this.automation.dndConfig();
    if (!dnd || !dnd.enabled) return [];

    const startMin = timeStringToMinutes(dnd.startTime);
    const endMin = timeStringToMinutes(dnd.endTime);
    if (startMin < 0 || endMin < 0 || startMin === endMin) return [];

    if (startMin < endMin) {
      // Misma jornada (ej. 14:00 a 18:00)
      return [
        {
          left: (startMin / 1440) * 100,
          width: ((endMin - startMin) / 1440) * 100,
        },
      ];
    } else {
      // Cruza la medianoche (ej. 21:00 a 07:00)
      return [
        {
          left: (startMin / 1440) * 100,
          width: ((1440 - startMin) / 1440) * 100,
        },
        {
          left: 0,
          width: (endMin / 1440) * 100,
        },
      ];
    }
  });

  readonly routineTicks = computed(() => {
    const list = this.automation.routines().filter((r) => r.enabled);
    return list.map((r) => {
      const mins = timeStringToMinutes(r.time);
      return {
        id: r.id,
        name: r.name,
        time: r.time,
        percent: mins >= 0 ? (mins / 1440) * 100 : 0,
      };
    });
  });

  ngAfterViewInit(): void {
    // En móviles, abrir la línea de tiempo desplazada horizontalmente a la hora actual
    setTimeout(() => {
      if (this.scrollContainer?.nativeElement) {
        const el = this.scrollContainer.nativeElement;
        const targetScroll = (el.scrollWidth * (this.nowPercent() / 100)) - (el.clientWidth / 2);
        el.scrollTo({ left: Math.max(0, targetScroll), behavior: 'smooth' });
      }
    }, 200);
  }
}
