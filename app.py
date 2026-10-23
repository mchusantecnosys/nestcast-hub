"""Google Home Mini Controller — backend en Flask.

Ejecuta:  python app.py   y abre  http://localhost:5000
El PC debe estar en la misma red Wi-Fi que el Google Home Mini.
"""
import concurrent.futures
import os
import socket
import threading
import time
import uuid

import pychromecast
import requests
from flask import Flask, jsonify, request, send_from_directory

import setup_api

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TTS_DIR = os.path.join(BASE_DIR, "tts_cache")
PORT = int(os.environ.get("PORT", "5000"))
os.makedirs(TTS_DIR, exist_ok=True)

app = Flask(__name__, static_folder="static", static_url_path="/static")

@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS, PUT, DELETE"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response

@app.route("/api/<path:dummy>", methods=["OPTIONS"])
def handle_options(dummy):
    return "", 204

_casts = {}               # id -> pychromecast.Chromecast
_known_hosts = {"192.168.18.27"}  # hosts conocidos/descubiertos
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
            for c in _casts.values():
                if c.cast_info.host == device_id or str(c.cast_info.uuid) == device_id or device_id.endswith(c.cast_info.host.replace('.', '-')):
                    return c
        if cast is None and ("192.168." in device_id or "10." in device_id):
            host = device_id.replace("custom-", "").replace("-", ".")
            try:
                c = pychromecast.get_chromecast_from_host((host, 8009, None, None, None))
                c.wait(timeout=5)
                _casts[str(c.cast_info.uuid)] = c
                return c
            except Exception:
                pass
    if cast is None:
        raise LookupError(f"Dispositivo '{device_id}' no encontrado.")
    return cast


def device_dict(cast):
    info = cast.cast_info
    name = info.friendly_name or cast.name
    uuid_str = str(info.uuid) if info.uuid and str(info.uuid) != "None" else None
    if not name or name == "None" or not uuid_str:
        try:
            eureka = setup_api.get_info(info.host)
            if not name or name == "None":
                name = eureka.get("name") or "Bedroom"
            if not uuid_str:
                uuid_str = "9385cf53-1a40-d508-df9e-25975238365b"
        except Exception:
            name = name or "Google Home Mini"
            uuid_str = uuid_str or f"device-{info.host.replace('.', '-')}"

    return {
        "id": uuid_str,
        "name": name,
        "model": info.model_name or "Google Home Mini",
        "host": info.host,
        "type": info.cast_type or "audio",
    }


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


def get_local_subnet_prefixes():
    prefixes = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        if ip and not ip.startswith("127."):
            prefixes.add(".".join(ip.split(".")[:3]) + ".")
    except Exception:
        pass

    try:
        hostname = socket.gethostname()
        for ip in socket.gethostbyname_ex(hostname)[2]:
            if not ip.startswith("127.") and ":" not in ip:
                prefixes.add(".".join(ip.split(".")[:3]) + ".")
    except Exception:
        pass

    if not prefixes:
        prefixes.add("192.168.18.")
    return sorted(list(prefixes))


def probe_speaker_ip(ip):
    # Probar socket 8008 primero
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(0.35)
    port_8008 = False
    try:
        if s.connect_ex((ip, 8008)) == 0:
            port_8008 = True
    except Exception:
        pass
    finally:
        s.close()

    port_8009 = False
    if not port_8008:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.35)
        try:
            if s.connect_ex((ip, 8009)) == 0:
                port_8009 = True
        except Exception:
            pass
        finally:
            s.close()

    if not port_8008 and not port_8009:
        return None

    info = None
    if port_8008:
        try:
            info = setup_api.get_info(ip)
        except Exception:
            pass

    if info:
        uuid_str = f"device-{ip.replace('.', '-')}"
        return {
            "id": uuid_str,
            "name": info.get("name") or f"Google Home ({ip})",
            "model": info.get("model") or "Google Home Mini",
            "ip": ip,
            "host": ip,
            "connected": info.get("connected", True),
            "version": info.get("version"),
            "ssid": info.get("ssid"),
            "signal_level": info.get("signal_level"),
            "has_public_key": info.get("has_public_key", False),
        }

    if port_8009:
        try:
            c = pychromecast.get_chromecast_from_host((ip, 8009, None, None, None))
            c.wait(timeout=2)
            dd = device_dict(c)
            return {
                "id": dd["id"],
                "name": dd["name"],
                "model": dd["model"],
                "ip": ip,
                "host": ip,
                "connected": True,
                "version": None,
                "ssid": None,
                "signal_level": None,
                "has_public_key": False,
            }
        except Exception:
            pass

    return None


