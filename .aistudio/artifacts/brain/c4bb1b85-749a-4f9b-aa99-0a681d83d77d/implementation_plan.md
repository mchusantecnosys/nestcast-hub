# NestCast Hub — Fase 0: Control Local y Emparejamiento para Google Home Mini

Una aplicación web tipo Hub domótico diseñada para descubrir, controlar y configurar altavoces Google Home Mini y Nest Mini en red local sin depender de la app oficial de Google Home, combinando un entorno híbrido (simulador interactivo en vivo + puente local Python listo para ejecutar en tu PC) con una interfaz inspirada en Google Nest Hub.

## Decisiones Confirmadas y Revisión del Usuario

> [!IMPORTANT]
> Estas decisiones recogen tus respuestas en la fase de clarificación y definen el alcance exacto de la Fase 0 antes de iniciar la construcción del código.

- **Arquitectura Operativa Confirmada**: **Modo híbrido con simulador interactivo y puente local descargable**. Dado que la vista previa web se ejecuta en la nube y el protocolo Cast/mDNS + `192.168.255.249` opera en tu red local Wi-Fi, el Hub permitirá alternar entre:
  1. **Modo Simulador Interactivo**: Dispositivos Google Home Mini / Nest Mini virtuales con respuesta realista en tiempo real (estado de reproducción, volumen, silencio, audio real en el navegador para URLs y síntesis de voz TTS, y simulación completa del flujo `eureka_info` y escaneo Wi-Fi con cifrado RSA).
  2. **Modo Puente Local (LAN Bridge)**: Conexión directa desde el navegador hacia tu servidor local (`http://localhost:5000` o IP local configurable) más un centro integrado para inspeccionar y descargar el paquete Python local completo (`app.py`, `setup_api.py`, `requirements.txt` y guía rápida).
- **Dirección Visual Confirmada**: **Panel domótico moderno estilo Nest Hub con tema adaptable (Claro / Oscuro)**, superficies limpias de un solo nivel de elevación, tipografía geométrica expresiva y controles táctiles de alta precisión.
- **Alcance Funcional Ampliado Confirmado**:
  - **Emisoras y audios predefinidos** para pruebas rápidas de streaming (radios en vivo, tonos de aviso, ruido blanco/ambiental).
  - **Historial de frases TTS y favoritos de voz** con repetición en un clic, selección de idioma (`es`, `en`, `pt`) y guardado persistente.
  - **Asistente interactivo paso a paso para el emparejamiento Wi-Fi** con verificación visual del estado `eureka_info`, llave pública RSA (`PKCS#1 v1.5`), intensidad de señal dBm y envío seguro de credenciales.

---

## 1. Visión General y Concepto Central

- **Qué hace**: Centraliza en un único panel web todas las operaciones de la Fase 0 para altavoces Google Home Mini y Nest Mini: descubrimiento mDNS o por IP manual, monitoreo de estado cada 3 segundos, control de volumen y silencio, control multimedia (`play`, `pause`, `stop`, `quit`), envío de streams HTTP/HTTPS, anuncio por voz (Text-to-Speech en español, inglés y portugués) y configuración inicial Wi-Fi para dispositivos nuevos o reseteados de fábrica.
- **Usuarios Objetivo**: Desarrolladores, integradores de domótica y usuarios que desean operar y aprovisionar altavoces Cast de forma local, autónoma y auditable.
- **Valor Principal**: Elimina la fricción entre el prototipado en la nube y la ejecución en red local, ofreciendo tanto una experiencia funcional inmediata para probar todos los flujos de control/emparejamiento como el servidor local exacto y el puente directo hacia el hardware físico.

---

## 2. Experiencia de Usuario y Diseño Visual

### Flujos Principales de Usuario

1. **Descubrimiento y Selección de Altavoz**:
   - El usuario ingresa al Hub y visualiza la barra lateral de dispositivos detectados junto con un campo para especificar IPs conocidas (`hosts=192.168.1.50`).
   - Al pulsar **Buscar dispositivos**, el sistema consulta `/api/devices` (o el puente local configurado) y lista los altavoces encontrados con su nombre, modelo (`Google Home Mini`, `Google Nest Mini`) y dirección IP.
   - Al seleccionar un altavoz, se activa el panel principal de control y comienza el sondeo automático de estado (`/api/devices/<id>/status`).
