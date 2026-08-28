# Modul 05 — Picker pflegen: kuratieren, beschriften, Keys rotieren

**Wann:** bei Interview-Antwort B oder C, nach Modul 04.
**Ziel:** Der Picker zeigt eine überschaubare, aktuelle Auswahl; er bleibt von selbst aktuell; du siehst pro Modell, wie viel du verbrauchst; und bei erschöpftem Kontingent schaltet ein Watchdog auf einen freien Key um.
**Beleg am Ende:** Picker-Readback nach dem Aufräumen, sichtbare Verbrauchslabels, `status`-Ausgabe der Key-Slots.

Alles hier ist **optional und einzeln nutzbar**. Wer nur einen Key hat, überspringt Teil D. Teil C (Modell-Sync) ist der Teil, den du am ehesten *nicht* auslassen solltest — ohne ihn veraltet die Auswahl still vor sich hin.

**Variablen zuerst setzen.** Dieses Modul benutzt `$REPO` und `$ROUTER_DIR`. Steigst du hier ein, setz sie neu — ein leeres `$REPO` macht aus `cp "$REPO/tools/…"` einen Zugriff auf `/tools/…`:

```bash
REPO="<Pfad zu diesem Repo>"        # dort, wo INSTALL.md liegt
ROUTER_DIR="${CODEX_ROUTER_DIR:-$HOME/.local/share/codex-router}"
[ -f "$REPO/INSTALL.md" ] || echo "REPO zeigt nicht auf dieses Repo!"
```

## Teil A — Modelle im Picker ein- und ausblenden

Ab Router v0.5.0 ist die Sichtbarkeit ein **Opt-in**: `$HOME/.codex/codex-router/model-picker.json` führt eine `visible`-Allowlist und zusätzlich eine `hidden`-Liste. Veröffentlicht wird nur, was du ausdrücklich zeigst oder bei der Kuration auswählst.

Ist-Zustand:

```bash
ROUTER_DIR="${CODEX_ROUTER_DIR:-$HOME/.local/share/codex-router}"
cd "$ROUTER_DIR"
node src/control.mjs picker status
cat "$HOME/.codex/codex-router/model-picker.json"
```

Einzelne Modelle schalten:

```bash
node src/control.mjs picker set <provider>/<modell> hide
node src/control.mjs picker set <provider>/<modell> show
```

Ganze Provider oder alles auf einmal:

```bash
node src/control.mjs picker provider <provider-id> hide
node src/control.mjs picker all hide       # danach gezielt einzelne 'show'
```

Der Befehl publiziert selbst — du musst den Katalog danach nicht extra neu bauen. Aber: **Codex komplett beenden und neu öffnen**, sonst siehst du den alten Stand.

### Grenze, die man kennen muss

**Native Modelle lassen sich router-seitig nicht verstecken.** v0.5.0 schützt die nativen Slugs bewusst vor dem Router-Overlay: Der Router darf den vom Client gepflegten GPT-Katalog nicht überschreiben. Wer ein natives Modell nicht sehen will, muss das (falls überhaupt möglich) in der App selbst regeln. Versuch es nicht über den Router zu erzwingen — es geht nicht, und Umwege beschädigen den Katalog.

### Sinnvolle Zielgröße

Zwanzig bis dreißig sichtbare Einträge sind bedienbar. Sechzig sind es nicht. Halte:

- die nativen GPT-Modelle, die du wirklich nutzt,
- pro Fremdanbieter-Produktlinie **ein** aktuelles Modell,
- die kostenlosen Modelle, falls du sie eingerichtet hast,
- ein bis zwei Modelle mit sehr großem Kontextfenster für lange Threads.

Alles andere: `hide`. Rückgängig ist es jederzeit.

Nach dem Aufräumen Readback:

```bash
node src/control.mjs picker status | tail -40
```

## Teil B — Verbrauchslabels im Picker

Der Picker zeigt Modellnamen, aber nicht, was sie dich kosten. `tools/picker-usage-labels.mjs` schreibt eine kompakte Verbrauchsanzeige in die Beschreibung jedes gerouteten Modells:

```
▰▰▰▱▱ lokal 442 Anfr./7T · 178M Tok · 14 Fehler | <ursprüngliche Beschreibung>
```

