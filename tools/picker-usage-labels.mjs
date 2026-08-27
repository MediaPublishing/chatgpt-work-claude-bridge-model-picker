#!/usr/bin/env node
// Schreibt Verbrauchs-Anhaltspunkte in die Modellbeschreibungen des Codex-Pickers.
//
// Patcht merged-models.json (nur die description der GEROUTETEN, gelisteten Modelle):
//   ▰▰▰▱▱ 442 Req/7T · 178M Tok · 14 Fehler | <urspruengliche Beschreibung>
//
// Der Balken ist der Anteil an allen gerouteten Requests der letzten 7 Tage.
// Bei einem Flat-Abo zaehlen Requests gegen die Limits, nicht Tokens — deshalb
// ist das die relevante Groesse. Die Token-Zahl steht trotzdem daneben, weil sie
// zaehlt, sobald ein Endpunkt mit Token-Abrechnung im Spiel ist.
//
// Manuell:  node picker-usage-labels.mjs   (danach Codex komplett neu starten)
//
// WICHTIG: Die Labels stehen in einer generierten Datei. Jeder Katalog-Neubau
// (Kuration, providers enable/disable, Modell-Sync) loescht sie. Das Skript muss
// danach erneut laufen.
//
// Das Skript nimmt die Katalog-Sperre des Routers NICHT. Laeuft es genau
// waehrend einer Kuration oder eines providers enable/disable, kann der Router
// die Datei parallel neu schreiben und die Labels gehen verloren (schlimmsten-
// falls bleibt ein halb geschriebener Katalog stehen, den der naechste
// ./bin/refresh-catalog wieder geradezieht). Deshalb: nicht gleichzeitig mit
// Kuration oder Provider-Wechsel starten, sondern danach.
//
// Pfade per Umgebungsvariable umbiegbar:
//   CODEX_ROUTER_STATE   Router-State-Verzeichnis (Standard ~/.codex/codex-router)
//   USAGE_LABEL_DAYS     Betrachtungsfenster in Tagen (Standard 7)

import { createReadStream, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";

const HOME = process.env.HOME;
if (!HOME) {
  console.error("HOME ist nicht gesetzt.");
  process.exit(1);
}

const STATE = process.env.CODEX_ROUTER_STATE || path.join(HOME, ".codex/codex-router");
const DAYS = Number(process.env.USAGE_LABEL_DAYS || 7);
const since = Date.now() - DAYS * 86400000;

const eventsPath = path.join(STATE, "usage-events.jsonl");
const catalogPath = path.join(STATE, "merged-models.json");

if (!existsSync(catalogPath)) {
  console.error(`Kein Katalog unter ${catalogPath}. Laeuft der Router und ist ein Provider aktiv?`);
  process.exit(1);
}

// Verbrauch je Modell aus dem Ereignisprotokoll aufsummieren.
// Native Anfragen (Provider "openai") bleiben aussen vor — die laufen ueber das Abo.
const byModel = new Map();
if (existsSync(eventsPath)) {
  const rl = createInterface({ input: createReadStream(eventsPath), crlfDelay: Infinity });
  for await (const line of rl) {
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue; // unvollstaendige Zeile: ueberspringen
    }
    if (!e.at || new Date(e.at).getTime() < since || e.provider === "openai") continue;
    const row = byModel.get(e.model) || { req: 0, err: 0, tok: 0 };
    row.req += 1;
    if (e.status !== 200) row.err += 1;
    row.tok += (e.inputTokens || 0) + (e.outputTokens || 0);
    byModel.set(e.model, row);
  }
} else {
  console.log(`Kein Ereignisprotokoll unter ${eventsPath} — alle Modelle werden mit 0 beschriftet.`);
}

const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(0)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : String(n));

const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
// Geroutet = Slug mit Provider-Praefix; nur gelistete Eintraege sind im Picker sichtbar.
// Ein Eintrag ohne slug ist kein Grund zum Absturz — er wird uebersprungen.
const routed = (catalog.models || []).filter(
  (m) => typeof m?.slug === "string" && m.slug.includes("/") && m.visibility === "list",
);
if (!routed.length) {
  console.log("Keine gerouteten, gelisteten Modelle im Katalog. Nichts zu beschriften.");
  process.exit(0);
}
const maxReq = Math.max(1, ...routed.map((m) => byModel.get(m.slug)?.req || 0));

let patched = 0;
for (const m of routed) {
  const u = byModel.get(m.slug);
  // Ein bereits vorhandenes Label zuerst abschneiden, damit sich nichts stapelt.
  const base = (m.description || "").replace(/^▰*▱* [^·]+ · [^·]+ Tok[^|]*\| ?/, "");
  if (!u) {
    m.description = `▱▱▱▱▱ 0 Req/${DAYS}T · 0 Tok | ${base}`.trim();
    patched += 1;
    continue;
  }
  const filled = Math.max(u.req > 0 ? 1 : 0, Math.round((u.req / maxReq) * 5));
  const bar = "▰".repeat(filled) + "▱".repeat(5 - filled);
  const err = u.err ? ` · ${u.err} Fehler` : "";
  m.description = `${bar} ${u.req} Req/${DAYS}T · ${fmt(u.tok)} Tok${err} | ${base}`.trim();
  patched += 1;
}

writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Picker-Labels: ${patched} geroutete Modelle beschriftet (Fenster ${DAYS} Tage). Codex neu starten.`);
