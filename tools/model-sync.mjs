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
//   - Entfernt NUR Eintraege, die dieses Skript selbst angelegt hat (siehe
//     Sidecar unten). Handkuratiertes bleibt immer stehen.
//   - Ueberspringt Modelle, deren Name mit einem nativen GPT-Modell kollidiert:
//     die hast du ueber dein ChatGPT-Abo schon, geroutet wuerden sie kosten.
//
// Fail-closed an zwei Stellen:
//   1. Katalog. Ungueltiges JSON, keine Liste, keine brauchbaren IDs oder eine
//      Liste, von der nichts uebrig bleibt -> Abbruch ohne jede Aenderung. Ein
//      leerer Katalog ist fast immer eine Stoerung, kein Auftrag, die halbe
//      Auswahl zu loeschen.
//   2. Protokoll. Welche Wire-Variante (Chat, Messages, Responses) ein neues
//      Modell spricht, steht NICHT in der Modelliste des Anbieters. Geraten
//      wird hier nichts: die Zuordnung kommt aus der Kurationstabelle des
//      Routers (src/opencode-curation.mjs). Ist sie unbekannt, wird das Modell
//      mit dem Grund `blocked_unverified_protocol` uebersprungen. Fehlt die
//      Kurationsdatei, bricht der Lauf ab -- kein stiller Chat-Fallback.
//
// Grenze, ehrlich benannt: neu aufgenommene Modelle bekommen das Standardprofil
// des Providers (Kontextfenster 131072, nur Text). Braucht ein Modell ein
// groesseres Fenster, muss das einmal von Hand nachgezogen werden -- siehe
// modules/05-picker-pflege.md. Der Lauf meldet, wenn er etwas aufgenommen hat.
//
// Aufruf:
//   node model-sync.mjs --dry-run     zeigt nur, was passieren wuerde (0 Writes)
//   node model-sync.mjs               fuehrt aus
//
// Pfade per Umgebungsvariable umbiegbar:
//   CODEX_ROUTER_DIR      Checkout des codex-router
//   CODEX_ROUTER_STATE    Router-State (Standard ~/.codex/codex-router)
//   OPENCODE_API_KEY      Key direkt (sonst wird er aus den Dateien gelesen)

import { execFileSync } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PROVIDER_ID = "opencode-go";
const FETCH_TIMEOUT_MS = 15000;
const ALLOWED_HOST = "opencode.ai";

