import { test, assert, beforeEach } from 'vitest';
import { SchedulerEngine, SpeakerDispatcher } from './scheduler-engine';
import {
  saveRoutine,
  deleteRoutine,
  saveDndConfig,
  saveActiveTimer,
  getActiveTimers,
  getExecutionHistory,
  deleteExecutionLog,
  dismissErrorNotification,
  getErrorNotifications,
} from './scheduler-store';
import { Routine, ActiveTimer, DndConfig } from '../app/models/scheduler.models';

class MockDispatcher implements SpeakerDispatcher {
  public volumeCalls: Array<{ deviceId: string; level: number }> = [];
  public muteCalls: Array<{ deviceId: string; muted: boolean }> = [];
  public ttsCalls: Array<{ deviceId: string; text: string; lang: string }> = [];
  public playUrlCalls: Array<{ deviceId: string; url: string }> = [];
  public mediaControlCalls: Array<{ deviceId: string; action: string }> = [];
  public activeDeviceIds = ['mock-dev-1', 'mock-dev-2'];

  getActiveDeviceIds(): string[] {
    return [...this.activeDeviceIds];
  }
  getDeviceName(id: string): string {
    return `Device-${id}`;
  }
  isDeviceAvailable(): boolean {
    return true;
  }
  async sendVolume(deviceId: string, level: number): Promise<boolean> {
    this.volumeCalls.push({ deviceId, level });
    return true;
  }
  async sendMute(deviceId: string, muted: boolean): Promise<boolean> {
    this.muteCalls.push({ deviceId, muted });
    return true;
  }
  async sendTts(deviceId: string, text: string, lang: 'es' | 'en' | 'pt'): Promise<boolean> {
    this.ttsCalls.push({ deviceId, text, lang });
    return true;
  }
  async sendPlayUrl(deviceId: string, url: string): Promise<boolean> {
    this.playUrlCalls.push({ deviceId, url });
    return true;
  }
  async sendMediaControl(deviceId: string, action: 'pause' | 'stop'): Promise<boolean> {
    this.mediaControlCalls.push({ deviceId, action });
    return true;
  }
}

beforeEach(() => {
  deleteExecutionLog();
  dismissErrorNotification();
});

test('SchedulerEngine evaluates active timer completion and deletes it', async () => {
  const mock = new MockDispatcher();
  const engine = new SchedulerEngine(mock);

  const pastDate = new Date(Date.now() - 5000).toISOString();
  const timer: ActiveTimer = {
    id: 'test-timer-1',
    label: 'Procedimiento Sala 1',
    targetDeviceId: 'mock-dev-1',
    durationMinutes: 1,
    alertPoints: [],
    lang: 'es',
    startedAt: new Date(Date.now() - 65000).toISOString(),
    endsAt: pastDate,
    alertsFired: [],
  };
  saveActiveTimer(timer);

  await engine.tick(new Date());

  // Debe haber emitido TTS de finalización
  assert.equal(mock.ttsCalls.length, 1);
  assert.match(mock.ttsCalls[0].text, /tiempo completado/);

  // El temporizador debe haber desaparecido
  const remaining = getActiveTimers().filter((t) => t.id === 'test-timer-1');
  assert.equal(remaining.length, 0);
});

test('SchedulerEngine enforces DND by omitting non-urgent TTS and capping volume', async () => {
  process.env['NODE_ENV'] = 'test';
  const mock = new MockDispatcher();
  const engine = new SchedulerEngine(mock);

  const dnd: DndConfig = {
    enabled: true,
    startTime: '21:00',
    endTime: '07:00',
    maxVolume: 20,
  };
  saveDndConfig(dnd);

  const testRoutine: Routine = {
    id: 'routine-dnd-test',
    name: 'Rutina Nocturna',
    enabled: true,
    time: '22:00',
    days: ['thu'], // 22 Oct 2026 es jueves ('thu')
    targetDeviceIds: ['mock-dev-1'],
    actions: [
      { id: 'a1', type: 'set_volume', volume: 60 },
      { id: 'a2', type: 'tts', text: 'Buenas noches no urgente', urgent: false },
      { id: 'a3', type: 'tts', text: 'Aviso urgente de alarma', urgent: true },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveRoutine(testRoutine);

  // Fecha jueves 22 Oct 2026 22:00
  const tickTime = new Date(2026, 9, 22, 22, 0, 0);
  await engine.tick(tickTime);

  // Volumen acotado al techo DND (20)
  assert.ok(mock.volumeCalls.length >= 1);
  assert.equal(mock.volumeCalls[0].level, 20);

  // TTS no urgente omitido, TTS urgente emitido
  assert.equal(mock.ttsCalls.length, 1);
  assert.equal(mock.ttsCalls[0].text, 'Aviso urgente de alarma');

  // Limpieza
  deleteRoutine('routine-dnd-test');
});
