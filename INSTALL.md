# INSTALL.md — Playbook für den installierenden Agenten

Du bist ein AI-Agent (Claude Cowork/Code oder ChatGPT Work/Codex) und richtest für deinen Nutzer das Setup „Brücke & Picker" ein. Arbeite dieses Playbook strikt der Reihe nach ab.

## Grundregeln (nicht verhandelbar)

1. Frage den Nutzer NIE nach Passwörtern, API-Keys im Chat oder Zahlungsdaten. Logins macht der Nutzer selbst im Terminal/Browser; Keys landen nur in Dateien (Rechte 0600), die du referenzierst.
2. Nutze ausschließlich offizielle CLIs (`claude`, `codex`, `gemini`) und die in `modules/` gepinnten Quellen. Keine UI-Automation, keine Abo-Logins in Dritt-Tools.
3. Vor jeder Installation aus dem Netz: die im jeweiligen Modul beschriebenen mechanischen Prüfbefunde erheben und dem Nutzer als ROHBEFUNDE zeigen (kein Pauschalurteil).
4. Nach JEDEM abgeschlossenen Schritt: `install-state.json` im Repo-Ordner aktualisieren (Schema unten) und dem Nutzer den Beleg zeigen (Testlauf-Ausgabe, Pfad, Readback).
5. **Führe den Dialog mit dem Nutzer in DESSEN Sprache**, unabhängig von der Sprache dieses Playbooks. Dieses Dokument ist deutsch; wenn der Nutzer englisch, spanisch oder sonst etwas schreibt, antwortest du in seiner Sprache. Befehle, Pfade und Dateinamen bleiben dabei unverändert.
6. Bei Fehlern: Fehlerbild in `LEARNINGS.md` nachschlagen, ehrlich melden, nicht endlos wiederholen. Läufst DU selbst in ein Kontingent-Limit: Schritt sauber abschließen oder als `in_progress` markieren — der nächste Agent (auch ein anderes Modell) liest `install-state.json` und macht dort weiter.
7. Vor Änderungen an bestehenden Dateien: zeitgestempelte Kopie anlegen. Jedes Modul nennt seinen Rückweg.
8. **Wenn etwas klemmt: erst selbst heilen, dann melden.** In dieser Reihenfolge — (a) Fehlerbild in `LEARNINGS.md` nachschlagen, (b) den Rückweg des Moduls nutzen und den Schritt **einmal** sauber wiederholen, (c) erst dann aufgeben. Nie in Schleife wiederholen; ein Kontingent-429 wird durch Retries nur schlimmer. Ist es wirklich nicht lösbar, hilf dem Nutzer beim Melden — siehe „Wenn es nicht lösbar ist" unten.

## Konventionen in allen Modulen

Die Module verwenden durchgängig diese Variablen. Setze sie zu Beginn jedes Laufs:

```bash
REPO="$(pwd)"                                              # Wurzel dieses Repos
[ -f "$REPO/INSTALL.md" ] || echo "ACHTUNG: REPO zeigt nicht auf dieses Repo."
ROUTER_DIR="${CODEX_ROUTER_DIR:-$HOME/.local/share/codex-router}"
CODEX_BIN="$( [ -x /Applications/ChatGPT.app/Contents/Resources/codex ] \
  && echo /Applications/ChatGPT.app/Contents/Resources/codex || command -v codex )"
```

Diese Variablen leben nur in **einer** Shell-Sitzung. Jeder neue Befehlsblock — und jeder Agent, der einen abgebrochenen Lauf fortsetzt — muss sie neu setzen. Die Module 04 und 05 sagen das noch einmal an ihrem Anfang, weil ein leeres `$REPO` dort still auf `/tools/…` zeigt.

Nutzerpfade stehen überall als `$HOME/...`. Schreibe nie absolute Pfade eines fremden Rechners in eine Datei.

## Schritt 0 — Zustand prüfen

Existiert `install-state.json` bereits? Dann lies sie, fasse dem Nutzer den Stand zusammen und setze beim ersten Schritt fort, der nicht `done` ist. Sonst neu beginnen.

### 0a — Bestehende Router-Installation erkennen (HARTER STOPP)

**Das ist der wichtigste Schritt in diesem Playbook.** Dieses Repo richtet auf einer frischen Maschine alles sauber ein. Auf einer Maschine, auf der bereits ein codex-router läuft, kann es eine **funktionierende Installation zerstören**: Branch gewechselt, `.env` ersetzt, Port migriert — und alle laufenden Codex-Sessions hängen mitten in der Arbeit.

Das ist real passiert. Prüfe **vor allem anderen**, bevor du irgendetwas installierst, klonst oder änderst:

```bash
ROUTER_DIR="${CODEX_ROUTER_DIR:-$HOME/.local/share/codex-router}"
FOUND=0

[ -d "$ROUTER_DIR" ] && { echo "GEFUNDEN: Checkout unter $ROUTER_DIR"; FOUND=1; }
[ -d "$HOME/.codex/codex-router" ] && { echo "GEFUNDEN: Router-State unter $HOME/.codex/codex-router"; FOUND=1; }
grep -q "BEGIN codex-router-managed" "$HOME/.codex/config.toml" 2>/dev/null \
  && { echo "GEFUNDEN: verwalteter Block in $HOME/.codex/config.toml"; FOUND=1; }
grep -q "BEGIN kimi-codex-router-managed" "$HOME/.codex/config.toml" 2>/dev/null \
  && { echo "GEFUNDEN: verwalteter Block einer ÄLTEREN Router-Version"; FOUND=1; }
ls "$HOME/Library/LaunchAgents/io.github.codex-router.plist" >/dev/null 2>&1 \
  && { echo "GEFUNDEN: LaunchAgent io.github.codex-router"; FOUND=1; }

echo "---"
[ "$FOUND" -eq 1 ] && echo "BESTAND VORHANDEN — Weiche unten, NICHT einfach weitermachen." \
                   || echo "Kein Bestand. Normale Neuinstallation."
```

Ist Bestand da, erhebe zusätzlich den **konfigurierten Port** — den brauchst du für die Port-Falle:

```bash
sed -n 's#.*openai_base_url *= *"http://\([0-9.]*\):\([0-9][0-9]*\)/.*#\1:\2#p' \
  "$HOME/.codex/config.toml" 2>/dev/null
```

> **Nur diesen `sed`-Befehl benutzen, kein `grep openai_base_url`.** Die vollständige Zeile enthält ein Geheimnis (ein Token im Pfad). Der Befehl oben gibt ausschließlich `host:port` aus. Zeig dem Nutzer nie die ganze Zeile und schreib sie in keine Datei und in kein Log.

### 0b — Die Weiche (nur der Nutzer entscheidet)

Wurde Bestand gefunden: **STOPP.** Installiere nichts, klone nichts, ändere nichts. Zeig dem Nutzer die Rohbefunde von oben und diese drei Möglichkeiten. Sag ihm ausdrücklich, dass (a) empfohlen ist:

**(a) Bestehende Installation unangetastet lassen — EMPFEHLUNG und Standard.**
Nur die Brücke und die Skills werden installiert. Konkret:
- Module 01, 02 und 06 laufen normal.
- **Modul 03 und 04 werden komplett übersprungen.** Kein `git clone`, kein `checkout`, kein `bin/install`, keine `.env`, keine Provider-Änderung.
- **Modul 05 nur lesend**: `picker status` anschauen ist in Ordnung; nichts kuratieren, keinen Sync einrichten, keine LaunchAgents laden.
- `existingInstall` auf `"preserved"` setzen.

Das ist fast immer richtig: Wer schon einen Router hat, hat den Picker bereits. Was ihm fehlt, ist die Brücke — und die berührt den Router nicht.

**(b) Bestehende Installation aktualisieren — nur für Leute, die wissen, was sie tun.**
Erst nach **ausdrücklicher Bestätigung des Nutzers in Worten**. Ein „ja" auf eine andere Frage zählt nicht; frag klar: „Soll ich deine bestehende Router-Installation verändern? Das kann laufende Codex-Sessions unterbrechen." Warte auf ein eindeutiges Ja.

Danach **zuerst vollständig sichern**, bevor du irgendetwas anfasst:

```bash
STAMP="$(date +%Y%m%d-%H%M%S)"
SAFE="$HOME/.config/bridge-picker/pre-upgrade-$STAMP"
mkdir -p "$SAFE"

# 1. Checkout-Zustand als Branch festhalten (verliert nichts, auch bei lokalen Änderungen)
git -C "$ROUTER_DIR" status --porcelain
git -C "$ROUTER_DIR" rev-parse --abbrev-ref HEAD
git -C "$ROUTER_DIR" branch "backup/pre-bridge-picker-$STAMP"

# 2. Konfiguration, Umgebungsdatei und State kopieren
cp "$HOME/.codex/config.toml" "$SAFE/config.toml" 2>/dev/null
cp "$ROUTER_DIR/.env" "$SAFE/router.env" 2>/dev/null
cp -R "$HOME/.codex/codex-router" "$SAFE/state" 2>/dev/null
cp "$HOME/Library/LaunchAgents/io.github.codex-router.plist" "$SAFE/" 2>/dev/null

echo "Sicherung: $SAFE"
ls -la "$SAFE"
```

Nenne dem Nutzer den Pfad **und den Rückweg**, bevor du weitermachst:

```bash
# Rückweg nach einem missglückten Upgrade:
cp "$SAFE/config.toml" "$HOME/.codex/config.toml"
cp "$SAFE/router.env" "$ROUTER_DIR/.env"          # nur, falls vorher eine existierte
git -C "$ROUTER_DIR" checkout "backup/pre-bridge-picker-$STAMP"
cd "$ROUTER_DIR" && npm ci && node src/service.mjs restart
# Danach Codex komplett beenden und neu öffnen.
```

Erst dann Modul 03 — und dort den Abschnitt „Bestandsfall" beachten. `existingInstall` auf `"upgraded-with-consent"` setzen.

**(c) Abbruch.** Völlig legitim. Nichts wurde geändert, der Nutzer kann sich in Ruhe entscheiden.

**Kein stillschweigendes Weitermachen.** Wählt der Nutzer nicht, gilt (a). Rate nie, was er gemeint haben könnte, und leg die Entscheidung nie in eine Nebenbemerkung — sie gehört als eigene Frage gestellt und als eigene Antwort beantwortet.

## Schritt 1 — Interview (nur fragen, was nötig ist)

1. **Was willst du einrichten?**
   - **A) Nur die Brücke** — andere Abos per Slash-Command aufrufen (leichtgewichtig, ~10 Min, kein Router)
   - **B) Nur den Picker** — zusätzliche Modelle in ChatGPT Work/Codex
   - **C) Beides**
2. **Welche Abos hast du?** ChatGPT (mit Codex) / Claude / Google Gemini — Mehrfachauswahl.

   **Zu Gemini gleich dazusagen (Stand 2026-08):** Der Login im `gemini`-CLI ist für **private Google-Konten blockiert** — Google hat den Zugang für Einzelnutzer über diesen Weg abgeschaltet. Gemini bleibt trotzdem nutzbar: über Googles Nachfolger **Antigravity** (`agy`), der headless funktioniert. Nennt der Nutzer Gemini, sag ihm das **jetzt**, nicht erst wenn Modul 01 damit scheitert. Die drei Wege stehen in `modules/01-cli-check.md`; und falls keiner passt, ist die Brücke mit Claude und Codex trotzdem vollständig.
3. Nur bei B/C: **Welche Modellquelle für den Picker?**
   - OpenCode Go (~10 $/Monat flat, empfohlen — Subscriptions vor APIs!) — ggf. mehrere Keys für Rotation
   - OpenRouter Free (kostenlos, aber geteilte Kapazität, oft ausgelastet)
   - Beides
4. Nur bei B/C mit OpenCode: Hinweis geben, dass der Nutzer die Subscription VOR der Installation im Browser abschließen muss (sonst scheitert später alles mit einem irreführenden 429). Warten, bis er „erledigt" sagt.

Schreibe die Antworten nach `install-state.json` unter `interview`.

## Schritt 2 — Module ausführen

**Vor jedem Modul: sag dem Nutzer in ein bis zwei einfachen Sätzen, was jetzt passiert und warum.** Ohne Fachjargon, ohne Dateinamen, ohne Flags — als würdest du es jemandem erklären, der nur wissen will, was mit seinem Rechner geschieht. Beispiel statt „Modul 03 installiert den codex-router auf Commit bc0ca25": „Jetzt richte ich ein kleines Programm ein, das im Hintergrund läuft und entscheidet, welcher Anbieter deine Anfrage bekommt. Deine GPT-Modelle laufen weiter wie bisher." Am Ende des Moduls in einem Satz sagen, was jetzt anders ist.

Reihenfolge und Zuordnung (jedes Modul ist eigenständig; überspringe, was laut Interview nicht gewählt ist):

| Modul | Wann | Inhalt |
|---|---|---|
| `modules/01-cli-check.md` | immer | Vorhandene CLIs erkennen, fehlende benennen, Logins durch den Nutzer, je ein Pong-Test |
| `modules/02-bruecke.md` | A oder C | Slash-Command-Skills aus `skills/` in die vorhandenen Apps kopieren und anpassen |
| `modules/03-router.md` | B oder C | codex-router installieren: gepinnter Commit, Prüfbefunde, `patches/` anwenden, Dienst einrichten |
| `modules/04-provider.md` | B oder C | OpenCode- und/oder OpenRouter-Provider anbinden, Keys aus Nutzer-Dateien, Modelle kuratieren |
| `modules/05-picker-pflege.md` | B oder C | Picker aufräumen (SOTA + gratis), Verbrauchslabels, **Modell-Sync**, Key-Rotation + Watchdog aus `tools/` |
| `modules/06-handoff.md` | A oder C | `/handoff`: langen Chat verdichten und an ein neues Gespräch übergeben |

**Bei `existingInstall: "preserved"` sind 03 und 04 gesperrt** und 05 ist nur lesend — unabhängig davon, was das Interview ergeben hat. Sag dem Nutzer in einem Satz, warum: Er hat den Picker bereits, und ein zweiter Installationslauf würde seine funktionierende Einrichtung anfassen.