def scan_subnet_for_speakers(prefix):
    clean = prefix.strip()
    if clean.endswith("."):
        ips = [f"{clean}{i}" for i in range(1, 255)]
    elif "/" in clean:
        base = clean.split("/")[0]
        base_prefix = ".".join(base.split(".")[:3]) + "."
        ips = [f"{base_prefix}{i}" for i in range(1, 255)]
    else:
        base_prefix = ".".join(clean.split(".")[:3]) + "."
        ips = [f"{base_prefix}{i}" for i in range(1, 255)]

    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=64) as executor:
        for res in executor.map(probe_speaker_ip, ips):
            if res:
                results.append(res)
    return results


# ---------- descubrimiento y control ----------
@app.get("/api/devices/scan-network")
def scan_network_endpoint():
    prefix_param = request.args.get("subnet")
    default_prefixes = get_local_subnet_prefixes()
    target_prefix = prefix_param.strip() if prefix_param and prefix_param.strip() else default_prefixes[0]
    if not target_prefix.endswith(".") and "/" not in target_prefix:
        target_prefix += "."

    devices = scan_subnet_for_speakers(target_prefix)
    with _lock:
        for d in devices:
            _known_hosts.add(d["host"])

    return ok(subnet=target_prefix, detected_subnets=default_prefixes, devices=devices)


@app.post("/api/devices/<device_id>/ping")
def ping_device(device_id):
    try:
        cast = get_cast(device_id)
        chime_url = "https://actions.google.com/sounds/v1/alarms/beep_short.ogg"
        mc = cast.media_controller
        mc.play_media(chime_url, "audio/ogg", title="Identificando altavoz")
        mc.block_until_active(timeout=4)
        return ok(pinged=device_id, name=cast.name or cast.cast_info.friendly_name)
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500


@app.get("/api/devices")
def list_devices():
    hosts = [h.strip() for h in request.args.get("hosts", "").split(",") if h.strip()]
    if not hosts:
        hosts = list(_known_hosts)

    found_casts = []
    for h in hosts:
        try:
            c = pychromecast.get_chromecast_from_host((h, 8009, None, "Google Home Mini", None))
            c.wait(timeout=3)
            found_casts.append(c)
        except Exception:
            pass

    if not found_casts:
        try:
            casts, browser = pychromecast.get_chromecasts(timeout=3)
            for c in casts:
                try:
                    c.wait(timeout=3)
                    found_casts.append(c)
                except Exception:
                    continue
            browser.stop_discovery()
        except Exception:
            pass

    # Si todavía no hay dispositivos, realizar barrido rápido de subred
    if not found_casts:
        prefixes = get_local_subnet_prefixes()
        for p in prefixes:
            lan_devices = scan_subnet_for_speakers(p)
            for ld in lan_devices:
                try:
                    c = pychromecast.get_chromecast_from_host((ld["host"], 8009, None, "Google Home Mini", None))
                    c.wait(timeout=3)
                    found_casts.append(c)
                except Exception:
                    pass
            if found_casts:
                break

    with _lock:
        for old in _casts.values():
            try:
                old.disconnect(timeout=1)
            except Exception:
                pass
        _casts.clear()
        devices = []
        seen_hosts = set()
        for cast in found_casts:
            dd = device_dict(cast)
            host = dd.get("host") or getattr(cast.cast_info, "host", None)
            if host:
                if host in seen_hosts:
                    continue
                seen_hosts.add(host)
                _known_hosts.add(host)
                _casts[host] = cast
            _casts[dd["id"]] = cast
            devices.append(dd)
    return ok(devices=devices)


@app.route("/api/devices/<device_id>", methods=["DELETE"])
def remove_device(device_id):
    with _lock:
        to_del = []
        for k, c in list(_casts.items()):
            if k == device_id or c.cast_info.host == device_id or str(c.cast_info.uuid) == device_id or device_id.endswith(c.cast_info.host.replace('.', '-')):
                to_del.append(k)
                try:
                    c.disconnect(timeout=1)
                except Exception:
                    pass
        for k in to_del:
            _casts.pop(k, None)
    return ok(removed=device_id)


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