// Der Key geht als Bearer mit. Eine manipulierte Umgebungsvariable duerfte ihn
// deshalb niemals an einen fremden Host schicken: nur HTTPS, nur opencode.ai.
export function assertAllowedBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Basis-URL ist keine gueltige URL: ${value}`);
  }
  if (url.protocol !== "https:") throw new Error(`Basis-URL muss HTTPS sein: ${value}`);
  if (url.hostname !== ALLOWED_HOST) {
    throw new Error(`Basis-URL muss auf ${ALLOWED_HOST} zeigen, nicht ${url.hostname}`);
  }
  return url.toString().replace(/\/$/, "");
}

// Vorschau- und Auslaufkennzeichnungen nehmen wir grundsaetzlich nicht auf.
export const SKIP_SUFFIX = /-(preview|beta|alpha|legacy|deprecated|latest|experimental)$/;

// Zusaetze, die eine Ausbaustufe beschreiben, nicht eine Generation. Sie werden
// fuer den Familienvergleich abgeschnitten, damit mimo-v2-pro und mimo-v2.5-pro
// als dieselbe Produktlinie erkannt werden.
export const QUALIFIER = /-(pro|omni|code|max|plus|flash|mini|nano|air|lite|thinking)$/;

// Modelle, die der Anbieter kaputt ausliefert (Formatwechsel, nonkonformer
// Stream). Ohne diese Liste nimmt der naechste Lauf sie brav wieder auf, weil
// sie im Anbieter-Katalog stehen -- und der Picker hat wieder einen toten
// Eintrag. Wer ein Modell dauerhaft nicht will, traegt es hier ein.
export const DENYLIST = new Set(["kimi-k3"]);

// --- Reine Logik. Kein Netz, kein Dateisystem, keine Uhr. --------------------

// Produktlinie = Name ohne Versionsnummern und ohne Ausbaustufe.
export function family(id) {
  return id.replace(QUALIFIER, "").replace(/\d+(\.\d+)*/g, "#");
}

export function versionOf(id) {
  const match = id.match(/\d+(\.\d+)*/);
  return match ? match[0].split(".").map(Number) : [0];
}

export function compareVersions(a, b) {
  const x = versionOf(a);
  const y = versionOf(b);
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

// Fail-closed: aus der rohen Anbieter-Antwort eine belastbare ID-Liste machen.
// Alles, was nicht eindeutig eine nichtleere String-ID ist, fliegt raus.
// Duplikate werden normalisiert (getrimmt, Reihenfolge stabil).
export function normalizeCatalog(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, error: "Antwort ist kein Objekt" };
  }
  const list = payload.data;
  if (!Array.isArray(list)) return { ok: false, error: "Feld 'data' ist keine Liste" };
  const ids = [];
  const seen = new Set();
  let dropped = 0;
  for (const entry of list) {
    const raw = typeof entry === "string" ? entry : entry && typeof entry === "object" ? entry.id : undefined;
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!id) {
      dropped += 1;
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  if (ids.length === 0) return { ok: false, error: "keine brauchbare Modell-ID in der Antwort", dropped };
  return { ok: true, ids, dropped };
}

// Pro Produktlinie nur die aktuelle Generation behalten. Mehrere Ausbaustufen
// derselben Generation (mimo-v2.5 und mimo-v2.5-pro) bleiben nebeneinander,
// aeltere Generationen fallen weg.
export function selectCurrentGeneration(ids) {
  const byFamily = new Map();
  for (const id of ids) {
    if (SKIP_SUFFIX.test(id)) continue;
    const group = byFamily.get(family(id)) || [];
    group.push(id);
    byFamily.set(family(id), group);
  }
  const wanted = new Set();
  const supersededBy = new Map();
  for (const group of byFamily.values()) {
    const top = [...group].sort((a, b) => compareVersions(b, a))[0];
    for (const id of group) {
      if (compareVersions(id, top) === 0) wanted.add(id);
      else supersededBy.set(id, top);
    }
  }
  return { wanted, supersededBy };
}

// Der Plan. `blockReasonFor(id, existingProvider)` liefert undefined, wenn das
// Protokoll geklaert ist, sonst den Grund; `providerIdFor(id, existingProvider)`
// die aufzunehmende Provider-ID. `managed` ist die Slug-Menge aus dem Sidecar.
export function planSync({
  upstreamIds,
  existingModels = [],
  managed = new Set(),
  routedIds = new Set(),
  nativeSlugs = new Set(),
  denylist = DENYLIST,
  providerIds = [PROVIDER_ID],
  blockReasonFor = () => undefined,
  providerIdFor = () => PROVIDER_ID,
}) {
  const { wanted, supersededBy } = selectCurrentGeneration(upstreamIds);
  const upstreamSet = new Set(upstreamIds);
  const family = new Set(providerIds);
  const existingByUpstream = new Map(
    existingModels.filter((m) => family.has(m.provider)).map((m) => [m.upstreamModel || m.slug.split("/").pop(), m]),
  );

  const toAdd = [];
  const skipped = [];
  for (const id of wanted) {
    if (denylist.has(id)) {
      skipped.push({ id, reason: "denylisted" });
      continue;
    }
    if (routedIds.has(id)) continue;
    if (nativeSlugs.has(id)) {
      skipped.push({ id, reason: "native_collision" });
      continue;
    }
    if (existingByUpstream.has(id)) continue;
    const reason = blockReasonFor(id, undefined);
    if (reason) {
      skipped.push({ id, reason: "blocked_unverified_protocol", detail: reason });
      continue;
    }
    let providerId;
    try {
      providerId = providerIdFor(id, undefined);
    } catch (error) {
      skipped.push({ id, reason: "blocked_unverified_protocol", detail: String(error.message) });
      continue;
    }
    toAdd.push({ id, providerId });
  }

  // Entfernen nur, was dieses Skript selbst angelegt hat. Alles andere wird
  // gemeldet, nie angefasst -- ein handkuratierter Eintrag gehoert dem Nutzer.
  const toRemove = [];
  const conflicts = [];
  for (const model of existingModels) {
    if (!family.has(model.provider)) continue;
    const id = model.upstreamModel || model.slug.split("/").pop();
    const gone = !upstreamSet.has(id);
    const superseded = supersededBy.has(id);
    const denied = denylist.has(id);
    if (!gone && !superseded && !denied) continue;
    const why = denied ? "denylisted" : gone ? "gone_upstream" : "superseded";
    if (managed.has(model.slug)) toRemove.push({ slug: model.slug, reason: why });
    else conflicts.push({ slug: model.slug, reason: why });
  }

  return { toAdd, toRemove, skipped, conflicts, wanted, supersededBy };
}

// Sidecar-Fortschreibung: was nach diesem Lauf als verwaltet gilt.
export function nextManaged({ managed = new Set(), added = [], removed = [] }) {
  const next = new Set(managed);
  for (const slug of removed) next.delete(slug);
  for (const slug of added) next.add(slug);
  return [...next].sort();
}

// --- Ab hier Seiteneffekte. Nur im Skriptmodus. ------------------------------

async function main() {
  const HOME = process.env.HOME;
  if (!HOME) {
    console.error("HOME ist nicht gesetzt.");
    process.exit(1);
  }

  const ROOT = process.env.CODEX_ROUTER_DIR || path.join(HOME, ".local/share/codex-router");
  const STATE = process.env.CODEX_ROUTER_STATE || path.join(HOME, ".codex/codex-router");
  const CONFIG_DIR = path.join(HOME, ".config/bridge-picker");
  const LOG = path.join(CONFIG_DIR, "model-sync.log");
  const SIDECAR = path.join(CONFIG_DIR, "model-sync-state.json");
  let BASE_URL;
  try {
    BASE_URL = assertAllowedBaseUrl(process.env.OPENCODE_GO_BASE_URL || "https://opencode.ai/zen/go/v1");
  } catch (error) {
    console.error(`Abbruch: ${error.message}`);
    process.exit(1);
  }

  const dryRun = process.argv.includes("--dry-run");
  const out = [];
  const say = (line) => {
    out.push(line);
    console.log(line);
  };

  // Im Trockenlauf wird NICHTS geschrieben -- auch kein Log.
  function finish(code) {
    if (!dryRun) {
      try {
        mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
        appendFileSync(LOG, `${out.join("\n")}\n\n`);
      } catch {
        /* Log nicht schreibbar: der Lauf selbst war trotzdem gueltig */
      }
    }
    process.exit(code);
  }

  function readKey() {
    if (process.env.OPENCODE_API_KEY) return process.env.OPENCODE_API_KEY.trim();
    try {
      const value = readFileSync(path.join(STATE, "opencode-go-api-key.secret"), "utf8").trim();
      if (value) return value;
    } catch {
      /* naechste Quelle */
    }
    try {
      return (
        readFileSync(path.join(CONFIG_DIR, "opencode-keys/_aktiv.env"), "utf8")
          .match(/^OPENCODE_API_KEY=(.+)$/m)?.[1]
          ?.trim() || ""
      );
    } catch {
      return "";
    }
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
  const key = readKey();
  if (!key) {
    say(`Abbruch: kein OpenCode-Key gefunden (${path.join(STATE, "opencode-go-api-key.secret")}).`);
    finish(1);
  }

  // Protokollzuordnung aus dem Router laden. Fehlt sie, wird nicht geraten.
  let curation;
  try {
    curation = await import(path.join(ROOT, "src/opencode-curation.mjs"));
  } catch (error) {
    say(`Abbruch: Kurationstabelle nicht ladbar (${String(error.message).split("\n")[0]}).`);
    say("  Ohne sie waere die Protokollzuordnung geraten. Kein Fallback.");
    finish(1);
  }
  for (const name of ["curatedModelBlockReason", "curatedModelProviderId", "curationProviderIds"]) {
    if (typeof curation[name] !== "function") {
      say(`Abbruch: ${name} fehlt in src/opencode-curation.mjs. Router-Version pruefen.`);
      finish(1);
    }
  }

  // --- Anbieter-Katalog holen. Timeout, dann strikte Validierung. ---
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
  } catch (error) {
    const why = error.name === "AbortError" ? `Zeitueberschreitung nach ${FETCH_TIMEOUT_MS} ms` : error.message;
    say(`Abbruch: Anbieter nicht erreichbar (${String(why).split("\n")[0]}). Nichts geaendert.`);
    finish(1);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    say(`Abbruch: Modelliste nicht abrufbar (HTTP ${response.status}). Nichts geaendert.`);
    finish(response.status === 401 || response.status === 403 ? 0 : 1);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    say(`Abbruch: Antwort ist kein gueltiges JSON (${String(error.message).split("\n")[0]}). Nichts geaendert.`);
    finish(1);
  }
  const parsed = normalizeCatalog(payload);
  if (!parsed.ok) {
    say(`Abbruch: Modelliste unbrauchbar (${parsed.error}). Nichts geaendert.`);
    finish(1);
  }
  const upstream = parsed.ids;

  const catalog = JSON.parse(readFileSync(catalogPath, "utf8")).models || [];
  const listed = catalog.filter((m) => m.visibility === "list" && typeof m.slug === "string");
  const routedIds = new Set(listed.filter((m) => m.slug.includes("/")).map((m) => m.slug.split("/").pop()));
  const nativeSlugs = new Set(listed.filter((m) => !m.slug.includes("/")).map((m) => m.slug));

  const { readUserModels, writeUserModels, userModelEntry } = await import(
    path.join(ROOT, "src/user-models.mjs")
  );
  const existing = readUserModels();

  let sidecar = { version: 1, managed: [] };
  if (existsSync(SIDECAR)) {
    try {
      const raw = JSON.parse(readFileSync(SIDECAR, "utf8"));
      if (Array.isArray(raw?.managed)) sidecar = { version: 1, managed: raw.managed.filter((s) => typeof s === "string") };
    } catch {
      say("  Hinweis: Sidecar unlesbar, wird als leer behandelt (nichts wird entfernt).");
    }
  }
  const managed = new Set(sidecar.managed);

  const plan = planSync({
    upstreamIds: upstream,
    existingModels: existing,
    managed,
    routedIds,
    nativeSlugs,
    providerIds: curation.curationProviderIds(PROVIDER_ID),
    blockReasonFor: (id, existingProvider) =>
      curation.curatedModelBlockReason(PROVIDER_ID, id, { existingProvider }),
    providerIdFor: (id, existingProvider) =>
      curation.curatedModelProviderId(PROVIDER_ID, id, { existingProvider }),
  });

  say(`[${new Date().toISOString().replace("T", " ").slice(0, 19)}] ${PROVIDER_ID}`);
  say(`  angeboten: ${upstream.length}   davon aktuell genug: ${plan.wanted.size}`);
  say(`  bereits in der Auswahl: ${routedIds.size}   selbst verwaltet: ${managed.size}`);
  for (const reason of ["denylisted", "native_collision", "blocked_unverified_protocol"]) {
    const hits = plan.skipped.filter((s) => s.reason === reason);
    if (hits.length) say(`  uebersprungen (${reason}): ${hits.map((h) => h.id).join(", ")}`);
  }
  for (const c of plan.conflicts) {
    say(`  KONFLIKT (${c.reason}, nicht selbst angelegt, bleibt stehen): ${c.slug}`);
  }
  say(`  aufnehmen: ${plan.toAdd.length ? plan.toAdd.map((a) => `${a.providerId}/${a.id}`).join(", ") : "nichts"}`);
  say(`  entfernen: ${plan.toRemove.length ? plan.toRemove.map((r) => r.slug).join(", ") : "nichts"}`);

  if (dryRun) {
    say("  (Probelauf, nichts geschrieben)");
    finish(0);
  }
  if (plan.toAdd.length === 0 && plan.toRemove.length === 0) {
    say("  keine Aenderung, Katalog bleibt wie er ist");
    finish(0);
  }

  // --- Backup vor dem ersten Write. ---
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(CONFIG_DIR, "backups", stamp);
  const { USER_MODELS_PATH } = await import(path.join(ROOT, "src/user-models.mjs"));
  mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const userModelsBackup = path.join(backupDir, "user-models.json");
  if (existsSync(USER_MODELS_PATH)) copyFileSync(USER_MODELS_PATH, userModelsBackup);
  const sidecarBackup = path.join(backupDir, "model-sync-state.json");
  if (existsSync(SIDECAR)) copyFileSync(SIDECAR, sidecarBackup);
  say(`  Backup: ${backupDir}`);

  let priority = Math.max(900, ...existing.map((m) => m.priority || 0)) + 1;
  const removedSlugs = new Set(plan.toRemove.map((r) => r.slug));
  const next = existing.filter((m) => !removedSlugs.has(m.slug));
  const addedSlugs = [];
  for (const { id, providerId } of plan.toAdd) {
    const entry = userModelEntry({ providerId, upstreamId: id, priority: priority++ });
    next.push(entry);
    addedSlugs.push(entry.slug);
  }
  writeUserModels(next);
  say(`  user-models.json geschrieben: ${next.length} Eintraege`);

  // --- Katalog neu bauen, Labels, Dienst. Scheitert etwas: zurueckrollen. ---
  function rollback(what, error) {
    say(`  FEHLER bei ${what}: ${String(error.message).split("\n")[0]}`);
    try {
      if (existsSync(userModelsBackup)) copyFileSync(userModelsBackup, USER_MODELS_PATH);
      say("  Backup zurueckgespielt.");
      for (const step of ["src/catalog.mjs", "src/litellm-config.mjs"]) {
        execFileSync(process.execPath, [step], { cwd: ROOT, stdio: "ignore" });
      }
      say("  Katalog aus dem Backup neu gebaut.");
    } catch (restoreError) {
      say(`  ACHTUNG: Ruecksicherung fehlgeschlagen (${String(restoreError.message).split("\n")[0]}).`);
      say(`  Von Hand: cp "${userModelsBackup}" "${USER_MODELS_PATH}" && cd "${ROOT}" && node src/catalog.mjs`);
    }
    say("  Sidecar NICHT fortgeschrieben. Der naechste Lauf versucht es erneut.");
    finish(1);
  }

  for (const step of ["src/catalog.mjs", "src/litellm-config.mjs"]) {
    try {
      execFileSync(process.execPath, [step], { cwd: ROOT, stdio: "ignore" });
    } catch (error) {
      rollback(step, error);
    }
  }

  const labels = [
    path.join(path.dirname(fileURLToPath(import.meta.url)), "picker-usage-labels.mjs"),
    path.join(HOME, ".local/bin/picker-usage-labels.mjs"),
  ].find((candidate) => existsSync(candidate));
  if (labels) {
    // Labels sind Kosmetik. Ein Fehler hier rollt nichts zurueck.
    try {
      execFileSync(process.execPath, [labels], { stdio: "ignore" });
      say("  Verbrauchslabels neu geschrieben");
    } catch (error) {
      say(`  Verbrauchslabels fehlgeschlagen (${String(error.message).split("\n")[0]}), Rest bleibt gueltig`);
    }
  } else {
    say("  picker-usage-labels.mjs nicht gefunden, Labels uebersprungen");
  }

  try {
    execFileSync(process.execPath, ["src/service.mjs", "restart"], { cwd: ROOT, stdio: "ignore" });
  } catch (error) {
    rollback("Dienst-Neustart", error);
  }
  say("  Katalog neu gebaut, Dienst neu gestartet");

  // Sidecar erst jetzt fortschreiben: nach einem vollstaendig geglueckten Lauf.
  writeFileSync(
    SIDECAR,
    `${JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), managed: nextManaged({ managed, added: addedSlugs, removed: [...removedSlugs] }) }, null, 2)}\n`,
    { mode: 0o600 },
  );
  say("  Sidecar fortgeschrieben");

  if (plan.toAdd.length) {
    say("  Hinweis: neue Modelle laufen mit dem Standardprofil (131072 Kontext,");
    say("  nur Text). Bricht ein Lauf frueh ab, Kontextfenster von Hand setzen.");
  }
  say("  Codex vollstaendig beenden und neu oeffnen, damit die Auswahl greift.");
  finish(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