2. **Control de Volumen, Reproducción y Emisoras Predefinidas**:
   - El usuario ajusta el deslizador de volumen (`0%` a `100%`) con bloqueo de arrastre para evitar saltos durante el sondeo, o alterna el botón de silencio (`mute`).
   - Utiliza la botonera de transporte para **Reanudar**, **Pausar**, **Detener** o **Cerrar app** activa en el Cast.
   - Puede pegar cualquier URL `http(s)` de audio o elegir con un clic entre las **Emisoras y Audios Predefinidos** (radio informativa, música instrumental, campana de aviso en casa, sonido de lluvia) para transmitirla al instante.
3. **Consola Text-to-Speech (TTS) con Historial y Favoritos**:
   - El usuario escribe un mensaje (ej. *"Hola, la cena está lista"*), selecciona el idioma (`Español`, `English`, `Português`) y pulsa **Decir en altavoz**.
   - El mensaje se sintetiza y reproduce en el altavoz (con preescucha acústica opcional en modo simulador) y queda registrado en el **Historial de Frases** con opción de marcarlo como **Favorito** para lanzarlo con un solo clic en el futuro.
4. **Asistente Paso a Paso de Emparejamiento Wi-Fi (Modo Setup)**:
   - Guía interactiva en 4 etapas claras:
     - **Paso 1 (Preparación y Host)**: Verificación de reinicio de fábrica (15 s) y conexión a la red temporal `GoogleHomeXXXX` en la IP `192.168.255.249` (editable).
     - **Paso 2 (Lectura del Dispositivo)**: Consulta a `/api/setup/info` (`/setup/eureka_info?options=detail`), mostrando nombre actual, modelo, revisión de firmware, estado Wi-Fi y confirmación de entrega de clave pública RSA (`has_public_key`).
     - **Paso 3 (Escaneo de Redes Wi-Fi)**: Ejecución de `/api/setup/scan` (`/setup/scan_wifi` + `/setup/scan_results`), presentando las redes ordenadas por potencia de señal (`dBm` en tipografía tabular) y tipo de seguridad (`wpa_auth`, `wpa_cipher`).
     - **Paso 4 (Cifrado RSA y Conexión)**: Ingreso de contraseña Wi-Fi (cifrada mediante RSA `PKCS#1 v1.5` con la clave pública del dispositivo) y asignación de nombre de habitación (ej. *"Sala"*, *"Consultorio"*), enviando `/setup/connect_wifi` y `/setup/save_wifi`.
5. **Puente Local y Kit Python Descargable**:
   - Vista dedicada donde el usuario puede configurar el endpoint de su backend Flask local (`http://localhost:5000`) o descargar con un clic los archivos originales listos para producción (`app.py`, `setup_api.py`, `requirements.txt`, `README.md`) con instrucciones de ejecución.

### Identidad Visual y Tema

- **Dirección Estética**: Panel de control domótico inspirado en **Google Nest Hub** con estética limpia, táctil y estructurada.
- **Paleta de Colores (Regla 60-30-10 y Tema Claro/Oscuro Adaptable)**:
  - **60% Lienzo Neutro Dominante**: En modo claro, blanco cálido de baja saturación (`#F8FAFC`); en modo oscuro, pizarra profunda (`#0F172A`).
  - **30% Superficies Estructurales**: Contenedores planos con bordes sutiles de `1px` (`#E2E8F0` en claro / `#1E293B` en oscuro) sin anidar tarjetas dentro de tarjetas.
  - **10% Presupuesto de Acento y Estados Semánticos**: Azul Google Cast (`#1A73E8` / `#3B82F6`) para acciones primarias y controles activos; Verde esmeralda (`#16A34A`) acompañado de etiqueta textual para conexión activa; Ámbar (`#D97706`) para modo configuración/escaneo; Rojo carmesí (`#DC2626`) para errores de red o bloqueos de firmware (`401/403`).
- **Tipografía y Jerarquía (Regla 2+1)**:
  - *Display y Encabezados*: `Outfit` (pesos 600 y 700) para títulos de habitación, nombres de altavoz y navegación principal.
  - *Cuerpo y Controles*: `Plus Jakarta Sans` (pesos 400 y 500) para formularios, pasos de configuración y etiquetas de alta legibilidad.
  - *Telemetría, IPs y Métricas*: `JetBrains Mono` con `font-variant-numeric: tabular-nums` para direcciones IP (`192.168.255.249`), niveles de volumen (`0–100%`), intensidad de señal (`-48 dBm`) y estados del reproductor.
