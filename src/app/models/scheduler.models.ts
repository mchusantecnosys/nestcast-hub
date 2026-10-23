export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type ActionType = 'tts' | 'play_url' | 'set_volume' | 'mute' | 'media_control' | 'delay';

export interface RoutineAction {
  id: string;
  type: ActionType;
  // Para 'tts'
  text?: string;
  lang?: 'es' | 'en' | 'pt';
  urgent?: boolean;
  // Para 'play_url'
  url?: string;
  title?: string;
  // Para 'set_volume'
  volume?: number; // 0 a 100
  // Para 'mute'
  muted?: boolean;
  // Para 'media_control'
  mediaAction?: 'pause' | 'stop';
  // Para 'delay' (pausa entre acciones)
  delaySeconds?: number; // 1 a 60
}

export interface Routine {
  id: string;
  name: string;
  enabled: boolean;
  time: string; // "HH:mm" en formato 24h
  days: DayOfWeek[]; // ['mon', 'tue', ...]
  targetDeviceIds: string[]; // ['c8b2...'] o ['all']
  actions: RoutineAction[]; // 1 a 10 acciones en secuencia
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastRunStatus?: 'success' | 'partial' | 'failed';
  nextRunAt?: string;
}

export interface DndConfig {
  enabled: boolean;
  startTime: string; // "HH:mm" ej. "21:00"
  endTime: string; // "HH:mm" ej. "07:00"
  maxVolume: number; // Techo de volumen (default 25)
}

export interface ActiveTimer {
  id: string;
  label: string; // Mensaje descriptivo ej. "Blanqueamiento Consultorio 1"
  targetDeviceId: string; // ID de altavoz destino
  targetDeviceName?: string;
  durationMinutes: number; // 1 a 480
  alertPoints: number[]; // Minutos restantes para avisos ordenados desc (ej. [5, 1])
  lang: 'es' | 'en' | 'pt'; // Idioma de aviso (default 'es')
  startedAt: string; // ISO timestamp
  endsAt: string; // ISO timestamp
  alertsFired: number[]; // Puntos ya emitidos
}

export interface ExecutionLogEntry {
  id: string;
  routineId: string;
  routineName: string;
  executedAt: string;
  status: 'success' | 'partial' | 'failed';
  details: string;
  error?: string;
}

export interface ErrorNotification {
  id: string;
  title: string;
  message: string;
  sourceType: 'routine' | 'timer';
  sourceId: string;
  targetDeviceId?: string;
  targetDeviceName?: string;
  timestamp: string;
  read: boolean;
}

export interface SchedulerDatabase {
  routines: Routine[];
  dnd: DndConfig;
  timers: ActiveTimer[];
  executionHistory: ExecutionLogEntry[];
  errorNotifications: ErrorNotification[];
}

export interface SchedulerOverview {
  dnd: DndConfig;
  isDndActive: boolean;
  routinesCount: number;
  activeTimersCount: number;
  unreadErrorsCount: number;
  nextRoutine?: Routine;
}
