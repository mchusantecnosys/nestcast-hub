import { test, assert } from 'vitest';
import {
  timeStringToMinutes,
  isDndActive,
  calculateNextRun,
  validateRoutine,
  validateTimerInput,
  buildTimerTtsMessage,
  formatTimeRemaining,
  estimateTtsDurationMs,
} from './scheduler-logic';
import { DndConfig, Routine } from '../app/models/scheduler.models';

test('timeStringToMinutes converts valid 24h times to minutes', () => {
  assert.equal(timeStringToMinutes('00:00'), 0);
  assert.equal(timeStringToMinutes('01:30'), 90);
  assert.equal(timeStringToMinutes('12:00'), 720);
  assert.equal(timeStringToMinutes('23:59'), 1439);
  assert.equal(timeStringToMinutes('24:00'), -1);
  assert.equal(timeStringToMinutes('invalid'), -1);
  assert.equal(timeStringToMinutes(''), -1);
});

test('isDndActive handles normal time window correctly', () => {
  const dnd: DndConfig = {
    enabled: true,
    startTime: '14:00',
    endTime: '18:00',
    maxVolume: 25,
  };

  const createDate = (h: number, m: number) => {
    const d = new Date(2026, 9, 22, h, m, 0);
    return d;
  };

  assert.equal(isDndActive(dnd, createDate(13, 59)), false);
  assert.equal(isDndActive(dnd, createDate(14, 0)), true);
  assert.equal(isDndActive(dnd, createDate(16, 30)), true);
  assert.equal(isDndActive(dnd, createDate(17, 59)), true);
  assert.equal(isDndActive(dnd, createDate(18, 0)), false);
});

test('isDndActive handles midnight crossing (CL-02: 21:00 -> 07:00)', () => {
  const dnd: DndConfig = {
    enabled: true,
    startTime: '21:00',
    endTime: '07:00',
    maxVolume: 25,
  };

  const createDate = (h: number, m: number) => new Date(2026, 9, 22, h, m, 0);

  assert.equal(isDndActive(dnd, createDate(20, 59)), false);
  assert.equal(isDndActive(dnd, createDate(21, 0)), true);
  assert.equal(isDndActive(dnd, createDate(23, 45)), true);
  assert.equal(isDndActive(dnd, createDate(0, 0)), true);
  assert.equal(isDndActive(dnd, createDate(3, 15)), true);
  assert.equal(isDndActive(dnd, createDate(6, 59)), true);
  assert.equal(isDndActive(dnd, createDate(7, 0)), false);
  assert.equal(isDndActive(dnd, createDate(12, 0)), false);
});

test('isDndActive returns false when disabled or identical start/end times', () => {
  const disabledDnd: DndConfig = {
    enabled: false,
    startTime: '21:00',
    endTime: '07:00',
    maxVolume: 25,
  };
  assert.equal(isDndActive(disabledDnd, new Date(2026, 9, 22, 23, 0)), false);

  const identicalDnd: DndConfig = {
    enabled: true,
    startTime: '22:00',
    endTime: '22:00',
    maxVolume: 25,
  };
  assert.equal(isDndActive(identicalDnd, new Date(2026, 9, 22, 22, 0)), false);
});

test('calculateNextRun finds the next upcoming execution', () => {
  // Jueves 22 Octubre 2026 a las 10:00 (getDay() === 4 -> 'thu')
  const baseDate = new Date(2026, 9, 22, 10, 0, 0);

  // Mismo día más tarde (11:30)
  const nextToday = calculateNextRun('11:30', ['thu'], baseDate);
  assert.ok(nextToday);
  assert.equal(nextToday!.getHours(), 11);
  assert.equal(nextToday!.getMinutes(), 30);
  assert.equal(nextToday!.getDate(), 22);

  // Mismo día pero ya pasó la hora (08:00) -> próximo jueves
  const nextWeek = calculateNextRun('08:00', ['thu'], baseDate);
  assert.ok(nextWeek);
  assert.equal(nextWeek!.getDate(), 29); // 22 + 7

  // Día siguiente (viernes 'fri' a las 09:00)
  const nextFriday = calculateNextRun('09:00', ['fri'], baseDate);
  assert.ok(nextFriday);
  assert.equal(nextFriday!.getDate(), 23);
  assert.equal(nextFriday!.getHours(), 9);
});

