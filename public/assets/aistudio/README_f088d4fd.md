# Google Home Mini — Control local (sin la app Google Home)

Una web app muy sencilla para **emparejar** (configurar el Wi‑Fi) y **controlar** un Google Home Mini / Nest Mini desde el navegador.

- **Backend:** Python (Flask + PyChromecast)
- **Frontend:** HTML, CSS y JavaScript puro

## Qué hace

**Controlar** (pestaña "Controlar")
- Encuentra automáticamente los altavoces de tu red (mDNS). Si alguno no aparece, puedes escribir su IP.
- Volumen y silencio
- Reanudar, pausar, detener y cerrar la app activa
- Reproducir audio desde una URL (mp3, aac, radio por internet)
- Texto a voz: escribes una frase y el altavoz la dice

**Emparejar** (pestaña "Emparejar (Wi‑Fi)")
- Lee la información del altavoz cuando está en modo configuración
- Busca las redes Wi‑Fi que ve el altavoz
- Envía tu red y tu contraseña (cifrada con la clave pública del propio altavoz) y le pone un nombre

## Requisitos
- Python 3.10 o superior
- Un PC en la **misma red Wi‑Fi** que el altavoz (no funciona desde un servidor en la nube)

## Instalación y uso
```bash
cd google-home-mini-web
python -m venv .venv
# Windows: .venv\Scripts\activate     macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python app.py
```
Abre **http://localhost:5000**.

> Para el texto a voz, el altavoz descarga el audio desde tu PC por el puerto 5000.
> Si tu firewall pregunta, permite las conexiones de Python en redes privadas.

## Emparejar un altavoz nuevo o reseteado
1. Restablece el altavoz (mantén pulsado el botón de reset unos 15 s).
2. Conecta tu PC a la red Wi‑Fi que crea el altavoz (`GoogleHomeXXXX…`).
3. Inicia la app, ve a **Emparejar**, pulsa **Leer dispositivo** y luego **Buscar redes**.
4. Elige tu red, escribe la contraseña y pulsa **Conectar**.
5. Vuelve a conectar tu PC a tu Wi‑Fi normal y, en **Controlar**, pulsa **Buscar dispositivos**.

## Limitaciones importantes
- El emparejamiento usa la **API local no oficial** del dispositivo (documentada por la comunidad en GHLocalApi). Google no la garantiza y algunos firmwares la bloquean: si responde 401/403, la app te mostrará el error.
- Sin vincular una cuenta de Google, el **Asistente de voz** ("Ok Google") no funciona. La app controla el altavoz como un dispositivo **Cast**: volumen, reproducción y texto a voz.
- No se pueden reproducir Spotify ni YouTube Music directamente (necesitan sus propias apps y cuentas); sí URLs de audio directas y radios por streaming.

## Estructura
```
google-home-mini-web/
├── app.py            # API Flask: búsqueda, control y endpoints de emparejamiento
├── setup_api.py      # Cliente de la API local de configuración Wi‑Fi
├── requirements.txt
└── static/
    ├── index.html
    ├── style.css
    └── app.js
```

## API del backend
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/devices?hosts=IP1,IP2` | Buscar altavoces |
| GET | `/api/devices/<id>/status` | Estado (volumen, app, reproducción) |
| POST | `/api/devices/<id>/volume` | `{ "level": 0-100 }` |
| POST | `/api/devices/<id>/mute` | `{ "muted": true }` |
| POST | `/api/devices/<id>/media/<play\|pause\|stop\|quit>` | Control de reproducción |
| POST | `/api/devices/<id>/play` | `{ "url": "https://…mp3" }` |
| POST | `/api/devices/<id>/say` | `{ "text": "Hola", "lang": "es" }` |
| GET | `/api/setup/info?host=192.168.255.249` | Info del altavoz en modo configuración |
| POST | `/api/setup/scan` | `{ "host": "…" }` → redes Wi‑Fi |
| POST | `/api/setup/connect` | `{ host, ssid, password, wpa_auth, wpa_cipher, name }` |
