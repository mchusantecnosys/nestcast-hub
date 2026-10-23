import { test, assert } from 'vitest';
import {
  parseKnownHosts,
  isValidHostOrIp,
  validateVolumeLevel,
  isValidMediaAction,
  validateStreamUrl,
  validateTtsRequest,
  normalizeAndSortNetworks,
  buildPemCandidates,
  upsertTtsHistory,
  toggleTtsFavorite,
} from './cast-logic';

test('parseKnownHosts splits and trims comma-separated hosts', () => {
  assert.deepEqual(parseKnownHosts('192.168.1.50, 192.168.1.60 , '), [
    '192.168.1.50',
    '192.168.1.60',
  ]);
  assert.deepEqual(parseKnownHosts(''), []);
  assert.deepEqual(parseKnownHosts(null), []);
});

test('isValidHostOrIp validates IPv4 addresses and hostnames', () => {
  assert.equal(isValidHostOrIp('192.168.255.249'), true);
  assert.equal(isValidHostOrIp('192.168.1.50'), true);
  assert.equal(isValidHostOrIp('999.168.1.1'), false);
  assert.equal(isValidHostOrIp('google-home-mini.local'), true);
  assert.equal(isValidHostOrIp(''), false);
});

test('validateVolumeLevel clamps and rejects out-of-bounds values', () => {
  assert.equal(validateVolumeLevel(0), 0);
  assert.equal(validateVolumeLevel(65.4), 65);
  assert.equal(validateVolumeLevel(100), 100);
  assert.throws(() => validateVolumeLevel(-5), /entre 0 y 100/);
  assert.throws(() => validateVolumeLevel(105), /entre 0 y 100/);
});

test('isValidMediaAction accepts only play, pause, stop, quit', () => {
  assert.equal(isValidMediaAction('play'), true);
  assert.equal(isValidMediaAction('pause'), true);
  assert.equal(isValidMediaAction('stop'), true);
  assert.equal(isValidMediaAction('quit'), true);
  assert.equal(isValidMediaAction('rewind'), false);
});

test('validateStreamUrl requires http or https prefix', () => {
  assert.equal(
    validateStreamUrl(' https://ice1.somafm.com/groovesalad-128-mp3 '),
    'https://ice1.somafm.com/groovesalad-128-mp3'
  );
  assert.throws(() => validateStreamUrl('ftp://example.com/file.mp3'), /URL http\(s\)/);
  assert.throws(() => validateStreamUrl(''), /URL http\(s\)/);
});

test('validateTtsRequest validates non-empty text and normalizes language', () => {
  assert.deepEqual(validateTtsRequest(' Hola familia ', 'es'), {
    text: 'Hola familia',
    lang: 'es',
  });
  assert.deepEqual(validateTtsRequest('Dinner is ready', 'en'), {
    text: 'Dinner is ready',
    lang: 'en',
  });
  assert.throws(() => validateTtsRequest('   ', 'es'), /Escribe el texto/);
});

test('normalizeAndSortNetworks deduplicates SSIDs by strongest signal and sorts descending', () => {
  const raw = [
    { ssid: 'Casa_WiFi', signal_level: -72, wpa_auth: 7, wpa_cipher: 4 },
    { ssid: 'Consultorio_5G', signal_level: -46, wpa_auth: 7, wpa_cipher: 4 },
    { ssid: 'Casa_WiFi', signal_level: -58, wpa_auth: 7, wpa_cipher: 4 },
    { ssid: 'Invitados_Abierta', signal_level: -81, wpa_auth: 0, wpa_cipher: 0 },
  ];
  const result = normalizeAndSortNetworks(raw);
  assert.equal(result.length, 3);
  assert.equal(result[0].ssid, 'Consultorio_5G');
  assert.equal(result[0].signal, -46);
  assert.equal(result[0].signalQuality, 'Excelente');
  assert.equal(result[1].ssid, 'Casa_WiFi');
  assert.equal(result[1].signal, -58);
  assert.equal(result[1].signalQuality, 'Buena');
  assert.equal(result[2].ssid, 'Invitados_Abierta');
  assert.equal(result[2].isSecure, false);
});

test('buildPemCandidates wraps base64 keys into 64-char PEM blocks', () => {
  const b64 = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1234567890abcdef';
  const candidates = buildPemCandidates(b64);
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].startsWith('-----BEGIN PUBLIC KEY-----'), true);
  assert.equal(candidates[1].startsWith('-----BEGIN RSA PUBLIC KEY-----'), true);
});

test('upsertTtsHistory and toggleTtsFavorite preserve favorites and deduplicate phrases', () => {
  const initial = upsertTtsHistory([], {
    id: 'tts-1',
    text: 'La cena está lista',
    lang: 'es',
    createdAt: '2026-10-22T12:00:00Z',
  });
  assert.equal(initial.length, 1);
  assert.equal(initial[0].favorite, false);

  const favorited = toggleTtsFavorite(initial, 'tts-1');
  assert.equal(favorited[0].favorite, true);

  const readded = upsertTtsHistory(favorited, {
    id: 'tts-2',
    text: 'la cena está lista',
    lang: 'es',
    createdAt: '2026-10-22T12:05:00Z',
  });
  assert.equal(readded.length, 1);
  assert.equal(readded[0].id, 'tts-1');
  assert.equal(readded[0].favorite, true);
});
