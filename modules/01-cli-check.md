# Modul 01 — CLIs erkennen, installieren, anmelden

**Wann:** immer, als erstes Modul.
**Ziel:** Für jedes Abo, das der Nutzer hat, steht das offizielle CLI bereit, ist angemeldet und hat einen echten Testlauf bestanden.
**Beleg am Ende:** je CLI eine Versionsnummer und eine „pong"-Ausgabe.

Du bist der installierende Agent. Arbeite defensiv: Erst den Ist-Zustand feststellen, dann nur das ändern, was fehlt. Nichts ohne Bestätigung des Nutzers installieren.

## Schritt 1 — Bestandsaufnahme (nur lesen)

```bash
for c in claude codex gemini agy; do
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
| `gemini` | `gemini` (interaktiv starten) | Im Auswahlmenü **„Login with Google"** wählen und den Browser-Flow abschließen — **siehe Warnung unten** |

Frage nach jedem Login den Nutzer, ob er fertig ist, und prüfe dann mit Schritt 4. Rate nie, ob ein Login geklappt hat.

### Gemini: Einzel-Logins sind derzeit blockiert (Stand 2026-08)

Bei einem privaten Google-Konto scheitert der OAuth-Login im Gemini CLI mit genau dieser Meldung:

```
Error authenticating: IneligibleTierError: This client is no longer supported for
Gemini Code Assist for individuals. To continue using Gemini, please migrate to
the Antigravity suite of products: https://antigravity.google
```

Das ist **kein Fehler auf dem Rechner des Nutzers** und nichts, was ein Wiederholen löst. Google hat den Zugang für Einzelnutzer über diesen Weg abgeschaltet. Verifiziert mit Gemini CLI 0.57.0.

Randnotiz: **Workspace-/Business-Konten** kommen teils weiterhin per OAuth ins Gemini CLI. Betroffen sind private Einzelkonten. Wenn der Nutzer ein Firmenkonto hat, lass ihn den normalen Login probieren, bevor du auf die Wege unten ausweichst.

Wenn du die Meldung siehst, biete dem Nutzer diese drei Wege an — **in dieser Reihenfolge** — und lass ihn wählen:

**Weg 1 (Empfehlung): Antigravity, Googles offizieller Nachfolger.** Das ist genau der Weg, auf den die Fehlermeldung selbst verweist, und er funktioniert headless.

Erst prüfen, ob das CLI schon da ist:

```bash
command -v agy && agy --version || echo "agy nicht gefunden"
```

Ist es vorhanden, direkt den Pong-Test:

```bash
cd /tmp && agy --print "Antworte mit genau einem Wort: pong"
```

Kommt `pong` zurück, ist Gemini über Antigravity nutzbar — Modul 02 installiert den `/gemini`-Skill dann ganz normal, er ruft `agy` statt `gemini` auf.

Fehlt `agy`, installiert der **Nutzer** Antigravity von Googles offizieller Seite (`antigravity.google`) und meldet sich **in der App** mit seinem Google-Konto an; das CLI übernimmt diese Anmeldung. Danach neue Shell öffnen und den Test wiederholen. Installiere das nicht ungefragt und lade nichts aus anderen Quellen.

Gültige Modellnamen zeigt `agy models`. Verifiziert (Version 1.1.22): `--print` für den headless Lauf, `--model <slug>` für die Modellwahl, `--effort low|medium|high`. Dokumentiere nichts, was `agy --help` auf dem Rechner des Nutzers nicht belegt — das CLI ist jung und ändert sich.

**Weg 2: API-Key-Modus des Gemini CLIs.** Nur, wenn der Nutzer beim `gemini`-CLI bleiben will.

- Der Nutzer holt sich einen kostenlosen Key auf `aistudio.google.com/apikey`.
- Der Key kommt in eine Datei mit Rechten 0600, die du nur referenzierst — **nie in den Chat, nie in ein Shell-Argument**:

  ```bash
  install -m 700 -d "$HOME/.config/bridge-picker"
  umask 077
  # Diesen Editor öffnet der NUTZER; du siehst den Inhalt nie.
  nano "$HOME/.config/bridge-picker/gemini-api-key.env"     # Inhalt: GEMINI_API_KEY=…
  chmod 600 "$HOME/.config/bridge-picker/gemini-api-key.env"
  ```

- **Die Umgebungsvariable allein genügt nicht.** Nachgemessen: Mit gesetztem `GEMINI_API_KEY` kommt weiterhin dieselbe `IneligibleTierError`, solange das CLI auf den OAuth-Weg eingestellt ist. Die Auswahl steckt in `~/.gemini/settings.json` unter `security.auth.selectedType` (dort steht dann `oauth-personal`; der Wert für den Key-Weg heißt `gemini-api-key`). **Umstellen soll der Nutzer selbst** im interaktiven CLI über das Auth-Menü — du änderst keine Konfigurationsdateien für ihn.
- Ehrlich dazusagen, bevor er sich entscheidet:
  - Das weicht vom Prinzip **„Subscriptions vor APIs"** ab. Es ist der einzige Punkt im ganzen Setup, an dem ein API-Key ins Spiel kommt.
  - Im **Free-Tier** kostet es nichts, hat aber eigene Ratenlimits.
  - **Eingaben im Free-Tier dürfen für Modelltraining genutzt werden.** Also nichts Vertrauliches durch diese Brücke schicken — keine Kundendaten, keine unveröffentlichten Inhalte, keine Zugangsdaten.
  - Hinterlegt er später eine Zahlungsmethode, wird pro Token abgerechnet. Dann gilt: beobachten, nicht vergessen.

**Weg 3: ohne Gemini weitermachen.** Jederzeit in Ordnung. Die Brücke funktioniert mit Claude und Codex vollständig; Gemini ist ein optionales Extra, kein Baustein, auf dem etwas anderes aufbaut. Trage `01-cli-check` für Gemini als `skipped` ein, mit dieser Meldung als Begründung, und mach weiter. Installiere den `/gemini`-Skill in Modul 02 dann **nicht** — eine Brücke zu einem CLI ohne Zugang ist ein garantierter Fehlschlag.

Setz **nie** eigenmächtig Auth-Umgebungsvariablen, um den Fehler zu umgehen. Der Nutzer entscheidet, welchen Weg er will.

## Schritt 4 — Pong-Test je CLI (der Beleg)

Jeder Test ist ein echter Aufruf mit minimaler Antwort. Führe nur die Tests für tatsächlich vorhandene CLIs aus.

```bash
# Claude
claude -p "Antworte mit genau einem Wort: pong"

