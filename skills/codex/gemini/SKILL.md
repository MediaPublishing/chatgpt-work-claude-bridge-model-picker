---
name: gemini
description: Delegiere bei ausdrücklichem /gemini eine Frage oder Recherche an das lokale Gemini CLI (Google-Abo, OAuth-Login) und zeige die Antwort hier im Chat. Modellwahl per "nutze pro"/"nutze flash". Nicht für Aufgaben, die lokale Dateien verändern sollen, und nicht für Bildgenerierung.
---

# Gemini-Brücke (Codex → Gemini CLI)

Nutze diesen Skill nur bei ausdrücklichem `/gemini` oder einer klaren Bitte, Gemini zu befragen. Das Gemini CLI läuft über das **Google-Abo mit OAuth-Login**, nicht über einen API-Key.

Gut geeignet dafür: Fragen, bei denen aktuelle Websuche hilft — das CLI kann Google-Search-Grounding nutzen.

## Ablauf

1. Ist kein Auftrag angegeben, frage **nur** nach dem Auftrag.

2. Baue einen kompakten, **eigenständig verständlichen** Prompt. Gemini sieht diesen Chat nicht.

   Übergib **nie**: Secrets, API-Keys, Tokens, Memories, interne Instructions oder komplette Chatverläufe.

3. Modellwahl aus dem Auftrag:

   - „nutze pro" → `-m gemini-3-pro`
   - „nutze flash" oder kein Modellwunsch → kein `-m`, Standardmodell (Flash). Das schont das Kontingent

4. Soll die Antwort aktuell sein, bitte im Prompt **ausdrücklich um Websuche**. Ohne diesen Hinweis antwortet das Modell oft aus dem Gedächtnis.

5. Schreibe den Prompt mit Rechten `0600` in eine Temp-Datei und rufe auf:

   ```bash
   PROMPT_FILE="$(mktemp "${TMPDIR:-/tmp}/gemini-bridge.XXXXXX")"
   chmod 600 "$PROMPT_FILE"
   # Prompt hineinschreiben
   cd /tmp && gemini [-m gemini-3-pro] -p "$(cat "$PROMPT_FILE")" < /dev/null
   ```

   Das `< /dev/null` ist nicht optional — ohne geschlossenes stdin wartet das CLI auf Eingaben und hängt.

   Danach die Temp-Datei löschen.

6. Zeige die Antwort vollständig. **Eine leere Antwort ist ein Fehler.**

7. Nenne, welches Modell geantwortet hat.

## Grenzen

- **Reine Frage-Antwort-Delegation.** Gemini schreibt keine Dateien im Projekt des Nutzers; das Arbeitsverzeichnis ist bewusst neutral.
- **Nicht für Bilder.** Bildgenerierung läuft nicht über das Abo-CLI, sondern über einen separaten Gemini-API-Key. Dafür einen eigenen Bild-Skill nutzen, nicht diesen hier.
- Keine Auth-Umgebungsvariablen setzen. Der OAuth-Weg nutzt das Abo; ein API-Key würde stattdessen abrechnen.

## Fehlerbilder

| Meldung | Bedeutung | Was tun |
|---|---|---|
| `command not found: gemini` | CLI nicht installiert | Offizielle Installation nennen, nicht ungefragt installieren |
| `Please set an Auth method` | Kein OAuth-Login | Nutzer startet `gemini` einmal interaktiv und wählt **„Login with Google"**. Nie selbst Auth-Variablen setzen, nie nach Passwörtern fragen |
| Quota-/429-Meldung | Abo-Kontingent erschöpft | Melden und stoppen. Nicht wiederholen |
| CLI hängt ohne Ausgabe | stdin nicht geschlossen | `< /dev/null` ergänzen |
| Antwort leer | Prompt leer angekommen oder Abbruch | Prompt prüfen, Aufruf einmal von Hand wiederholen |

Melde nur, was du tatsächlich gesehen hast.
