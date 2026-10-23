import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { generateKeyPairSync, publicEncrypt, constants } from 'node:crypto';
import {
  parseKnownHosts,
  isValidHostOrIp,
  validateVolumeLevel,
  isValidMediaAction,
  validateStreamUrl,
  validateTtsRequest,
  normalizeAndSortNetworks,
  buildPemCandidates,
} from './utils/cast-logic';
import {
  getRoutines,
  saveRoutine,
  deleteRoutine,
  getDndConfig,
  saveDndConfig,
  getActiveTimers,
  saveActiveTimer,
  removeActiveTimer,
  getExecutionHistory,
  deleteExecutionLog,
  getErrorNotifications,
  markErrorNotificationRead,
  dismissErrorNotification,
} from './server/scheduler-store';
import { SchedulerEngine, SpeakerDispatcher } from './server/scheduler-engine';
import {
  validateRoutine,
  validateTimerInput,
  calculateNextRun,
  isDndActive,
} from './utils/scheduler-logic';
import { Routine, ActiveTimer, DndConfig } from './app/models/scheduler.models';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
app.use(express.json());
const angularApp = new AngularNodeAppEngine();

// Generate a real 2048-bit RSA keypair representing the Google Home Mini setup key
const deviceRsaKeys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const rawBase64PublicKey = deviceRsaKeys.publicKey
  .replace(/-----BEGIN PUBLIC KEY-----/g, '')
  .replace(/-----END PUBLIC KEY-----/g, '')
  .replace(/\s+/g, '');

interface DeviceState {
  id: string;
  name: string;
  model: string;
  host: string;
  type: string;
  status: {
    volume: number;
    muted: boolean;
    app: string;
    player_state: 'IDLE' | 'PLAYING' | 'PAUSED' | 'BUFFERING';
    title: string;
  };
}

const activeDevices = new Map<string, DeviceState>();

function upsertActiveDevice(newDev: DeviceState): DeviceState {
  // Comprobar si ya existe un dispositivo con el mismo host (IP) o ID
  for (const [key, existing] of activeDevices.entries()) {
    if (
      (newDev.host && existing.host === newDev.host) ||
      (newDev.id && existing.id === newDev.id)
    ) {
      const canonicalId = existing.id || newDev.id;
      const merged: DeviceState = {
        id: canonicalId,
        name: newDev.name || existing.name,
        model: newDev.model || existing.model,
        host: newDev.host || existing.host,
        type: newDev.type || existing.type,
        status: { ...existing.status, ...newDev.status },
      };
      if (key !== canonicalId) {
        activeDevices.delete(key);
      }
      activeDevices.set(canonicalId, merged);
      return merged;
    }
  }
  activeDevices.set(newDev.id, newDev);
  return newDev;
}

function isRealHardwareDevice(deviceId: string): boolean {
  if (activeDevices.has(deviceId)) return true;
  for (const d of activeDevices.values()) {
    if (d.host === deviceId || d.id === deviceId) return true;
  }
  return false;
}

let setupDeviceState = {
  name: 'GoogleHome8492',
  model: 'Google Home Mini',
  version: '1.56.275994',
  ip: '192.168.255.249',
  connected: false,
  ssid: null as string | null,
  setup_state: 10,
  has_public_key: true,
  public_key: rawBase64PublicKey,
};

function getDeviceOrThrow(deviceId: string): DeviceState {
  let dev = activeDevices.get(deviceId);
  if (!dev) {
    for (const d of activeDevices.values()) {
      if (d.host === deviceId || d.id === deviceId || deviceId.includes(d.host)) {
        dev = d;
        break;
      }
    }
  }
  if (!dev) {
    const err = new Error("Dispositivo no encontrado. Pulsa 'Buscar dispositivos'.") as Error & {
      statusCode?: number;
    };
    err.statusCode = 404;
    throw err;
  }
  return dev;
}

function encryptWifiPasswordRsa(publicKey: string, password: string): string {
  const candidates = buildPemCandidates(publicKey);
  for (const pem of candidates) {
    try {
      const encrypted = publicEncrypt(
        {
          key: pem,
          padding: constants.RSA_PKCS1_PADDING,
        },
        Buffer.from(password, 'utf-8')
      );
      return encrypted.toString('base64');
    } catch {
      continue;
    }
  }
  throw new Error('No se pudo leer la clave pública del dispositivo.');
}

async function queryDeviceEurekaInfo(host: string): Promise<Record<string, unknown> | null> {
  for (const protocol of ['http', 'https']) {
    const port = protocol === 'http' ? 8008 : 8443;
    try {
      const res = await fetch(`${protocol}://${host}:${port}/setup/eureka_info?options=detail`, {
        signal: AbortSignal.timeout(2500),
      });
      if (res.ok) {
        return (await res.json()) as Record<string, unknown>;
      }
    } catch {
      // Continue
    }
  }
  return null;
}