test('validateRoutine enforces rules on name, time, days, and actions', () => {
  const validRoutine: Partial<Routine> = {
    name: 'Despertador Suave',
    time: '07:00',
    days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    targetDeviceIds: ['c8b2a190-4f12-4e89-9a11-019283746501'],
    actions: [
      { id: '1', type: 'set_volume', volume: 30 },
      { id: '2', type: 'delay', delaySeconds: 2 },
      { id: '3', type: 'tts', text: 'Buenos días', lang: 'es', urgent: false },
    ],
  };

  assert.equal(validateRoutine(validRoutine).valid, true);

  // Nombre vacío
  assert.equal(validateRoutine({ ...validRoutine, name: '' }).valid, false);

  // Nombre > 80 chars
  assert.equal(validateRoutine({ ...validRoutine, name: 'A'.repeat(85) }).valid, false);

  // Hora inválida
  assert.equal(validateRoutine({ ...validRoutine, time: '25:00' }).valid, false);

  // Días vacíos
  assert.equal(validateRoutine({ ...validRoutine, days: [] }).valid, false);

  // Sin altavoces
  assert.equal(validateRoutine({ ...validRoutine, targetDeviceIds: [] }).valid, false);

  // Sin acciones
  assert.equal(validateRoutine({ ...validRoutine, actions: [] }).valid, false);

  // Más de 10 acciones
  const elevenActions = Array(11).fill({ id: 'x', type: 'set_volume', volume: 20 });
  assert.equal(validateRoutine({ ...validRoutine, actions: elevenActions }).valid, false);
});

test('validateTimerInput rejects duration 0 and values > 480', () => {
  // CL-08: duración 0 rechazada
  const res0 = validateTimerInput(0);
  assert.equal(res0.valid, false);
  assert.match(res0.error!, /al menos 1 minuto/);

  // Duración > 480 rechazada
  const resOver = validateTimerInput(500);
  assert.equal(resOver.valid, false);
  assert.match(resOver.error!, /máxima permitida es de 480/);
});

test('validateTimerInput validates, cleans and orders alert points', () => {
  // CL-04: alerta mayor o igual a la duración rechazada
  const invalidAlert = validateTimerInput(20, [30]);
  assert.equal(invalidAlert.valid, false);
  assert.match(invalidAlert.error!, /no puede ser mayor o igual/);

  // Alerta 0 rechazada
  const zeroAlert = validateTimerInput(20, [0]);
  assert.equal(zeroAlert.valid, false);
  assert.match(zeroAlert.error!, /no pueden ser 0 minutos/);

  // Deduplicación y orden descendente
  const valid = validateTimerInput(20, [5, 10, 5, 1], ' Blanqueamiento \n Dental ');
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.cleanAlerts, [10, 5, 1]);
  assert.equal(valid.cleanLabel, 'Blanqueamiento   Dental');
});

test('buildTimerTtsMessage produces clean voice messages without beeps', () => {
  assert.equal(
    buildTimerTtsMessage('Consultorio 1', 5, 'es'),
    'Consultorio 1: faltan 5 minutos.'
  );
  assert.equal(
    buildTimerTtsMessage('Consultorio 1', 1, 'es'),
    'Consultorio 1: faltan 1 minuto.'
  );
  assert.equal(
    buildTimerTtsMessage('Consultorio 1', 0, 'es'),
    'Consultorio 1: tiempo completado.'
  );
  assert.equal(
    buildTimerTtsMessage('Room 2', 5, 'en'),
    'Room 2: 5 minutes remaining.'
  );
});

test('formatTimeRemaining formats mm:ss and hh:mm:ss correctly', () => {
  assert.equal(formatTimeRemaining(0), '00:00');
  assert.equal(formatTimeRemaining(65), '01:05');
  assert.equal(formatTimeRemaining(3661), '01:01:01');
});

test('estimateTtsDurationMs estimates reasonable speech time', () => {
  const shortText = 'Hola';
  assert.ok(estimateTtsDurationMs(shortText) >= 2000);

  const longText = 'Aviso general a todo el personal: la clínica cerrará sus puertas en 15 minutos.';
  const duration = estimateTtsDurationMs(longText);
  assert.ok(duration > 4000);
});
