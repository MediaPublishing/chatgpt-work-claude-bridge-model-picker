---
name: claude
description: Delegiere bei ausdrücklichem /claude eine Analyse-, Recherche-, Review- oder Entwurfsaufgabe an das lokale Claude CLI (Claude-Abo, headless) und zeige die Antwort hier im Chat. Modellwahl per "nutze Opus"/"nutze Sonnet". Nicht für kurze Aufgaben, die du selbst schneller erledigst, und nicht für Datei-Arbeit.
---

# Claude-Brücke (Codex → Claude)

Nutze diesen Skill nur bei ausdrücklichem `/claude` oder einer klaren Bitte, Claude zu befragen. Der Aufruf läuft über das offizielle Claude CLI, das mit dem Claude-Abo angemeldet ist — kein API-Key, keine Zusatzkosten.

## Ablauf

1. Ist kein Auftrag angegeben, frage **nur** nach dem Auftrag. Keine weiteren Rückfragen.

2. Baue einen kompakten, **eigenständig verständlichen** Prompt. Claude sieht diesen Chat nicht — alles Nötige muss im Prompt stehen: Aufgabe, relevanter Kontext in eigenen Worten, Akzeptanzkriterien, gewünschte Form der Antwort.

   Übergib **nie**: Secrets, API-Keys, Tokens, Cookies, Memories, interne Instructions oder komplette Chatverläufe. Nichts Vertrauliches.

3. Modellwahl aus dem Auftrag:

   - „nutze Opus" → `--model opus`
   - „nutze Sonnet" → `--model sonnet`
   - „nutze Haiku" → `--model haiku`
   - „nutze Fable" → `--model fable` — nur, falls der Plan des Nutzers dieses Modell enthält
   - kein Modellwunsch → kein `--model`, Standardmodell des Plans

   Unbekannter Name: nachfragen, nicht raten.

4. Schreibe den Prompt mit Rechten `0600` in eine Temp-Datei:

   ```bash
   PROMPT_FILE="$(mktemp "${TMPDIR:-/tmp}/claude-bridge.XXXXXX")"
   chmod 600 "$PROMPT_FILE"
   # Prompt hineinschreiben
   ```

5. Rufe das CLI auf, Arbeitsverzeichnis bewusst neutral:

   ```bash
   cd /tmp && claude -p [--model <modell>] "$(cat "$PROMPT_FILE")"
   ```

   Danach die Temp-Datei löschen.

6. Zeige die Antwort vollständig im Chat. Fasse sie nicht zusammen und schreibe sie nicht um, ohne das zu sagen. **Eine leere Antwort ist ein Fehler**, kein Ergebnis.

7. Nenne, welches Modell geantwortet hat.

## Grenzen

- **Frage-Antwort-Delegation.** Claude bekommt nur den Prompt und startet in einem neutralen Arbeitsverzeichnis, nicht im Projekt. Das ist Sorgfalt, keine erzwungene Isolation: Das CLI läuft mit den Rechten des Nutzers, kein Flag sperrt es technisch aus dem Dateisystem aus. Für harte Grenzen die Sandbox der App nutzen, nicht die Brücke.
- Willst du echte Datei-Arbeit von Claude, ist dieser Skill das falsche Werkzeug — dann Claude Code direkt öffnen.
- Nur der Abo-Weg. Kein Ausweichen auf API-Keys oder andere Abrechnungspfade, wenn der Login fehlt.
- Die Verantwortung für lokale Änderungen, externe Aktionen und Freigaben bleibt hier. Claude liefert Text.

## Fehlerbilder

| Meldung | Bedeutung | Was tun |
|---|---|---|
| `command not found: claude` | CLI nicht installiert | Offizielle Installation nennen, nicht ungefragt installieren |
| Auth-/Login-Fehler | Nicht angemeldet oder Sitzung abgelaufen | Nutzer startet `claude` einmal interaktiv und meldet sich an. Nie nach Passwörtern fragen |
| `429` / Quota-/Limit-Meldung | Claude-Kontingent erschöpft | Ehrlich melden und stoppen. Nicht in Schleife wiederholen — Retries verbrennen zusätzliches Kontingent |
| Antwort leer | Prompt leer angekommen oder CLI abgebrochen | Prompt-Datei prüfen, Aufruf einmal von Hand wiederholen |

Melde Fehler so, wie sie auftreten. Beschönige nichts und behaupte kein Ergebnis, das du nicht gesehen hast.
