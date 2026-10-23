import { NormalizedWifiNetwork, TtsEntry, MediaActionType } from '../../utils/cast-logic';

export type { NormalizedWifiNetwork, TtsEntry, MediaActionType };

export interface CastDevice {
  id: string;
  name: string;
  model: string;
  host: string;
  type: string;
  status?: CastStatus;
}

export interface DiscoveredSpeaker {
  id: string;
  name: string;
  model: string;
  ip: string;
  host: string;
  connected: boolean;
  version?: string | null;
  ssid?: string | null;
  signal_level?: number | null;
  has_public_key?: boolean;
}

export interface CastStatus {
  volume: number;
  muted: boolean;
  app: string;
  player_state: 'IDLE' | 'PLAYING' | 'PAUSED' | 'BUFFERING' | 'Sin conexión';
  title: string;
}

export interface EurekaInfo {
  name: string | null;
  model: string | null;
  version: string | null;
  ip: string | null;
  connected: boolean;
  ssid: string | null;
  setup_state: number | null;
  has_public_key: boolean;
}

export interface AudioPreset {
  id: string;
  title: string;
  subtitle: string;
  category: 'Radio' | 'Ambiente' | 'Aviso Clínico';
  url: string;
  icon: string;
}

export interface LocalPackageFile {
  filename: string;
  targetPath: string;
  description: string;
  language: string;
  content: string;
}

export interface ToastMessage {
  id: number;
  text: string;
  type: 'info' | 'success' | 'error';
}
