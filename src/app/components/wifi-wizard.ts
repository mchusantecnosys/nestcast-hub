import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { CastHubService } from '../services/cast-hub';

@Component({
  selector: 'app-wifi-wizard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatIconModule],
  template: `
    <div class="space-y-8">
      <!-- Header & 4-Step Guide Overview -->
      <section
        class="rounded-2xl border p-6 transition-colors"
        [class.bg-white]="!hub.darkMode()"
        [class.border-slate-200]="!hub.darkMode()"
        [class.bg-slate-900]="hub.darkMode()"
        [class.border-slate-800]="hub.darkMode()"
      >
        <div class="flex flex-wrap items-start justify-between gap-4 pb-5 border-b"
             [class.border-slate-100]="!hub.darkMode()"
             [class.border-slate-800]="hub.darkMode()">
          <div>
            <div class="flex items-center gap-2 text-xs font-medium"
                 [class.text-slate-500]="!hub.darkMode()"
                 [class.text-slate-400]="hub.darkMode()">
              <span>Protocolo GHLocalApi</span>
              <span aria-hidden="true">·</span>
              <span class="font-mono tabular-nums">HTTPS :8443 / HTTP :8008</span>
              <span aria-hidden="true">·</span>
              <span>Cifrado RSA PKCS#1 v1.5</span>
            </div>
            <h2 class="mt-1 text-2xl font-bold tracking-tight font-display">
              Asistente de Emparejamiento Wi-Fi
            </h2>
          </div>

          <button
            type="button"
            (click)="hub.activeTab.set('control')"
            class="inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            [class.border-slate-200]="!hub.darkMode()"
            [class.hover:bg-slate-50]="!hub.darkMode()"
            [class.border-slate-700]="hub.darkMode()"
            [class.hover:bg-slate-800]="hub.darkMode()"
          >
            <mat-icon class="!text-base !w-4 !h-4 leading-none">arrow_back</mat-icon>
            <span>Ir a Controlar</span>
          </button>
        </div>

        <!-- Step Progress Strip -->
        <ol class="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-5 text-xs">
          <li class="space-y-1">
            <span class="font-mono font-semibold text-blue-600">01. Modo Setup</span>
            <p [class.text-slate-600]="!hub.darkMode()" [class.text-slate-400]="hub.darkMode()">
              Mantén pulsado el botón de reset 15 s y conecta tu PC al Wi-Fi temporal <code>GoogleHomeXXXX</code>.
            </p>
          </li>
          <li class="space-y-1">
            <span class="font-mono font-semibold" [class.text-blue-600]="hub.setupStep() >= 2">02. Leer eureka_info</span>
            <p [class.text-slate-600]="!hub.darkMode()" [class.text-slate-400]="hub.darkMode()">
              Extrae el modelo, firmware y la clave pública RSA del dispositivo en <code>192.168.255.249</code>.
            </p>
          </li>
          <li class="space-y-1">
            <span class="font-mono font-semibold" [class.text-blue-600]="hub.setupStep() >= 3">03. Escaneo Wi-Fi</span>
            <p [class.text-slate-600]="!hub.darkMode()" [class.text-slate-400]="hub.darkMode()">
              Solicita al altavoz la lista de redes cercanas ordenadas por nivel de señal (dBm).
            </p>
          </li>
          <li class="space-y-1">
            <span class="font-mono font-semibold" [class.text-emerald-600]="hub.setupStep() === 4">04. Cifrar y Guardar</span>
            <p [class.text-slate-600]="!hub.darkMode()" [class.text-slate-400]="hub.darkMode()">
              Cifra la contraseña con la clave pública del altavoz y asigna el nombre de habitación.
            </p>
          </li>
        </ol>
      </section>

      <!-- Step 1 & 2: Device Discovery & eureka_info Inspector + Step 3 & 4 Form -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
        <!-- Left Column: Host Input, Read Info & Scanned Networks Table -->
        <section
          class="rounded-2xl border p-6 flex flex-col justify-between transition-colors"
          [class.bg-white]="!hub.darkMode()"
          [class.border-slate-200]="!hub.darkMode()"
          [class.bg-slate-900]="hub.darkMode()"
          [class.border-slate-800]="hub.darkMode()"
        >
          <div>
            <h3 class="text-lg font-bold font-display">1. Conexión con el Altavoz en Modo Configuración</h3>
            <p class="text-xs mt-1"
               [class.text-slate-500]="!hub.darkMode()"
               [class.text-slate-400]="hub.darkMode()">
              Dirección IP por defecto cuando estás conectado al hotspot del Google Home Mini
            </p>

            <div class="mt-4 flex flex-wrap items-center gap-2.5">
              <label for="setup-host-input" class="sr-only">IP del altavoz en modo configuración</label>
              <input
                id="setup-host-input"
                type="text"
                [formControl]="hostControl"
                placeholder="192.168.18.27"
                class="flex-1 min-w-[160px] rounded-xl border px-3.5 py-2 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600"
                [class.bg-slate-50]="!hub.darkMode()"
                [class.border-slate-200]="!hub.darkMode()"
                [class.bg-slate-800]="hub.darkMode()"
                [class.border-slate-700]="hub.darkMode()"
              />

              <button
                type="button"
                (click)="scanLan()"
                [disabled]="hub.isScanningSubnet()"
                class="inline-flex items-center gap-1.5 rounded-xl border border-blue-600/30 bg-blue-50/60 hover:bg-blue-100/60 text-blue-600 px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <mat-icon class="!text-base !w-4 !h-4 leading-none" [class.animate-spin]="hub.isScanningSubnet()">radar</mat-icon>
                <span>{{ hub.isScanningSubnet() ? 'Buscando...' : 'Escanear red local' }}</span>
              </button>

              <button
                type="button"
                (click)="readDevice()"
                [disabled]="hub.busyAction() === 'setup-info'"
                class="inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                [class.border-slate-200]="!hub.darkMode()"
                [class.hover:bg-slate-50]="!hub.darkMode()"
                [class.border-slate-700]="hub.darkMode()"
                [class.hover:bg-slate-800]="hub.darkMode()"
              >
                <mat-icon class="!text-base !w-4 !h-4 leading-none text-blue-600">memory</mat-icon>
                <span>Leer dispositivo</span>
              </button>

              <button
                type="button"
                (click)="scanNetworks()"
                [disabled]="hub.busyAction() === 'setup-scan'"
                class="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <mat-icon class="!text-base !w-4 !h-4 leading-none">wifi_find</mat-icon>
                <span>Buscar redes Wi-Fi</span>
              </button>
            </div>

            <!-- Quick IP Preset Badges -->
            <div class="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
              <span [class.text-slate-400]="!hub.darkMode()" [class.text-slate-500]="hub.darkMode()">Atajos rápidos:</span>
              <button
                type="button"
                (click)="setHost('192.168.255.249')"
                class="px-2 py-0.5 rounded-md border border-slate-200 hover:bg-slate-100 font-mono text-[11px] cursor-pointer"
                [class.border-slate-200]="!hub.darkMode()"
                [class.hover:bg-slate-100]="!hub.darkMode()"
                [class.border-slate-700]="hub.darkMode()"
                [class.hover:bg-slate-800]="hub.darkMode()"
              >
                Hotspot (192.168.255.249)
              </button>
              @for (speaker of hub.discoveredLanSpeakers(); track speaker.id) {
                <button
                  type="button"
                  (click)="setHost(speaker.host || speaker.ip)"
                  class="px-2 py-0.5 rounded-md border border-blue-200 bg-blue-50/50 text-blue-700 font-mono text-[11px] flex items-center gap-1 cursor-pointer"
                >
                  <span class="font-semibold">{{ speaker.name }}</span>
                  <span class="opacity-70">({{ speaker.ip }})</span>
                </button>
              }
            </div>

            <!-- Device Info Data List -->
            @if (hub.setupInfo(); as info) {
              <div class="mt-6 pt-5 border-t"
                   [class.border-slate-100]="!hub.darkMode()"
                   [class.border-slate-800]="hub.darkMode()">
                <span class="block text-xs font-semibold mb-3 text-blue-600">
                  Respuesta /setup/eureka_info verificada
                </span>
                <dl class="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
                  <div>
                    <dt [class.text-slate-500]="!hub.darkMode()" [class.text-slate-400]="hub.darkMode()">Nombre actual</dt>
                    <dd class="font-semibold mt-0.5">{{ info.name || '—' }}</dd>
                  </div>
                  <div>
                    <dt [class.text-slate-500]="!hub.darkMode()" [class.text-slate-400]="hub.darkMode()">Modelo</dt>
                    <dd class="font-semibold mt-0.5">{{ info.model || '—' }}</dd>
                  </div>
                  <div>
                    <dt [class.text-slate-500]="!hub.darkMode()" [class.text-slate-400]="hub.darkMode()">Revisión Firmware</dt>
                    <dd class="font-mono font-semibold tabular-nums mt-0.5">{{ info.version || '—' }}</dd>
                  </div>
                  <div>
                    <dt [class.text-slate-500]="!hub.darkMode()" [class.text-slate-400]="hub.darkMode()">Wi-Fi actual</dt>
                    <dd class="font-semibold mt-0.5">{{ info.ssid || 'Sin configurar (Hotspot activo)' }}</dd>
                  </div>
                  <div class="col-span-2">
                    <dt [class.text-slate-500]="!hub.darkMode()" [class.text-slate-400]="hub.darkMode()">Estado de Clave Pública RSA</dt>
                    <dd class="font-semibold mt-0.5 flex items-center gap-1.5"
                        [class.text-emerald-600]="info.has_public_key"
                        [class.text-amber-600]="!info.has_public_key">
                      <mat-icon class="!text-base !w-4 !h-4 leading-none">
                        {{ info.has_public_key ? 'verified_user' : 'warning' }}
                      </mat-icon>
                      <span>
                        {{
                          info.has_public_key
                            ? 'Lista para emparejar (Clave RSA 2048-bit recibida)'
                            : 'No entregó clave pública (Solo redes abiertas)'
                        }}
                      </span>
                    </dd>
                  </div>
                </dl>
              </div>
            }

            <!-- Scanned Wi-Fi Networks Table -->
            @if (hub.scannedNetworks().length > 0) {
              <div class="mt-6 pt-5 border-t"
                   [class.border-slate-100]="!hub.darkMode()"
                   [class.border-slate-800]="hub.darkMode()">
                <span class="block text-xs font-semibold mb-2.5">
                  Redes Wi-Fi detectadas por el altavoz ({{ hub.scannedNetworks().length }})
                </span>
                <div class="divide-y border-y max-h-52 overflow-y-auto"
                     [class.divide-slate-100]="!hub.darkMode()"
                     [class.border-slate-100]="!hub.darkMode()"
                     [class.divide-slate-800]="hub.darkMode()"
                     [class.border-slate-800]="hub.darkMode()">
                  @for (net of hub.scannedNetworks(); track net.ssid; let idx = $index) {
                    <button
                      type="button"
                      (click)="selectNetworkIndex(idx)"
                      class="w-full py-2.5 px-2 flex items-center justify-between text-left transition-colors cursor-pointer"
                      [class.bg-blue-50]="connectForm.controls.networkIndex.value === idx && !hub.darkMode()"
                      [class.bg-slate-800]="connectForm.controls.networkIndex.value === idx && hub.darkMode()"
                    >
                      <div class="flex items-center gap-2.5 min-w-0">
                        <mat-icon class="!text-base !w-4 !h-4 leading-none text-blue-600">
                          {{ net.isSecure ? 'wifi_lock' : 'wifi' }}
                        </mat-icon>
                        <div class="min-w-0">
                          <span class="block text-xs font-semibold truncate">{{ net.ssid }}</span>
                          <span class="block text-[11px]"
                                [class.text-slate-500]="!hub.darkMode()"
                                [class.text-slate-400]="hub.darkMode()">
                            {{ net.signalQuality }} · {{ net.isSecure ? 'WPA/WPA2' : 'Abierta' }}
                          </span>
                        </div>
                      </div>
                      <span class="font-mono text-xs font-semibold tabular-nums shrink-0">
                        {{ net.signal ?? '?' }} dBm
                      </span>
                    </button>
                  }
                </div>
              </div>
            }
          </div>

          <p class="mt-6 text-xs"
             [class.text-slate-500]="!hub.darkMode()"
             [class.text-slate-400]="hub.darkMode()">
            Nota: Algunos firmwares recientes exigen un token local de Google y devuelven HTTP 401/403; si ocurre, la aplicación mostrará el código exacto.
          </p>
        </section>

        <!-- Right Column: Wi-Fi Credentials & Room Name Form -->
        <section
          class="rounded-2xl border p-6 flex flex-col justify-between transition-colors"
          [class.bg-white]="!hub.darkMode()"
          [class.border-slate-200]="!hub.darkMode()"
          [class.bg-slate-900]="hub.darkMode()"
          [class.border-slate-800]="hub.darkMode()"
        >
          <div>
            <h3 class="text-lg font-bold font-display">2. Enviar Credenciales Wi-Fi y Nombre</h3>
            <p class="text-xs mt-1"
               [class.text-slate-500]="!hub.darkMode()"
               [class.text-slate-400]="hub.darkMode()">
              La contraseña se cifra con la clave pública RSA del propio altavoz antes de enviarse a <code>/setup/connect_wifi</code>
            </p>

            <form [formGroup]="connectForm" (ngSubmit)="submitConnect()" class="mt-5 space-y-4">
              <div>
                <label for="wifi-list-select" class="block text-xs font-semibold mb-1.5">
                  Red Wi-Fi seleccionada
                </label>
                <select
                  id="wifi-list-select"
                  formControlName="networkIndex"
                  class="w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  [class.bg-slate-50]="!hub.darkMode()"
                  [class.border-slate-200]="!hub.darkMode()"
                  [class.bg-slate-800]="hub.darkMode()"
                  [class.border-slate-700]="hub.darkMode()"
                >
                  @if (hub.scannedNetworks().length === 0) {
                    <option [ngValue]="-1">— Primero pulsa "Buscar redes" —</option>
                  } @else {
                    @for (net of hub.scannedNetworks(); track net.ssid; let i = $index) {
                      <option [ngValue]="i">
                        {{ net.ssid }} ({{ net.signal ?? '?' }} dBm · {{ net.signalQuality }})
                      </option>
                    }
                  }
                </select>
              </div>

              <div>
                <label for="wifi-pass-input" class="block text-xs font-semibold mb-1.5">
                  Contraseña de la red Wi-Fi
                </label>
                <input
                  id="wifi-pass-input"
                  type="password"
                  formControlName="password"
                  autocomplete="off"
                  placeholder="Deja vacío si la red es abierta"
                  class="w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  [class.bg-slate-50]="!hub.darkMode()"
                  [class.border-slate-200]="!hub.darkMode()"
                  [class.bg-slate-800]="hub.darkMode()"
                  [class.border-slate-700]="hub.darkMode()"
                />
              </div>

              <div>
                <label for="device-name-input" class="block text-xs font-semibold mb-1.5">
                  Nombre del altavoz / Habitación (opcional)
                </label>
                <input
                  id="device-name-input"
                  type="text"
                  formControlName="deviceName"
                  placeholder="Ej. Sala Principal o Consultorio 2"
                  class="w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  [class.bg-slate-50]="!hub.darkMode()"
                  [class.border-slate-200]="!hub.darkMode()"
                  [class.bg-slate-800]="hub.darkMode()"
                  [class.border-slate-700]="hub.darkMode()"
                />
              </div>

              @if (connectError()) {
                <p class="text-xs text-rose-600 font-medium">{{ connectError() }}</p>
              }

              <div class="pt-2">
                <button
                  type="submit"
                  [disabled]="hub.busyAction() === 'setup-connect'"
                  class="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <mat-icon class="!text-base !w-4 !h-4 leading-none">lock_reset</mat-icon>
                  <span>Conectar y Guardar Wi-Fi</span>
                </button>
              </div>
            </form>

            <!-- Pairing Confirmation Receipt -->
            @if (hub.lastPairingReceipt(); as receipt) {
              <div class="mt-6 pt-5 border-t space-y-2"
                   [class.border-slate-100]="!hub.darkMode()"
                   [class.border-slate-800]="hub.darkMode()">
                <div class="flex items-center gap-2 text-emerald-600 font-semibold text-xs">
                  <mat-icon class="!text-base !w-4 !h-4 leading-none">check_circle</mat-icon>
                  <span>Emparejamiento enviado a '{{ receipt.ssid }}'</span>
                </div>
                <p class="text-xs leading-relaxed" [class.text-slate-600]="!hub.darkMode()" [class.text-slate-300]="hub.darkMode()">
                  {{ receipt.message }}
                </p>
                <div class="text-[11px] font-mono break-all pt-1"
                     [class.text-slate-500]="!hub.darkMode()"
                     [class.text-slate-400]="hub.darkMode()">
                  enc_passwd (RSA): {{ receipt.encryptedSample }}
                </div>
              </div>
            }
          </div>
        </section>
      </div>
    </div>
  `,
})
export class WifiWizard {
  readonly hub = inject(CastHubService);

