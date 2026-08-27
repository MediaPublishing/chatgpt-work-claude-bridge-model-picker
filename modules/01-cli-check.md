# Modul 01 — CLIs erkennen, installieren, anmelden

**Wann:** immer, als erstes Modul.
**Ziel:** Für jedes Abo, das der Nutzer hat, steht das offizielle CLI bereit, ist angemeldet und hat einen echten Testlauf bestanden.
**Beleg am Ende:** je CLI eine Versionsnummer und eine „pong"-Ausgabe.

Du bist der installierende Agent. Arbeite defensiv: Erst den Ist-Zustand feststellen, dann nur das ändern, was fehlt. Nichts ohne Bestätigung des Nutzers installieren.

## Schritt 1 — Bestandsaufnahme (nur lesen)

```bash
for c in claude codex gemini; do
  printf '%s: ' "$c"
  command -v "$c" >/dev/null 2>&1 && command -v "$c" || echo "nicht gefunden"
done
```

Danach die Versionen der gefundenen CLIs:

```bash
command -v claude >/dev/null 2>&1 && claude --version
command -v codex  >/dev/null 2>&1 && codex --version
command -v gemini >/dev/null 2>&1 && gemini --version
```

Zusätzlich prüfen, ob eine Desktop-App ein eigenes, neueres Codex-Binary mitbringt (macOS):

```bash
CODEX_APP="/Applications/ChatGPT.app/Contents/Resources/codex"
[ -x "$CODEX_APP" ] && "$CODEX_APP" --version || echo "kein App-Binary unter $CODEX_APP"
```

**Merksatz (wichtig):** Wenn beide existieren, ist für alle Codex-Aufrufe in diesem Repo **das App-Binary die erste Wahl**. Die PATH-Version (Homebrew, npm) hinkt oft eine Version hinterher und scheitert dann an neueren Katalogfeldern mit `failed to parse model_catalog_json`. Die Desktop-App ist davon nicht betroffen.

Lege dir die gefundenen Pfade als Variablen an und nutze sie in allen folgenden Modulen:

```bash
CODEX_BIN="$( [ -x /Applications/ChatGPT.app/Contents/Resources/codex ] \
  && echo /Applications/ChatGPT.app/Contents/Resources/codex \
  || command -v codex )"
echo "CODEX_BIN=$CODEX_BIN"
```

Schreibe das Ergebnis der Bestandsaufnahme in `install-state.json` unter `steps.01-cli-check.found`.

## Schritt 2 — Fehlende CLIs benennen (nicht installieren)

Zeige dem Nutzer nur die offiziellen Wege für das, was ihm laut Interview fehlt, und **warte auf sein ausdrückliches OK**, bevor du irgendetwas installierst.

| CLI | Offizieller Weg (macOS/Linux) | Hinweis |
|---|---|---|
| `claude` (Claude Code) | `npm install -g @anthropic-ai/claude-code` — oder der auf `claude.com/product/claude-code` genannte Installer | Braucht ein Claude-Abo mit Claude Code |
| `codex` (OpenAI Codex) | `npm install -g @openai/codex` oder `brew install codex` | Wer die ChatGPT-Desktop-App hat, braucht das CLI oft gar nicht — das App-Binary reicht |
| `gemini` (Gemini CLI) | `npm install -g @google/gemini-cli` oder `brew install gemini-cli` | Braucht ein Google-Konto; Abo-Kontingent je nach Plan |

Regeln:

- Keine `curl … | sh`-Einzeiler von unbekannten Hosts. Nur die offiziellen Pakete oben.
- Ist Node.js nicht vorhanden, sag es dem Nutzer und nenne `brew install node` bzw. den Installer von `nodejs.org`. Installiere Node nicht ungefragt.
- **Node-Version prüfen, wenn der Picker geplant ist (Interview B oder C).** Der Router verlangt **Node 22.19 oder neuer**; mit einer älteren Version scheitert schon seine Installation. Für die Brücke allein (A) spielt das keine Rolle.

  ```bash
  command -v node >/dev/null 2>&1 && node --version || echo "Node nicht gefunden"
  ```

  Zeigt das etwas unter `v22.19.0`, sag es dem Nutzer **jetzt** — nicht erst, wenn Modul 03 abbricht.
