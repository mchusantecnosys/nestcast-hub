import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  inject,
  signal,
  computed,
  OnInit,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormControl, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { CastHubService } from './services/cast-hub';
import { AutomationService } from './services/automation.service';
import { DayTimeline } from './components/day-timeline';
import { WifiWizard } from './components/wifi-wizard';
import { LocalBridge } from './components/local-bridge';
import { AutomationPanel } from './components/automation-panel';
import { formatRelativeTime, formatTimeRemaining } from '../utils/scheduler-logic';
import { CastDevice, AudioPreset, DiscoveredSpeaker } from './models/cast.models';
import { Routine, ActiveTimer } from './models/scheduler.models';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatIconModule,
    DayTimeline,
    WifiWizard,
    LocalBridge,
    AutomationPanel,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  readonly hub = inject(CastHubService);
  readonly automation = inject(AutomationService);
  private readonly platformId = inject(PLATFORM_ID);

  @ViewChild('pairingDialog') pairingDialog?: ElementRef<HTMLDialogElement>;

  // Entrada de búsqueda por IP manual
  readonly knownHostsControl = new FormControl('192.168.18.27', { nonNullable: true });

  // Mensaje rápido ("Hablar por los altavoces")
  readonly quickMessageControl = new FormControl('', { nonNullable: true });
  readonly selectedSpeakerIds = signal<string[]>([]);
  readonly quickMessageStatus = signal<string | null>(null);
  private quickMessageTimer: ReturnType<typeof setTimeout> | null = null;

  // Diálogo nativo de emparejamiento ("Emparejar altavoz")
  readonly pairingTab = signal<'lan' | 'hotspot'>('lan');
  readonly customSubnetControl = new FormControl('192.168.18.', { nonNullable: true });
  readonly hotspotHostControl = new FormControl('192.168.255.249', { nonNullable: true });
  readonly selectedWifiSsid = signal<string>('');
  readonly wifiPasswordControl = new FormControl('', { nonNullable: true });
  readonly speakerNameControl = new FormControl('', { nonNullable: true });
  readonly isScanningNetworks = signal<boolean>(false);
  readonly isConnecting = signal<boolean>(false);
  readonly pairingError = signal<string | null>(null);
  readonly pairingSuccess = signal<string | null>(null);

  // Lista calculada de próximas rutinas con tiempo relativo
  readonly upcomingRoutines = computed(() => {
    const now = new Date(this.automation.currentClientTimeMs());
    return this.automation
      .routines()
      .filter((r) => r.enabled)
      .map((r) => ({
        ...r,
        relativeTime: formatRelativeTime(r.time, now),
      }))
      .sort((a, b) => a.time.localeCompare(b.time));
  });

  // Temporizadores activos con cuenta regresiva en vivo
  readonly activeTimersList = computed(() => {
    const nowMs = this.automation.currentClientTimeMs();
    return this.automation.activeTimers().map((t) => {
      const endMs = new Date(t.endsAt).getTime();
      const diffSec = Math.max(0, Math.floor((endMs - nowMs) / 1000));
      return {
        ...t,
        remainingText: formatTimeRemaining(diffSec),
        isDone: diffSec === 0,
      };
    });
  });

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.customSubnetControl.setValue(this.hub.detectedSubnet());
      this.hub.discoverDevices().then(() => {
        // Por defecto, marcar todos los altavoces en "Hablar por los altavoces"
        const ids = this.hub.devices().map((d) => d.id);
        this.selectedSpeakerIds.set(ids);
      });
      this.hub.loadLocalPythonPackage();
    }
  }

  async runDiscovery(): Promise<void> {
    await this.hub.discoverDevices(this.knownHostsControl.value);
    const ids = this.hub.devices().map((d) => d.id);
    this.selectedSpeakerIds.set(ids);
  }

  // --- No molestar ---
  async toggleDnd(): Promise<void> {
    const dnd = this.automation.dndConfig();
    await this.automation.updateDnd({ ...dnd, enabled: !dnd.enabled });
  }

  // --- Selección de altavoces para mensajes ---
  isSpeakerSelected(id: string): boolean {
    return this.selectedSpeakerIds().includes(id);
  }

  toggleSpeakerSelection(id: string): void {
    const current = this.selectedSpeakerIds();
    if (current.includes(id)) {
      this.selectedSpeakerIds.set(current.filter((x) => x !== id));
    } else {
      this.selectedSpeakerIds.set([...current, id]);
    }
  }

  selectAllSpeakers(): void {
    this.selectedSpeakerIds.set(this.hub.devices().map((d) => d.id));
  }

  // --- Envío de mensaje rápido ("Hablar por los altavoces") ---
  async sendQuickMessage(): Promise<void> {
    const text = this.quickMessageControl.value.trim();
    if (!text) return;

    let targetIds = this.selectedSpeakerIds();
    if (targetIds.length === 0) {
      targetIds = this.hub.devices().map((d) => d.id);
      this.selectedSpeakerIds.set(targetIds);
    }

    const success = await this.hub.speakToMultiple(text, 'es', targetIds);
    if (success) {
      const names = this.hub
        .devices()
        .filter((d) => targetIds.includes(d.id))
        .map((d) => d.name)
        .join(', ');

      this.quickMessageStatus.set(`Mensaje enviado a ${names || 'los altavoces'}.`);
      this.quickMessageControl.setValue('');

      if (this.quickMessageTimer) {
        clearTimeout(this.quickMessageTimer);
      }
      this.quickMessageTimer = setTimeout(() => {
        this.quickMessageStatus.set(null);
      }, 5000);
    }
  }

  // --- Control de volumen y reproducción por altavoz ---
  onSpeakerVolumeInput(deviceId: string, event: Event): void {
    const target = event.target as HTMLInputElement;
    let val = parseInt(target.value, 10);
    if (isNaN(val)) return;

    // Si DND está activo en este momento (dentro de su franja horaria), limitar volumen al máximo estipulado
    const dnd = this.automation.dndConfig();
    if (this.automation.isDndActive() && val > dnd.maxVolume) {
      val = dnd.maxVolume;
      target.value = String(val);
    }

    // Actualizar variable CSS --fill
    target.style.setProperty('--fill', `${val}%`);
    void this.hub.setVolume(val, deviceId);
  }

  async togglePlayPause(dev: CastDevice): Promise<void> {
    if (dev.status?.player_state === 'PLAYING') {
      await this.hub.sendMediaAction('pause', dev.id);
    } else {
      await this.hub.sendMediaAction('play', dev.id);
    }
  }

  async playPresetOnSpeaker(dev: CastDevice, preset: AudioPreset): Promise<void> {
    await this.hub.selectDevice(dev.id);
    await this.hub.playStreamUrl(preset.url, preset.title);
  }

  async confirmRemoveDevice(event: Event, dev: { id: string; name: string }): Promise<void> {
    event.stopPropagation();
    event.preventDefault();
    const confirmed = window.confirm(
      `¿Estás seguro de que deseas quitar "${dev.name}" de la lista de altavoces?`
    );
    if (confirmed) {
      await this.hub.removeDevice(dev.id);
      this.selectedSpeakerIds.update((ids) => ids.filter((id) => id !== dev.id));
    }
  }

  // --- Diálogo nativo de emparejamiento ---
  openPairingDialog(initialTab: 'lan' | 'hotspot' = 'lan'): void {
    this.selectPairingTab(initialTab);
    this.pairingError.set(null);
    this.pairingSuccess.set(null);
    this.selectedWifiSsid.set('');
    this.wifiPasswordControl.setValue('');
    this.speakerNameControl.setValue('');

    if (this.pairingDialog?.nativeElement) {
      this.pairingDialog.nativeElement.showModal();
    }
  }

  selectPairingTab(tab: 'lan' | 'hotspot'): void {
    this.pairingTab.set(tab);
    if (tab === 'lan' && this.hub.discoveredLanSpeakers().length === 0) {
      void this.scanLanSpeakers();
    } else if (tab === 'hotspot' && this.hub.scannedNetworks().length === 0) {
      void this.scanNetworks();
    }
  }

  closePairingDialog(): void {
    if (this.pairingDialog?.nativeElement) {
      this.pairingDialog.nativeElement.close();
    }
  }

  async scanLanSpeakers(): Promise<void> {
    this.pairingError.set(null);
    const subnet = this.customSubnetControl.value.trim();
    await this.hub.scanLocalNetwork(subnet);
  }

  async linkDiscoveredSpeaker(speaker: DiscoveredSpeaker): Promise<void> {
    this.pairingError.set(null);
    this.pairingSuccess.set(null);
    try {
      if (this.hub.isSpeakerConnected(speaker)) {
        const msg = `El dispositivo "${speaker.name}" ya está conectado.`;
        this.pairingSuccess.set(msg);
        this.hub.showToast(msg, 'info');
        return;
      }

      const linked = await this.hub.addDiscoveredSpeaker(speaker);
      if (linked) {
        this.pairingSuccess.set(`¡Altavoz "${speaker.name}" vinculado exitosamente!`);
        const ids = this.hub.devices().map((d) => d.id);
        this.selectedSpeakerIds.set(ids);
        setTimeout(() => {
          this.closePairingDialog();
        }, 1200);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al vincular el altavoz';
      this.pairingError.set(msg);
    }
  }

  async pingDiscoveredSpeaker(speaker: DiscoveredSpeaker): Promise<void> {
    await this.hub.pingSpeaker(speaker.host || speaker.ip);
  }

  async scanNetworks(): Promise<void> {
    this.isScanningNetworks.set(true);
    this.pairingError.set(null);
    const host = this.hotspotHostControl.value.trim() || '192.168.255.249';
    try {
      await this.hub.scanWifiNetworks(host);
    } catch {
      this.pairingError.set('No se pudieron escanear redes Wi-Fi desde el altavoz.');
    } finally {
      this.isScanningNetworks.set(false);
    }
  }

  async submitPairing(): Promise<void> {
    const ssid = this.selectedWifiSsid().trim();
    if (!ssid) {
      this.pairingError.set('Por favor, selecciona una red Wi-Fi de la lista.');
      return;
    }

    const network = this.hub.scannedNetworks().find((n) => n.ssid === ssid) || {
      ssid,
      signal: -50,
      signalQuality: 'Excelente' as const,
      isSecure: true,
      wpa_auth: 7,
      wpa_cipher: 4,
    };

    this.isConnecting.set(true);
    this.pairingError.set(null);
    this.pairingSuccess.set(null);

    const host = this.hotspotHostControl.value.trim() || '192.168.255.249';

    try {
      this.pairingSuccess.set(`Enviando configuración Wi-Fi a "${ssid}"...`);
      const ok = await this.hub.connectSpeakerToWifi({
        host,
        network,
        password: this.wifiPasswordControl.value,
        deviceName: this.speakerNameControl.value.trim() || 'Google Home Mini',
      });

      if (ok) {
        // Bug 2: Buscar más dispositivos dentro de la red una vez ingresada la red Wi-Fi
        this.pairingSuccess.set(
          `Altavoz conectado a "${ssid}". Buscando más dispositivos en la red local...`
        );
        this.hub.showToast(`Buscando más dispositivos en la red "${ssid}"...`, 'info');

        // Breve espera para que el altavoz se una al router y reciba IP por DHCP
        await new Promise((resolve) => setTimeout(resolve, 3500));

        // Escanear la subred local para encontrar el altavoz en su nueva IP y cualquier otro altavoz
        await this.hub.scanLocalNetwork();

        // Actualizar lista de hosts conocidos y sincronizar dispositivos
        const currentHosts = new Set(this.hub.knownHosts());
        for (const spk of this.hub.discoveredLanSpeakers()) {
          if (spk.host) currentHosts.add(spk.host);
        }
        await this.hub.discoverDevices(Array.from(currentHosts).join(','));

        const count = this.hub.devices().length;
        this.pairingSuccess.set(
          `¡Wi-Fi configurado! Se detectaron ${count} altavoz(ces) en la red local.`
        );
        this.hub.showToast(
          `¡Configuración completada! ${count} altavoz(ces) disponible(s) en la red.`,
          'success'
        );

        // Cambiar a la pestaña de red local para ver los altavoces
        this.selectPairingTab('lan');

        setTimeout(() => {
          this.closePairingDialog();
        }, 2200);
      } else {
        this.pairingError.set('No se pudo conectar el altavoz a la red Wi-Fi indicada.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error durante el emparejamiento.';
      this.pairingError.set(msg);
    } finally {
      this.isConnecting.set(false);
    }
  }

  // --- Ayudante de nombres de altavoces para rutinas ---
  getSpeakerNamesForRoutine(routine: Routine): string {
    if (routine.targetDeviceIds.includes('all')) {
      return 'Todos los altavoces';
    }
    const names = this.hub
      .devices()
      .filter((d) => routine.targetDeviceIds.includes(d.id))
      .map((d) => d.name);
    return names.length > 0 ? names.join(', ') : 'Altavoz sin asignar';
  }

  getSpeakerNameById(deviceId: string): string {
    const d = this.hub.devices().find((item) => item.id === deviceId);
    return d ? d.name : deviceId;
  }
}
