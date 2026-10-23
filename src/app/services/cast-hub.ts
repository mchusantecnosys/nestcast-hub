import { Injectable, PLATFORM_ID, inject, signal, computed } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  CastDevice,
  CastStatus,
  EurekaInfo,
  NormalizedWifiNetwork,
  AudioPreset,
  TtsEntry,
  LocalPackageFile,
  ToastMessage,
  MediaActionType,
  DiscoveredSpeaker,
} from '../models/cast.models';
import { upsertTtsHistory, toggleTtsFavorite } from '../../utils/cast-logic';

const DEFAULT_PRESETS: AudioPreset[] = [
  {
    id: 'preset-soma-groove',
    title: 'SomaFM Groove Salad',
    subtitle: 'Ambient & Downtempo Instrumental (MP3 128k)',
    category: 'Radio',
    url: 'https://ice1.somafm.com/groovesalad-128-mp3',
    icon: 'radio',
  },
  {
    id: 'preset-soma-drone',
    title: 'SomaFM Drone Zone',
    subtitle: 'Texturas Atmosféricas Relajantes',
    category: 'Ambiente',
    url: 'https://ice1.somafm.com/dronezone-128-mp3',
    icon: 'spa',
  },
  {
    id: 'preset-swiss-jazz',
    title: 'Radio Swiss Jazz',
    subtitle: 'Jazz Clásico y Contemporáneo en Streaming',
    category: 'Radio',
    url: 'https://stream.srg-ssr.ch/m/rsj/mp3_128',
    icon: 'music_note',
  },
  {
    id: 'preset-chime-ready',
    title: 'Tono de Recepción / Turno',
    subtitle: 'Aviso acústico suave para sala de espera',
    category: 'Aviso Clínico',
    url: 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg',
    icon: 'notifications_active',
  },
];

const INITIAL_TTS_HISTORY: TtsEntry[] = [
  {
    id: 'seed-tts-1',
    text: 'Hola, bienvenidos. Por favor tome asiento en la sala de espera.',
    lang: 'es',
    createdAt: '2026-10-22T09:00:00.000Z',
    favorite: true,
  },
  {
    id: 'seed-tts-2',
    text: 'Hola, la cena está lista en el comedor.',
    lang: 'es',
    createdAt: '2026-10-22T08:30:00.000Z',
    favorite: true,
  },
  {
    id: 'seed-tts-3',
    text: 'The meeting room speaker is now connected and ready.',
    lang: 'en',
    createdAt: '2026-10-22T08:00:00.000Z',
    favorite: false,
  },
];

