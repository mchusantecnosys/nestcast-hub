import {
  DayOfWeek,
  DndConfig,
  Routine,
  RoutineAction,
} from '../app/models/scheduler.models';

export const DAY_KEYS: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export const JS_DAY_TO_KEY: Record<number, DayOfWeek> = {
  0: 'sun',
  1: 'mon',
  2: 'tue',
  3: 'wed',
  4: 'thu',
  5: 'fri',
  6: 'sat',
};

export const KEY_TO_JS_DAY: Record<DayOfWeek, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

/**
 * Convierte "HH:mm" a minutos transcurridos desde las 00:00 (0 a 1439).
 */
export function timeStringToMinutes(timeStr: string): number {
  if (!timeStr || typeof timeStr !== 'string') return -1;
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(timeStr.trim());
  if (!match) return -1;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  return hours * 60 + minutes;
}

/**
 * Evalúa si el modo "No Molestar" (DND) está actualmente activo,
 * contemplando el cruce de medianoche (ej. 22:00 -> 06:00).
 */
export function isDndActive(dnd: DndConfig | null | undefined, now = new Date()): boolean {
  if (!dnd || !dnd.enabled) return false;

  const startMin = timeStringToMinutes(dnd.startTime);
  const endMin = timeStringToMinutes(dnd.endTime);

  if (startMin < 0 || endMin < 0) return false;
  if (startMin === endMin) return false; // Horas iguales: inactivo / inválido

  const currentMin = now.getHours() * 60 + now.getMinutes();

  if (startMin < endMin) {
    // Franja dentro del mismo día (ej. 14:00 a 16:00)
    return currentMin >= startMin && currentMin < endMin;
  } else {
    // Franja que cruza la medianoche (ej. 21:00 a 07:00)
    return currentMin >= startMin || currentMin < endMin;
  }
}

/**
 * Calcula la fecha y hora del próximo disparo de una rutina según sus días y hora "HH:mm".
 */
export function calculateNextRun(
  time: string,
  days: DayOfWeek[],
  now = new Date()
): Date | null {
  if (!time || !Array.isArray(days) || days.length === 0) return null;
  const targetMinutes = timeStringToMinutes(time);
  if (targetMinutes < 0) return null;

  const targetHours = Math.floor(targetMinutes / 60);
  const targetMins = targetMinutes % 60;

  // Evaluar los próximos 8 días (para cubrir la semana completa)
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(now.getTime());
    candidate.setDate(candidate.getDate() + offset);
    candidate.setHours(targetHours, targetMins, 0, 0);

    const candidateDayKey = JS_DAY_TO_KEY[candidate.getDay()];
    if (!days.includes(candidateDayKey)) {
      continue;
    }

    // Si es hoy, debe ser en el futuro (al menos el minuto actual o posterior)
    if (offset === 0) {
      if (candidate.getTime() > now.getTime()) {
        return candidate;
      }
    } else {
      return candidate;
    }
  }

  return null;
}

/**
 * Valida la definición de una rutina antes de guardarla.
 */
export function validateRoutine(routine: Partial<Routine>): {
  valid: boolean;
  error?: string;
} {
  if (!routine.name || typeof routine.name !== 'string' || routine.name.trim().length === 0) {
    return { valid: false, error: 'El nombre de la rutina es obligatorio.' };
  }
  if (routine.name.trim().length > 80) {
    return { valid: false, error: 'El nombre no puede exceder 80 caracteres.' };
  }

  const minutes = timeStringToMinutes(routine.time ?? '');
  if (minutes < 0) {
    return { valid: false, error: 'La hora programada debe tener formato válido HH:mm (24h).' };
  }

  if (!Array.isArray(routine.days) || routine.days.length === 0) {
    return { valid: false, error: 'Debes seleccionar al menos un día de la semana.' };
  }

  for (const d of routine.days) {
    if (!DAY_KEYS.includes(d)) {
      return { valid: false, error: `Día inválido: ${d}` };
    }
  }

  if (!Array.isArray(routine.targetDeviceIds) || routine.targetDeviceIds.length === 0) {
    return { valid: false, error: 'Debes seleccionar al menos un altavoz destino o "Todos".' };
  }

  if (!Array.isArray(routine.actions) || routine.actions.length === 0) {
    return { valid: false, error: 'La rutina debe contener al menos 1 acción.' };
  }
  if (routine.actions.length > 10) {
    return { valid: false, error: 'Una rutina puede contener un máximo de 10 acciones.' };
  }

  for (let i = 0; i < routine.actions.length; i++) {
    const act = routine.actions[i];
    const validation = validateRoutineAction(act, i + 1);
    if (!validation.valid) {
      return validation;
    }
  }

  return { valid: true };
}

