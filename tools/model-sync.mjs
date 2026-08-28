#!/usr/bin/env node
// Taeglicher Abgleich der OpenCode-Go-Modelle mit der Codex-Modellauswahl.
//
// Ohne diese Routine versteinert der Picker: neue Modelle des Anbieters tauchen
// nie auf, abgeschaltete bleiben als tote Slugs stehen.
//
// Politik:
//   - Gruppiert Modelle nach Produktlinie (Versionsnummern werden ausmaskiert).
//   - Nimmt pro Linie nur die aktuelle Generation auf. glm-5 neben glm-5.2
//     bleibt damit draussen.
//   - Ergaenzt nur, was noch nicht in der Auswahl steht.
//   - Entfernt selbst ergaenzte Modelle wieder, sobald der Anbieter sie nicht
//     mehr fuehrt oder eine neuere Generation sie abgeloest hat.
//   - Faesst die kuratierte Liste des Router-Checkouts NIE an. Alles landet in
//     user-models.json, das ein Checkout-Update nicht ueberschreibt.
//   - Ueberspringt Modelle, deren Name mit einem nativen GPT-Modell kollidiert:
//     die hast du ueber dein ChatGPT-Abo schon, geroutet wuerden sie kosten.
//
// Abbruchsicherungen: Bei einem Anbieter-Fehler oder null gemeldeten Modellen
// aendert die Routine NICHTS. Ein leerer Katalog ist fast immer eine Stoerung,
// kein Signal, die halbe Auswahl zu loeschen.
//
// Grenze, ehrlich benannt: neu aufgenommene Modelle bekommen das Standardprofil
// des Providers (Kontextfenster 131072, nur Text). Braucht ein Modell ein
// anderes Protokoll oder hat es ein viel groesseres Fenster, muss es einmal von
// Hand nachgezogen werden -- siehe modules/05-picker-pflege.md. Der Lauf meldet,
// wenn er etwas Neues aufgenommen hat.
//
// Aufruf:
//   node model-sync.mjs --dry-run     zeigt nur, was passieren wuerde
//   node model-sync.mjs               fuehrt aus
//
// Pfade per Umgebungsvariable umbiegbar:
//   CODEX_ROUTER_DIR      Checkout des codex-router
//   CODEX_ROUTER_STATE    Router-State (Standard ~/.codex/codex-router)
//   OPENCODE_API_KEY      Key direkt (sonst wird er aus den Dateien gelesen)

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOME = process.env.HOME;
if (!HOME) {
  console.error("HOME ist nicht gesetzt.");
  process.exit(1);
}

const ROOT = process.env.CODEX_ROUTER_DIR || path.join(HOME, ".local/share/codex-router");
const STATE = process.env.CODEX_ROUTER_STATE || path.join(HOME, ".codex/codex-router");
const CONFIG_DIR = path.join(HOME, ".config/bridge-picker");
const LOG = path.join(CONFIG_DIR, "model-sync.log");

const PROVIDER_ID = "opencode-go";
const BASE_URL = process.env.OPENCODE_GO_BASE_URL || "https://opencode.ai/zen/go/v1";

const dryRun = process.argv.includes("--dry-run");
const out = [];
const say = (line) => {
  out.push(line);
  console.log(line);
};

// Log schreiben und beenden. Der Log ist die einzige Spur, wenn der Lauf
// nachts unbeaufsichtigt aus einem LaunchAgent kommt.
function finish(code) {
  try {
    if (existsSync(CONFIG_DIR)) appendFileSync(LOG, `${out.join("\n")}\n\n`);
  } catch {
    /* Log nicht schreibbar: der Lauf selbst war trotzdem gueltig */
  }
  process.exit(code);
}

// Vorschau- und Auslaufkennzeichnungen nehmen wir grundsaetzlich nicht auf.
const SKIP_SUFFIX = /-(preview|beta|alpha|legacy|deprecated|latest|experimental)$/;

// Zusaetze, die eine Ausbaustufe beschreiben, nicht eine Generation. Sie werden
// fuer den Familienvergleich abgeschnitten, damit mimo-v2-pro und mimo-v2.5-pro
// als dieselbe Produktlinie erkannt werden.
const QUALIFIER = /-(pro|omni|code|max|plus|flash|mini|nano|air|lite|thinking)$/;

