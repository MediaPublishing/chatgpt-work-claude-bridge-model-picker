# Modul 05 — Picker pflegen: kuratieren, beschriften, Keys rotieren

**Wann:** bei Interview-Antwort B oder C, nach Modul 04.
**Ziel:** Der Picker zeigt eine überschaubare, aktuelle Auswahl; du siehst pro Modell, wie viel du verbrauchst; und bei erschöpftem Kontingent schaltet ein Watchdog auf einen freien Key um.
**Beleg am Ende:** Picker-Readback nach dem Aufräumen, sichtbare Verbrauchslabels, `status`-Ausgabe der Key-Slots.

Alles hier ist **optional und einzeln nutzbar**. Wer nur einen Key hat, überspringt Teil C.

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
▰▰▰▱▱ 442 Req/7T · 178M Tok · 14 Fehler | <ursprüngliche Beschreibung>
```

Der Balken ist der **Anteil an allen gerouteten Requests der letzten 7 Tage**. Warum Requests und nicht Tokens: Bei einem Flat-Abo wie OpenCode Go zählen Requests gegen die Limits, Tokens nicht. Die Token-Zahl steht trotzdem daneben — sie ist relevant, sobald ein Endpunkt mit Token-Abrechnung im Spiel ist.

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
    <string>/usr/bin/env</string>
    <string>node</string>
    <string>REPLACE_HOME/.local/bin/picker-usage-labels.mjs</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>7</integer><key>Minute</key><integer>10</integer></dict>
  <key>StandardOutPath</key><string>REPLACE_HOME/.local/state/picker-usage-labels.log</string>
  <key>StandardErrorPath</key><string>REPLACE_HOME/.local/state/picker-usage-labels.log</string>
</dict>
</plist>
```

`REPLACE_HOME` durch den echten Wert von `$HOME` ersetzen (Plists verstehen keine Variablen). Dann:

```bash
mkdir -p "$HOME/.local/state"
launchctl bootstrap gui/$(id -u) "$HOME/Library/LaunchAgents/local.picker-usage-labels.plist"
launchctl list | grep picker-usage-labels
```

Entladen: `launchctl bootout gui/$(id -u)/local.picker-usage-labels`

Auf Linux stattdessen ein `cron`-Eintrag oder ein systemd-User-Timer.

## Teil C — Mehrere Keys und der Kontingent-Watchdog

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

### Fallstrick: Freigaben hängen am Konto des Keys

Kontobezogene Freigaben (etwa ein Hosting-Region-Opt-in) gelten für den **Workspace des jeweiligen Keys**. Ein Slot aus einem anderen Konto kann deshalb bei manchen Modellen plötzlich `403 … requires explicit opt in` liefern, obwohl der Key völlig in Ordnung ist. Freigabe im jeweiligen Konto nachziehen — oder wissen, welche Modelle mit welchem Slot laufen.

### Der Watchdog

`auto --if-limited` ist so gebaut, dass er im Normalfall **keine einzige Anbieter-Anfrage** stellt: Er schaut zuerst in die Cooldown-Datei des Routers und tut nur dann etwas, wenn dort ein aktives Kontingent-429 vermerkt ist. Ein Watchdog, der alle fünf Minuten Kontingent verbrennt, um Kontingent zu sparen, wäre absurd.

Vorlage für `$HOME/Library/LaunchAgents/local.opencode-keys-watch.plist` (`REPLACE_HOME` ersetzen, **der Nutzer lädt selbst**):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>local.opencode-keys-watch</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/env</string>
    <string>node</string>
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
node "$HOME/.local/bin/picker-usage-labels.mjs"
node "$HOME/.local/bin/opencode-keys.mjs" status    # nur bei mehreren Slots
launchctl list | grep -E 'picker-usage-labels|opencode-keys-watch'
```

Dann den Nutzer bitten: App neu starten, Picker öffnen, bestätigen, dass die Auswahl stimmt und die Verbrauchsbalken zu sehen sind.

## Rückweg

```bash
# Picker: alles wieder zeigen
cd "$ROUTER_DIR" && node src/control.mjs picker all show

# LaunchAgents entladen und entfernen
launchctl bootout gui/$(id -u)/local.picker-usage-labels 2>/dev/null || true
launchctl bootout gui/$(id -u)/local.opencode-keys-watch 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/local.picker-usage-labels.plist" \
      "$HOME/Library/LaunchAgents/local.opencode-keys-watch.plist"

# Skripte entfernen
rm -f "$HOME/.local/bin/picker-usage-labels.mjs" "$HOME/.local/bin/opencode-keys.mjs"

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
  "keySlots": ["haupt"],
  "watchdog": false,
  "receipt": "picker status Readback + Labels im Picker sichtbar",
  "at": "ISO-Datum" }
```