# Codex (App-Binary bevorzugt, Arbeitsverzeichnis bewusst neutral)
cd /tmp && "$CODEX_BIN" exec --skip-git-repo-check "Antworte mit genau einem Wort: pong"

# Gemini über Antigravity (der Weg, der bei privaten Konten funktioniert)
cd /tmp && agy --print "Antworte mit genau einem Wort: pong"

# Gemini über das gemini-CLI (stdin schließen, sonst wartet das CLI)
gemini -p "Antworte mit genau einem Wort: pong" < /dev/null
```

Für Gemini genügt **einer** der beiden Tests. Welcher zählt, hängt davon ab, welchen Weg der Nutzer gewählt hat — notiere im Beleg mit, welcher es war.

Erwartet: die Ausgabe enthält `pong`. Zeige dem Nutzer die **echte Ausgabe**, nicht deine Zusammenfassung davon.

Eine leere Antwort ist ein Fehler, kein Erfolg.

## Fehlerbilder

| Ausgabe | Bedeutung | Was tun |
|---|---|---|
| `command not found` | CLI nicht installiert oder nicht im PATH | Schritt 2, danach neue Shell öffnen |
| `Please set an Auth method` (gemini) | Kein OAuth-Login | Nutzer startet `gemini` einmal interaktiv, „Login with Google" |
| `IneligibleTierError: This client is no longer supported for Gemini Code Assist for individuals` | Google hat den Einzelnutzer-Zugang über diesen Weg abgeschaltet. Kein lokaler Fehler | Nicht wiederholen. Die drei Wege oben anbieten; Empfehlung: ohne Gemini weitermachen |
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