  readonly hostControl = new FormControl('192.168.18.27', { nonNullable: true });
  readonly connectError = signal<string | null>(null);

  readonly connectForm = new FormGroup({
    networkIndex: new FormControl<number>(0, { nonNullable: true }),
    password: new FormControl<string>('', { nonNullable: true }),
    deviceName: new FormControl<string>('Sala', { nonNullable: true }),
  });

  setHost(ip: string): void {
    this.hostControl.setValue(ip);
    void this.readDevice();
  }

  async scanLan(): Promise<void> {
    const list = await this.hub.scanLocalNetwork();
    if (list.length > 0) {
      this.hostControl.setValue(list[0].host || list[0].ip);
      await this.readDevice();
    }
  }

  async readDevice(): Promise<void> {
    await this.hub.readSetupDeviceInfo(this.hostControl.value);
  }

  async scanNetworks(): Promise<void> {
    await this.hub.scanWifiNetworks(this.hostControl.value);
    if (this.hub.scannedNetworks().length > 0) {
      this.connectForm.controls.networkIndex.setValue(0);
    }
  }

  selectNetworkIndex(idx: number): void {
    this.connectForm.controls.networkIndex.setValue(idx);
    this.connectError.set(null);
  }

  async submitConnect(): Promise<void> {
    const networks = this.hub.scannedNetworks();
    const idx = Number(this.connectForm.controls.networkIndex.value);
    const selected = networks[idx];
    if (!selected) {
      this.connectError.set('Primero pulsa "Buscar redes" y selecciona una red Wi-Fi de la lista.');
      return;
    }
    this.connectError.set(null);
    const ok = await this.hub.connectSpeakerToWifi({
      host: this.hostControl.value,
      network: selected,
      password: this.connectForm.controls.password.value,
      deviceName: this.connectForm.controls.deviceName.value,
    });
    if (ok) {
      this.connectForm.controls.password.setValue('');
    }
  }
}