**Was das ist und was nicht.** Die Zahlen stammen aus dem Ereignisprotokoll des Routers auf **diesem** Rechner: welche Modelle du zuletzt benutzt hast. Der Balken ist der Anteil eines Modells an allen hier gerouteten Anfragen der letzten 7 Tage.

Es ist **kein Restkontingent**. Anfragen von anderen Geräten oder aus anderen Werkzeugen desselben Kontos tauchen nicht auf, und wie der Anbieter sein Limit intern zählt, ist nicht veröffentlicht. Verbindlich ist allein die Anzeige im Anbieter-Konto. Das Label beantwortet „was nutze ich eigentlich?", nicht „wie viel habe ich noch?".

Die Token-Zahl steht daneben, weil sie zählt, sobald ein Endpunkt mit Token-Abrechnung im Spiel ist.

Installieren und einmal laufen lassen:

```bash
install -m 755 -d "$HOME/.local/bin"
cp "$REPO/tools/picker-usage-labels.mjs" "$HOME/.local/bin/picker-usage-labels.mjs"
node "$HOME/.local/bin/picker-usage-labels.mjs"
```

Danach Codex neu starten und im Picker nachsehen — das ist der Beleg.

**Wichtig:** Die Labels stehen in der generierten Katalogdatei. **Jeder Katalog-Neubau löscht sie.** Das Skript muss also nach jeder Kuration, jedem `providers enable/disable` und jedem Modell-Sync erneut laufen.

**Und: immer danach, nie gleichzeitig.** Das Skript nimmt die Katalog-Sperre des Routers nicht. Läuft es genau während einer Kuration oder eines Provider-Wechsels, schreiben beide auf dieselbe Datei — die Labels sind dann weg. Repariert wird das mit `./bin/refresh-catalog` und einem erneuten Lauf.

### Optional: täglich automatisch (macOS)

Lege dir `$HOME/Library/LaunchAgents/local.picker-usage-labels.plist` an. **Der Nutzer lädt den Agent selbst** — du schreibst nur die Datei und nennst den Befehl.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>local.picker-usage-labels</string>
  <key>ProgramArguments</key>
  <array>
    <string>REPLACE_NODE</string>
    <string>REPLACE_HOME/.local/bin/picker-usage-labels.mjs</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>7</integer><key>Minute</key><integer>10</integer></dict>
  <key>StandardOutPath</key><string>REPLACE_HOME/.local/state/picker-usage-labels.log</string>
  <key>StandardErrorPath</key><string>REPLACE_HOME/.local/state/picker-usage-labels.log</string>
