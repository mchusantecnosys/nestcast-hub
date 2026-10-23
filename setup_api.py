"""Emparejamiento (configuración inicial Wi-Fi) de un Google Home / Nest Mini
usando la API local NO oficial del dispositivo (la misma que usa la app Google Home).

Flujo:
  1. El dispositivo en modo configuración crea su propia red Wi-Fi (p. ej. "GoogleHomeXXXX.o").
  2. El PC donde corre esta app se conecta a esa red. El dispositivo responde en 192.168.255.249.
  3. Leemos /setup/eureka_info (incluye la clave pública RSA del dispositivo).
  4. Pedimos un escaneo de redes (/setup/scan_wifi + /setup/scan_results).
  5. Enviamos la red elegida con la contraseña cifrada (RSA PKCS#1 v1.5) a /setup/connect_wifi
     y confirmamos con /setup/save_wifi.
"""
import base64
import time

import requests
import urllib3
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import padding

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

DEFAULT_SETUP_HOST = "192.168.18.27"
TIMEOUT = 4


class SetupError(Exception):
    pass


def _request(host, method, path, body=None):
    """Prueba HTTP:8008 (inmediato) y luego HTTPS:8443 (firmware con TLS)."""
    last_error = None
    for base in (f"http://{host}:8008", f"https://{host}:8443"):
        try:
            resp = requests.request(method, base + path, json=body, timeout=TIMEOUT, verify=False,
                                    headers={"Content-Type": "application/json"})
        except requests.RequestException as exc:
            last_error = f"No se pudo conectar con {base}: {exc.__class__.__name__}"
            continue
        if resp.status_code in (401, 403):
            last_error = (f"{base}{path} respondió {resp.status_code}: el dispositivo no está en modo "
                          "configuración o exige un token local de Google.")
            continue
        if resp.status_code >= 400:
            last_error = f"{base}{path} respondió {resp.status_code}: {resp.text[:200]}"
            continue
        if not resp.content:
            return {}
        try:
            return resp.json()
        except ValueError:
            return {"raw": resp.text}
    raise SetupError(last_error or "El dispositivo no respondió.")


def get_info(host=DEFAULT_SETUP_HOST):
    info = _request(host, "GET", "/setup/eureka_info?options=detail")
    setup = info.get("setup") or {}
    device = info.get("device_info") or {}
    net = info.get("net") or {}
    return {
        "name": info.get("name") or "Google Home Mini",
        "model": device.get("model_name") or device.get("product_name") or "Google Home Mini",
        "version": info.get("cast_build_revision") or info.get("build_version"),
        "ip": net.get("ip_address") or info.get("ip_address") or host,
        "connected": bool(net.get("online") or info.get("connected")),
        "ssid": info.get("ssid") or (info.get("wifi") or {}).get("ssid"),
        "setup_state": info.get("setup_state") or setup.get("setup_state") or (60 if info.get("connected") else 10),
        "has_public_key": bool(info.get("public_key")),
        "public_key": info.get("public_key"),
        "signal_level": info.get("signal_level"),
    }


def scan_networks(host=DEFAULT_SETUP_HOST, wait_seconds=3):
    info = get_info(host)
    results = []
    try:
        _request(host, "POST", "/setup/scan_wifi")
        time.sleep(wait_seconds)
        res = _request(host, "GET", "/setup/scan_results")
        if isinstance(res, dict):
            results = res.get("results") or res.get("networks") or []
        elif isinstance(res, list):
            results = res
    except SetupError:
        # Si el altavoz ya está conectado a una red Wi-Fi, devuelve 403 por seguridad
        pass

    best = {}
    for net in results:
        ssid = net.get("ssid")
        if not ssid:
            continue
        if ssid not in best or net.get("signal_level", -999) > best[ssid].get("signal_level", -999):
            best[ssid] = net

    # Si no se pudieron escanear redes externas porque ya está conectado, incluir su red Wi-Fi actual
    if not best and info.get("ssid"):
        best[info["ssid"]] = {
            "ssid": info["ssid"],
            "signal_level": info.get("signal_level") or -50,
            "wpa_auth": 7,
            "wpa_cipher": 4,
        }

    networks = [{
        "ssid": n["ssid"],
        "signal": n.get("signal_level"),
        "wpa_auth": n.get("wpa_auth", 7),
        "wpa_cipher": n.get("wpa_cipher", 4),
    } for n in best.values()]
    return sorted(networks, key=lambda n: n["signal"] if n["signal"] is not None else -999, reverse=True)


def encrypt_password(public_key, password):
    """Cifra la contraseña Wi-Fi con la clave pública RSA que entrega eureka_info."""
    if "BEGIN" in public_key:
        candidates = [public_key.encode()]
    else:
        b64 = "".join(public_key.split())
        body = "\n".join(b64[i:i + 64] for i in range(0, len(b64), 64))
        candidates = [
            f"-----BEGIN RSA PUBLIC KEY-----\n{body}\n-----END RSA PUBLIC KEY-----\n".encode(),
            f"-----BEGIN PUBLIC KEY-----\n{body}\n-----END PUBLIC KEY-----\n".encode(),
        ]
    key = None
    for pem in candidates:
        try:
            key = serialization.load_pem_public_key(pem)
            break
        except ValueError:
            continue
    if key is None:
        raise SetupError("No se pudo leer la clave pública del dispositivo.")
    encrypted = key.encrypt(password.encode("utf-8"), padding.PKCS1v15())
    return base64.b64encode(encrypted).decode("ascii")


def connect_wifi(host, ssid, password, wpa_auth=7, wpa_cipher=4, name=None):
    info = _request(host, "GET", "/setup/eureka_info?options=detail")

    if name:
        _request(host, "POST", "/setup/set_eureka_info", {
            "name": name,
            "opt_in": {"crash": False, "opencast": False, "stats": False},
        })

    body = {"ssid": ssid, "wpa_auth": int(wpa_auth), "wpa_cipher": int(wpa_cipher)}
    if password:
        public_key = info.get("public_key")
        if not public_key:
            raise SetupError("El dispositivo no entregó su clave pública; no se puede enviar la contraseña.")
        body["enc_passwd"] = encrypt_password(public_key, password)

    _request(host, "POST", "/setup/connect_wifi", body)
    _request(host, "POST", "/setup/save_wifi", {"keep_hotspot_until_connected": True})
    return {
        "message": (f"Credenciales enviadas. El dispositivo intentará conectarse a '{ssid}'. "
                    "Vuelve a conectar tu PC a tu Wi-Fi normal y pulsa 'Buscar dispositivos'.")
    }