- **Estructura Espacial y Top Bar Contract**:
  - **Barra Superior en 3 Zonas**: Marca en una línea (`NestCast Hub`) a la izquierda, navegación principal en texto limpio de una línea (`Controlar`, `Emparejar Wi-Fi`, `Puente Local`) en el centro, y selector de modo (`Simulador / Red Local` + cambio de tema) a la derecha.
  - **Lienzo Principal en Escritorio (1440px)**: Distribución de barra lateral de dispositivos (`280px`) + área de trabajo principal amplia con grillas equilibradas para transporte multimedia, presets de audio y consola TTS.

---

## 3. Decisiones de Producto y Compromisos Técnicos

- **Decisión 1: Backend API Espejo en Express + Puente a Flask Local**
  - *Enfoque Elegido*: Implementar todos los endpoints REST especificados en el proyecto original (`GET /api/devices`, `GET /api/devices/:id/status`, `POST /api/devices/:id/volume`, `POST /api/devices/:id/mute`, `POST /api/devices/:id/media/:action`, `POST /api/devices/:id/play`, `POST /api/devices/:id/say`, `GET /api/setup/info`, `POST /api/setup/scan`, `POST /api/setup/connect`) dentro del servidor del proyecto, incluyendo el cifrado real RSA `PKCS#1 v1.5` en Node (`node:crypto`) y soporte de proxy/conexión hacia un host real o hacia el motor de simulación integrado.
  - *Por qué*: Permite que la aplicación web sea 100% funcional desde el primer segundo en el navegador (cumpliendo el contrato exacto de la API de `app.py` y `setup_api.py`), y al mismo tiempo pueda conectarse a dispositivos reales o exportar el servidor Python nativo con `pychromecast` y `gTTS`.
  - *Alternativas Descartadas*: Dejar los endpoints sin respuesta cuando no hay un Google Home Mini en la red de la nube, lo que impediría probar la interfaz de control y el asistente de emparejamiento.
- **Decisión 2: Síntesis de Voz y Reproducción Acústica Dual**
  - *Enfoque Elegido*: Cuando el usuario envía una frase en `/api/devices/:id/say` o reproduce una emisora en `/api/devices/:id/play`, el servidor actualiza el estado del dispositivo Cast (`PLAYING`, título de pista/frase) y, en modo simulador, el navegador reproduce el audio real o pronuncia la frase mediante Web Speech API / generador TTS para que el usuario escuche la respuesta tal como sonaría en el Google Home Mini.
  - *Por qué*: Proporciona retroalimentación inmediata y verificable durante las pruebas de Fase 0 sin requerir hardware físico conectado en ese instante.

---

## 4. Arquitectura Técnica y Estrategia de Datos *(Referencia Técnica)*

