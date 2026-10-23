export interface RawScanNetwork {
  ssid?: string;
  signal_level?: number | null;
  wpa_auth?: number;
  wpa_cipher?: number;
}

export interface NormalizedWifiNetwork {
  ssid: string;
  signal: number | null;
  wpa_auth: number;
  wpa_cipher: number;
  signalQuality: 'Excelente' | 'Buena' | 'Regular' | 'Débil';
  isSecure: boolean;
}

export interface TtsEntry {
  id: string;
  text: string;
  lang: 'es' | 'en' | 'pt';
  createdAt: string;
  favorite: boolean;
}

export type MediaActionType = 'play' | 'pause' | 'stop' | 'quit';

/**
 * Parses comma-separated hosts input (e.g., "192.168.1.50, 192.168.1.51")
 * and returns a clean array of non-empty host strings.
 */
export function parseKnownHosts(input: string | null | undefined): string[] {
  if (!input) return [];
  return input
    .split(',')
    .map((h) => h.trim())
    .filter((h) => h.length > 0);
}

/**
 * Validates whether a host string is a valid IPv4 address or local hostname.
 */
export function isValidHostOrIp(host: string): boolean {
  const trimmed = host.trim();
  if (!trimmed) return false;
  const ipv4Parts = trimmed.split('.');
  if (ipv4Parts.length === 4 && ipv4Parts.every((p) => /^\d+$/.test(p))) {
    return ipv4Parts.every((p) => {
      const n = Number(p);
      return n >= 0 && n <= 255;
    });
  }
  return /^[a-zA-Z0-9.-]+$/.test(trimmed) && !trimmed.startsWith('-') && !trimmed.endsWith('-');
}

/**
 * Validates and normalizes volume level between 0 and 100.
 * Throws ValueError-style message if out of range.
 */
export function validateVolumeLevel(level: unknown): number {
  const num = typeof level === 'number' ? level : Number(level);
  if (Number.isNaN(num) || !Number.isFinite(num)) {
    throw new Error('El volumen debe ser un número válido.');
  }
  const rounded = Math.round(num);
  if (rounded < 0 || rounded > 100) {
    throw new Error('El volumen debe estar entre 0 y 100.');
  }
  return rounded;
}

/**
 * Validates media transport action.
 */
export function isValidMediaAction(action: string): action is MediaActionType {
  return action === 'play' || action === 'pause' || action === 'stop' || action === 'quit';
}

/**
 * Validates direct audio stream URLs (must start with http:// or https://).
 */
export function validateStreamUrl(url: string | null | undefined): string {
  const trimmed = (url ?? '').trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    throw new Error('Ingresa una URL http(s) de audio válida (mp3, aac, radio en streaming...).');
  }
  return trimmed;
}

/**
 * Validates TTS text and language code.
 */
export function validateTtsRequest(
  text: string | null | undefined,
  lang: string | null | undefined = 'es'
): { text: string; lang: 'es' | 'en' | 'pt' } {
  const cleanText = (text ?? '').trim();
  if (!cleanText) {
    throw new Error('Escribe el texto que quieres que diga.');
  }
  const validLangs: Array<'es' | 'en' | 'pt'> = ['es', 'en', 'pt'];
  const normalizedLang = validLangs.includes(lang as 'es' | 'en' | 'pt')
    ? (lang as 'es' | 'en' | 'pt')
    : 'es';
  return { text: cleanText, lang: normalizedLang };
}

/**
 * Categorizes dBm signal level into human-readable Spanish quality label.
 */
export function classifySignalQuality(
  signal: number | null | undefined
): 'Excelente' | 'Buena' | 'Regular' | 'Débil' {
  if (signal === null || signal === undefined) return 'Regular';
  if (signal >= -55) return 'Excelente';
  if (signal >= -67) return 'Buena';
  if (signal >= -78) return 'Regular';
  return 'Débil';
}

/**
 * Deduplicates Wi-Fi scan results by SSID keeping the strongest signal_level,
 * and sorts descending by signal strength (matches setup_api.py scan_networks).
 */
export function normalizeAndSortNetworks(rawList: RawScanNetwork[]): NormalizedWifiNetwork[] {
  const bestBySsid = new Map<string, RawScanNetwork>();

  for (const net of rawList) {
    const ssid = (net.ssid ?? '').trim();
    if (!ssid) continue;
    const existing = bestBySsid.get(ssid);
    const currentSignal = net.signal_level ?? -999;
    const existingSignal = existing ? (existing.signal_level ?? -999) : -999;
    if (!existing || currentSignal > existingSignal) {
      bestBySsid.set(ssid, net);
    }
  }

  const normalized: NormalizedWifiNetwork[] = [];
  for (const net of bestBySsid.values()) {
    const ssid = (net.ssid ?? '').trim();
    const signal = net.signal_level ?? null;
    const wpa_auth = net.wpa_auth ?? 7;
    const wpa_cipher = net.wpa_cipher ?? 4;
    normalized.push({
      ssid,
      signal,
      wpa_auth,
      wpa_cipher,
      signalQuality: classifySignalQuality(signal),
      isSecure: wpa_auth !== 0 && wpa_auth !== 1,
    });
  }

  return normalized.sort((a, b) => {
    const sigA = a.signal !== null ? a.signal : -999;
    const sigB = b.signal !== null ? b.signal : -999;
    return sigB - sigA;
  });
}

/**
 * Formats a raw base64 public key or PEM string into candidate PEM blocks
 * for RSA PKCS#1 v1.5 encryption (matches setup_api.py encrypt_password).
 */
export function buildPemCandidates(publicKey: string): string[] {
  const trimmed = (publicKey ?? '').trim();
  if (!trimmed) {
    throw new Error('No se pudo leer la clave pública del dispositivo.');
  }
  if (trimmed.includes('BEGIN')) {
    return [trimmed];
  }
  const b64 = trimmed.replace(/\s+/g, '');
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 64) {
    lines.push(b64.slice(i, i + 64));
  }
  const body = lines.join('\n');
  return [
    `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----\n`,
    `-----BEGIN RSA PUBLIC KEY-----\n${body}\n-----END RSA PUBLIC KEY-----\n`,
  ];
}

/**
 * Pure state helper to insert or bump a TTS phrase in history while preserving favorites.
 */
export function upsertTtsHistory(
  existing: TtsEntry[],
  newEntry: { id: string; text: string; lang: 'es' | 'en' | 'pt'; createdAt: string },
  maxEntries = 25
): TtsEntry[] {
  const cleanText = newEntry.text.trim();
  const prevMatch = existing.find(
    (item) => item.text.toLowerCase() === cleanText.toLowerCase() && item.lang === newEntry.lang
  );
  const entry: TtsEntry = {
    id: prevMatch ? prevMatch.id : newEntry.id,
    text: cleanText,
    lang: newEntry.lang,
    createdAt: newEntry.createdAt,
    favorite: prevMatch ? prevMatch.favorite : false,
  };
  const filtered = existing.filter((item) => item.id !== entry.id);
  return [entry, ...filtered].slice(0, maxEntries);
}

/**
 * Pure state helper to toggle favorite flag on a TTS entry.
 */
export function toggleTtsFavorite(existing: TtsEntry[], entryId: string): TtsEntry[] {
  return existing.map((item) =>
    item.id === entryId ? { ...item, favorite: !item.favorite } : item
  );
}
