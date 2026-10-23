import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import {
  SchedulerDatabase,
  Routine,
  DndConfig,
  ActiveTimer,
  ExecutionLogEntry,
  ErrorNotification,
} from '../app/models/scheduler.models';

const DATA_DIR = join(process.cwd(), 'data');
const DB_PATH = join(DATA_DIR, 'scheduler-db.json');
const TMP_PATH = join(DATA_DIR, 'scheduler-db.json.tmp');

const DEFAULT_DND: DndConfig = {
  enabled: false,
  startTime: '21:00',
  endTime: '07:00',
  maxVolume: 25,
};

const SEED_ROUTINES: Routine[] = [
  {
    id: 'routine-seed-1',
    name: 'Despertador y Radio Suave',
    enabled: false,
    time: '07:00',
    days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    targetDeviceIds: ['all'],
    actions: [
      { id: 'act-1', type: 'set_volume', volume: 30 },
      { id: 'act-2', type: 'delay', delaySeconds: 1 },
      {
        id: 'act-3',
        type: 'tts',
        text: 'Buenos días. Iniciando música relajante matutina.',
        lang: 'es',
        urgent: false,
      },
      { id: 'act-4', type: 'delay', delaySeconds: 4 },
      {
        id: 'act-5',
        type: 'play_url',
        url: 'https://ice1.somafm.com/groovesalad-128-mp3',
        title: 'SomaFM Groove Salad',
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'routine-seed-2',
    name: 'Aviso de Cierre de Clínica',
    enabled: false,
    time: '18:45',
    days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
    targetDeviceIds: ['all'],
    actions: [
      {
        id: 'act-cierre-1',
        type: 'tts',
        text: 'Estimados pacientes y equipo: la clínica cerrará sus puertas en 15 minutos.',
        lang: 'es',
        urgent: true,
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

let inMemoryDb: SchedulerDatabase | null = null;

function ensureDataDirectory(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getDefaultDatabase(): SchedulerDatabase {
  return {
    routines: SEED_ROUTINES,
    dnd: DEFAULT_DND,
    timers: [],
    executionHistory: [],
    errorNotifications: [],
  };
}

export function loadSchedulerDatabase(): SchedulerDatabase {
  if (inMemoryDb) return inMemoryDb;

  ensureDataDirectory();
  if (existsSync(DB_PATH)) {
    try {
      const raw = readFileSync(DB_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<SchedulerDatabase>;
      inMemoryDb = {
        routines: Array.isArray(parsed.routines) ? parsed.routines : [],
        dnd: parsed.dnd ? { ...DEFAULT_DND, ...parsed.dnd } : DEFAULT_DND,
        timers: Array.isArray(parsed.timers) ? parsed.timers : [],
        executionHistory: Array.isArray(parsed.executionHistory) ? parsed.executionHistory : [],
        errorNotifications: Array.isArray(parsed.errorNotifications)
          ? parsed.errorNotifications
          : [],
      };
      return inMemoryDb;
    } catch {
      // Si el archivo está corrupto o ilegible, inicializar con defaults
    }
  }

  inMemoryDb = getDefaultDatabase();
  saveSchedulerDatabase(inMemoryDb);
  return inMemoryDb;
}

export function saveSchedulerDatabase(db: SchedulerDatabase): void {
  inMemoryDb = db;
  ensureDataDirectory();
  try {
    const json = JSON.stringify(db, null, 2);
    writeFileSync(TMP_PATH, json, 'utf-8');
    renameSync(TMP_PATH, DB_PATH);
  } catch {
    // Si falla el renombrado atómico, guardar directamente
    try {
      writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
    } catch (writeErr) {
      console.error('Error al guardar base de datos del scheduler:', writeErr);
    }
  }
}

// Helpers para Rutinas
export function getRoutines(): Routine[] {
  const db = loadSchedulerDatabase();
  return [...db.routines];
}

export function saveRoutine(routine: Routine): void {
  const db = loadSchedulerDatabase();
  const index = db.routines.findIndex((r) => r.id === routine.id);
  if (index >= 0) {
    db.routines[index] = { ...routine, updatedAt: new Date().toISOString() };
  } else {
    db.routines.push(routine);
  }
  saveSchedulerDatabase(db);
}

export function deleteRoutine(id: string): boolean {
  const db = loadSchedulerDatabase();
  const initLen = db.routines.length;
  db.routines = db.routines.filter((r) => r.id !== id);
  if (db.routines.length !== initLen) {
    saveSchedulerDatabase(db);
    return true;
  }
  return false;
}

// Helpers para DND
export function getDndConfig(): DndConfig {
  const db = loadSchedulerDatabase();
  return { ...db.dnd };
}

export function saveDndConfig(dnd: DndConfig): void {
  const db = loadSchedulerDatabase();
  db.dnd = { ...dnd };
  saveSchedulerDatabase(db);
}

// Helpers para Temporizadores
export function getActiveTimers(): ActiveTimer[] {
  const db = loadSchedulerDatabase();
  return [...db.timers];
}

export function saveActiveTimer(timer: ActiveTimer): void {
  const db = loadSchedulerDatabase();
  const idx = db.timers.findIndex((t) => t.id === timer.id);
  if (idx >= 0) {
    db.timers[idx] = timer;
  } else {
    db.timers.push(timer);
  }
  saveSchedulerDatabase(db);
}

export function removeActiveTimer(id: string): boolean {
  const db = loadSchedulerDatabase();
  const initLen = db.timers.length;
  db.timers = db.timers.filter((t) => t.id !== id);
  if (db.timers.length !== initLen) {
    saveSchedulerDatabase(db);
    return true;
  }
  return false;
}

// Helpers para Historial de Ejecuciones
export function getExecutionHistory(): ExecutionLogEntry[] {
  const db = loadSchedulerDatabase();
  return [...db.executionHistory];
}

export function addExecutionLog(entry: ExecutionLogEntry): void {
  const db = loadSchedulerDatabase();
  db.executionHistory.unshift(entry);
  // Conservación indefinida, pero aseguramos tope de seguridad de memoria si pasa 5000 registros
  if (db.executionHistory.length > 5000) {
    db.executionHistory = db.executionHistory.slice(0, 5000);
  }
  saveSchedulerDatabase(db);
}

export function deleteExecutionLog(id?: string): void {
  const db = loadSchedulerDatabase();
  if (id) {
    db.executionHistory = db.executionHistory.filter((e) => e.id !== id);
  } else {
    db.executionHistory = [];
  }
  saveSchedulerDatabase(db);
}

// Helpers para Notificaciones de Error
export function getErrorNotifications(): ErrorNotification[] {
  const db = loadSchedulerDatabase();
  return [...db.errorNotifications];
}

export function addErrorNotification(notif: ErrorNotification): void {
  const db = loadSchedulerDatabase();
  db.errorNotifications.unshift(notif);
  if (db.errorNotifications.length > 200) {
    db.errorNotifications = db.errorNotifications.slice(0, 200);
  }
  saveSchedulerDatabase(db);
}

export function markErrorNotificationRead(id: string): void {
  const db = loadSchedulerDatabase();
  const item = db.errorNotifications.find((n) => n.id === id);
  if (item) {
    item.read = true;
    saveSchedulerDatabase(db);
  }
}

export function dismissErrorNotification(id?: string): void {
  const db = loadSchedulerDatabase();
  if (id) {
    db.errorNotifications = db.errorNotifications.filter((n) => n.id !== id);
  } else {
    db.errorNotifications = [];
  }
  saveSchedulerDatabase(db);
}
