#!/usr/bin/env node
// Mehrere OpenCode-API-Keys als "Slots" verwalten und per Schalter aktivieren.
//
// Slots liegen als einzelne Dateien (0600) unter
//   ~/.config/bridge-picker/opencode-keys/<slot>.env      (Inhalt: OPENCODE_API_KEY=…)
// Der aktive Key steht zusaetzlich im Router-Speicher:
//   ~/.codex/codex-router/opencode-go-api-key.secret
//
// Key-Werte werden nie ausgegeben, nie geloggt, nie als Prozessargument uebergeben.
// Der Weg ist immer: Zwischenablage -> Test gegen den Anbieter -> Datei.
// Ein abgelehnter Key ueberschreibt nie einen funktionierenden.
//
// Pfade lassen sich per Umgebungsvariable umbiegen:
//   OPENCODE_SLOT_DIR    Slot-Verzeichnis
//   OPENCODE_ACTIVE_ENV  Datei mit dem aktiven Key
//   CODEX_ROUTER_DIR     Checkout des codex-router
//
// Aufrufe:
//   node opencode-keys.mjs import <slot>        aktuell aktiven Key als Slot sichern
//   node opencode-keys.mjs add <slot> [--use]   Key aus der Zwischenablage testen und speichern
//   node opencode-keys.mjs status               alle Slots pruefen (OK / LIMIT / HTTP-Fehler)
//   node opencode-keys.mjs use <slot>           Slot aktivieren, Cooldown loeschen, Dienst neu starten
//   node opencode-keys.mjs auto [--if-limited]  ersten Slot mit freiem Kontingent aktivieren
//   node opencode-keys.mjs remove <slot>        Slot loeschen (nie den aktiven)

import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

const HOME = process.env.HOME;
if (!HOME) {
  console.error("HOME ist nicht gesetzt.");
  process.exit(1);
}

const SLOT_DIR = process.env.OPENCODE_SLOT_DIR || path.join(HOME, ".config/bridge-picker/opencode-keys");
const ACTIVE_ENV = process.env.OPENCODE_ACTIVE_ENV || path.join(SLOT_DIR, "_aktiv.env");
const ROUTER_DIR = process.env.CODEX_ROUTER_DIR || path.join(HOME, ".local/share/codex-router");
const ROUTER_STATE = path.join(HOME, ".codex/codex-router");
const RATE_LIMITS = path.join(ROUTER_STATE, "rate-limits.json");
const ROUTER_SECRET = path.join(ROUTER_STATE, "opencode-go-api-key.secret");

const VAR = "OPENCODE_API_KEY";
const GO = "https://opencode.ai/zen/go/v1";
const ZEN = "https://opencode.ai/zen/v1";
// Kontingent-Probe ueber die Messages-Route. Wichtig: /messages am Go-Endpunkt
// verlangt den Header x-api-key, NICHT Authorization: Bearer.
const PROBE_MODEL = process.env.OPENCODE_PROBE_MODEL || "minimax-m3";

const [, , command, slotArg] = process.argv;
const flags = new Set(process.argv.slice(3).filter((a) => a.startsWith("--")));

function die(message) {
  console.error(message);
  process.exit(1);
}

function validSlot(slot) {
  if (!slot || !/^[a-z0-9][a-z0-9-]{0,31}$/.test(slot)) {
    die("Slot-Name: nur a-z, 0-9, Bindestrich (z. B. 'haupt', 'zweit').");
  }
  return slot;
}

function slotPath(slot) {
  return path.join(SLOT_DIR, `${slot}.env`);
}

// Liest den Key aus einer Datei im Format OPENCODE_API_KEY=…
function parseEnv(file) {
  try {
    return readFileSync(file, "utf8").match(new RegExp(`^${VAR}=(.+)$`, "m"))?.[1]?.trim() || "";
  } catch {
    return "";
  }
}

