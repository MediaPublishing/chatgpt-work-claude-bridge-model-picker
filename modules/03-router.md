# Modul 03 — Der Router: Fremdmodelle in die Codex-Modellauswahl

**Wann:** bei Interview-Antwort B oder C.
**Ziel:** Ein lokaler Dienst entscheidet pro Modellname, ob eine Anfrage ans ChatGPT-Abo oder an einen Fremdanbieter geht. Native GPT-Modelle laufen unverändert übers Abo weiter.
**Beleg am Ende:** je ein „pong" über ein natives und über ein geroutetes Modell.

## Warum überhaupt ein Router

Codex kennt nur **einen** globalen Modell-Provider, und die Einträge im Modellkatalog haben kein Provider-Feld. Trägt man Fremdmodelle nur in den Katalog ein, erscheinen sie zwar im Picker, aber der Klick geht trotzdem an OpenAI und scheitert mit `The '<modell>' model is not supported when using Codex with a ChatGPT account`.

Der Router löst das als lokaler Dispatcher: Die Basis-URL zeigt auf `127.0.0.1`, der Dienst schaut sich den Modellnamen an und leitet weiter — nativ ans ChatGPT-Abo, geroutet an den Fremdanbieter.

**Harte Bedingung, die dabei gilt:** Native GPT-Modelle dürfen nie auf eine Fremdabrechnung wandern. Der Router hält das ein; prüfe es trotzdem in der Abnahme.

## Schritt 1 — Ist-Zustand prüfen

```bash
ROUTER_DIR="${CODEX_ROUTER_DIR:-$HOME/.local/share/codex-router}"
STATE_DIR="$HOME/.codex/codex-router"

[ -d "$ROUTER_DIR/.git" ] && echo "Checkout existiert: $ROUTER_DIR" \
  && git -C "$ROUTER_DIR" log --oneline -1 \
  && git -C "$ROUTER_DIR" status --porcelain \
  || echo "Kein Checkout"

[ -d "$STATE_DIR" ] && echo "Router-State existiert bereits: $STATE_DIR" || echo "Kein State"
ls -l "$HOME/.codex/config.toml" 2>/dev/null || echo "Keine Codex-Config"
```

Ist bereits ein Checkout vorhanden: **nicht** einfach überschreiben. Zeige dem Nutzer Commit und lokale Änderungen und frage, ob er neu aufsetzen oder abbrechen will.

## Schritt 2 — Klonen und auf den geprüften Commit pinnen

```bash
git clone https://github.com/duolahypercho/codex-router "$ROUTER_DIR"
git -C "$ROUTER_DIR" checkout bc0ca25
git -C "$ROUTER_DIR" log --oneline -1        # muss bc0ca25 zeigen
node -e "console.log(require('$ROUTER_DIR/package.json').version)"   # 0.5.0
```

