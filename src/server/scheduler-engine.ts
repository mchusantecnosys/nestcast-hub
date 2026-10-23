import {
  Routine,
  ActiveTimer,
  RoutineAction,
  ExecutionLogEntry,
  ErrorNotification,
} from '../app/models/scheduler.models';
import {
  isDndActive,
  JS_DAY_TO_KEY,
  calculateNextRun,
  buildTimerTtsMessage,
  estimateTtsDurationMs,
} from '../utils/scheduler-logic';
import {
  getRoutines,
  saveRoutine,
  getDndConfig,
  getActiveTimers,
  saveActiveTimer,
  removeActiveTimer,
  addExecutionLog,
  addErrorNotification,
} from './scheduler-store';

export interface SpeakerDispatcher {
  getActiveDeviceIds(): string[];
  getDeviceName(id: string): string;
  isDeviceAvailable(id: string): boolean;
  sendVolume(deviceId: string, level: number): Promise<boolean>;
  sendMute(deviceId: string, muted: boolean): Promise<boolean>;
  sendTts(deviceId: string, text: string, lang: 'es' | 'en' | 'pt'): Promise<boolean>;
  sendPlayUrl(deviceId: string, url: string, title?: string): Promise<boolean>;
  sendMediaControl(deviceId: string, action: 'pause' | 'stop'): Promise<boolean>;
}

export class SchedulerEngine {
  private tickInterval: NodeJS.Timeout | null = null;
  private isTicking = false;
  private lastEvaluatedMinute = '';
  private wasDndActive = false;
  private readonly runningRoutineIds = new Set<string>();

  constructor(private readonly dispatcher: SpeakerDispatcher) {}

  public start(tickMs = 5000): void {
    if (this.tickInterval) return;

    // Recuperar temporizadores vencidos al arrancar
    this.checkInitialTimerRecovery();

    this.tickInterval = setInterval(() => {
      void this.tick();
    }, tickMs);
  }

  public stop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  private checkInitialTimerRecovery(): void {
    const now = Date.now();
    const timers = getActiveTimers();

    for (const timer of timers) {
      const endsAt = new Date(timer.endsAt).getTime();
      if (now >= endsAt) {
        const diffMs = now - endsAt;
        if (diffMs <= 120_000) {
          // Expiró hace menos de 2 minutos: anunciar fin de inmediato
          const msg = buildTimerTtsMessage(timer.label, 0, timer.lang);
          void this.dispatcher.sendTts(timer.targetDeviceId, msg, timer.lang);
        } else {
          // Expiró hace más de 2 minutos mientras el servidor estaba apagado
          addErrorNotification({
            id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            title: 'Temporizador expirado en corte',
            message: `El temporizador "${timer.label}" expiró mientras el servidor estaba apagado.`,
            sourceType: 'timer',
            sourceId: timer.id,
            targetDeviceId: timer.targetDeviceId,
            targetDeviceName: timer.targetDeviceName,
            timestamp: new Date().toISOString(),
            read: false,
          });
        }
        removeActiveTimer(timer.id);
      }
    }
  }