</dict>
</plist>
```

### Die zwei Platzhalter in jeder Plist-Vorlage

Beide gelten für **alle** LaunchAgent-Vorlagen in diesem Modul:

- **`REPLACE_HOME`** → der echte Wert von `$HOME`. Plists verstehen keine Variablen.
- **`REPLACE_NODE`** → der **absolute** Pfad zu Node. `launchd` startet mit einem minimalen PATH und kennt weder Homebrew noch nvm noch `~/.local/bin` — ein `/usr/bin/env node` findet dort schlicht kein Node, und der Agent scheitert täglich still.

Beides ermitteln:

```bash
echo "REPLACE_HOME = $HOME"
echo "REPLACE_NODE = $(command -v node)"
```

Zeigt `command -v node` nichts, ist Node nicht im PATH — dann zuerst Modul 01. Nach dem Einsetzen einmal gegenprüfen, dass der Pfad wirklich existiert:

```bash
"$(command -v node)" --version
```

Dann:

```bash
mkdir -p "$HOME/.local/state"
launchctl bootstrap gui/$(id -u) "$HOME/Library/LaunchAgents/local.picker-usage-labels.plist"
launchctl list | grep picker-usage-labels
```

Entladen: `launchctl bootout gui/$(id -u)/local.picker-usage-labels`

Auf Linux stattdessen ein `cron`-Eintrag oder ein systemd-User-Timer.

## Teil C — Picker aktuell halten (Modell-Sync)

Ohne diesen Schritt **versteinert der Picker**. Der Anbieter bringt laufend neue Modelle und schaltet alte ab; deine Auswahl bleibt auf dem Stand des Installationstags stehen — neue Modelle fehlen, abgeschaltete stehen als tote Slugs herum und antworten mit `429`.

`tools/model-sync.mjs` gleicht das täglich ab:

- fragt den Anbieter-Katalog ab,
- nimmt pro Produktlinie **nur die aktuelle Generation** auf (`glm-5` fliegt raus, sobald `glm-5.2` da ist),
- überspringt `-preview`/`-beta`/`-alpha`/`-legacy`/`-deprecated` und geroutete Kopien nativer Modelle,
- entfernt selbst ergänzte Einträge, die es beim Anbieter nicht mehr gibt,
- baut Katalog und Gateway-Konfiguration neu, schreibt die Verbrauchslabels nach und startet den Dienst.

Geschrieben wird ausschließlich nach `$HOME/.codex/codex-router/user-models.json`. Das liegt **außerhalb** des Checkouts — ein Router-Update wirft es nicht weg, und die kuratierte Liste des Projekts wird nie angefasst.

### Immer zuerst der Trockenlauf

```bash
node "$REPO/tools/model-sync.mjs" --dry-run
```

Der zeigt genau, was aufgenommen und was entfernt würde, und schreibt nichts. Erst wenn das plausibel aussieht:

```bash
install -m 755 -d "$HOME/.local/bin"
cp "$REPO/tools/model-sync.mjs" "$HOME/.local/bin/model-sync.mjs"
node "$HOME/.local/bin/model-sync.mjs"
```

Damit die Verbrauchslabels aus Teil B mitlaufen, muss `picker-usage-labels.mjs` daneben liegen — entweder im selben Verzeichnis oder unter `$HOME/.local/bin/`. Das Skript sagt im Log, wenn es sie nicht findet.

### Die Abbruchsicherungen

Das Skript ändert **nichts**, wenn der Anbieter einen Fehler liefert oder null Modelle meldet. Ein leerer Katalog ist fast immer eine Störung — und ohne diese Sicherung würde ein Anbieter-Schluckauf deine halbe Modellauswahl löschen. Beide Fälle landen im Log.

### Die Denyliste

Manche Modelle liefert ein Anbieter dauerhaft kaputt aus (Formatwechsel, nonkonformer Stream). Nimmst du sie aus dem Picker, holt der nächste Sync sie brav wieder — sie stehen ja im Anbieter-Katalog. Dafür gibt es im Skript die `DENYLIST`. Voreingestellt steht dort `kimi-k3`, passend zu `patches/0001`. Wer ein Modell dauerhaft nicht will, trägt es dort ein.

### Täglich automatisch (macOS)

`$HOME/Library/LaunchAgents/local.model-sync.plist` — `REPLACE_HOME` und `REPLACE_NODE` ersetzen (siehe Teil B), **der Nutzer lädt selbst**:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>local.model-sync</string>
  <key>ProgramArguments</key>
  <array>
    <string>REPLACE_NODE</string>
    <string>REPLACE_HOME/.local/bin/model-sync.mjs</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>REPLACE_HOME/.config/bridge-picker/model-sync.out.log</string>
  <key>StandardErrorPath</key><string>REPLACE_HOME/.config/bridge-picker/model-sync.err.log</string>
</dict>
</plist>
```

```bash
mkdir -p "$HOME/.config/bridge-picker"
launchctl bootstrap gui/$(id -u) "$HOME/Library/LaunchAgents/local.model-sync.plist"
launchctl list | grep model-sync
tail -20 "$HOME/.config/bridge-picker/model-sync.log"
```

Entladen: `launchctl bootout gui/$(id -u)/local.model-sync`

Auf Linux stattdessen ein `cron`-Eintrag oder ein systemd-User-Timer. Läuft der Sync um 07:00, sollten die Verbrauchslabels aus Teil B **danach** laufen — oder gar nicht extra, weil der Sync sie selbst nachzieht.

### Grenzen, ehrlich benannt

