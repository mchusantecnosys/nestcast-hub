const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let currentId = null;
let currentStatus = null;
let statusTimer = null;
let draggingVolume = false;
let networks = [];

// ---------- utilidades ----------
async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

let toastTimer;
function toast(msg, type = "info") {
  const el = $("#toast");
  el.textContent = msg;
  el.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = ""), type === "error" ? 6000 : 3000);
}

async function withBusy(btn, fn) {
  if (btn) { btn.disabled = true; btn.classList.add("loading"); }
  try { await fn(); }
  catch (err) { toast(err.message, "error"); }
  finally { if (btn) { btn.disabled = false; btn.classList.remove("loading"); } }
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- pestañas ----------
$$(".tab").forEach((tab) => tab.addEventListener("click", () => {
  $$(".tab").forEach((t) => t.classList.toggle("active", t === tab));
  $$(".panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${tab.dataset.tab}`));
}));

// ---------- descubrimiento ----------
$("#btn-discover").addEventListener("click", (e) => withBusy(e.currentTarget, async () => {
  const hosts = $("#known-hosts").value.trim();
  const { devices } = await api(`/api/devices?hosts=${encodeURIComponent(hosts)}`);
  const list = $("#device-list");
  list.innerHTML = "";
  if (!devices.length) {
    list.innerHTML = '<li class="empty">No se encontró ningún dispositivo. Revisa que estén en la misma red o escribe su IP.</li>';
    return;
  }
  devices.forEach((dev) => {
    const li = document.createElement("li");
    li.innerHTML = `<span><b>${esc(dev.name)}</b><br><small>${esc(dev.model)} · ${esc(dev.host)}</small></span><span>›</span>`;
    li.addEventListener("click", () => selectDevice(dev, li));
    list.appendChild(li);
  });
  toast(`${devices.length} dispositivo(s) encontrado(s)`, "success");
  if (devices.length === 1) selectDevice(devices[0], list.firstChild);
}));

function selectDevice(dev, li) {
  currentId = dev.id;
  $$("#device-list li").forEach((x) => x.classList.toggle("selected", x === li));
  $("#control-card").classList.remove("hidden");
  $("#dev-name").textContent = dev.name;
  $("#dev-meta").textContent = `${dev.model} · ${dev.host}`;
  clearInterval(statusTimer);
  refreshStatus();
  statusTimer = setInterval(refreshStatus, 3000);
}

async function refreshStatus() {
  if (!currentId) return;
  try {
    const { status } = await api(`/api/devices/${currentId}/status`);
    currentStatus = status;
    $("#st-state").textContent = status.player_state;
    $("#st-app").textContent = status.app;
    $("#st-title").textContent = status.title || "—";
    $("#btn-mute").textContent = status.muted ? "🔊 Activar sonido" : "🔇 Silenciar";
    if (!draggingVolume) {
      $("#volume").value = status.volume;
      $("#vol-label").textContent = status.volume;
    }
  } catch {
    $("#st-state").textContent = "Sin conexión";
  }
}

// ---------- controles ----------
const volume = $("#volume");
volume.addEventListener("input", () => {
  draggingVolume = true;
  $("#vol-label").textContent = volume.value;
});
volume.addEventListener("change", () => withBusy(null, async () => {
  try {
    await api(`/api/devices/${currentId}/volume`, { method: "POST", body: { level: Number(volume.value) } });
  } finally {
    draggingVolume = false;
  }
}));

$("#btn-mute").addEventListener("click", (e) => withBusy(e.currentTarget, async () => {
  const muted = !(currentStatus && currentStatus.muted);
  await api(`/api/devices/${currentId}/mute`, { method: "POST", body: { muted } });
  await refreshStatus();
}));

$$(".media button").forEach((btn) => btn.addEventListener("click", () => withBusy(btn, async () => {
  await api(`/api/devices/${currentId}/media/${btn.dataset.action}`, { method: "POST" });
  await refreshStatus();
})));

$("#form-play").addEventListener("submit", (e) => {
  e.preventDefault();
  withBusy(e.submitter, async () => {
    await api(`/api/devices/${currentId}/play`, { method: "POST", body: { url: $("#play-url").value } });
    toast("Reproduciendo", "success");
    await refreshStatus();
  });
});

$("#form-say").addEventListener("submit", (e) => {
  e.preventDefault();
  withBusy(e.submitter, async () => {
    await api(`/api/devices/${currentId}/say`, {
      method: "POST",
      body: { text: $("#say-text").value, lang: $("#say-lang").value },
    });
    toast("Enviado al altavoz", "success");
  });
});

// ---------- emparejamiento ----------
const setupHost = () => $("#setup-host").value.trim();

$("#btn-setup-info").addEventListener("click", (e) => withBusy(e.currentTarget, async () => {
  const { info } = await api(`/api/setup/info?host=${encodeURIComponent(setupHost())}`);
  const box = $("#setup-info");
  box.classList.remove("hidden");
  box.innerHTML = `<dl>
    <dt>Nombre</dt><dd>${esc(info.name || "—")}</dd>
    <dt>Modelo</dt><dd>${esc(info.model || "—")}</dd>
    <dt>Firmware</dt><dd>${esc(info.version || "—")}</dd>
    <dt>Wi-Fi actual</dt><dd>${esc(info.ssid || "Sin configurar")}</dd>
    <dt>Listo para emparejar</dt><dd>${info.has_public_key ? "Sí ✅" : "No (no entregó clave pública) ⚠️"}</dd>
  </dl>`;
}));

$("#btn-scan").addEventListener("click", (e) => withBusy(e.currentTarget, async () => {
  toast("Buscando redes… (unos segundos)");
  ({ networks } = await api("/api/setup/scan", { method: "POST", body: { host: setupHost() } }));
  const select = $("#wifi-list");
  select.innerHTML = networks.length
    ? networks.map((n, i) => `<option value="${i}">${esc(n.ssid)} (${n.signal ?? "?"} dBm)</option>`).join("")
    : '<option value="">No se encontraron redes</option>';
  toast(`${networks.length} red(es) encontrada(s)`, "success");
}));

$("#form-connect").addEventListener("submit", (e) => {
  e.preventDefault();
  withBusy(e.submitter, async () => {
    const net = networks[$("#wifi-list").value];
    if (!net) throw new Error("Primero busca y selecciona una red Wi-Fi.");
    const { message } = await api("/api/setup/connect", {
      method: "POST",
      body: {
        host: setupHost(),
        ssid: net.ssid,
        wpa_auth: net.wpa_auth,
        wpa_cipher: net.wpa_cipher,
        password: $("#wifi-pass").value,
        name: $("#device-name").value,
      },
    });
    $("#wifi-pass").value = "";
    toast(message, "success");
  });
});