### Diagrama de Arquitectura y Componentes

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         NESTCAST HUB — FRONTEND WEB                          │
│  ┌──────────────────────┐  ┌─────────────────────────┐  ┌─────────────────┐  │
│  │ Top Bar (3 Zonas)    │  │ Navegación de Vistas    │  │ Selector Modo   │  │
│  │ Marca: NestCast Hub  │  │ Control · Wi-Fi · Kit   │  │ Simulador / LAN │  │
│  └──────────────────────┘  └─────────────────────────┘  └─────────────────┘  │
│              │                          │                        │           │
│              ▼                          ▼                        ▼           │
│  ┌──────────────────────┐  ┌──────────────────────────────────────────────┐  │
│  │ Sidebar Dispositivos │  │ Vista 1: Panel de Control Cast               │  │
│  │ - Búsqueda mDNS / IP │  │ - Cabecera de Estado (App, Estado, Pista)    │  │
│  │ - Lista de Altavoces │  │ - Control Volumen (0-100%) + Mute + Media    │  │
│  │ - Selección Activa   │  │ - Reproductor URL + Presets de Radio/Sonidos │  │
│  └──────────────────────┘  │ - Consola TTS (ES/EN/PT) + Favoritos/History │  │
│                            └──────────────────────────────────────────────┘  │
│                            ┌──────────────────────────────────────────────┐  │
│                            │ Vista 2: Asistente Emparejamiento Wi-Fi      │  │
│                            │ - Paso 1: IP Setup (192.168.255.249)         │  │
│                            │ - Paso 2: Lectura eureka_info y Clave RSA    │  │
│                            │ - Paso 3: Escaneo Redes Wi-Fi (dBm / WPA)    │  │
│                            │ - Paso 4: Cifrado PKCS#1 v1.5 y Conexión     │  │
│                            └──────────────────────────────────────────────┘  │
│                            ┌──────────────────────────────────────────────┐  │
│                            │ Vista 3: Puente Local y Kit Python (Fase 0)  │  │
│                            │ - Configuración Endpoint Local (Puerto 5000) │  │
│                            │ - Visor y Descarga de app.py / setup_api.py  │  │
│                            └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────┬────────────────────────────────────┘
                                          │ HTTP JSON (/api/*)
                                          ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                     CAPA DE SERVICIO Y API BACKEND (/api)                    │
│  ┌───────────────────────────────────┐  ┌─────────────────────────────────┐  │
│  │ Controlador de Dispositivos Cast  │  │ Cliente GHLocalApi (setup_api)  │  │
│  │ - GET  /api/devices?hosts=...     │  │ - GET  /api/setup/info          │  │
│  │ - GET  /api/devices/:id/status    │  │ - POST /api/setup/scan          │  │
│  │ - POST /api/devices/:id/volume    │  │ - POST /api/setup/connect       │  │
│  │ - POST /api/devices/:id/mute      │  │ - Cifrado RSA PKCS#1 v1.5 Real  │  │
│  │ - POST /api/devices/:id/media/:op │  └─────────────────────────────────┘  │
│  │ - POST /api/devices/:id/play      │                                       │
│  │ - POST /api/devices/:id/say       │                                       │
│  └───────────────────────────────────┘                                       │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Modelo de Datos y Estado

- **Dispositivo Cast (`CastDevice`)**: `id` (UUID), `name` (ej. *"Google Home Mini - Sala"*), `model` (`Google Home Mini` / `Google Nest Mini`), `host` (IPv4 en red local), `type` (`audio`).
- **Estado de Reproducción (`CastStatus`)**: `volume` (`0–100`), `muted` (`boolean`), `app` (`Ninguna`, `Default Media Receiver`, `Text-to-Speech`, `Radio Stream`), `player_state` (`IDLE`, `PLAYING`, `PAUSED`, `BUFFERING`), `title` (nombre del stream o texto pronunciado).
- **Información de Configuración (`EurekaInfo`)**: `name`, `model`, `version` (revisión de firmware), `ip`, `connected`, `ssid`, `setup_state`, `has_public_key` (`boolean`) y clave pública RSA para cifrado.
- **Red Wi-Fi Detectada (`WifiNetwork`)**: `ssid`, `signal` (nivel en `dBm`), `wpa_auth`, `wpa_cipher`, indicador de red abierta o protegida.
- **Elementos de Biblioteca Local (Persistidos en `localStorage`)**:
  - **Presets de Audio**: Lista preconfigurada + emisoras personalizadas añadidas por el usuario (`title`, `url`, `category`).
  - **Historial y Favoritos TTS**: Registro de frases enviadas (`id`, `text`, `lang`, `timestamp`, `isFavorite`).

### Mapeo de Componentes Interactivos y Transiciones de Estado

- **Buscador de Dispositivos**: Valida formato de lista de IPs opcionales separadas por comas, muestra estado de carga durante el descubrimiento, renderiza estado vacío con sugerencia de IP o diagnóstico si no hay coincidencias, y selecciona automáticamente el dispositivo si solo se encuentra uno.
- **Control Deslizante de Volumen y Transporte**: Bloquea la actualización por sondeo (`draggingVolume = true`) mientras el usuario arrastra el control para evitar saltos visuales; al soltar, invoca `POST /api/devices/:id/volume` y sincroniza el porcentaje tabular.
- **Reproductor de URLs y Presets**: Valida que la URL comience con `http://` o `https://`, muestra error descriptivo en caso contrario, y al pulsar cualquier preset carga y reproduce inmediatamente el stream actualizando el estado a `PLAYING`.
- **Consola TTS**: Verifica que el texto no esté vacío, envía la solicitud `POST /api/devices/:id/say`, añade la entrada al historial, permite marcar/desmarcar favoritos y repetir cualquier frase previa con un clic.
- **Asistente de Emparejamiento Wi-Fi**: Avanza y valida cada etapa: lectura de `eureka_info`, poblamiento del selector de redes ordenadas por mejor señal (`dBm`), cifrado RSA real de la contraseña usando la clave pública del dispositivo, y confirmación final con instrucciones para reconectar al Wi-Fi habitual.