**Modul 06 auch bei B anbieten.** Es gehört formal zum Brücken-Pfad, ist aber unabhängig davon nützlich — gerade wer den Picker hat, braucht es: Ein Modellwechsel mitten im Gespräch scheitert an der Verdichtungsfalle, und `/handoff` ist der saubere Ausweg. Bei Interview-Antwort B fragst du den Nutzer, ob er es trotzdem will, statt es stillschweigend zu überspringen.

## Schritt 3 — Abnahme

1. Pro eingerichtetem Baustein einen echten Testlauf („Antworte mit genau einem Wort: pong") und die Ausgabe zeigen.
2. Bei B/C: Modellliste zeigen (`codex debug models` bzw. App-Picker nach Neustart) und den Nutzer bestätigen lassen, dass die erwarteten Modelle sichtbar sind.
3. `install-state.json` final auf `done` setzen, mit Datum und Versionsständen.
4. Dem Nutzer eine kompakte Übersicht geben: was wurde installiert, wo liegt was, wie deinstalliert man es wieder (jedes Modul hat einen Rückweg-Abschnitt), und die drei wichtigsten Fehlerbilder aus `LEARNINGS.md`.

## Wenn es nicht lösbar ist — Report vorbereiten

Erst wenn Grundregel 8 (nachschlagen, Rückweg, ein sauberer zweiter Versuch) nichts gebracht hat. Dann schreibst **du** dem Nutzer den fertigen Report — er soll ihn nur noch abschicken.

Bevorzugt als GitHub-Issue im Repo (Pull Requests genauso willkommen). Hat der Nutzer kein GitHub-Konto: dieselben Angaben per E-Mail an **info@ainauten.com**.

Diese Punkte gehören hinein — sammle sie mechanisch, rate nichts:

- [ ] Modul und Schritt, an dem es hängt (z. B. „03-router, Schritt 6")
- [ ] Die **exakte** Fehlermeldung, wörtlich kopiert statt zusammengefasst
- [ ] Auszug aus `install-state.json` — der betroffene Schritt genügt
- [ ] Betriebssystem und Version, plus `node --version`
- [ ] Router-Commit, falls installiert: `git -C "$ROUTER_DIR" log --oneline -1`
- [ ] Was schon versucht wurde (die Schritte aus Grundregel 8, mit Ergebnis)
- [ ] Was du erwartet hast und was stattdessen passiert ist

**Vor dem Abschicken selbst prüfen:** keine API-Keys, Tokens, Passwörter, keine Inhalte von `*.secret`-Dateien im Report. Logs enthalten manchmal Keys — ersetze sie durch `[REDACTED]`. Sag dem Nutzer ausdrücklich, dass du das geprüft hast. Ein Report ohne Key ist verwertbar; ein Key in einem öffentlichen Issue ist ein Sicherheitsvorfall.

## install-state.json — Schema

```json
{
  "version": 1,
  "startedAt": "ISO-Datum",
  "agent": "claude-code | codex | anderes",
  "interview": { "scope": "A|B|C", "abos": ["chatgpt","claude","gemini"], "picker": ["opencode","openrouter"] },
  "existingInstall": "none | preserved | upgraded-with-consent",
  "steps": {
    "01-cli-check": { "status": "done|in_progress|skipped|failed", "receipt": "Kurzbeleg", "at": "ISO" },
    "02-bruecke": { "status": "…" },
    "03-router": { "status": "…", "pinnedCommit": "…" },
    "04-provider": { "status": "…" },
    "05-picker-pflege": { "status": "…" },
    "06-handoff": { "status": "…" }
  },
  "notes": ["freier Text für Übergaben zwischen Agenten/Modellen"]
}
```

Ein Schritt gilt erst als `done`, wenn sein Beleg (Testlauf/Readback) erbracht wurde — nicht, wenn die Befehle nur ausgeführt wurden.

`existingInstall` schreibst du **direkt nach Schritt 0**, bevor irgendein Modul startet:

| Wert | Bedeutung |
|---|---|
| `none` | Kein Bestand gefunden. Normale Neuinstallation, alle Module frei |
| `preserved` | Bestand gefunden, Nutzer hat (a) gewählt. **Module 03 und 04 sind gesperrt**, Modul 05 nur lesend |
| `upgraded-with-consent` | Bestand gefunden, Nutzer hat (b) ausdrücklich bestätigt **und** die Sicherung liegt vor. Pfad zur Sicherung gehört in `notes` |

Steht dort `preserved`, führt kein späterer Schritt und keine spätere Rückfrage zu einer Router-Änderung. Auch nicht, wenn der Nutzer beiläufig „mach ruhig" sagt — dann gehst du zurück zur Weiche und lässt ihn (b) bewusst wählen.