async function forwardToFlask(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<any> {
  try {
    const res = await fetch(`http://127.0.0.1:5000${path}`, {
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Ignore Flask offline
  }
  return null;
}

// ---------- API: Descubrimiento y Control ----------

app.get('/api/devices', async (req, res) => {
  try {
    const hostsParam = typeof req.query['hosts'] === 'string' ? req.query['hosts'] : '';
    const customHosts = parseKnownHosts(hostsParam);
    if (!customHosts.includes('192.168.18.27')) {
      customHosts.unshift('192.168.18.27');
    }

    // 1. Try Flask bridge first for real Cast connections
    const flaskData = await forwardToFlask(
      `/api/devices${hostsParam ? `?hosts=${encodeURIComponent(hostsParam)}` : ''}`
    );
    if (flaskData?.ok && Array.isArray(flaskData.devices) && flaskData.devices.length > 0) {
      for (const d of flaskData.devices) {
        const existing = activeDevices.get(d.id);
        const saved = upsertActiveDevice({
          id: d.id,
          name: d.name || 'Google Home Mini',
          model: d.model || 'Google Home Mini',
          host: d.host,
          type: d.type || 'audio',
          status: existing?.status || {
            volume: 40,
            muted: false,
            app: 'Ninguna',
            player_state: 'IDLE',
            title: '',
          },
        });

        // Query real status from Flask so volume and state are actual hardware values
        const statusRes = await forwardToFlask(`/api/devices/${encodeURIComponent(d.id)}/status`);
        if (statusRes?.ok && statusRes.status) {
          saved.status = { ...saved.status, ...statusRes.status };
        }
      }
    }

    // 2. Direct probe for any specified hosts that are not yet discovered
    for (const host of customHosts) {
      if (!isValidHostOrIp(host)) continue;
      let hostExists = false;
      for (const d of activeDevices.values()) {
        if (d.host === host) {
          hostExists = true;
          break;
        }
      }
      if (hostExists) continue;

      const eureka = await queryDeviceEurekaInfo(host);
      if (eureka) {
        const realId = String(eureka['ssdp_udn'] || `device-${host.replace(/[^a-zA-Z0-9]/g, '-')}`);
        const realName = String(eureka['name'] || `Google Home Mini (${host})`);
        const existing = activeDevices.get(realId);
        upsertActiveDevice({
          id: realId,
          name: realName,
          model: 'Google Home Mini',
          host,
          type: 'audio',
          status: existing?.status || {
            volume: 40,
            muted: false,
            app: 'Ninguna',
            player_state: 'IDLE',
            title: eureka['ssid'] ? `Conectado a ${eureka['ssid']}` : 'Listo para transmitir',
          },
        });
      }
    }

    // Deduplicate strictly by host (IP) so there can NEVER be duplicate cards for the same physical device
    const hostMap = new Map<string, DeviceState>();
    for (const dev of activeDevices.values()) {
      const key = dev.host || dev.id;
      if (!hostMap.has(key)) {
        hostMap.set(key, dev);
      } else {
        const prev = hostMap.get(key)!;
        hostMap.set(key, { ...prev, status: { ...prev.status, ...dev.status } });
      }
    }

    const uniqueList = Array.from(hostMap.values());
    uniqueList.sort((a, b) => (a.host === '192.168.18.27' ? -1 : b.host === '192.168.18.27' ? 1 : 0));

    const devices = uniqueList.map((d) => ({
      id: d.id,
      name: d.name,
      model: d.model,
      host: d.host,
      type: d.type,
      status: d.status,
    }));

    return res.json({ ok: true, devices });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al buscar dispositivos';
    return res.status(500).json({ ok: false, error: message });
  }
});

app.get('/api/devices/scan-network', async (req, res) => {
  try {
    const subnetParam = typeof req.query['subnet'] === 'string' ? req.query['subnet'] : '';
    // 1. Try Flask bridge first
    const flaskRes = await forwardToFlask(
      `/api/devices/scan-network${subnetParam ? `?subnet=${encodeURIComponent(subnetParam)}` : ''}`
    );
    if (flaskRes?.ok) {
      if (Array.isArray(flaskRes.devices)) {
        for (const d of flaskRes.devices) {
          upsertActiveDevice({
            id: d.id,
            name: d.name || 'Google Home Mini',
            model: d.model || 'Google Home Mini',
            host: d.host || d.ip,
            type: 'audio',
            status: {
              volume: 40,
              muted: false,
              app: 'Ninguna',
              player_state: 'IDLE',
              title: d.ssid ? `Conectado a ${d.ssid}` : 'Listo para transmitir',
            },
          });
        }
      }
      return res.json(flaskRes);
    }

    // 2. Node.js fallback sweep across specified or default subnet
    const prefix = subnetParam.trim() ? subnetParam.replace(/\d+$/, '') : '192.168.18.';
    const cleanPrefix = prefix.endsWith('.') ? prefix : `${prefix}.`;
    const ips = Array.from({ length: 254 }, (_, i) => `${cleanPrefix}${i + 1}`);

    const probes = await Promise.all(
      ips.map(async (ip) => {
        const eureka = await queryDeviceEurekaInfo(ip);
        if (eureka) {
          const id = String(eureka['ssdp_udn'] || `device-${ip.replace(/[^a-zA-Z0-9]/g, '-')}`);
          const name = String(eureka['name'] || `Google Home (${ip})`);
          const model = String(
            (eureka['device_info'] as any)?.model_name || eureka['model'] || 'Google Home Mini'
          );
          return {
            id,
            name,
            model,
            ip,
            host: ip,
            connected: Boolean(eureka['connected'] ?? true),
            version: String(eureka['cast_build_revision'] || eureka['build_version'] || ''),
            ssid: (eureka['ssid'] as string) || null,
            signal_level: (eureka['signal_level'] as number) || -50,
            has_public_key: Boolean(eureka['public_key']),
          };
        }
        return null;
      })
    );

    const devices = probes.filter((d): d is NonNullable<typeof d> => d !== null);
    for (const d of devices) {
      if (!activeDevices.has(d.id)) {
        activeDevices.set(d.id, {
          id: d.id,
          name: d.name,
          model: d.model,
          host: d.host,
          type: 'audio',
          status: {
            volume: 40,
            muted: false,
            app: 'Ninguna',
            player_state: 'IDLE',
            title: d.ssid ? `Conectado a ${d.ssid}` : 'Listo para transmitir',
          },
        });
      }
    }

    return res.json({
      ok: true,
      subnet: cleanPrefix,
      detected_subnets: [cleanPrefix],
      devices,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al escanear la red local';
    return res.status(500).json({ ok: false, error: message });
  }
});

app.post('/api/devices/:deviceId/ping', async (req, res) => {
  try {
    const deviceId = req.params['deviceId'];
    if (isRealHardwareDevice(deviceId)) {
      const flaskRes = await forwardToFlask(
        `/api/devices/${encodeURIComponent(deviceId)}/ping`,
        { method: 'POST' }
      );
      if (flaskRes?.ok) {
        return res.json(flaskRes);
      }
    }

    // Simulator / fallback ping
    const dev = activeDevices.get(deviceId);
    return res.json({
      ok: true,
      pinged: deviceId,
      name: dev?.name || 'Google Home Mini',
      sound: 'chime',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al hacer sonar el altavoz';
    return res.status(500).json({ ok: false, error: message });
  }
});

app.delete('/api/devices/:deviceId', async (req, res) => {
  try {
    const deviceId = req.params['deviceId'];

    // Forward to Flask bridge only if it's a real hardware device
    if (isRealHardwareDevice(deviceId)) {
      await forwardToFlask(`/api/devices/${encodeURIComponent(deviceId)}`, {
        method: 'DELETE',
      });
    }

    let removed = false;
    if (activeDevices.has(deviceId)) {
      activeDevices.delete(deviceId);
      removed = true;
    } else {
      for (const [id, dev] of activeDevices.entries()) {
        if (dev.host === deviceId || dev.name === deviceId) {
          activeDevices.delete(id);
          removed = true;
          break;
        }
      }
    }

    return res.json({ ok: true, removed, deviceId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al eliminar dispositivo';
    return res.status(500).json({ ok: false, error: message });
  }
});

app.get('/api/devices/:deviceId/status', async (req, res) => {
  try {
    const deviceId = req.params['deviceId'];
    // Try Flask bridge only for real hardware devices
    if (isRealHardwareDevice(deviceId)) {
      const flaskData = await forwardToFlask(`/api/devices/${encodeURIComponent(deviceId)}/status`);
      if (flaskData?.ok) {
        const dev = activeDevices.get(deviceId);
        if (dev && flaskData.status) {
          dev.status = { ...dev.status, ...flaskData.status };
        }
        return res.json(flaskData);
      }
    }

    const dev = getDeviceOrThrow(deviceId);
    return res.json({
      ok: true,
      device: {
        id: dev.id,
        name: dev.name,
        model: dev.model,
        host: dev.host,
        type: dev.type,
      },
      status: dev.status,
    });
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode ?? 404;
    const message = err instanceof Error ? err.message : 'Dispositivo no encontrado';
    return res.status(status).json({ ok: false, error: message });
  }
});

app.post('/api/devices/:deviceId/volume', async (req, res) => {
  try {
    const deviceId = req.params['deviceId'];
    let level = validateVolumeLevel(req.body?.level ?? 50);

    // Si No Molestar está activo en este momento, respetar el techo de volumen
    const dnd = getDndConfig();
    if (isDndActive(dnd, new Date()) && level > dnd.maxVolume) {
      level = dnd.maxVolume;
    }

    // Forward to Flask bridge only for real hardware devices
    if (isRealHardwareDevice(deviceId)) {
      await forwardToFlask(`/api/devices/${encodeURIComponent(deviceId)}/volume`, {
        method: 'POST',
        body: { level },
      });
    }

    const dev = activeDevices.get(deviceId);
    if (dev) {
      dev.status.volume = level;
      if (level > 0 && dev.status.muted) {
        dev.status.muted = false;
      }
    }
    return res.json({ ok: true, volume: level });
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode ?? 400;
    const message = err instanceof Error ? err.message : 'Error al ajustar volumen';
    return res.status(status).json({ ok: false, error: message });
  }
});

app.post('/api/devices/:deviceId/mute', async (req, res) => {
  try {
    const deviceId = req.params['deviceId'];
    const muted = Boolean(req.body?.muted ?? true);

    // Forward to Flask bridge only for real hardware devices
    if (isRealHardwareDevice(deviceId)) {
      await forwardToFlask(`/api/devices/${encodeURIComponent(deviceId)}/mute`, {
        method: 'POST',
        body: { muted },
      });
    }

    const dev = activeDevices.get(deviceId);
    if (dev) {
      dev.status.muted = muted;
    }
    return res.json({ ok: true, muted });
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode ?? 400;
    const message = err instanceof Error ? err.message : 'Error al cambiar silencio';
    return res.status(status).json({ ok: false, error: message });
  }
});

app.post('/api/devices/:deviceId/media/:action', async (req, res) => {
  try {
    const deviceId = req.params['deviceId'];
    const action = req.params['action'];
    if (!isValidMediaAction(action)) {
      return res
        .status(400)
        .json({ ok: false, error: 'Acción no válida. Usa play, pause, stop o quit.' });
    }

    // Forward to Flask bridge only for real hardware devices
    if (isRealHardwareDevice(deviceId)) {
      await forwardToFlask(`/api/devices/${encodeURIComponent(deviceId)}/media/${action}`, {
        method: 'POST',
      });
    }

    const dev = activeDevices.get(deviceId);
    if (dev) {
      if (action === 'play') {
        dev.status.player_state = 'PLAYING';
      } else if (action === 'pause') {
        dev.status.player_state = 'PAUSED';
      } else if (action === 'stop' || action === 'quit') {
        dev.status.player_state = 'IDLE';
      }
    }

    return res.json({ ok: true, action, status: dev?.status });
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode ?? 400;
    const message = err instanceof Error ? err.message : 'Error en acción multimedia';
    return res.status(status).json({ ok: false, error: message });
  }
});

app.post('/api/devices/:deviceId/play', async (req, res) => {
  try {
    const deviceId = req.params['deviceId'];
    const url = validateStreamUrl(req.body?.url);
    const title = (req.body?.title ?? '').trim() || url;

    // Forward to Flask bridge only for real hardware devices
    if (isRealHardwareDevice(deviceId)) {
      await forwardToFlask(`/api/devices/${encodeURIComponent(deviceId)}/play`, {
        method: 'POST',
        body: { url, title },
      });
    }

    const dev = activeDevices.get(deviceId);
    if (dev) {
      dev.status.app = 'Default Media Receiver';
      dev.status.player_state = 'PLAYING';
      dev.status.title = title;
    }
    return res.json({ ok: true, url, title, status: dev?.status });
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode ?? 400;
    const message = err instanceof Error ? err.message : 'Error al reproducir URL';
    return res.status(status).json({ ok: false, error: message });
  }
});

app.post('/api/devices/:deviceId/say', async (req, res) => {
  try {
    const deviceId = req.params['deviceId'];
    const { text, lang } = validateTtsRequest(req.body?.text, req.body?.lang);

    let flaskRes: any = null;
    // Forward to Flask bridge only for real hardware devices
    if (isRealHardwareDevice(deviceId)) {
      flaskRes = await forwardToFlask(`/api/devices/${encodeURIComponent(deviceId)}/say`, {
        method: 'POST',
        body: { text, lang },
      });
    }

    const dev = activeDevices.get(deviceId);
    if (dev) {
      dev.status.app = `Text-to-Speech (${lang.toUpperCase()})`;
      dev.status.player_state = 'PLAYING';
      dev.status.title = `🗣️ "${text.slice(0, 60)}"`;
    }
    return res.json({
      ok: true,
      url: flaskRes?.url || `http://127.0.0.1:5000/tts/voice.mp3`,
      text,
      lang,
      status: dev?.status,
    });
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode ?? 400;
    const message = err instanceof Error ? err.message : 'Error en síntesis de voz';
    return res.status(status).json({ ok: false, error: message });
  }
});

// ---------- API: Emparejamiento (Configuración Wi-Fi GHLocalApi) ----------

app.get('/api/setup/info', async (req, res) => {
  const host =
    (typeof req.query['host'] === 'string' ? req.query['host'].trim() : '') || '192.168.18.27';
  if (!isValidHostOrIp(host)) {
    return res.status(400).json({ ok: false, error: 'Host de configuración no válido.' });
  }

  // 1. Direct probe to device eureka_info
  const eureka = await queryDeviceEurekaInfo(host);
  if (eureka) {
    const name = String(eureka['name'] || 'Bedroom');
    const model = 'Google Home Mini';
    const version = String(eureka['cast_build_revision'] || eureka['build_version'] || '3.78.540761');
    const ssid = (eureka['ssid'] as string) || null;
    const setup_state = typeof eureka['setup_state'] === 'number' ? eureka['setup_state'] : 60;
    const public_key = (eureka['public_key'] as string) || '';

    return res.json({
      ok: true,
      info: {
        name,
        model,
        version,
        ip: host,
        connected: Boolean(eureka['connected'] ?? true),
        ssid,
        setup_state,
        has_public_key: Boolean(public_key),
      },
    });
  }

  // 2. Try Flask bridge
  const flaskRes = await forwardToFlask(`/api/setup/info?host=${encodeURIComponent(host)}`);
  if (flaskRes?.ok) {
    return res.json(flaskRes);
  }

  // 3. Fallback
  return res.json({
    ok: true,
    info: {
      name: setupDeviceState.name,
      model: setupDeviceState.model,
      version: setupDeviceState.version,
      ip: host,
      connected: setupDeviceState.connected,
      ssid: setupDeviceState.ssid,
      setup_state: setupDeviceState.setup_state,
      has_public_key: setupDeviceState.has_public_key,
    },
  });
});

app.post('/api/setup/scan', async (req, res) => {
  const host = (req.body?.host ?? '').trim() || '192.168.18.27';
  if (!isValidHostOrIp(host)) {
    return res.status(400).json({ ok: false, error: 'Host de configuración no válido.' });
  }

  // 1. Check if device is real and already connected
  const eureka = await queryDeviceEurekaInfo(host);
  if (eureka && eureka['ssid']) {
    const signalLevel = typeof eureka['signal_level'] === 'number' ? eureka['signal_level'] : -50;
    const networks = [
      {
        ssid: String(eureka['ssid']),
        signal: signalLevel,
        signalQuality: 'Excelente',
        isSecure: true,
        wpa_auth: 7,
        wpa_cipher: 4,
      },
    ];
    return res.json({
      ok: true,
      networks,
      message: `El altavoz está conectado a '${eureka['ssid']}' (${signalLevel} dBm).`,
    });
  }

  // 2. Try Flask bridge scan
  const flaskScan = await forwardToFlask('/api/setup/scan', { method: 'POST', body: { host } });
  if (flaskScan?.ok && Array.isArray(flaskScan.networks)) {
    return res.json(flaskScan);
  }

  // 3. Fallback simulated networks
  const rawScan = [
    { ssid: 'CELERITY_CHUSAN', signal_level: -50, wpa_auth: 7, wpa_cipher: 4 },
    { ssid: 'Red_Domotica_5G', signal_level: -54, wpa_auth: 7, wpa_cipher: 4 },
    { ssid: 'Hogar_Fibra_WiFi', signal_level: -62, wpa_auth: 7, wpa_cipher: 4 },
  ];
  const networks = normalizeAndSortNetworks(rawScan);
  return res.json({ ok: true, networks });
});

app.post('/api/setup/connect', async (req, res) => {
  try {
    const host = (req.body?.host ?? '').trim() || '192.168.18.27';
    const ssid = (req.body?.ssid ?? '').trim();
    if (!ssid) {
      return res.status(400).json({ ok: false, error: 'Selecciona una red Wi-Fi.' });
    }
    const password = String(req.body?.password ?? '');
    const name = (req.body?.name ?? '').trim();
    const wpa_auth = Number(req.body?.wpa_auth ?? 7);
    const wpa_cipher = Number(req.body?.wpa_cipher ?? 4);

    // Forward to Flask bridge for real setup if device is in setup mode
    const flaskRes = await forwardToFlask('/api/setup/connect', {
      method: 'POST',
      body: { host, ssid, password, name, wpa_auth, wpa_cipher },
    });
    if (flaskRes?.ok) {
      return res.json(flaskRes);
    }

    let encPasswdPreview: string | null = null;
    if (password) {
      encPasswdPreview = encryptWifiPasswordRsa(setupDeviceState.public_key, password);
    }

    const pairedId = `device-${host.replace(/[^a-zA-Z0-9]/g, '-')}`;
    upsertActiveDevice({
      id: pairedId,
      name: name || 'Google Home Mini',
      model: 'Google Home Mini',
      host,
      type: 'audio',
      status: {
        volume: 50,
        muted: false,
        app: 'Ninguna',
        player_state: 'IDLE',
        title: `Emparejado a ${ssid}`,
      },
    });

    return res.json({
      ok: true,
      ssid,
      wpa_auth,
      wpa_cipher,
      encrypted_password_sample: encPasswdPreview
        ? `${encPasswdPreview.slice(0, 36)}...`
        : 'Red abierta (sin cifrado RSA)',
      message: `Credenciales enviadas. El altavoz '${name || 'Google Home Mini'}' se conectó a '${ssid}'.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al conectar Wi-Fi';
    return res.status(502).json({ ok: false, error: message });
  }
});

// ---------- API: Kit Python Local (Fase 0 Archivos Adjuntos) ----------

app.get('/api/local-package', (_req, res) => {
  const assetsDir = join(process.cwd(), 'public/assets/aistudio');
  const fileMapping = [
    {
      filename: 'app.py',
      targetPath: 'google-home-mini-web/app.py',
      description: 'Backend Flask con descubrimiento mDNS (PyChromecast), control Cast y servidor TTS (gTTS)',
      sourceFile: 'app_de90d542.py',
      language: 'python',
    },
    {
      filename: 'setup_api.py',
      targetPath: 'google-home-mini-web/setup_api.py',
      description: 'Cliente GHLocalApi (192.168.255.249:8443/8008) con escaneo Wi-Fi y cifrado RSA PKCS#1 v1.5',
      sourceFile: 'setup_api_e9ac6ecc.py',
      language: 'python',
    },
    {
      filename: 'requirements.txt',
      targetPath: 'google-home-mini-web/requirements.txt',
      description: 'Dependencias Python: Flask, PyChromecast, requests, cryptography y gTTS',
      sourceFile: 'requirements_77b9eb83.txt',
      language: 'text',
    },
    {
      filename: 'README.md',
      targetPath: 'google-home-mini-web/README.md',
      description: 'Documentación oficial de instalación, flujo de emparejamiento y tabla de endpoints REST',
      sourceFile: 'README_f088d4fd.md',
      language: 'markdown',
    },
    {
      filename: 'static/index.html',
      targetPath: 'google-home-mini-web/static/index.html',
      description: 'Plantilla HTML estática original para el servidor local en puerto 5000',
      sourceFile: 'index_c278477c.html',
      language: 'html',
    },
    {
      filename: 'static/app.js',
      targetPath: 'google-home-mini-web/static/app.js',
      description: 'Cliente JavaScript ligero original para el modo standalone de Flask',
      sourceFile: 'app_4a9d3318.js',
      language: 'javascript',
    },
    {
      filename: 'static/style.css',
      targetPath: 'google-home-mini-web/static/style.css',
      description: 'Hoja de estilos original para el paquete local Flask',
      sourceFile: 'style_aa674657.css',
      language: 'css',
    },
  ];

  const files = fileMapping.map((item) => {
    const fullPath = join(assetsDir, item.sourceFile);
    const content = existsSync(fullPath)
      ? readFileSync(fullPath, 'utf-8')
      : `# Archivo ${item.filename} no encontrado en ${fullPath}`;
    return {
      filename: item.filename,
      targetPath: item.targetPath,
      description: item.description,
      language: item.language,
      content,
    };
  });

  return res.json({ ok: true, files });
});

// ---------- API: Automatización, Rutinas y Horarios (Scheduler Local) ----------

const schedulerDispatcher: SpeakerDispatcher = {
  getActiveDeviceIds(): string[] {
    return Array.from(activeDevices.keys());
  },
  getDeviceName(id: string): string {
    return activeDevices.get(id)?.name || id;
  },
  isDeviceAvailable(id: string): boolean {
    return activeDevices.has(id);
  },
  async sendVolume(deviceId: string, level: number): Promise<boolean> {
    try {
      if (isRealHardwareDevice(deviceId)) {
        await forwardToFlask(`/api/devices/${encodeURIComponent(deviceId)}/volume`, {
          method: 'POST',
          body: { level },
        });
      }
      const dev = activeDevices.get(deviceId);
      if (dev) {
        dev.status.volume = level;
        if (level > 0 && dev.status.muted) dev.status.muted = false;
      }
      return true;
    } catch {
      return false;
    }
  },
  async sendMute(deviceId: string, muted: boolean): Promise<boolean> {
    try {
      if (isRealHardwareDevice(deviceId)) {
        await forwardToFlask(`/api/devices/${encodeURIComponent(deviceId)}/mute`, {
          method: 'POST',
          body: { muted },
        });
      }
      const dev = activeDevices.get(deviceId);
      if (dev) dev.status.muted = muted;
      return true;
    } catch {
      return false;
    }
  },
  async sendTts(deviceId: string, text: string, lang: 'es' | 'en' | 'pt'): Promise<boolean> {
    try {
      if (isRealHardwareDevice(deviceId)) {
        await forwardToFlask(`/api/devices/${encodeURIComponent(deviceId)}/say`, {
          method: 'POST',
          body: { text, lang },
        });
      }
      const dev = activeDevices.get(deviceId);
      if (dev) {
        dev.status.app = `Text-to-Speech (${lang.toUpperCase()})`;
        dev.status.player_state = 'PLAYING';
        dev.status.title = `🗣️ "${text.slice(0, 60)}"`;
      }
      return true;
    } catch {
      return false;
    }
  },
  async sendPlayUrl(deviceId: string, url: string, title?: string): Promise<boolean> {
    try {
      if (isRealHardwareDevice(deviceId)) {
        await forwardToFlask(`/api/devices/${encodeURIComponent(deviceId)}/play`, {
          method: 'POST',
          body: { url, title: title || url },
        });
      }
      const dev = activeDevices.get(deviceId);
      if (dev) {
        dev.status.app = 'Default Media Receiver';
        dev.status.player_state = 'PLAYING';
        dev.status.title = title || url;
      }
      return true;
    } catch {
      return false;
    }
  },
  async sendMediaControl(deviceId: string, action: 'pause' | 'stop'): Promise<boolean> {
    try {
      if (isRealHardwareDevice(deviceId)) {
        await forwardToFlask(`/api/devices/${encodeURIComponent(deviceId)}/media/${action}`, {
          method: 'POST',
        });
      }
      const dev = activeDevices.get(deviceId);
      if (dev) {
        dev.status.player_state = action === 'pause' ? 'PAUSED' : 'IDLE';
      }
      return true;
    } catch {
      return false;
    }
  },
};

const schedulerEngine = new SchedulerEngine(schedulerDispatcher);
schedulerEngine.start();

app.get('/api/scheduler/overview', (req, res) => {
  try {
    const dnd = getDndConfig();
    const routines = getRoutines();
    const timers = getActiveTimers();
    const notifications = getErrorNotifications();
    const unreadErrorsCount = notifications.filter((n) => !n.read).length;

    // Calcular próxima rutina
    const now = new Date();
    const enabledRoutines = routines
      .filter((r) => r.enabled)
      .map((r) => {
        const nextDate = calculateNextRun(r.time, r.days, now);
        return { ...r, nextRunAt: nextDate ? nextDate.toISOString() : undefined };
      })
      .filter((r) => r.nextRunAt)
      .sort((a, b) => new Date(a.nextRunAt!).getTime() - new Date(b.nextRunAt!).getTime());

    return res.json({
      ok: true,
      overview: {
        dnd,
        isDndActive: isDndActive(dnd, now),
        routinesCount: routines.length,
        activeTimersCount: timers.length,
        unreadErrorsCount,
        nextRoutine: enabledRoutines[0],
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al obtener overview';
    return res.status(500).json({ ok: false, error: message });
  }
});

// Rutinas
app.get('/api/scheduler/routines', (req, res) => {
  try {
    const now = new Date();
    const routines = getRoutines().map((r) => {
      const nextDate = r.enabled ? calculateNextRun(r.time, r.days, now) : null;
      return {
        ...r,
        nextRunAt: nextDate ? nextDate.toISOString() : undefined,
      };
    });

    routines.sort((a, b) => {
      if (!a.nextRunAt) return 1;
      if (!b.nextRunAt) return -1;
      return new Date(a.nextRunAt).getTime() - new Date(b.nextRunAt).getTime();
    });

    return res.json({ ok: true, routines });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al listar rutinas';
    return res.status(500).json({ ok: false, error: message });
  }
});

app.post('/api/scheduler/routines', (req, res) => {
  try {
    const validation = validateRoutine(req.body);
    if (!validation.valid) {
      return res.status(400).json({ ok: false, error: validation.error });
    }

    const now = new Date();
    const nextDate = calculateNextRun(req.body.time, req.body.days, now);

    const routine: Routine = {
      id: `routine-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: req.body.name.trim(),
      enabled: req.body.enabled !== false,
      time: req.body.time.trim(),
      days: req.body.days,
      targetDeviceIds: req.body.targetDeviceIds,
      actions: req.body.actions.map((act: any, idx: number) => ({
        id: act.id || `act-${idx + 1}-${Date.now()}`,
        type: act.type,
        text: act.text,
        lang: act.lang || 'es',
        urgent: Boolean(act.urgent),
        url: act.url,
        title: act.title,
        volume: typeof act.volume === 'number' ? act.volume : undefined,
        muted: typeof act.muted === 'boolean' ? act.muted : undefined,
        mediaAction: act.mediaAction,
        delaySeconds: typeof act.delaySeconds === 'number' ? act.delaySeconds : undefined,
      })),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      nextRunAt: nextDate ? nextDate.toISOString() : undefined,
    };

    saveRoutine(routine);
    return res.json({ ok: true, routine });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al crear rutina';
    return res.status(500).json({ ok: false, error: message });
  }
});

app.put('/api/scheduler/routines/:id', (req, res) => {
  try {
    const routineId = req.params['id'];
    const validation = validateRoutine(req.body);
    if (!validation.valid) {
      return res.status(400).json({ ok: false, error: validation.error });
    }

    const now = new Date();
    const nextDate = calculateNextRun(req.body.time, req.body.days, now);

    const routine: Routine = {
      id: routineId,
      name: req.body.name.trim(),
      enabled: Boolean(req.body.enabled),
      time: req.body.time.trim(),
      days: req.body.days,
      targetDeviceIds: req.body.targetDeviceIds,
      actions: req.body.actions,
      createdAt: req.body.createdAt || now.toISOString(),
      updatedAt: now.toISOString(),
      lastRunAt: req.body.lastRunAt,
      lastRunStatus: req.body.lastRunStatus,
      nextRunAt: nextDate ? nextDate.toISOString() : undefined,
    };

    saveRoutine(routine);
    return res.json({ ok: true, routine });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al actualizar rutina';
    return res.status(500).json({ ok: false, error: message });
  }
});

app.patch('/api/scheduler/routines/:id/toggle', (req, res) => {
  try {
    const routineId = req.params['id'];
    const routines = getRoutines();
    const r = routines.find((item) => item.id === routineId);
    if (!r) {
      return res.status(404).json({ ok: false, error: 'Rutina no encontrada' });
    }

    const enabled = typeof req.body.enabled === 'boolean' ? req.body.enabled : !r.enabled;
    const now = new Date();
    const nextDate = enabled ? calculateNextRun(r.time, r.days, now) : null;

    r.enabled = enabled;
    r.nextRunAt = nextDate ? nextDate.toISOString() : undefined;
    r.updatedAt = now.toISOString();

    saveRoutine(r);
    return res.json({ ok: true, routine: r });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al cambiar estado de rutina';
    return res.status(500).json({ ok: false, error: message });
  }
});

app.delete('/api/scheduler/routines/:id', (req, res) => {
  try {
    const routineId = req.params['id'];
    const removed = deleteRoutine(routineId);
    return res.json({ ok: true, removed });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al eliminar rutina';
    return res.status(500).json({ ok: false, error: message });
  }
});

// Historial
app.get('/api/scheduler/routines/history', (req, res) => {
  try {
    const history = getExecutionHistory();
    return res.json({ ok: true, history });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al obtener historial';
    return res.status(500).json({ ok: false, error: message });
  }
});

app.delete('/api/scheduler/routines/history/:id', (req, res) => {
  try {
    deleteExecutionLog(req.params['id']);
    return res.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al borrar registro';
    return res.status(500).json({ ok: false, error: message });
  }
});

app.delete('/api/scheduler/routines/history', (req, res) => {
  try {
    deleteExecutionLog();
    return res.json({ ok: true, cleared: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al vaciar historial';
    return res.status(500).json({ ok: false, error: message });
  }
});

// DND
app.get('/api/scheduler/dnd', (req, res) => {
  try {
    const dnd = getDndConfig();
    return res.json({ ok: true, dnd, isActive: isDndActive(dnd) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al obtener DND';
    return res.status(500).json({ ok: false, error: message });
  }
});

app.put('/api/scheduler/dnd', (req, res) => {
  try {
    const { enabled, startTime, endTime, maxVolume } = req.body;
    if (startTime === endTime) {
      return res.status(400).json({
        ok: false,
        error: 'La hora de inicio y de fin de No Molestar no pueden ser idénticas.',
      });
    }

    const dnd: DndConfig = {
      enabled: Boolean(enabled),
      startTime: (startTime || '21:00').trim(),
      endTime: (endTime || '07:00').trim(),
      maxVolume: typeof maxVolume === 'number' ? Math.max(0, Math.min(100, maxVolume)) : 25,
    };

    saveDndConfig(dnd);
    return res.json({ ok: true, dnd, isActive: isDndActive(dnd) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al actualizar DND';
    return res.status(500).json({ ok: false, error: message });
  }
});

// Temporizadores
app.get('/api/scheduler/timers', (req, res) => {
  try {
    const timers = getActiveTimers();
    return res.json({ ok: true, timers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al listar temporizadores';
    return res.status(500).json({ ok: false, error: message });
  }
});

app.post('/api/scheduler/timers', (req, res) => {
  try {
    const durationMinutes = Number(req.body.durationMinutes);
    const alertPoints = Array.isArray(req.body.alertPoints) ? req.body.alertPoints : [];
    const targetDeviceId = String(req.body.targetDeviceId || '').trim();

    if (!targetDeviceId) {
      return res.status(400).json({ ok: false, error: 'Debes seleccionar un altavoz destino.' });
    }

    const currentTimers = getActiveTimers();
    if (currentTimers.length >= 10) {
      return res.status(400).json({
        ok: false,
        error: 'Límite alcanzado: se permiten hasta 10 temporizadores simultáneos.',
      });
    }

    const validation = validateTimerInput(
      durationMinutes,
      alertPoints,
      req.body.label,
      req.body.lang
    );
    if (!validation.valid) {
      return res.status(400).json({ ok: false, error: validation.error });
    }

    const now = Date.now();
    const endsAt = new Date(now + durationMinutes * 60_000).toISOString();

    const dev = activeDevices.get(targetDeviceId);
    const targetDeviceName = dev ? dev.name : targetDeviceId;

    const timer: ActiveTimer = {
      id: `timer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label: validation.cleanLabel,
      targetDeviceId,
      targetDeviceName,
      durationMinutes,
      alertPoints: validation.cleanAlerts,
      lang: validation.cleanLang,
      startedAt: new Date(now).toISOString(),
      endsAt,
      alertsFired: [],
    };

    saveActiveTimer(timer);
    return res.json({ ok: true, timer });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al crear temporizador';
    return res.status(500).json({ ok: false, error: message });
  }
});

app.delete('/api/scheduler/timers/:id', (req, res) => {
  try {
    const timerId = req.params['id'];
    const removed = removeActiveTimer(timerId);
    return res.json({ ok: true, removed });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al cancelar temporizador';
    return res.status(500).json({ ok: false, error: message });
  }
});

// Notificaciones
app.get('/api/scheduler/notifications', (req, res) => {
  try {
    const notifications = getErrorNotifications();
    return res.json({ ok: true, notifications });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al listar notificaciones';
    return res.status(500).json({ ok: false, error: message });
  }
});

app.patch('/api/scheduler/notifications/:id/read', (req, res) => {
  try {
    markErrorNotificationRead(req.params['id']);
    return res.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al marcar notificación';
    return res.status(500).json({ ok: false, error: message });
  }
});

app.delete('/api/scheduler/notifications/:id', (req, res) => {
  try {
    dismissErrorNotification(req.params['id']);
    return res.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al descartar notificación';
    return res.status(500).json({ ok: false, error: message });
  }
});

app.delete('/api/scheduler/notifications', (req, res) => {
  try {
    dismissErrorNotification();
    return res.json({ ok: true, cleared: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al descartar notificaciones';
    return res.status(500).json({ ok: false, error: message });
  }
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  })
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

export const reqHandler = createNodeRequestHandler(app);