/**
 * Valida una acción individual dentro de una rutina.
 */
export function validateRoutineAction(
  action: Partial<RoutineAction>,
  index: number
): { valid: boolean; error?: string } {
  if (!action || !action.type) {
    return { valid: false, error: `Acción #${index}: Tipo de acción no especificado.` };
  }

  switch (action.type) {
    case 'tts':
      if (!action.text || action.text.trim().length === 0) {
        return { valid: false, error: `Acción #${index} (TTS): El texto no puede estar vacío.` };
      }
      break;

    case 'play_url':
      if (!action.url || !action.url.trim().startsWith('http')) {
        return { valid: false, error: `Acción #${index} (Audio): La URL debe comenzar con http:// o https://.` };
      }
      break;

    case 'set_volume':
      if (typeof action.volume !== 'number' || action.volume < 0 || action.volume > 100) {
        return { valid: false, error: `Acción #${index} (Volumen): El volumen debe estar entre 0 y 100.` };
      }
      break;

    case 'mute':
      if (typeof action.muted !== 'boolean') {
        return { valid: false, error: `Acción #${index} (Silencio): Debe especificar si activa o desactiva el silencio.` };
      }
      break;

    case 'media_control':
      if (action.mediaAction !== 'pause' && action.mediaAction !== 'stop') {
        return { valid: false, error: `Acción #${index} (Control): Acción no válida (solo pause o stop).` };
      }
      break;

    case 'delay':
      if (
        typeof action.delaySeconds !== 'number' ||
        action.delaySeconds < 1 ||
        action.delaySeconds > 60
      ) {
        return { valid: false, error: `Acción #${index} (Pausa): La espera debe durar entre 1 y 60 segundos.` };
      }
      break;

    default:
      return { valid: false, error: `Acción #${index}: Tipo desconocido: ${(action as { type: string }).type}` };
  }

  return { valid: true };
}

/**
 * Valida y sanea los parámetros para iniciar un nuevo temporizador.
 */
export function validateTimerInput(
  durationMinutes: number,
  alertPoints: number[] = [],
  label?: string,
  lang: 'es' | 'en' | 'pt' = 'es'
): {
  valid: boolean;
  error?: string;
  cleanAlerts: number[];
  cleanLabel: string;
  cleanLang: 'es' | 'en' | 'pt';
} {
  if (typeof durationMinutes !== 'number' || isNaN(durationMinutes) || durationMinutes < 1) {
    return {
      valid: false,
      error: 'La duración del temporizador debe ser de al menos 1 minuto.',
      cleanAlerts: [],
      cleanLabel: '',
      cleanLang: 'es',
    };
  }

  if (durationMinutes > 480) {
    return {
      valid: false,
      error: 'La duración máxima permitida es de 480 minutos (8 horas).',
      cleanAlerts: [],
      cleanLabel: '',
      cleanLang: 'es',
    };
  }

  const rawLabel = (label ?? '').trim();
  const cleanLabel = (rawLabel || 'Temporizador').slice(0, 60).replace(/[\r\n]+/g, ' ');

  const validLangs: Array<'es' | 'en' | 'pt'> = ['es', 'en', 'pt'];
  const cleanLang = validLangs.includes(lang) ? lang : 'es';

  // Validar puntos de alerta
  const cleanAlerts: number[] = [];
  if (Array.isArray(alertPoints)) {
    for (const point of alertPoints) {
      if (typeof point !== 'number' || isNaN(point)) continue;
      const rounded = Math.floor(point);
      if (rounded <= 0) {
        return {
          valid: false,
          error: 'Los puntos de aviso intermedio no pueden ser 0 minutos (el 0 es la alerta final).',
          cleanAlerts: [],
          cleanLabel,
          cleanLang,
        };
      }
      if (rounded >= durationMinutes) {
        return {
          valid: false,
          error: `El punto de aviso (${rounded} min) no puede ser mayor o igual a la duración total (${durationMinutes} min).`,
          cleanAlerts: [],
          cleanLabel,
          cleanLang,
        };
      }
      if (!cleanAlerts.includes(rounded)) {
        cleanAlerts.push(rounded);
      }
    }
  }

  if (cleanAlerts.length > 5) {
    return {
      valid: false,
      error: 'Se permite un máximo de 5 puntos de aviso intermedio.',
      cleanAlerts: [],
      cleanLabel,
      cleanLang,
    };
  }

  // Ordenar de mayor a menor (ej. [10, 5, 1])
  cleanAlerts.sort((a, b) => b - a);

  return {
    valid: true,
    cleanAlerts,
    cleanLabel,
    cleanLang,
  };
}