  public async tick(now = new Date()): Promise<void> {
    if (this.isTicking) return;
    this.isTicking = true;

    try {
      const dnd = getDndConfig();
      const dndActive = isDndActive(dnd, now);

      // Proactividad DND: si acaba de activarse, bajar altavoces por encima del techo
      if (dndActive && !this.wasDndActive) {
        await this.applyProactiveDndCap(dnd.maxVolume);
      }
      this.wasDndActive = dndActive;

      // 1. Evaluar temporizadores activos
      await this.evaluateTimers(now);

      // 2. Evaluar rutinas programadas por minuto
      const pad = (n: number) => n.toString().padStart(2, '0');
      const minuteKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}:${pad(now.getMinutes())}`;

      if (minuteKey !== this.lastEvaluatedMinute) {
        this.lastEvaluatedMinute = minuteKey;
        await this.evaluateRoutines(now, dndActive, dnd.maxVolume);
      }
    } catch (err) {
      console.error('Error en SchedulerEngine.tick:', err);
    } finally {
      this.isTicking = false;
    }
  }

  private async applyProactiveDndCap(maxVolume: number): Promise<void> {
    const devices = this.dispatcher.getActiveDeviceIds();
    for (const devId of devices) {
      try {
        await this.dispatcher.sendVolume(devId, maxVolume);
      } catch {
        // Ignorar fallo puntual en limitación proactiva
      }
    }
  }

  private async evaluateTimers(now = new Date()): Promise<void> {
    const timers = getActiveTimers();
    const nowMs = now.getTime();

    for (const timer of timers) {
      const endsAt = new Date(timer.endsAt).getTime();

      // Temporizador completado
      if (nowMs >= endsAt) {
        const completionMsg = buildTimerTtsMessage(timer.label, 0, timer.lang);
        try {
          await this.dispatcher.sendMute(timer.targetDeviceId, false);
          await this.dispatcher.sendTts(timer.targetDeviceId, completionMsg, timer.lang);
        } catch {
          addErrorNotification({
            id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            title: 'Fallo al avisar temporizador completado',
            message: `No se pudo emitir el aviso de voz para "${timer.label}" en el altavoz.`,
            sourceType: 'timer',
            sourceId: timer.id,
            targetDeviceId: timer.targetDeviceId,
            targetDeviceName: timer.targetDeviceName,
            timestamp: new Date().toISOString(),
            read: false,
          });
        }

        // Remueve el temporizador activo (desaparece de la interfaz de inmediato)
        removeActiveTimer(timer.id);
        continue;
      }

      // Alertas intermedias
      const remainingSeconds = Math.max(0, Math.round((endsAt - nowMs) / 1000));
      const remainingMinutes = Math.round(remainingSeconds / 60);

      for (const alertPoint of timer.alertPoints) {
        if (
          remainingMinutes === alertPoint &&
          !timer.alertsFired.includes(alertPoint) &&
          Math.abs(remainingSeconds - alertPoint * 60) <= 15
        ) {
          const alertMsg = buildTimerTtsMessage(timer.label, alertPoint, timer.lang);
          try {
            await this.dispatcher.sendMute(timer.targetDeviceId, false);
            await this.dispatcher.sendTts(timer.targetDeviceId, alertMsg, timer.lang);
          } catch {
            // Ignorar fallo puntual en alerta intermedia
          }

          timer.alertsFired.push(alertPoint);
          saveActiveTimer(timer);
        }
      }
    }
  }

  private async evaluateRoutines(
    now: Date,
    dndActive: boolean,
    dndMaxVolume: number
  ): Promise<void> {
    const routines = getRoutines();
    const currentDayKey = JS_DAY_TO_KEY[now.getDay()];
    const pad = (n: number) => n.toString().padStart(2, '0');
    const currentTimeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

    const routinePromises: Promise<void>[] = [];

    for (const routine of routines) {
      if (!routine.enabled) continue;
      if (!routine.days.includes(currentDayKey)) continue;
      if (routine.time !== currentTimeStr) continue;
      if (this.runningRoutineIds.has(routine.id)) continue;

      routinePromises.push(this.executeRoutine(routine, dndActive, dndMaxVolume));
    }

    if (routinePromises.length > 0) {
      await Promise.all(routinePromises);
    }
  }

  private async executeRoutine(
    routine: Routine,
    dndActive: boolean,
    dndMaxVolume: number
  ): Promise<void> {
    this.runningRoutineIds.add(routine.id);
    const startTime = new Date();

    // Determinar altavoces destino
    let targetDeviceIds: string[] = [];
    if (routine.targetDeviceIds.includes('all')) {
      targetDeviceIds = this.dispatcher.getActiveDeviceIds();
    } else {
      targetDeviceIds = [...routine.targetDeviceIds];
    }

    // CL-01: Sin destino disponible
    if (targetDeviceIds.length === 0) {
      this.runningRoutineIds.delete(routine.id);
      addExecutionLog({
        id: `exec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        routineId: routine.id,
        routineName: routine.name,
        executedAt: startTime.toISOString(),
        status: 'failed',
        details: 'Rutina sin altavoces de destino configurados o disponibles.',
        error: 'Sin destino',
      });
      addErrorNotification({
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: 'Rutina sin destino',
        message: `La rutina "${routine.name}" no pudo ejecutarse porque no se encontraron altavoces disponibles.`,
        sourceType: 'routine',
        sourceId: routine.id,
        timestamp: startTime.toISOString(),
        read: false,
      });
      return;
    }

    const deviceResults: Array<{ deviceId: string; success: boolean; details: string }> = [];

    // Ejecutar en paralelo por altavoz para no bloquear si uno falla
    await Promise.all(
      targetDeviceIds.map(async (devId) => {
        const res = await this.executeActionsOnDevice(
          routine,
          devId,
          dndActive,
          dndMaxVolume
        );
        deviceResults.push({ deviceId: devId, ...res });
      })
    );

    this.runningRoutineIds.delete(routine.id);

    // Calcular estado global
    const total = deviceResults.length;
    const successes = deviceResults.filter((r) => r.success).length;
    const globalStatus: 'success' | 'partial' | 'failed' =
      successes === total ? 'success' : successes > 0 ? 'partial' : 'failed';

    const detailsStr = deviceResults
      .map((r) => `${this.dispatcher.getDeviceName(r.deviceId)}: ${r.details}`)
      .join(' | ');

    // Actualizar rutina con último disparo y recalcular próximo
    const nextRun = calculateNextRun(routine.time, routine.days, new Date());
    routine.lastRunAt = startTime.toISOString();
    routine.lastRunStatus = globalStatus;
    routine.nextRunAt = nextRun ? nextRun.toISOString() : undefined;
    saveRoutine(routine);

    // Registrar en historial
    addExecutionLog({
      id: `exec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      routineId: routine.id,
      routineName: routine.name,
      executedAt: startTime.toISOString(),
      status: globalStatus,
      details: detailsStr,
      error: globalStatus === 'failed' ? 'Fallaron todos los altavoces' : undefined,
    });

    // Notificación en caso de fallo persistente
    if (globalStatus === 'failed' || globalStatus === 'partial') {
      addErrorNotification({
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: `Fallo en rutina "${routine.name}"`,
        message: `La rutina terminó con estado ${globalStatus}. Detalles: ${detailsStr}`,
        sourceType: 'routine',
        sourceId: routine.id,
        timestamp: startTime.toISOString(),
        read: false,
      });
    }
  }

  private async executeActionsOnDevice(
    routine: Routine,
    deviceId: string,
    dndActive: boolean,
    dndMaxVolume: number
  ): Promise<{ success: boolean; details: string }> {
    const executedLogs: string[] = [];
    let hasFailure = false;

    for (let i = 0; i < routine.actions.length; i++) {
      // Si la rutina fue deshabilitada o eliminada en vuelo, abortar
      const currentRoutines = getRoutines();
      const freshRoutine = currentRoutines.find((r) => r.id === routine.id);
      if (!freshRoutine || !freshRoutine.enabled) {
        executedLogs.push('Cancelado: rutina pausada o eliminada en vuelo');
        break;
      }

      const action = routine.actions[i];
      const actionRes = await this.executeSingleActionWithRetries(
        action,
        deviceId,
        dndActive,
        dndMaxVolume
      );

      executedLogs.push(actionRes.detail);
      if (!actionRes.success) {
        hasFailure = true;
      }

      // Si fue una frase TTS, esperar la duración estimada para no cortar audio con la siguiente
      if (action.type === 'tts' && action.text) {
        const speechWait =
          process.env['NODE_ENV'] === 'test' ? 10 : estimateTtsDurationMs(action.text);
        await new Promise((resolve) => setTimeout(resolve, Math.min(speechWait, 10000)));
      }
    }

    return {
      success: !hasFailure,
      details: executedLogs.join('; '),
    };
  }

  private async executeSingleActionWithRetries(
    action: RoutineAction,
    deviceId: string,
    dndActive: boolean,
    dndMaxVolume: number
  ): Promise<{ success: boolean; detail: string }> {
    // Manejo de Delay
    if (action.type === 'delay') {
      const sec = action.delaySeconds || 1;
      await new Promise((resolve) => setTimeout(resolve, sec * 1000));
      return { success: true, detail: `Espera ${sec}s` };
    }

    // Manejo de No Molestar (DND)
    if (dndActive) {
      if (action.type === 'tts' && !action.urgent) {
        return { success: true, detail: 'TTS omitido por modo No Molestar' };
      }
      if (action.type === 'set_volume' && typeof action.volume === 'number') {
        action = { ...action, volume: Math.min(action.volume, dndMaxVolume) };
      }
    }

    // Política de 3 reintentos con intervalo de 30s (o menor en test)
    const maxRetries = 3;
    const retryDelayMs = process.env['NODE_ENV'] === 'test' ? 50 : 30_000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        let ok = false;
        switch (action.type) {
          case 'set_volume':
            ok = await this.dispatcher.sendVolume(deviceId, action.volume ?? 30);
            break;
          case 'mute':
            ok = await this.dispatcher.sendMute(deviceId, action.muted ?? false);
            break;
          case 'tts':
            if (action.urgent) {
              await this.dispatcher.sendMute(deviceId, false);
            }
            ok = await this.dispatcher.sendTts(
              deviceId,
              action.text ?? '',
              action.lang ?? 'es'
            );
            break;
          case 'play_url':
            ok = await this.dispatcher.sendPlayUrl(
              deviceId,
              action.url ?? '',
              action.title
            );
            break;
          case 'media_control':
            ok = await this.dispatcher.sendMediaControl(
              deviceId,
              action.mediaAction ?? 'stop'
            );
            break;
          default:
            ok = true;
        }

        if (ok) {
          return { success: true, detail: `${action.type} OK` };
        }
      } catch {
        // Falló intento
      }

      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }

    return {
      success: false,
      detail: `${action.type} falló tras 3 intentos`,
    };
  }
}