// Schreibt mit 0600 und prueft direkt danach zurueck (Readback statt Vertrauen).
function writeEnv(file, key) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, `${VAR}=${key}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(file, 0o600);
  if (readFileSync(file, "utf8").trim() !== `${VAR}=${key}`) die(`Readback von ${file} stimmt nicht.`);
}

function listSlots() {
  if (!existsSync(SLOT_DIR)) return [];
  return readdirSync(SLOT_DIR)
    .filter((f) => f.endsWith(".env") && !f.startsWith("_"))
    .map((f) => f.slice(0, -4))
    .sort();
}

// Aktiver Key: bevorzugt die eigene Datei, sonst der Router-Speicher.
function activeKey() {
  const own = parseEnv(ACTIVE_ENV);
  if (own) return own;
  try {
    return readFileSync(ROUTER_SECRET, "utf8").trim();
  } catch {
    return "";
  }
}

// Key aus der Zwischenablage (macOS: pbpaste, Linux: xclip/wl-paste).
function readClipboardKey() {
  const candidates = [
    ["pbpaste", []],
    ["wl-paste", ["--no-newline"]],
    ["xclip", ["-selection", "clipboard", "-o"]],
  ];
  let raw = "";
  for (const [bin, args] of candidates) {
    try {
      raw = execFileSync(bin, args, { encoding: "utf8" });
      break;
    } catch {
      /* naechsten Kandidaten versuchen */
    }
  }
  const key = raw.trim();
  if (!key) die("Zwischenablage ist leer oder kein Zwischenablage-Werkzeug gefunden (pbpaste/wl-paste/xclip).");
  if (key.includes("\n")) die("Zwischenablage enthaelt mehrere Zeilen.");
  if (!/^[A-Za-z0-9._-]+$/.test(key)) die("Unerwartete Zeichen im Key.");
  return key;
}

// Ein Key gilt als gueltig, wenn /models auf beiden Endpunkten 200 liefert.
async function keyAccepted(key) {
  for (const base of [GO, ZEN]) {
    const r = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
    if (!r.ok) return { ok: false, where: base.replace("https://opencode.ai", ""), status: r.status };
  }
  return { ok: true };
}

// Kontingent-Probe: winziger Request.
// 200 = frei, 429 = Kontingent/Wochenlimit, 401/403 = Key- oder Freigabeproblem.
async function probeQuota(key) {
  try {
    const r = await fetch(`${GO}/messages`, {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model: PROBE_MODEL, max_tokens: 16, messages: [{ role: "user", content: "pong" }] }),
    });
    if (r.ok) return { state: "OK", detail: "Kontingent frei" };
    // Der Key darf niemals in einer Fehlermeldung landen.
    const body = (await r.text()).split(key).join("[REDACTED]");
    let msg = body.slice(0, 160).replace(/\s+/g, " ");
    try {
      const j = JSON.parse(body);
      msg = `${j.error?.type || ""} ${j.error?.message || ""}`.trim().slice(0, 160);
    } catch {
      /* keine JSON-Antwort: Rohtext gekuerzt anzeigen */
    }
    if (r.status === 429) return { state: "LIMIT", detail: msg };
    return { state: `HTTP ${r.status}`, detail: msg };
  } catch (e) {
    return { state: "FEHLER", detail: e.message };
  }
}

// Der Router merkt sich ein beobachtetes 429 als Cooldown. Nach einem
// Key-Wechsel muss der weg, sonst wartet er auf ein Limit, das nicht mehr gilt.
function clearRouterCooldown() {
  try {
    const data = JSON.parse(readFileSync(RATE_LIMITS, "utf8"));
    if (data["opencode-go"]) {
      delete data["opencode-go"];
      writeFileSync(RATE_LIMITS, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
      console.log("Router-Cooldown fuer opencode-go geloescht.");
    }
  } catch {
    /* keine Cooldown-Datei: nichts zu tun */
  }
}

async function activate(slot) {
  const key = parseEnv(slotPath(slot));
  if (!key) die(`Slot '${slot}' nicht gefunden oder leer.`);
  if (key === activeKey()) {
    console.log(`Slot '${slot}' ist bereits aktiv.`);
    return;
  }
  writeEnv(ACTIVE_ENV, key);
  console.log(`Geschrieben: ${ACTIVE_ENV} (0600)`);

  // Bevorzugt die Schreibfunktion des Routers, damit Format und Rechte
  // zu seiner Erwartung passen. Faellt auf die Secret-Datei zurueck.
  try {
    const { writeProviderCredential } = await import(`${ROUTER_DIR}/src/provider-credentials.mjs`);
    const target = writeProviderCredential("opencode-go", key);
    console.log(`Geschrieben: ${target}`);
  } catch {
    mkdirSync(ROUTER_STATE, { recursive: true, mode: 0o700 });
    writeFileSync(ROUTER_SECRET, `${key}\n`, { encoding: "utf8", mode: 0o600 });
    chmodSync(ROUTER_SECRET, 0o600);
    console.log(`Geschrieben: ${ROUTER_SECRET} (0600, Fallback)`);
  }

  clearRouterCooldown();
  try {
    execFileSync(process.execPath, ["src/service.mjs", "restart"], { cwd: ROUTER_DIR, stdio: "ignore" });
    console.log(`Router neu gestartet. Slot '${slot}' ist aktiv.`);
  } catch {
    console.log(`Slot '${slot}' ist aktiv. Router-Neustart fehlgeschlagen — von Hand: cd ${ROUTER_DIR} && node src/service.mjs restart`);
  }
  console.log("Codex komplett beenden und neu oeffnen.");
}

async function status() {
  const slots = listSlots();
  if (!slots.length) {
    console.log(`Keine Slots unter ${SLOT_DIR}. Erst 'import <slot>' oder 'add <slot>'.`);
    return [];
  }
  const active = activeKey();
  const rows = [];
  for (const slot of slots) {
    const key = parseEnv(slotPath(slot));
    const probe = key ? await probeQuota(key) : { state: "LEER", detail: "" };
    rows.push({ slot, active: Boolean(key) && key === active, ...probe });
  }
  for (const r of rows) {
    console.log(`${r.active ? "*" : " "} ${r.slot.padEnd(12)} ${r.state.padEnd(9)} ${r.detail}`);
  }
  console.log("\n* = aktiv. OK = Kontingent frei, LIMIT = Kontingent/Wochenlimit erreicht.");
  return rows;
}

switch (command) {
  case "add": {
    const slot = validSlot(slotArg);
    const key = readClipboardKey();
    console.log(`Key aus Zwischenablage: ${key.length} Zeichen.`);
    for (const s of listSlots()) {
      if (parseEnv(slotPath(s)) === key) die(`Dieser Key ist bereits als Slot '${s}' gespeichert.`);
    }
    const test = await keyAccepted(key);
    if (!test.ok) die(`Test ${test.where}: HTTP ${test.status}. Key abgelehnt, NICHTS geschrieben.`);
    console.log("Test gegen beide Endpunkte: HTTP 200");
    writeEnv(slotPath(slot), key);
    console.log(`Gespeichert: ${slotPath(slot)} (0600)`);
    const quota = await probeQuota(key);
    console.log(`Kontingent: ${quota.state} ${quota.detail}`);
    if (flags.has("--use")) await activate(slot);
    else console.log(`Aktivieren mit: node ${process.argv[1]} use ${slot}`);
    break;
  }

  case "import": {
    const slot = validSlot(slotArg);
    const key = activeKey();
    if (!key) die("Kein aktiver Key gefunden. Erst 'add <slot> --use' verwenden.");
    if (existsSync(slotPath(slot)) && !flags.has("--force")) {
      die(`Slot '${slot}' existiert schon (--force zum Ueberschreiben).`);
    }
    writeEnv(slotPath(slot), key);
    console.log(`Aktiver Key als Slot '${slot}' gesichert: ${slotPath(slot)}`);
    break;
  }

  case "status":
    await status();
    break;

  case "use":
    await activate(validSlot(slotArg));
    break;

  case "auto": {
    // --if-limited: nur handeln, wenn der Router selbst ein 429 von opencode
    // beobachtet hat. Spart im Normalfall jede Anbieter-Anfrage, damit ein
    // haeufig laufender Watchdog kein Kontingent verbrennt.
    if (flags.has("--if-limited")) {
      let limited = false;
      try {
        const rl = JSON.parse(readFileSync(RATE_LIMITS, "utf8"));
        const entry = rl["opencode-go"];
        limited = Boolean(entry?.retryAt && new Date(entry.retryAt) > new Date());
      } catch {
        /* keine Cooldown-Datei: kein beobachtetes Limit */
      }
      if (!limited) process.exit(0);
      console.log(`[${new Date().toISOString()}] Router meldet opencode-Limit — pruefe Slots.`);
    }
    const rows = await status();
    const winner = rows.find((r) => r.state === "OK");
    if (!winner) die("\nKein Slot mit freiem Kontingent.");
    if (winner.active) console.log(`\nAktiver Slot '${winner.slot}' hat freies Kontingent. Nichts zu tun.`);
    else {
      console.log(`\nWechsle auf '${winner.slot}'.`);
      await activate(winner.slot);
    }
    break;
  }

  case "remove": {
    const slot = validSlot(slotArg);
    if (!existsSync(slotPath(slot))) die(`Slot '${slot}' existiert nicht.`);
    if (parseEnv(slotPath(slot)) === activeKey()) {
      die("Aktiver Slot kann nicht entfernt werden. Erst einen anderen aktivieren.");
    }
    unlinkSync(slotPath(slot));
    console.log(`Slot '${slot}' entfernt.`);
    break;
  }

  default:
    console.log("Aufruf: opencode-keys.mjs import <slot> | add <slot> [--use] | status | use <slot> | auto [--if-limited] | remove <slot>");
    console.log(`Slot-Verzeichnis: ${SLOT_DIR}`);
}