/**
 * Estima la duración de reproducción de una frase TTS en milisegundos.
 */
export function estimateTtsDurationMs(text: string): number {
  if (!text) return 2000;
  return Math.max(2000, Math.round(text.trim().length * 85));
}

/**
 * Construye el mensaje hablado del temporizador según el idioma y los minutos restantes.
 */
export function buildTimerTtsMessage(
  label: string,
  minutesRemaining: number,
  lang: 'es' | 'en' | 'pt' = 'es'
): string {
  const cleanLabel = (label || 'Temporizador').trim();

  if (minutesRemaining <= 0) {
    switch (lang) {
      case 'en':
        return `${cleanLabel}: time completed.`;
      case 'pt':
        return `${cleanLabel}: tempo completado.`;
      case 'es':
      default:
        return `${cleanLabel}: tiempo completado.`;
    }
  }

  switch (lang) {
    case 'en':
      return `${cleanLabel}: ${minutesRemaining} minute${minutesRemaining === 1 ? '' : 's'} remaining.`;
    case 'pt':
      return `${cleanLabel}: faltam ${minutesRemaining} minuto${minutesRemaining === 1 ? '' : 's'}.`;
    case 'es':
    default:
      return `${cleanLabel}: faltan ${minutesRemaining} minuto${minutesRemaining === 1 ? '' : 's'}.`;
  }
}

/**
 * Formatea segundos a texto amigable "mm:ss" o "hh:mm:ss".
 */
export function formatTimeRemaining(totalSeconds: number): string {
  if (totalSeconds <= 0) return '00:00';
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

/**
 * Formatea el tiempo restante relativo para la ejecución de una rutina ("en 1 h 43 min", "en 25 min").
 */
export function formatRelativeTime(target: Date | string, now = new Date()): string {
  let targetDate: Date;
  if (typeof target === 'string') {
    const mins = timeStringToMinutes(target);
    if (mins >= 0) {
      targetDate = new Date(now.getTime());
      targetDate.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
      if (targetDate.getTime() <= now.getTime()) {
        targetDate.setDate(targetDate.getDate() + 1);
      }
    } else {
      targetDate = new Date(target);
    }
  } else {
    targetDate = target;
  }

  const diffMs = targetDate.getTime() - now.getTime();
  if (diffMs <= 0) return 'ahora';

  const diffMinutes = Math.round(diffMs / 60000);
  if (diffMinutes < 1) return 'en menos de 1 min';
  if (diffMinutes < 60) return `en ${diffMinutes} min`;

  const hours = Math.floor(diffMinutes / 60);
  const remainingMinutes = diffMinutes % 60;
  if (remainingMinutes === 0) return `en ${hours} h`;
  return `en ${hours} h ${remainingMinutes} min`;
}