@Injectable({
  providedIn: 'root',
})
export class CastHubService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  // Navigation & Theme
  readonly activeTab = signal<'control' | 'pair' | 'bridge' | 'automation'>('control');
  readonly darkMode = signal<boolean>(false);

  // Connection Mode: 'lan' uses the unified local Express/Flask LAN bridge
  readonly connectionMode = signal<'lan' | 'simulator'>('lan');
  readonly lanBridgeUrl = signal<string>('http://localhost:5000');
  readonly acousticPreviewEnabled = signal<boolean>(true);

  // Devices & Active Status
  readonly devices = signal<CastDevice[]>([]);
  readonly selectedDeviceId = signal<string | null>(null);
  readonly currentStatus = signal<CastStatus>({
    volume: 45,
    muted: false,
    app: 'Default Media Receiver',
    player_state: 'IDLE',
    title: 'Listo para transmitir',
  });
  readonly discovering = signal<boolean>(false);
  readonly busyAction = signal<string | null>(null);

  // Local Subnet Network Scanner State
  readonly isScanningSubnet = signal<boolean>(false);
  readonly detectedSubnet = signal<string>('192.168.18.');
  readonly detectedSubnetsList = signal<string[]>(['192.168.18.']);
  readonly discoveredLanSpeakers = signal<DiscoveredSpeaker[]>([]);
  readonly pingingDeviceId = signal<string | null>(null);
  readonly knownHosts = signal<string[]>(['192.168.18.27']);

  // Audio Presets & TTS History
  readonly presets = signal<AudioPreset[]>(DEFAULT_PRESETS);
  readonly ttsHistory = signal<TtsEntry[]>(INITIAL_TTS_HISTORY);

  // Wi-Fi Setup Wizard State
  readonly setupHost = signal<string>('192.168.18.27');
  readonly setupInfo = signal<EurekaInfo | null>(null);
  readonly scannedNetworks = signal<NormalizedWifiNetwork[]>([]);
  readonly setupStep = signal<1 | 2 | 3 | 4>(1);
  readonly lastPairingReceipt = signal<{
    ssid: string;
    encryptedSample: string;
    message: string;
  } | null>(null);

  // Local Python Package Files
  readonly localFiles = signal<LocalPackageFile[]>([]);

  // Toast Notification
  readonly toast = signal<ToastMessage | null>(null);
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;

  readonly selectedDevice = computed(() => {
    const id = this.selectedDeviceId();
    return this.devices().find((d) => d.id === id) ?? null;
  });

  readonly favoriteTts = computed(() => this.ttsHistory().filter((item) => item.favorite));

  constructor() {
    if (this.isBrowser) {
      this.loadPersistedState();
    }
  }

  private loadPersistedState(): void {
    try {
      const savedHosts = localStorage.getItem('nestcast_known_hosts');
      if (savedHosts) {
        try {
          const parsed = JSON.parse(savedHosts);
          if (Array.isArray(parsed) && parsed.length > 0) {
            this.knownHosts.set(parsed);
          }
        } catch {
          // Ignore
        }
      }
      const savedHistory = localStorage.getItem('nestcast_tts_history');
      if (savedHistory) {
        const parsed = JSON.parse(savedHistory);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.ttsHistory.set(parsed);
        }
      }
      const savedTheme = localStorage.getItem('nestcast_dark_mode');
      if (savedTheme !== null) {
        this.darkMode.set(savedTheme === 'true');
      } else if (typeof window !== 'undefined' && window.matchMedia) {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        this.darkMode.set(prefersDark);
      }
      this.applyTheme(this.darkMode());

      const savedLanUrl = localStorage.getItem('nestcast_lan_url');
      if (savedLanUrl) {
        this.lanBridgeUrl.set(savedLanUrl);
      }
    } catch {
      // Ignore storage access errors in restricted frames
    }
  }

  applyTheme(isDark: boolean): void {
    if (this.isBrowser && typeof document !== 'undefined') {
      const root = document.documentElement;
      if (isDark) {
        root.classList.add('dark');
        root.setAttribute('data-theme', 'dark');
        document.body?.classList.add('dark');
      } else {
        root.classList.remove('dark');
        root.setAttribute('data-theme', 'light');
        document.body?.classList.remove('dark');
      }
    }
  }

  private saveTtsHistory(list: TtsEntry[]): void {
    this.ttsHistory.set(list);
    if (this.isBrowser) {
      try {
        localStorage.setItem('nestcast_tts_history', JSON.stringify(list));
      } catch {
        // Ignore
      }
    }
  }

  toggleDarkMode(): void {
    const next = !this.darkMode();
    this.darkMode.set(next);
    this.applyTheme(next);
    if (this.isBrowser) {
      try {
        localStorage.setItem('nestcast_dark_mode', String(next));
      } catch {
        // Ignore
      }
    }
  }

  setConnectionMode(mode: 'lan' | 'simulator' = 'lan', customUrl?: string): void {
    this.connectionMode.set(mode);
    if (customUrl !== undefined && customUrl.trim()) {
      const clean = customUrl.trim().replace(/\/+$/, '');
      this.lanBridgeUrl.set(clean);
      if (this.isBrowser) {
        try {
          localStorage.setItem('nestcast_lan_url', clean);
        } catch {
          // Ignore
        }
      }
    }
    const targetDesc = mode === 'simulator' ? 'Simulador Interactivo' : `puente local en ${this.lanBridgeUrl()}`;
    this.showToast(`Modo cambiado a: ${targetDesc}`, 'info');
  }

  showToast(text: string, type: 'info' | 'success' | 'error' = 'info'): void {
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
    this.toast.set({ id: Date.now(), text, type });
    this.toastTimeout = setTimeout(
      () => {
        this.toast.set(null);
      },
      type === 'error' ? 6000 : 3500
    );
  }

  private resolveApiUrl(path: string): string {
    return path;
  }

  private async apiRequest<T>(
    path: string,
    options: { method?: 'GET' | 'POST' | 'DELETE' | string; body?: unknown } = {}
  ): Promise<T> {
    const url = this.resolveApiUrl(path);
    const res = await fetch(url, {
      method: options.method ?? 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await res
      .json()
      .catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || `Error HTTP ${res.status}`);
    }
    return data as T;
  }

  async discoverDevices(knownHostsParam?: string): Promise<void> {
    this.discovering.set(true);
    try {
      const hostsList =
        knownHostsParam !== undefined ? knownHostsParam : this.knownHosts().join(',');
      const query = hostsList.trim() ? `?hosts=${encodeURIComponent(hostsList.trim())}` : '';
      const data = await this.apiRequest<{ ok: boolean; devices: CastDevice[] }>(
        `/api/devices${query}`
      );
      // Deduplicar lista de dispositivos por host o ID
      const seen = new Set<string>();
      const uniqueDevices: CastDevice[] = [];
      for (const d of data.devices || []) {
        const key = d.host || d.id;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueDevices.push(d);
        }
      }
      this.devices.set(uniqueDevices);
      if (uniqueDevices.length > 0) {
        // Guardar cualquier host nuevo descubierto
        const currentHosts = new Set(this.knownHosts());
        for (const d of uniqueDevices) {
          if (d.host) currentHosts.add(d.host);
        }
        const updatedList = Array.from(currentHosts);
        this.knownHosts.set(updatedList);
        if (this.isBrowser) {
          try {
            localStorage.setItem('nestcast_known_hosts', JSON.stringify(updatedList));
          } catch {
            // Ignore
          }
        }

        const currentId = this.selectedDeviceId();
        const stillExists = uniqueDevices.some((d) => d.id === currentId);
        const targetDevice = stillExists
          ? uniqueDevices.find((d) => d.id === currentId)!
          : uniqueDevices[0];
        await this.selectDevice(targetDevice.id);
        this.showToast(`${uniqueDevices.length} altavoz(ces) disponible(s) en la red`, 'success');
      } else {
        this.selectedDeviceId.set(null);
        this.showToast('No se encontraron altavoces. Haz clic en "Escanear red local" para buscarlos.', 'info');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al buscar dispositivos';
      this.showToast(msg, 'error');
    } finally {
      this.discovering.set(false);
    }
  }

  async scanLocalNetwork(customSubnet?: string): Promise<DiscoveredSpeaker[]> {
    this.isScanningSubnet.set(true);
    try {
      const target = customSubnet?.trim() || this.detectedSubnet();
      const query = target ? `?subnet=${encodeURIComponent(target)}` : '';
      const data = await this.apiRequest<{
        ok: boolean;
        subnet: string;
        detected_subnets?: string[];
        devices: DiscoveredSpeaker[];
      }>(`/api/devices/scan-network${query}`);

      if (data.subnet) {
        this.detectedSubnet.set(data.subnet);
      }
      if (Array.isArray(data.detected_subnets) && data.detected_subnets.length > 0) {
        this.detectedSubnetsList.set(data.detected_subnets);
      }
      this.discoveredLanSpeakers.set(data.devices || []);

      if (data.devices && data.devices.length > 0) {
        this.showToast(
          `¡${data.devices.length} altavoz(ces) detectado(s) en la red!`,
          'success'
        );
      } else {
        this.showToast(
          `Escaneo completo: no se detectaron nuevos altavoces en ${data.subnet}`,
          'info'
        );
      }
      return data.devices || [];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al escanear la red local';
      this.showToast(msg, 'error');
      return [];
    } finally {
      this.isScanningSubnet.set(false);
    }
  }

  async pingSpeaker(hostOrId: string): Promise<boolean> {
    this.pingingDeviceId.set(hostOrId);
    try {
      const data = await this.apiRequest<{ ok: boolean; pinged?: string; name?: string }>(
        `/api/devices/${encodeURIComponent(hostOrId)}/ping`,
        { method: 'POST' }
      );
      this.showToast(`🔔 Tono enviado a ${data.name || 'altavoz'}`, 'info');
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al hacer sonar el altavoz';
      this.showToast(msg, 'error');
      return false;
    } finally {
      this.pingingDeviceId.set(null);
    }
  }

  isSpeakerConnected(speaker: DiscoveredSpeaker): boolean {
    return this.devices().some(
      (d) =>
        d.host === speaker.host ||
        d.id === speaker.id ||
        (speaker.ip && d.host === speaker.ip)
    );
  }

  async addDiscoveredSpeaker(speaker: DiscoveredSpeaker): Promise<boolean> {
    if (this.isSpeakerConnected(speaker)) {
      this.showToast(`El dispositivo "${speaker.name}" ya está conectado.`, 'info');
      return false;
    }

    const currentHosts = new Set(this.knownHosts());
    currentHosts.add(speaker.host);
    const updated = Array.from(currentHosts);
    this.knownHosts.set(updated);
    if (this.isBrowser) {
      try {
        localStorage.setItem('nestcast_known_hosts', JSON.stringify(updated));
      } catch {
        // Ignore
      }
    }

    await this.discoverDevices(updated.join(','));
    this.showToast(`Altavoz '${speaker.name}' vinculado al Hub`, 'success');
    return true;
  }

  async removeDevice(deviceId: string): Promise<boolean> {
    const target = this.devices().find((d) => d.id === deviceId);
    const name = target ? target.name : 'Altavoz';
    try {
      await this.apiRequest(`/api/devices/${encodeURIComponent(deviceId)}`, {
        method: 'DELETE',
      });

      const remaining = this.devices().filter((d) => d.id !== deviceId);
      this.devices.set(remaining);

      if (this.selectedDeviceId() === deviceId) {
        if (remaining.length > 0) {
          await this.selectDevice(remaining[0].id);
        } else {
          this.selectedDeviceId.set(null);
          this.currentStatus.set({
            volume: 0,
            muted: false,
            app: 'Ninguna',
            player_state: 'IDLE',
            title: '',
          });
        }
      }

      this.showToast(`Altavoz '${name}' eliminado del Hub`, 'info');
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al eliminar el altavoz';
      this.showToast(msg, 'error');
      return false;
    }
  }

  async selectDevice(deviceId: string): Promise<void> {
    this.selectedDeviceId.set(deviceId);
    await this.refreshStatus();
  }

  async refreshStatus(): Promise<void> {
    const id = this.selectedDeviceId();
    if (!id) return;
    try {
      const data = await this.apiRequest<{
        ok: boolean;
        device: CastDevice;
        status: CastStatus;
      }>(`/api/devices/${encodeURIComponent(id)}/status`);
      this.currentStatus.set(data.status);
    } catch {
      this.currentStatus.update((st) => ({ ...st, player_state: 'Sin conexión' }));
    }
  }

  async setVolume(level: number, deviceId?: string): Promise<void> {
    const id = deviceId || this.selectedDeviceId();
    if (!id) return;
    try {
      const rounded = Math.max(0, Math.min(100, Math.round(level)));
      this.devices.update((devs) =>
        devs.map((d) =>
          d.id === id
            ? {
                ...d,
                status: {
                  ...(d.status || { app: '', player_state: 'IDLE', title: '', muted: false }),
                  volume: rounded,
                  muted: rounded > 0 && d.status?.muted ? false : (d.status?.muted ?? false),
                },
              }
            : d
        )
      );
      if (this.selectedDeviceId() === id) {
        this.currentStatus.update((st) => ({
          ...st,
          volume: rounded,
          muted: rounded > 0 && st.muted ? false : st.muted,
        }));
      }
      await this.apiRequest(`/api/devices/${encodeURIComponent(id)}/volume`, {
        method: 'POST',
        body: { level: rounded },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo cambiar el volumen';
      this.showToast(msg, 'error');
    }
  }

  async toggleMute(deviceId?: string): Promise<void> {
    const id = deviceId || this.selectedDeviceId();
    if (!id) return;
    this.busyAction.set('mute');
    try {
      const dev = this.devices().find((d) => d.id === id);
      const nextMuted = !(dev?.status?.muted ?? this.currentStatus().muted);
      await this.apiRequest(`/api/devices/${encodeURIComponent(id)}/mute`, {
        method: 'POST',
        body: { muted: nextMuted },
      });
      this.devices.update((devs) =>
        devs.map((d) =>
          d.id === id
            ? {
                ...d,
                status: {
                  ...(d.status || { app: '', player_state: 'IDLE', title: '', volume: 40 }),
                  muted: nextMuted,
                },
              }
            : d
        )
      );
      if (this.selectedDeviceId() === id) {
        this.currentStatus.update((st) => ({ ...st, muted: nextMuted }));
      }
      this.showToast(nextMuted ? 'Altavoz silenciado' : 'Sonido activado', 'info');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al silenciar';
      this.showToast(msg, 'error');
    } finally {
      this.busyAction.set(null);
    }
  }

  async sendMediaAction(action: MediaActionType, deviceId?: string): Promise<void> {
    const id = deviceId || this.selectedDeviceId();
    if (!id) return;
    this.busyAction.set(action);
    try {
      await this.apiRequest(`/api/devices/${encodeURIComponent(id)}/media/${action}`, {
        method: 'POST',
      });
      const newState: 'PLAYING' | 'PAUSED' | 'IDLE' =
        action === 'play' ? 'PLAYING' : action === 'pause' ? 'PAUSED' : 'IDLE';
      this.devices.update((devs) =>
        devs.map((d) =>
          d.id === id
            ? {
                ...d,
                status: {
                  ...(d.status || { app: '', volume: 40, muted: false, title: '' }),
                  player_state: newState,
                },
              }
            : d
        )
      );
      if (this.selectedDeviceId() === id) {
        await this.refreshStatus();
      }
      const labels: Record<MediaActionType, string> = {
        play: 'Reproducción reanudada',
        pause: 'Reproducción en pausa',
        stop: 'Reproducción detenida',
        quit: 'Aplicación Cast cerrada',
      };
      this.showToast(labels[action], 'info');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error en control multimedia';
      this.showToast(msg, 'error');
    } finally {
      this.busyAction.set(null);
    }
  }

  async speakToMultiple(
    text: string,
    lang: 'es' | 'en' | 'pt',
    targetDeviceIds: string[]
  ): Promise<boolean> {
    if (!targetDeviceIds || targetDeviceIds.length === 0) {
      this.showToast('Selecciona al menos un altavoz.', 'error');
      return false;
    }
    this.busyAction.set('say');
    try {
      await Promise.all(
        targetDeviceIds.map((id) =>
          this.apiRequest(`/api/devices/${encodeURIComponent(id)}/say`, {
            method: 'POST',
            body: { text, lang },
          })
        )
      );

      const targetNames = this.devices()
        .filter((d) => targetDeviceIds.includes(d.id))
        .map((d) => d.name)
        .join(', ');

      const updated = upsertTtsHistory(this.ttsHistory(), {
        id: `tts-${Date.now()}`,
        text,
        lang,
        createdAt: new Date().toISOString(),
      });
      this.saveTtsHistory(updated);

      if (this.isBrowser && this.acousticPreviewEnabled() && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = lang === 'es' ? 'es-EC' : lang === 'pt' ? 'pt-BR' : 'en-US';
          utterance.volume = Math.max(0.1, this.currentStatus().volume / 100);
          window.speechSynthesis.speak(utterance);
        } catch {
          // Optional
        }
      }

      this.showToast(`Mensaje enviado a ${targetNames || 'los altavoces'}.`, 'success');
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al enviar mensaje';
      this.showToast(msg, 'error');
      return false;
    } finally {
      this.busyAction.set(null);
    }
  }

  async playStreamUrl(url: string, title?: string): Promise<void> {
    const id = this.selectedDeviceId();
    if (!id) {
      this.showToast('Selecciona primero un altavoz de la lista.', 'error');
      return;
    }
    this.busyAction.set('play-url');
    try {
      await this.apiRequest(`/api/devices/${encodeURIComponent(id)}/play`, {
        method: 'POST',
        body: { url, title },
      });
      await this.refreshStatus();
      this.showToast(`Transmitiendo: ${title || url}`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al reproducir audio';
      this.showToast(msg, 'error');
    } finally {
      this.busyAction.set(null);
    }
  }

  async speakText(text: string, lang: 'es' | 'en' | 'pt'): Promise<boolean> {
    const id = this.selectedDeviceId();
    if (!id) {
      this.showToast('Selecciona primero un altavoz de la lista.', 'error');
      return false;
    }
    this.busyAction.set('say');
    try {
      await this.apiRequest(`/api/devices/${encodeURIComponent(id)}/say`, {
        method: 'POST',
        body: { text, lang },
      });

      const updated = upsertTtsHistory(this.ttsHistory(), {
        id: `tts-${Date.now()}`,
        text,
        lang,
        createdAt: new Date().toISOString(),
      });
      this.saveTtsHistory(updated);

      if (this.isBrowser && this.acousticPreviewEnabled() && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(text);
          const langMap: Record<'es' | 'en' | 'pt', string> = {
            es: 'es-EC',
            en: 'en-US',
            pt: 'pt-BR',
          };
          utterance.lang = langMap[lang];
          utterance.volume = Math.max(0.1, this.currentStatus().volume / 100);
          window.speechSynthesis.speak(utterance);
        } catch {
          // SpeechSynthesis is optional
        }
      }

      await this.refreshStatus();
      this.showToast('Frase enviada y reproducida en el altavoz', 'success');
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al enviar texto a voz';
      this.showToast(msg, 'error');
      return false;
    } finally {
      this.busyAction.set(null);
    }
  }

  toggleFavoritePhrase(entryId: string): void {
    const updated = toggleTtsFavorite(this.ttsHistory(), entryId);
    this.saveTtsHistory(updated);
  }

  deletePhrase(entryId: string): void {
    const updated = this.ttsHistory().filter((item) => item.id !== entryId);
    this.saveTtsHistory(updated);
  }

  // ---------- Emparejamiento Wi-Fi (setup_api) ----------

  async readSetupDeviceInfo(host: string): Promise<void> {
    this.busyAction.set('setup-info');
    this.setupHost.set(host.trim() || '192.168.255.249');
    try {
      const data = await this.apiRequest<{ ok: boolean; info: EurekaInfo }>(
        `/api/setup/info?host=${encodeURIComponent(this.setupHost())}`
      );
      this.setupInfo.set(data.info);
      if (this.setupStep() < 2) {
        this.setupStep.set(2);
      }
      this.showToast(
        `Dispositivo ${data.info.name || 'Google Home Mini'} leído correctamente`,
        'success'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al leer eureka_info';
      this.showToast(msg, 'error');
    } finally {
      this.busyAction.set(null);
    }
  }

  async scanWifiNetworks(host: string): Promise<void> {
    this.busyAction.set('setup-scan');
    this.setupHost.set(host.trim() || '192.168.255.249');
    try {
      const data = await this.apiRequest<{ ok: boolean; networks: NormalizedWifiNetwork[] }>(
        '/api/setup/scan',
        {
          method: 'POST',
          body: { host: this.setupHost() },
        }
      );
      this.scannedNetworks.set(data.networks);
      if (this.setupStep() < 3) {
        this.setupStep.set(3);
      }
      this.showToast(`${data.networks.length} red(es) Wi-Fi detectadas por el altavoz`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al escanear redes Wi-Fi';
      this.showToast(msg, 'error');
    } finally {
      this.busyAction.set(null);
    }
  }

  async connectSpeakerToWifi(payload: {
    host: string;
    network: NormalizedWifiNetwork;
    password: string;
    deviceName: string;
  }): Promise<boolean> {
    this.busyAction.set('setup-connect');
    try {
      const res = await this.apiRequest<{
        ok: boolean;
        message: string;
        encrypted_password_sample?: string;
      }>('/api/setup/connect', {
        method: 'POST',
        body: {
          host: payload.host.trim() || '192.168.255.249',
          ssid: payload.network.ssid,
          wpa_auth: payload.network.wpa_auth,
          wpa_cipher: payload.network.wpa_cipher,
          password: payload.password,
          name: payload.deviceName.trim(),
        },
      });
      this.lastPairingReceipt.set({
        ssid: payload.network.ssid,
        encryptedSample: res.encrypted_password_sample || 'Cifrado RSA PKCS#1 v1.5 completado',
        message: res.message,
      });
      this.setupStep.set(4);
      this.showToast(res.message, 'success');

      // Bug 2: Buscar automáticamente más dispositivos en la red local tras ingresar Wi-Fi
      try {
        const found = await this.scanLocalNetwork();
        const currentHosts = new Set(this.knownHosts());
        for (const spk of found) {
          if (spk.host) currentHosts.add(spk.host);
        }
        await this.discoverDevices(Array.from(currentHosts).join(','));
      } catch {
        await this.discoverDevices();
      }
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al conectar Wi-Fi';
      this.showToast(msg, 'error');
      return false;
    } finally {
      this.busyAction.set(null);
    }
  }

  async loadLocalPythonPackage(): Promise<void> {
    if (this.localFiles().length > 0) return;
    try {
      const res = await fetch('/api/local-package');
      const data = await res.json();
      if (data.ok && Array.isArray(data.files)) {
        this.localFiles.set(data.files);
      }
    } catch {
      // Ignore error
    }
  }
}
