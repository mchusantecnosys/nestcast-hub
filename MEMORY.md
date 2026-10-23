# MEMORY.md — NestCast Hub (Fase 0: Control y Emparejamiento Google Home Mini)

## Estado Actual
- **Fase 0 Completada y Mejorada**: Hub Web App (`NestCast Hub`) implementada con arquitectura híbrida (Simulador Interactivo en vivo + Puente Local hacia el backend Flask `app.py` / `setup_api.py` + ngrok tunnel activo).
- **Escaneo y Emparejamiento Avanzado en Red Local (Sin mDNS restrictivo)**:
  - Detección automática de subredes activas de la máquina (`192.168.18.0/24`, etc.).
  - Barredora concurrente multiproceso (`ThreadPoolExecutor` con 64 hilos) sondando puertos `8008`/`8009` y `/setup/eureka_info` en ~1.5 segundos.
  - Endpoints implementados en Flask (`app.py`) y proxy en Express/Angular (`src/server.ts`):
    - `GET /api/devices/scan-network?subnet=...`
    - `POST /api/devices/<id>/ping` (reproducción de chime acústico `beep_short.ogg` para identificación física de bocinas).
  - Interfaz de Emparejamiento en 2 Pestañas ("En mi red local" con escaneo + ping acústico + vinculación directa en 1 clic; y "Nuevo altavoz / Hotspot" con el asistente de aprovisionamiento Wi-Fi y cifrado RSA).
  - Persistencia reactiva de IPs conocidas (`knownHosts`) en `localStorage`.
- **API Backend Completa (`src/server.ts` & `app.py`)**:
  - `GET /api/devices` (con soporte de `?hosts=IP1,IP2` y validación de formato IP/host).
  - `GET /api/devices/:id/status`, `POST /api/devices/:id/volume`, `POST /api/devices/:id/mute`.
  - `POST /api/devices/:id/media/:action` (`play`, `pause`, `stop`, `quit`), `POST /api/devices/:id/play`, `POST /api/devices/:id/say`.
  - `GET /api/setup/info`, `POST /api/setup/scan`, `POST /api/setup/connect` con cifrado RSA `PKCS#1 v1.5` real (`node:crypto`) compatible con la clave pública de `eureka_info`.
  - `GET /api/local-package` que expone el paquete Python original para inspección y descarga.
- **Entorno y Servicios Activos**:
  - Frontend Angular SSR en puerto `3000` (`http://localhost:3000`).
  - Backend Flask (`app.py`) en puerto `5000` (`http://localhost:5000`).
  - Túnel ngrok activo en `https://spray-composer-epic.ngrok-free.dev` (Inspector: `http://127.0.0.1:4040`).
  - Dispositivo físico validado: Google Home Mini `"Bedroom"` en IP `192.168.18.27`, firmware `3.78.540761`, red Wi-Fi `CELERITY_CHUSAN`.

## Decisiones Importantes
1. **Barrido TCP/HTTP Concurrente vs mDNS Multicast**:
   - *Por qué*: Muchos routers domésticos bloquean o aíslan paquetes mDNS (`_googlecast._tcp.local.`) entre bandas 2.4 GHz y 5 GHz o puertos Wi-Fi/Ethernet. El sondeo directo de `/setup/eureka_info` por HTTP/HTTPS es 100% confiable y localiza cualquier Google Home en menos de 2 segundos.
2. **Deduplicación Estricta por Host / IP y Notificación de Dispositivo ya Conectado**:
   - *Por qué*: Evita duplicaciones visuales cuando un mismo dispositivo es descubierto simultáneamente por pychromecast (UUID de hardware) y por eureka_info (ID `device-IP`). Se unifica mediante `upsertActiveDevice` en Express, deduplicación en Flask y filtro reactivo en Angular. Si el usuario intenta vincular un dispositivo ya presente, se le notifica que *"El dispositivo ya está conectado"* y se muestra el badge `✓ Conectado`.
3. **Escaneo Automático Post-Wi-Fi**:
   - *Por qué*: Tras enviar credenciales Wi-Fi al hotspot, el altavoz se desconecta de la red provisional y se une al router local. El sistema espera unos segundos y activa automáticamente una búsqueda completa de subred para detectar tanto el nuevo altavoz como otros Google Home en la red.
4. **Identificación Acústica ("Hacer Sonar / Ping")**:
   - *Por qué*: Cuando hay varios altavoces o nombres genéricos en la casa, emitir un tono sutil (`beep_short.ogg`) permite al usuario confirmar exactamente qué altavoz físico está vinculando.
5. **Arquitectura Híbrida (Simulador + Puente Local)**:
   - *Por qué*: Permite verificar de inmediato todos los flujos en el navegador sin hardware, mientras que el puente local conecta de forma transparente con los dispositivos físicos reales en la red.
6. **Bloqueo de Arrastre en Volumen (`draggingVolume`)**:
   - *Por qué*: Evita que el sondeo periódico de estado cada 3 segundos sobrescriba el valor del deslizador mientras el usuario lo está ajustando.
7. **Sincronización del Tema Oscuro en Cascada (`:root.dark`, `document.documentElement` y CSS Variables)**:
   - *Por qué*: Las variables del sistema de diseño (`--chalk`, `--panel`, `--ink`, etc.) estaban condicionadas a `.dark` y `[data-theme="dark"]`, pero el botón de cambio únicamente modificaba una señal en memoria sin inyectar la clase en el DOM. Se implementó `applyTheme()` en `CastHubService` afectando a `document.documentElement` y `document.body`, se enlazó `[class.dark]` y `[attr.data-theme]` en los contenedores raíz y el diálogo, y se agregó `color-scheme: dark` junto a un script inline en `index.html` para evitar destellos blancos (FOUC).

## Errores a Evitar
- No exponer nunca claves privadas ni credenciales reales en el repositorio.
- No usar expresiones regulares ni sentencias de control complejas (`if`, etc.) directamente en plantillas HTML de Angular; delegar a métodos del componente en TypeScript.
- En Windows con terminal sandbox, los comandos que requieren `python`, `node` o `ngrok` deben ejecutarse con `BypassSandbox: true` para acceder a los binarios del sistema.
