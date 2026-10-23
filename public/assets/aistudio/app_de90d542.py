"""Google Home Mini Controller — backend en Flask.

Ejecuta:  python app.py   y abre  http://localhost:5000
El PC debe estar en la misma red Wi-Fi que el Google Home Mini.
"""
import os
import socket
import threading
import time
import uuid

import pychromecast
from flask import Flask, jsonify, request, send_from_directory

import setup_api

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TTS_DIR = os.path.join(BASE_DIR, "tts_cache")
PORT = int(os.environ.get("PORT", "5000"))
os.makedirs(TTS_DIR, exist_ok=True)

app = Flask(__name__, static_folder="static", static_url_path="/static")

_casts = {}               # id -> pychromecast.Chromecast
_lock = threading.Lock()


# ---------- utilidades ----------
def ok(**data):
    return jsonify({"ok": True, **data})


@app.errorhandler(LookupError)
def not_found(exc):
    return jsonify({"ok": False, "error": str(exc)}), 404


@app.errorhandler(setup_api.SetupError)
def setup_error(exc):
    return jsonify({"ok": False, "error": str(exc)}), 502


@app.errorhandler(ValueError)
def bad_request(exc):
    return jsonify({"ok": False, "error": str(exc)}), 400


@app.errorhandler(Exception)
def server_error(exc):
    code = getattr(exc, "code", 500)
    if not isinstance(code, int):
        code = 500
    return jsonify({"ok": False, "error": str(exc) or exc.__class__.__name__}), code


def body():
    return request.get_json(silent=True) or {}


def get_cast(device_id):
    with _lock:
        cast = _casts.get(device_id)
    if cast is None:
        raise LookupError("Dispositivo no encontrado. Pulsa 'Buscar dispositivos'.")
    return cast


def device_dict(cast):
    info = cast.cast_info
    return {"id": str(info.uuid), "name": info.friendly_name, "model": info.model_name,
            "host": info.host, "type": info.cast_type}


def local_ip_for(host):
    """IP de este PC vista desde el dispositivo (para servirle el audio de voz)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect((host, 8009))
        return s.getsockname()[0]
    finally:
        s.close()


def clean_tts_cache(max_age=3600):
    now = time.time()
    for name in os.listdir(TTS_DIR):
        path = os.path.join(TTS_DIR, name)
        if now - os.path.getmtime(path) > max_age:
            os.remove(path)


# ---------- frontend ----------
@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/tts/<path:filename>")
def tts_file(filename):
    return send_from_directory(TTS_DIR, filename, mimetype="audio/mpeg")


# ---------- descubrimiento y control ----------
@app.get("/api/devices")
def list_devices():
    hosts = [h.strip() for h in request.args.get("hosts", "").split(",") if h.strip()]
    casts, browser = pychromecast.get_chromecasts(known_hosts=hosts or None)
    browser.stop_discovery()

    with _lock:
        for old in _casts.values():
            try:
                old.disconnect(timeout=1)
            except Exception:
                pass
        _casts.clear()
        for cast in casts:
            try:
                cast.wait(timeout=10)
            except Exception:
                continue
            _casts[str(cast.cast_info.uuid)] = cast
        devices = [device_dict(c) for c in _casts.values()]
    return ok(devices=devices)


@app.get("/api/devices/<device_id>/status")
def device_status(device_id):
    cast = get_cast(device_id)
    st = cast.status
    ms = cast.media_controller.status
    return ok(device=device_dict(cast), status={
        "volume": round((st.volume_level if st else 0) * 100),
        "muted": bool(st.volume_muted) if st else False,
        "app": (st.display_name if st else None) or "Ninguna",
        "player_state": (ms.player_state if ms else None) or "IDLE",
        "title": (ms.title if ms else None) or "",
    })


@app.post("/api/devices/<device_id>/volume")
def set_volume(device_id):
    level = int(body().get("level", 50))
    if not 0 <= level <= 100:
        raise ValueError("El volumen debe estar entre 0 y 100.")
    get_cast(device_id).set_volume(level / 100)
    return ok(volume=level)


@app.post("/api/devices/<device_id>/mute")
def set_mute(device_id):
    muted = bool(body().get("muted", True))
    get_cast(device_id).set_volume_muted(muted)
    return ok(muted=muted)


@app.post("/api/devices/<device_id>/media/<action>")
def media_action(device_id, action):
    cast = get_cast(device_id)
    mc = cast.media_controller
    actions = {"play": mc.play, "pause": mc.pause, "stop": mc.stop, "quit": cast.quit_app}
    if action not in actions:
        raise ValueError("Acción no válida. Usa play, pause, stop o quit.")
    actions[action]()
    return ok(action=action)


@app.post("/api/devices/<device_id>/play")
def play_url(device_id):
    data = body()
    url = (data.get("url") or "").strip()
    if not url.startswith(("http://", "https://")):
        raise ValueError("Ingresa una URL http(s) de audio válida (mp3, aac, radio en streaming...).")
    mc = get_cast(device_id).media_controller
    mc.play_media(url, data.get("content_type") or "audio/mpeg", title=data.get("title") or url)
    mc.block_until_active(timeout=10)
    return ok()


@app.post("/api/devices/<device_id>/say")
def say(device_id):
    from gtts import gTTS  # importación diferida: solo se necesita para esta función

    data = body()
    text = (data.get("text") or "").strip()
    if not text:
        raise ValueError("Escribe el texto que quieres que diga.")
    cast = get_cast(device_id)
    clean_tts_cache()
    filename = f"{uuid.uuid4().hex}.mp3"
    gTTS(text=text, lang=data.get("lang") or "es").save(os.path.join(TTS_DIR, filename))
    url = f"http://{local_ip_for(cast.cast_info.host)}:{PORT}/tts/{filename}"
    mc = cast.media_controller
    mc.play_media(url, "audio/mpeg", title=text[:60])
    mc.block_until_active(timeout=10)
    return ok(url=url)


# ---------- emparejamiento (configuración Wi-Fi) ----------
@app.get("/api/setup/info")
def setup_info():
    host = request.args.get("host") or setup_api.DEFAULT_SETUP_HOST
    return ok(info=setup_api.get_info(host))


@app.post("/api/setup/scan")
def setup_scan():
    host = body().get("host") or setup_api.DEFAULT_SETUP_HOST
    return ok(networks=setup_api.scan_networks(host))


@app.post("/api/setup/connect")
def setup_connect():
    data = body()
    if not data.get("ssid"):
        raise ValueError("Selecciona una red Wi-Fi.")
    result = setup_api.connect_wifi(
        host=data.get("host") or setup_api.DEFAULT_SETUP_HOST,
        ssid=data["ssid"],
        password=data.get("password") or "",
        wpa_auth=data.get("wpa_auth", 7),
        wpa_cipher=data.get("wpa_cipher", 4),
        name=(data.get("name") or "").strip() or None,
    )
    return ok(**result)


if __name__ == "__main__":
    # 0.0.0.0 para que el Google Home pueda descargar el audio de voz desde este PC.
    app.run(host="0.0.0.0", port=PORT, debug=False, threaded=True)