- **Neu aufgenommene Modelle laufen mit dem Standardprofil**: Kontextfenster 131072, nur Text. Hat ein Modell in Wirklichkeit ein 1M-Fenster, brichst du bei ~110k ab (siehe Kontextfenster-Falle in `modules/04-provider.md`). Das muss von Hand nachgezogen werden — der Lauf weist darauf hin, wenn er etwas Neues aufgenommen hat.
- **Codex muss nach jedem Lauf mit Änderungen neu gestartet werden.** Der Sync kann das nicht.
- **Der Sync kennt keine Qualität.** Er kennt Versionsnummern. Was neu und schlecht ist, kommt trotzdem rein — gelegentlich selbst aussortieren mit `node src/control.mjs picker set <provider>/<modell> hide`.
- **Er pflegt nur `opencode-go`.** OpenRouter-Free-Modelle bleiben Handarbeit.

## Teil D — Mehrere Keys und der Kontingent-Watchdog

Wer zwei OpenCode-Keys hat (etwa aus zwei Konten), kann bei erschöpftem Wochenlimit umschalten, statt zu warten. `tools/opencode-keys.mjs` verwaltet die Keys als **Slots**.

Slots liegen als einzelne Dateien mit Rechten 0600 unter `$HOME/.config/bridge-picker/opencode-keys/<slot>.env`. Der aktive Key steht zusätzlich im Router-Speicher. **Key-Werte laufen nie durch Chat, Shell-Argumente oder Logs** — der Weg ist immer Zwischenablage → Test → Datei.

Installieren:

```bash
install -m 755 -d "$HOME/.local/bin"
cp "$REPO/tools/opencode-keys.mjs" "$HOME/.local/bin/opencode-keys.mjs"
node "$HOME/.local/bin/opencode-keys.mjs"     # zeigt die Aufrufe
```

### Befehle

| Befehl | Wirkung |
|---|---|
| `import <slot>` | Den aktuell aktiven Key als Slot sichern (immer der erste Schritt) |
| `add <slot> [--use]` | Key aus der Zwischenablage gegen den Anbieter testen, als Slot speichern, optional sofort aktivieren |
| `status` | Jeden Slot mit einem Mini-Request prüfen: `OK` / `LIMIT` / HTTP-Fehler |
| `use <slot>` | Slot aktivieren, Router-Cooldown löschen, Dienst neu starten |
| `auto` | Den ersten Slot mit freiem Kontingent aktivieren |
| `auto --if-limited` | Wie `auto`, handelt aber nur, wenn der Router selbst ein Kontingent-429 beobachtet hat |
| `remove <slot>` | Slot löschen (nie den aktiven) |

Typischer Einstieg:

```bash
node "$HOME/.local/bin/opencode-keys.mjs" import haupt
node "$HOME/.local/bin/opencode-keys.mjs" add zweit        # zweiter Key in der Zwischenablage
node "$HOME/.local/bin/opencode-keys.mjs" status
```

Nach jedem Wechsel: **Codex komplett beenden und neu öffnen.**

### Was `add` schützt

Das Skript testet den Key **bevor** es schreibt. Ein abgelehnter Key überschreibt also nie einen funktionierenden. Es weigert sich außerdem, denselben Key zweimal als verschiedene Slots abzulegen — das gäbe eine Rotation, die nichts rotiert.

Der Test geht bewusst an einen **authentifizierten** Endpunkt (`/messages`). Das ist kein Detail: `/models` beim selben Anbieter antwortet auf jeden beliebigen Wert mit `200` — ein Tippfehler im Key käme dort anstandslos durch. Ein `429` im Test gilt als angenommen: Der Key ist gültig, nur das Kontingent ist erschöpft.

### Fallstrick: Freigaben hängen am Konto des Keys

Kontobezogene Freigaben (etwa ein Hosting-Region-Opt-in) gelten für den **Workspace des jeweiligen Keys**. Ein Slot aus einem anderen Konto kann deshalb bei manchen Modellen plötzlich `403 … requires explicit opt in` liefern, obwohl der Key völlig in Ordnung ist. Freigabe im jeweiligen Konto nachziehen — oder wissen, welche Modelle mit welchem Slot laufen.

### Der Watchdog

`auto --if-limited` ist so gebaut, dass er im Normalfall **keine einzige Anbieter-Anfrage** stellt: Er schaut zuerst in die Cooldown-Datei des Routers und tut nur dann etwas, wenn dort ein aktives Kontingent-429 vermerkt ist. Ein Watchdog, der alle fünf Minuten Kontingent verbrennt, um Kontingent zu sparen, wäre absurd.