// Modelle, die der Anbieter kaputt ausliefert (Formatwechsel, nonkonformer
// Stream). Ohne diese Liste nimmt der naechste Lauf sie brav wieder auf, weil
// sie im Anbieter-Katalog stehen -- und der Picker hat wieder einen toten
// Eintrag. Wer ein Modell dauerhaft nicht will, traegt es hier ein.
const DENYLIST = new Set(["kimi-k3"]);

// Produktlinie = Name ohne Versionsnummern und ohne Ausbaustufe.
function family(id) {
  return id.replace(QUALIFIER, "").replace(/\d+(\.\d+)*/g, "#");
}
function version(id) {
  const match = id.match(/\d+(\.\d+)*/);
  return match ? match[0].split(".").map(Number) : [0];
}
function newer(a, b) {
  const x = version(a);
  const y = version(b);
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

// Key-Quellen in dieser Reihenfolge. Der Wert wird nie ausgegeben und nie als
// Prozessargument weitergereicht.
function readKey() {
  if (process.env.OPENCODE_API_KEY) return process.env.OPENCODE_API_KEY.trim();
  const secret = path.join(STATE, "opencode-go-api-key.secret");
  try {
    const value = readFileSync(secret, "utf8").trim();
    if (value) return value;
  } catch {
    /* naechste Quelle versuchen */
  }
  const slot = path.join(CONFIG_DIR, "opencode-keys/_aktiv.env");
  try {
    return readFileSync(slot, "utf8").match(/^OPENCODE_API_KEY=(.+)$/m)?.[1]?.trim() || "";
  } catch {
    return "";
  }
}

const key = readKey();
if (!key) {
  say(`Abbruch: kein OpenCode-Key gefunden (${path.join(STATE, "opencode-go-api-key.secret")}).`);
  finish(1);
}

if (!existsSync(ROOT)) {
  say(`Abbruch: Router-Checkout fehlt unter ${ROOT}. CODEX_ROUTER_DIR setzen?`);
  finish(1);
}

const catalogPath = path.join(STATE, "merged-models.json");
if (!existsSync(catalogPath)) {
  say(`Abbruch: kein Katalog unter ${catalogPath}. Laeuft der Router und ist ein Provider aktiv?`);
  finish(1);
}

// --- Anbieter-Katalog holen. Erste Abbruchsicherung. ---
let response;
try {
  response = await fetch(`${BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(30000),
  });
} catch (error) {
  say(`Abbruch: Anbieter nicht erreichbar (${String(error.message).split("\n")[0]}). Nichts geaendert.`);
  finish(1);
}
if (!response.ok) {
  say(`Abbruch: Modelliste nicht abrufbar (HTTP ${response.status}). Nichts geaendert.`);
  // 401/403 heisst Key- oder Freigabeproblem, nicht Stoerung: kein Alarm im Log.
  finish(response.status === 401 || response.status === 403 ? 0 : 1);
}

const upstream = ((await response.json()).data || []).map((m) => m.id).filter(Boolean);

// --- Zweite Abbruchsicherung: null Modelle ist fast sicher eine Stoerung. ---
if (upstream.length === 0) {
  say("Abbruch: Anbieter meldet 0 Modelle. Das ist fast sicher ein Fehler. Nichts geaendert.");
  finish(1);
}

// Pro Produktlinie nur die aktuelle Generation behalten. Mehrere Ausbaustufen
// derselben Generation (mimo-v2.5 und mimo-v2.5-pro) bleiben nebeneinander,
// aeltere Generationen fallen weg.
const byFamily = new Map();
for (const id of upstream) {
  if (SKIP_SUFFIX.test(id)) continue;
  const group = byFamily.get(family(id)) || [];
  group.push(id);
  byFamily.set(family(id), group);
}

const wanted = new Set();
const supersededBy = new Map();
for (const group of byFamily.values()) {
  const top = [...group].sort((a, b) => newer(b, a))[0];
  for (const id of group) {
    if (newer(id, top) === 0) wanted.add(id);
    else supersededBy.set(id, top);
  }
}

const catalog = JSON.parse(readFileSync(catalogPath, "utf8")).models || [];
const listed = catalog.filter((m) => m.visibility === "list" && typeof m.slug === "string");
const routedIds = new Set(listed.filter((m) => m.slug.includes("/")).map((m) => m.slug.split("/").pop()));
const nativeSlugs = new Set(listed.filter((m) => !m.slug.includes("/")).map((m) => m.slug));

const { readUserModels, writeUserModels, userModelEntry } = await import(
  path.join(ROOT, "src/user-models.mjs")
);
const existing = readUserModels();
const existingBySlug = new Map(existing.map((m) => [m.slug, m]));

const collisions = [];
const denied = [];
const toAdd = [];
for (const id of wanted) {
  if (DENYLIST.has(id)) {
    denied.push(id);
    continue;
  }
  if (routedIds.has(id)) continue;
  if (nativeSlugs.has(id)) {
    collisions.push(id);
    continue;
  }
  if (existingBySlug.has(`${PROVIDER_ID}/${id}`)) continue;
  toAdd.push(id);
}

// Selbst ergaenzte Modelle entfernen, die es beim Anbieter nicht mehr gibt oder
// die inzwischen von einer neueren Version abgeloest wurden.
const upstreamSet = new Set(upstream);
const toRemove = existing.filter((m) => {
  if (m.provider !== PROVIDER_ID) return false;
  const id = m.slug.split("/").pop();
  return !upstreamSet.has(id) || supersededBy.has(id);
});

say(`[${new Date().toISOString().replace("T", " ").slice(0, 19)}] ${PROVIDER_ID}`);
say(`  angeboten: ${upstream.length}   davon aktuell genug: ${wanted.size}`);
say(`  bereits in der Auswahl: ${routedIds.size}`);
if (collisions.length) say(`  uebersprungen (nativ vorhanden): ${collisions.join(", ")}`);
if (denied.length) say(`  uebersprungen (Denyliste): ${denied.join(", ")}`);
say(`  aufnehmen: ${toAdd.length ? toAdd.join(", ") : "nichts"}`);
say(`  entfernen: ${toRemove.length ? toRemove.map((m) => m.slug).join(", ") : "nichts"}`);

if (dryRun) {
  say("  (Probelauf, nichts geschrieben)");
  finish(0);
}

if (toAdd.length === 0 && toRemove.length === 0) {
  say("  keine Aenderung, Katalog bleibt wie er ist");
  finish(0);
}

let priority = Math.max(900, ...existing.map((m) => m.priority || 0)) + 1;
const removedSlugs = new Set(toRemove.map((m) => m.slug));
const next = existing.filter((m) => !removedSlugs.has(m.slug));
for (const id of toAdd) {
  next.push(userModelEntry({ providerId: PROVIDER_ID, upstreamId: id, priority: priority++ }));
}
writeUserModels(next);
say(`  user-models.json geschrieben: ${next.length} Eintraege`);

// Katalog und Gateway-Konfiguration neu erzeugen, dann Labels, dann Neustart.
// Reihenfolge zaehlt: der Katalog-Neubau loescht die Labels, also muessen sie
// danach kommen.
for (const step of ["src/catalog.mjs", "src/litellm-config.mjs"]) {
  execFileSync(process.execPath, [step], { cwd: ROOT, stdio: "ignore" });
}

const labels = [
  path.join(path.dirname(fileURLToPath(import.meta.url)), "picker-usage-labels.mjs"),
  path.join(HOME, ".local/bin/picker-usage-labels.mjs"),
].find((candidate) => existsSync(candidate));
if (labels) {
  try {
    execFileSync(process.execPath, [labels], { stdio: "ignore" });
    say("  Verbrauchslabels neu geschrieben");
  } catch (error) {
    say(`  Verbrauchslabels fehlgeschlagen (${String(error.message).split("\n")[0]})`);
  }
} else {
  say("  picker-usage-labels.mjs nicht gefunden, Labels uebersprungen");
}

execFileSync(process.execPath, ["src/service.mjs", "restart"], { cwd: ROOT, stdio: "ignore" });
say("  Katalog neu gebaut, Dienst neu gestartet");

if (toAdd.length) {
  say("  Hinweis: neue Modelle laufen mit dem Standardprofil (131072 Kontext,");
  say("  nur Text). Antwortet eines nicht oder bricht es frueh ab, einmal");
  say("  ./bin/curate-models dafuer durchlaufen bzw. das Kontextfenster setzen.");
}
say("  Codex vollstaendig beenden und neu oeffnen, damit die Auswahl greift.");
finish(0);