**Credit, wo er hingehört:** Die gesamte Router-Technik stammt aus dem Open-Source-Projekt [codex-router](https://github.com/duolahypercho/codex-router) — volle Anerkennung an dessen Autoren. Dieses Repo installiert es nur geordnet: gepinnter Commit, Prüf-Battery, wenige Kompatibilitäts-Patches. Wer lieber dem Original in seinem neuesten Stand folgt, kann das jederzeit tun — dann entfallen Schritt 4 (Patches) und der Pin in Schritt 2, und die Prüf-Battery in Schritt 3 lohnt sich erst recht.

**Warum ein fixer Commit:** `bc0ca25` ist der Stand (v0.5.0), gegen den die Prüfungen unten und die Patches in `patches/` erhoben wurden. `main` kann sich jederzeit ändern; ein Update wäre dann ein ungeprüfter Stand. Das gilt für ein Open-Source-Projekt, das sich zwischen deinen Prüfterminen unbeaufsichtigt weiterentwickelt, ganz besonders.

**Kein Auto-Update.** Das Repo bringt ein `bin/update` mit, das `main` nachzieht. Nutze es nicht. Ein Update ist eine bewusste Entscheidung: erst die Prüf-Battery aus Schritt 3 gegen den neuen Stand laufen lassen, dann die lokalen Patches neu einpassen.

## Schritt 3 — Mechanische Prüf-Battery (Rohbefunde zeigen)

Das ist **kein Sicherheitsaudit**, sondern eine Reihe mechanischer Stichproben. Führe sie aus und zeige dem Nutzer die **rohe Ausgabe jedes Befehls**, nicht dein Urteil darüber. Er entscheidet, ob installiert wird.

```bash
cd "$ROUTER_DIR"

echo "=== 1. Installations-Hooks in package.json ==="
node -e 'const s=require("./package.json").scripts||{};for(const k of ["preinstall","install","postinstall","prepare","prepack"])console.log(k+":",s[k]??"—")'

echo "=== 2. Laufzeit-Abhängigkeiten ==="
node -e 'const p=require("./package.json");console.log("deps:",p.dependencies||{});console.log("devDeps:",Object.keys(p.devDependencies||{}))'

echo "=== 3. Netzwerkziele im Quelltext (alle https-Hosts) ==="
grep -rhoE 'https://[a-zA-Z0-9._/-]+' src/ config/ bin/ 2>/dev/null \
  | sed -E 's#https://([^/]+).*#\1#' | sort -u

echo "=== 4. Dynamische Ausführung / Verschleierung ==="
grep -rnE '\beval\(|new Function\(|child_process.*exec\(|Buffer\.from\([^,]+,\s*.base64.\)' src/ bin/ 2>/dev/null | head -40
echo "(leer = kein Treffer)"

echo "=== 5. Telemetrie ==="
grep -rniE 'telemetry|analytics|posthog|sentry|mixpanel|segment\.io' src/ config/ 2>/dev/null | head -40
echo "(leer = kein Treffer)"

echo "=== 6. CI: pull_request_target ==="
grep -rn 'pull_request_target' .github/ 2>/dev/null
echo "(leer = kein Treffer)"

echo "=== 7. Tests ==="
npm ci --silent && npm test 2>&1 | tail -20
```

Zwei Dinge, die du dem Nutzer **vor** Prüfung 7 sagen musst:

- Der Router braucht **Node 22.19 oder neuer** (`engines` in seiner `package.json`). Mit älterem Node scheitert schon `npm ci`.
- `npm ci` installiert hier auch die Entwicklungs-Abhängigkeiten, darunter `playwright` — und dessen Installationsskript **lädt Browser-Binärdateien nach** (mehrere hundert MB). Das ist erwartet und kommt vom Test-Werkzeug, nicht vom Router. Prüfung 1 sieht solche Skripte nicht: sie schaut nur in die `package.json` des Routers selbst, nicht in die seiner Abhängigkeiten. Die eigentliche Installation in Schritt 6 nutzt später `npm ci --omit=dev` und lädt das nicht.

Wer den Download nicht will, überspringt Prüfung 7 bewusst und sagt es dem Nutzer — statt sie still wegzulassen.

Wonach der Nutzer schaut:

| Prüfung | Erwartung beim geprüften Stand `bc0ca25` |
|---|---|
| Installations-Hooks | keine — npm führt beim Installieren kein fremdes Skript aus |
| Abhängigkeiten | klein und benennbar (u. a. `proper-lockfile`, `undici`) |
| Netzwerkziele | ausschließlich offizielle Anbieter-APIs plus `127.0.0.1` |
| `eval`/Base64-Ausführung | keine |
| Telemetrie | keine nach außen; die Telemetrie der eingebetteten Gateway-Komponente wird aktiv abgeschaltet |
| `pull_request_target` | nicht verwendet (sonst könnte ein fremder Pull Request mit Repo-Rechten laufen) |
| Tests | laufen durch; einzelne bekannte Fehlschläge sind erklärbar, aber kein Massensterben |

Weicht etwas ab, **stoppe** und zeig es dem Nutzer. Ein abweichender Befund ist kein Grund weiterzumachen, nur weil das Modul es sonst vorsieht.

## Schritt 4 — Unsere Patches anwenden

In `patches/` liegen drei geprüfte Korrekturen gegen genau diesen Stand:

| Patch | Was er tut |
|---|---|
| `0001-…kimi-k3…messages-api…` | Der Anbieter hat das Antwortformat für ein Kimi-Modell gewechselt. Der Patch hängt das Modell auf die Messages-Route um und nimmt es aus der Liste, damit kein toter Slug im Picker steht |
| `0002-…schema-grenzen…kimi-modelle…` | Verdrahtet den generischen Tool-Schema-Sanitizer auch für weiterverkaufte Kimi-Modelle. Anbieter mit striktem Validator lehnen sonst die ganze Anfrage ab, sobald ein Werkzeug-Schema `oneOf`/`anyOf`/`allOf` an der Wurzel trägt |
| `0003-…kuration…messages-modell…` | Zieht die Kuration nach, damit das Kimi-Modell nicht bei jedem Modell-Sync im alten, kaputten Format zurückkommt |

Anwenden:

```bash
cd "$ROUTER_DIR"
git am "$REPO/patches/"*.patch
git log --oneline -4        # 3 neue Commits über bc0ca25
```

Scheitert `git am` (etwa weil du nicht auf `bc0ca25` stehst):

```bash
git am --abort
git status                  # muss sauber sein
```

Dann den Nutzer fragen. Nicht mit `--force` oder Handarbeit durchdrücken.

Die Patches sind **optional**, wenn der Nutzer die betroffenen Modelle nicht nutzt. Sie schaden aber nicht — sie berühren nur die genannten Provider-Pfade.

## Schritt 5 — Die .env-Kollisionsfalle (vor der Installation entschärfen)

Die eingebettete Gateway-Komponente ist ein Python-Prozess, der `python-dotenv` lädt. Dessen `find_dotenv()` läuft **vom Arbeitsverzeichnis aus nach oben** und nimmt die erste `.env`, die es findet. Liegt irgendwo oberhalb — typischerweise in `$HOME` — eine allgemeine `.env` mit einem `DATABASE_URL`, übernimmt das Gateway diesen Wert und startet nicht mehr. Symptom: `gateway exited before becoming healthy`, in Endlosschleife.

Prüfen:

```bash
ls -la "$HOME/.env" 2>/dev/null && grep -c DATABASE_URL "$HOME/.env" 2>/dev/null
```

Wenn dort etwas liegt, eine abschattende `.env` **im Router-Verzeichnis** anlegen. Sie muss die globale überdecken, ohne selbst etwas zu setzen:

```bash
printf '# Absichtlich leer: schattet eine globale ~/.env ab.\n' > "$ROUTER_DIR/.env"
echo ".env" >> "$ROUTER_DIR/.git/info/exclude"
```

Zwei Details, die man leicht falsch macht:

- Die Datei enthält **nur einen Kommentar**. Schreibe dort **kein** `DATABASE_URL=` — ein leerer Wert gilt als gesetzt und scheitert mit `unsupported scheme`.
- Der Ausschluss gehört in `.git/info/exclude`, nicht in `.gitignore`. `.gitignore` ist eine versionierte Datei des Projekts; sie zu ändern macht deinen Checkout schmutzig und kollidiert beim nächsten Update.

## Schritt 6 — Installation (nur nach Bestätigung)

Zeige dem Nutzer, was jetzt passiert: ein Hintergrunddienst wird eingerichtet (auf macOS ein LaunchAgent, der beim Login startet), die Codex-Konfiguration wird auf den lokalen Router umgestellt, und der Modellkatalog wird gebaut. **Warte auf sein ausdrückliches OK.**

Vorher die Codex-Konfiguration sichern:

```bash
[ -f "$HOME/.codex/config.toml" ] && \
  cp "$HOME/.codex/config.toml" "$HOME/.codex/config.toml.pre-codex-router" && \
  echo "Gesichert: $HOME/.codex/config.toml.pre-codex-router"
```

Wissen sollte man: **genau diesen Pfad benutzt der Router selbst** für seine eigene Sicherung. Deine Kopie ist also keine unabhängige zweite Sicherung — sie wird beim Installieren möglicherweise durch die des Routers ersetzt. Wer wirklich eine eigene, unantastbare Kopie will, nimmt einen eigenen Namen:

```bash
[ -f "$HOME/.codex/config.toml" ] && \
  cp "$HOME/.codex/config.toml" "$HOME/.codex/config.toml.vor-bridge-picker-$(date +%Y%m%d-%H%M%S)"
```

Dann:

```bash
cd "$ROUTER_DIR"
./bin/install
```

Die optionale Desktop-Begleit-App (Tray) wird dabei **nicht** installiert — der Installer legt sie nur an, wenn man ausdrücklich danach fragt. Der Router braucht sie nicht; alles geht über die Kommandozeile.

**Keine erfundenen Flags.** `bin/install` kennt bei `bc0ca25` genau vier Optionen: `--prepare-only`, `--migrate-known`, `--adopt-native-catalog`, `--force-deps`. Jedes andere Argument beendet den Installer sofort mit einer Usage-Zeile und Exit-Code 2 — es wird dann gar nichts installiert.

Danach Zustand prüfen:

```bash
cd "$ROUTER_DIR"
./bin/status
./bin/doctor
```

**Merke:** Setz für `./bin/status` **keine** `MODEL_ROUTER_PORT`-Variable „vorsichtshalber". Der Router läuft bei `bc0ca25` standardmäßig auf Port **4202**; `4102` ist der alte Port aus früheren Versionen und wird nur noch benutzt, wenn jemand die Variable ausdrücklich setzt. Wer `MODEL_ROUTER_PORT=4102` davorschreibt, fragt den Gesundheitscheck an der falschen Adresse und bekommt ein `unavailable`, obwohl der Dienst einwandfrei läuft. Die Variable ist nur nötig, wenn der Nutzer den Port selbst umgestellt hat — dann aber auf seinen echten Wert.

Den Dienst-Status auf macOS gegenprüfen:

```bash
launchctl list | grep -i codex-router || echo "LaunchAgent nicht geladen"
```

## Schritt 7 — Das Skill-Pack des Routers

`bin/install` schreibt beim Lauf einige eigene Skills nach `$HOME/.codex/skills`. Inhaltlich sind das Bedienungsanleitungen für geroutete Fremdmodelle: die sehen Codex' native Werkzeuge unter anderen Namen und kennen die Aufrufkonventionen ohne Erklärung nicht.

Sag dem Nutzer, dass das passiert, und liste ihm auf, was neu dazugekommen ist:

```bash
ls -la "$HOME/.codex/skills"
```

Der Installer weist Eigentum über eine eigene Verwaltungsdatei nach und lässt Symlinks, unbekannte Dateien und fremde Verzeichnisse unangetastet. Wer einzelne dieser Skills nicht will, kann sie entfernen — muss dann aber wissen, dass **jeder Router-Lauf sie zurückschreibt** und `./bin/doctor` sie dauerhaft als fehlend meldet. Das ist kosmetisch.

## Schritt 8 — Verifikation in beide Richtungen (der Beleg)

Ein Router ist erst dann in Ordnung, wenn **beide** Wege funktionieren. Ein Test allein beweist nichts.

```bash
CODEX_BIN="$( [ -x /Applications/ChatGPT.app/Contents/Resources/codex ] \
  && echo /Applications/ChatGPT.app/Contents/Resources/codex || command -v codex )"

# a) nativ — muss weiter über das ChatGPT-Abo laufen
cd /tmp && "$CODEX_BIN" exec -m <natives-gpt-modell> --skip-git-repo-check \
  "Antworte mit genau einem Wort: pong"

# b) geroutet — erst möglich, wenn Modul 04 einen Provider aktiviert hat
cd /tmp && "$CODEX_BIN" exec -m <provider>/<modell> --skip-git-repo-check \
  "Antworte mit genau einem Wort: pong"
```

Gültige Slugs zeigt `"$CODEX_BIN" debug models`. Ist noch kein Provider aktiv, ist nur Test (a) fällig; (b) holst du am Ende von Modul 04 nach — dann aber wirklich.

Zum Schluss den Nutzer bitten, die App **komplett zu beenden** und neu zu öffnen, und im Picker nachzusehen.

## Fehlerbilder

| Symptom | Bedeutung | Lösung |
|---|---|---|
| `gateway exited before becoming healthy` (Schleife) | Fremde `.env` von oberhalb geladen | Schritt 5, abschattende Kommentar-`.env` |
| `unsupported scheme '<missing scheme>'` | In der abschattenden `.env` steht ein leeres `DATABASE_URL=` | Zeile ersatzlos löschen |
| `./bin/status` sagt `unavailable`, Dienst läuft aber | Meist eine gesetzte `MODEL_ROUTER_PORT`, die nicht zum Dienst passt (z. B. der alte Wert `4102` statt des Standards `4202`) | Variable weglassen: `./bin/status`. Nur setzen, wenn der Nutzer den Port wirklich umgestellt hat |
| `stream disconnected before completion: … 127.0.0.1` in jedem Thread | Der Dienst läuft gar nicht | `./bin/enable` aus dem echten Checkout, dann `./bin/status` |
| `foreign_state_owner` im Log | Eine **Kopie** des Repos (z. B. aus einem Scan-Tempordner) wollte den Dienst starten und wurde korrekt abgewiesen | Nichts kaputt. Am echten Checkout weitermachen |
| `not supported when using Codex with a ChatGPT account` | Anfrage ging an OpenAI statt an den Fremdanbieter | Routing prüfen: Modell-Slug, aktive Provider, Dienst neu gestartet? |
| `failed to parse model_catalog_json` | Zu altes Codex-CLI aus dem PATH | App-Binary nutzen |

Mehr Fehlerbilder mit Erklärung: `LEARNINGS.md`.

## Rückweg

```bash
cd "$ROUTER_DIR"
./bin/disable                                    # Dienst abschalten
./bin/uninstall                                  # Integration entfernen

# Codex-Konfiguration auf den Stand vor dem Router zurücksetzen
cp "$HOME/.codex/config.toml.pre-codex-router" "$HOME/.codex/config.toml"

# Checkout und Router-State entfernen (erst nach Rückfrage beim Nutzer)
rm -rf "$ROUTER_DIR" "$HOME/.codex/codex-router"
```

Danach Codex komplett beenden und neu öffnen. Der Picker zeigt wieder ausschließlich die nativen Modelle.

## Abschluss

`install-state.json` → `steps.03-router`:

```json
{ "status": "done",
  "pinnedCommit": "bc0ca25",
  "patches": ["0001", "0002", "0003"],
  "receipt": "pong nativ | ./bin/status ok | doctor ok",
  "backup": "$HOME/.codex/config.toml.pre-codex-router",
  "at": "ISO-Datum" }
```