Vorlage für `$HOME/Library/LaunchAgents/local.opencode-keys-watch.plist` (`REPLACE_HOME` und `REPLACE_NODE` ersetzen (siehe Teil B), **der Nutzer lädt selbst**):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>local.opencode-keys-watch</string>
  <key>ProgramArguments</key>
  <array>
    <string>REPLACE_NODE</string>
    <string>REPLACE_HOME/.local/bin/opencode-keys.mjs</string>
    <string>auto</string>
    <string>--if-limited</string>
  </array>
  <key>StartInterval</key><integer>300</integer>
  <key>StandardOutPath</key><string>REPLACE_HOME/.local/state/opencode-keys-watch.log</string>
  <key>StandardErrorPath</key><string>REPLACE_HOME/.local/state/opencode-keys-watch.log</string>
</dict>
</plist>
```

```bash
mkdir -p "$HOME/.local/state"
launchctl bootstrap gui/$(id -u) "$HOME/Library/LaunchAgents/local.opencode-keys-watch.plist"
launchctl list | grep opencode-keys-watch
tail -5 "$HOME/.local/state/opencode-keys-watch.log"
```

Entladen: `launchctl bootout gui/$(id -u)/local.opencode-keys-watch`

**Grenzen des Watchdogs, ehrlich benannt:**

- Sind **alle** Slots am Limit, loggt er nur. Er kann kein Kontingent herbeizaubern.
- **Codex muss nach einem Wechsel neu gestartet werden.** Das kann er dir nicht abnehmen. Laufende Threads verbinden sich nach dem Router-Neustart zwar neu, aber der saubere Weg ist ein App-Neustart.
- Er reagiert auf das, was der Router gesehen hat. Ein Limit, das noch niemand getroffen hat, kennt er nicht.

## Abnahme (der Beleg)

```bash
cd "$ROUTER_DIR" && node src/control.mjs picker status | tail -30
node "$HOME/.local/bin/model-sync.mjs" --dry-run     # muss ohne Abbruch durchlaufen
node "$HOME/.local/bin/picker-usage-labels.mjs"
node "$HOME/.local/bin/opencode-keys.mjs" status     # nur bei mehreren Slots
launchctl list | grep -E 'model-sync|picker-usage-labels|opencode-keys-watch'
```

Dann den Nutzer bitten: App neu starten, Picker öffnen, bestätigen, dass die Auswahl stimmt und die Verbrauchsbalken zu sehen sind.

## Rückweg

```bash
# Picker: alles wieder zeigen
cd "$ROUTER_DIR" && node src/control.mjs picker all show

# LaunchAgents entladen und entfernen
launchctl bootout gui/$(id -u)/local.model-sync 2>/dev/null || true
launchctl bootout gui/$(id -u)/local.picker-usage-labels 2>/dev/null || true
launchctl bootout gui/$(id -u)/local.opencode-keys-watch 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/local.model-sync.plist" \
      "$HOME/Library/LaunchAgents/local.picker-usage-labels.plist" \
      "$HOME/Library/LaunchAgents/local.opencode-keys-watch.plist"

# Skripte entfernen
rm -f "$HOME/.local/bin/model-sync.mjs" \
      "$HOME/.local/bin/picker-usage-labels.mjs" \
      "$HOME/.local/bin/opencode-keys.mjs"

# Key-Slots (Rückfrage beim Nutzer! Das sind seine Keys)
# rm -rf "$HOME/.config/bridge-picker/opencode-keys"
```

Die Verbrauchslabels verschwinden beim nächsten Katalog-Neubau von selbst; erzwingen geht mit `./bin/refresh-catalog`.

## Abschluss

`install-state.json` → `steps.05-picker-pflege`:

```json
{ "status": "done",
  "visibleModels": 0,
  "labels": true,
  "modelSync": "manuell | launchagent | nein",
  "keySlots": ["haupt"],
  "watchdog": false,
  "receipt": "picker status Readback + Labels im Picker sichtbar + model-sync Trockenlauf ohne Abbruch",
  "at": "ISO-Datum" }
```
