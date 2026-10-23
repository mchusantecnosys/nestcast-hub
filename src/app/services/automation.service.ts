import { Injectable, PLATFORM_ID, inject, signal, computed } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  Routine,
  DndConfig,
  ActiveTimer,
  ExecutionLogEntry,
  ErrorNotification,
  SchedulerOverview,
} from '../models/scheduler.models';
import { isDndActive } from '../../utils/scheduler-logic';

@Injectable({
  providedIn: 'root',
})
export class AutomationService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  // Estados reactivos (Signals)
  readonly loading = signal<boolean>(false);
  readonly routines = signal<Routine[]>([]);
  readonly activeTimers = signal<ActiveTimer[]>([]);
  readonly dndConfig = signal<DndConfig>({
    enabled: false,
    startTime: '21:00',
    endTime: '07:00',
    maxVolume: 25,
  });

  // Timer local en segundos para reactividad visual suave de la cuenta regresiva
  readonly currentClientTimeMs = signal<number>(Date.now());

  // Evaluado de forma reactiva cada segundo contemplando horario y cruce de medianoche
  readonly isDndActive = computed<boolean>(() => {
    return isDndActive(this.dndConfig(), new Date(this.currentClientTimeMs()));
  });
  readonly history = signal<ExecutionLogEntry[]>([]);
  readonly notifications = signal<ErrorNotification[]>([]);

  readonly unreadErrorsCount = computed(() => {
    return this.notifications().filter((n) => !n.read).length;
  });

  readonly nextUpcomingRoutine = computed(() => {
    const list = this.routines().filter((r) => r.enabled && r.nextRunAt);
    if (list.length === 0) return null;
    return [...list].sort(
      (a, b) => new Date(a.nextRunAt!).getTime() - new Date(b.nextRunAt!).getTime()
    )[0];
  });

  private pollIntervalId: any = null;
  private clockIntervalId: any = null;

  constructor() {
    if (this.isBrowser) {
      void this.loadAll();

      // Reloj local cada segundo para timers
      this.clockIntervalId = setInterval(() => {
        this.currentClientTimeMs.set(Date.now());
      }, 1000);

      // Polling de sincronización cada 6 segundos
      this.pollIntervalId = setInterval(() => {
        void this.pollSync();
      }, 6000);
    }
  }

  private async apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(endpoint, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const data = await res.json();
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || `Error en llamada a ${endpoint}`);
    }
    return data;
  }

  public async loadAll(): Promise<void> {
    this.loading.set(true);
    try {
      await Promise.all([
        this.fetchOverview(),
        this.fetchRoutines(),
        this.fetchTimers(),
        this.fetchHistory(),
        this.fetchNotifications(),
      ]);
    } catch (err) {
      console.warn('Error al cargar datos del scheduler:', err);
    } finally {
      this.loading.set(false);
    }
  }

  public async pollSync(): Promise<void> {
    try {
      await Promise.all([
        this.fetchOverview(),
        this.fetchTimers(),
        this.fetchNotifications(),
      ]);
    } catch {
      // Ignorar fallo de sondeo puntual
    }
  }

  public async fetchOverview(): Promise<void> {
    try {
      const data = await this.apiRequest<{ ok: boolean; overview: SchedulerOverview }>(
        '/api/scheduler/overview'
      );
      if (data.overview) {
        this.dndConfig.set(data.overview.dnd);
      }
    } catch (err) {
      console.error(err);
    }
  }

  // Rutinas
  public async fetchRoutines(): Promise<void> {
    try {
      const data = await this.apiRequest<{ ok: boolean; routines: Routine[] }>(
        '/api/scheduler/routines'
      );
      this.routines.set(data.routines || []);
    } catch (err) {
      console.error(err);
    }
  }

  public async createRoutine(routine: Partial<Routine>): Promise<Routine> {
    const data = await this.apiRequest<{ ok: boolean; routine: Routine }>(
      '/api/scheduler/routines',
      {
        method: 'POST',
        body: JSON.stringify(routine),
      }
    );
    await this.fetchRoutines();
    return data.routine;
  }

  public async updateRoutine(id: string, routine: Partial<Routine>): Promise<Routine> {
    const data = await this.apiRequest<{ ok: boolean; routine: Routine }>(
      `/api/scheduler/routines/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        body: JSON.stringify(routine),
      }
    );
    await this.fetchRoutines();
    return data.routine;
  }

  public async toggleRoutine(id: string, enabled?: boolean): Promise<void> {
    await this.apiRequest(`/api/scheduler/routines/${encodeURIComponent(id)}/toggle`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    });
    await this.fetchRoutines();
  }

  public async deleteRoutine(id: string): Promise<void> {
    await this.apiRequest(`/api/scheduler/routines/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    await this.fetchRoutines();
  }

  // DND
  public async updateDnd(dnd: DndConfig): Promise<void> {
    const data = await this.apiRequest<{ ok: boolean; dnd: DndConfig; isActive: boolean }>(
      '/api/scheduler/dnd',
      {
        method: 'PUT',
        body: JSON.stringify(dnd),
      }
    );
    this.dndConfig.set(data.dnd);
  }

  // Temporizadores
  public async fetchTimers(): Promise<void> {
    try {
      const data = await this.apiRequest<{ ok: boolean; timers: ActiveTimer[] }>(
        '/api/scheduler/timers'
      );
      this.activeTimers.set(data.timers || []);
    } catch (err) {
      console.error(err);
    }
  }

  public async startTimer(params: {
    durationMinutes: number;
    targetDeviceId: string;
    label?: string;
    alertPoints?: number[];
    lang?: 'es' | 'en' | 'pt';
  }): Promise<ActiveTimer> {
    const data = await this.apiRequest<{ ok: boolean; timer: ActiveTimer }>(
      '/api/scheduler/timers',
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
    await this.fetchTimers();
    return data.timer;
  }

  public async cancelTimer(id: string): Promise<void> {
    // Optimistic removal: desaparece inmediatamente de la vista
    this.activeTimers.set(this.activeTimers().filter((t) => t.id !== id));
    await this.apiRequest(`/api/scheduler/timers/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    await this.fetchTimers();
  }

  // Historial
  public async fetchHistory(): Promise<void> {
    try {
      const data = await this.apiRequest<{ ok: boolean; history: ExecutionLogEntry[] }>(
        '/api/scheduler/routines/history'
      );
      this.history.set(data.history || []);
    } catch (err) {
      console.error(err);
    }
  }

  public async deleteHistoryItem(id: string): Promise<void> {
    this.history.set(this.history().filter((h) => h.id !== id));
    await this.apiRequest(
      `/api/scheduler/routines/history/${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    );
  }

  public async clearHistory(): Promise<void> {
    this.history.set([]);
    await this.apiRequest('/api/scheduler/routines/history', { method: 'DELETE' });
  }

  // Notificaciones
  public async fetchNotifications(): Promise<void> {
    try {
      const data = await this.apiRequest<{
        ok: boolean;
        notifications: ErrorNotification[];
      }>('/api/scheduler/notifications');
      this.notifications.set(data.notifications || []);
    } catch (err) {
      console.error(err);
    }
  }

  public async markNotificationRead(id: string): Promise<void> {
    const list = this.notifications().map((n) => (n.id === id ? { ...n, read: true } : n));
    this.notifications.set(list);
    await this.apiRequest(
      `/api/scheduler/notifications/${encodeURIComponent(id)}/read`,
      { method: 'PATCH' }
    );
  }

  public async dismissNotification(id: string): Promise<void> {
    this.notifications.set(this.notifications().filter((n) => n.id !== id));
    await this.apiRequest(
      `/api/scheduler/notifications/${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    );
  }

  public async clearNotifications(): Promise<void> {
    this.notifications.set([]);
    await this.apiRequest('/api/scheduler/notifications', { method: 'DELETE' });
  }
}
