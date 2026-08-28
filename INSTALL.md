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