- Ein CLI, das der Nutzer nicht braucht (kein passendes Abo), wird **nicht** installiert. Ein Abo-loses CLI ist nutzlos.

## Schritt 3 — Logins (macht der Nutzer selbst)

Du fragst **nie** nach Passwörtern, Codes oder Tokens. Du nennst nur den Befehl und wartest.

| CLI | Login | Was der Nutzer tut |
|---|---|---|
| `claude` | `claude` (interaktiv starten) | Dem Anmelde-Link folgen, mit dem Claude-Konto anmelden |
| `codex` | ChatGPT-Desktop-App öffnen und dort anmelden — oder `codex login` im Terminal | Die App-Anmeldung gilt auch für das App-Binary |
| `gemini` | `gemini` (interaktiv starten) | Im Auswahlmenü **„Login with Google"** wählen und den Browser-Flow abschließen |

Beim Gemini CLI ausdrücklich **nicht** irgendwelche Auth-Umgebungsvariablen setzen — der OAuth-Weg über „Login with Google" nutzt das Abo, ein API-Key würde stattdessen abrechnen.

Frage nach jedem Login den Nutzer, ob er fertig ist, und prüfe dann mit Schritt 4. Rate nie, ob ein Login geklappt hat.

## Schritt 4 — Pong-Test je CLI (der Beleg)

Jeder Test ist ein echter Aufruf mit minimaler Antwort. Führe nur die Tests für tatsächlich vorhandene CLIs aus.

```bash
# Claude
claude -p "Antworte mit genau einem Wort: pong"

# Codex (App-Binary bevorzugt, Arbeitsverzeichnis bewusst neutral)
cd /tmp && "$CODEX_BIN" exec --skip-git-repo-check "Antworte mit genau einem Wort: pong"

# Gemini (stdin schließen, sonst wartet das CLI)
gemini -p "Antworte mit genau einem Wort: pong" < /dev/null
```

Erwartet: die Ausgabe enthält `pong`. Zeige dem Nutzer die **echte Ausgabe**, nicht deine Zusammenfassung davon.

Eine leere Antwort ist ein Fehler, kein Erfolg.

## Fehlerbilder

| Ausgabe | Bedeutung | Was tun |
|---|---|---|
| `command not found` | CLI nicht installiert oder nicht im PATH | Schritt 2, danach neue Shell öffnen |
| `Please set an Auth method` (gemini) | Kein OAuth-Login | Nutzer startet `gemini` einmal interaktiv, „Login with Google" |
| Anmelde-/Auth-Fehler bei `claude` | Kein Login oder abgelaufen | Nutzer startet `claude` interaktiv |
| `failed to parse model_catalog_json` (codex) | Zu alte PATH-Version gegen neuen Katalog | App-Binary nutzen (`$CODEX_BIN`) oder CLI aktualisieren |
| `429`, `quota`, `usage limit` | Kontingent erschöpft | Melden, **nicht** wiederholen. Details in `LEARNINGS.md` |
| Antwort ist leer | Fehler | Melden, nicht als Erfolg verbuchen |

## Rückweg

Dieses Modul ändert nichts an bestehenden Dateien; es installiert höchstens CLIs, die der Nutzer freigegeben hat.

```bash
npm uninstall -g @anthropic-ai/claude-code
npm uninstall -g @openai/codex
npm uninstall -g @google/gemini-cli
# bei Homebrew stattdessen: brew uninstall codex / brew uninstall gemini-cli
```

Abmelden geht im jeweiligen CLI (`claude` bzw. `gemini` interaktiv starten, Logout wählen; `codex logout`). Die Konfigurationsordner `~/.claude`, `~/.codex`, `~/.gemini` bleiben dabei bestehen — löschen nur, wenn der Nutzer das ausdrücklich will.

## Abschluss

`install-state.json` → `steps.01-cli-check`:

```json
{ "status": "done",
  "receipt": "claude 1.x pong | codex (App-Binary) pong | gemini pong",
  "at": "ISO-Datum" }
```

Nur `done`, wenn für jedes vorhandene CLI eine echte `pong`-Ausgabe vorliegt. Fehlt eines, weil das Abo fehlt: `skipped` mit Begründung.
