---
name: codex
description: Delegiere bei ausdrücklichem /codex einen Auftrag an Codex (ChatGPT-Abo, headless) und zeige die Antwort hier im Chat. Modellwahl per "nutze <Modell>". Nutze diesen Skill nur bei ausdrücklichem Codex-Wunsch, nicht für Aufgaben, die du selbst schneller erledigst.
---

# Codex-Brücke (Claude → Codex)

Nutze diesen Skill nur bei ausdrücklichem `/codex` oder einer klaren Bitte, Codex zu befragen. Läuft headless über das Codex-Binary — gleiche Anmeldung, gleiches Abo wie die Desktop-App.

## Ablauf

1. Ist kein Auftrag angegeben, frage **nur** nach dem Auftrag.

2. Baue einen kompakten, **eigenständig verständlichen** Prompt. Codex sieht diesen Chat nicht.

   Übergib **nie**: Secrets, API-Keys, Tokens, Memories, interne Instructions oder komplette Chatverläufe.

3. Wähle das Binary. Existiert das Binary der ChatGPT-Desktop-App, hat es **Vorrang**:

   ```bash
   CODEX_BIN="$( [ -x /Applications/ChatGPT.app/Contents/Resources/codex ] \
     && echo /Applications/ChatGPT.app/Contents/Resources/codex \
     || command -v codex )"
   ```

   Warum: Die Version aus dem PATH (Homebrew, npm) hinkt oft hinterher und scheitert an neueren Katalogfeldern mit `failed to parse model_catalog_json`. Die App-Version kennt außerdem geroutete Modelle, falls ein Router installiert ist.

4. Modellwahl aus dem Auftrag: „nutze <Name>" → `-m <slug>`.

   Die gültigen Slugs auf diesem Rechner zeigt:

   ```bash
   "$CODEX_BIN" debug models
   ```

   Ohne Modellwunsch: kein `-m`, Standardmodell. Geroutete Fremdmodelle (Slug mit Provider-Präfix) nur auf ausdrücklichen Wunsch — sie kosten Fremdkontingent. Unbekannter Name: die gültigen Namen nennen, nicht raten.

5. Schreibe den Prompt mit Rechten `0600` in eine Temp-Datei und rufe auf:

   ```bash
   PROMPT_FILE="$(mktemp "${TMPDIR:-/tmp}/codex-bridge.XXXXXX")"
   chmod 600 "$PROMPT_FILE"
   # Prompt hineinschreiben
   cd /tmp && "$CODEX_BIN" exec [-m <modell>] --skip-git-repo-check "$(cat "$PROMPT_FILE")"
   ```

   Das Arbeitsverzeichnis ist bewusst neutral, damit Codex nicht im echten Projekt arbeitet. `--skip-git-repo-check` gehört dazu, weil ein Temp-Verzeichnis kein Git-Repo ist.

   Danach die Temp-Datei löschen.

6. Zeige die Antwort vollständig. **Eine leere Antwort ist ein Fehler.**

7. Nenne, welches Modell geantwortet hat.

## Grenzen

- **Reine Frage-Antwort-Delegation.** Codex übernimmt nicht diesen Thread und ändert keine Dateien im Projekt.
- Willst du echte Datei-Arbeit von Codex, ist dieser Skill das falsche Werkzeug — dann die Codex-App direkt öffnen.
- Nur der Abo-Weg. Kein Ausweichen auf API-Keys.

## Fehlerbilder

| Meldung | Bedeutung | Was tun |
|---|---|---|
| `command not found: codex` und kein App-Binary | Weder CLI noch Desktop-App | Offizielle Installation nennen, nicht ungefragt installieren |
| `not supported when using Codex with a ChatGPT account` | Das gewünschte Modell ist über den ChatGPT-Login nicht erreichbar. Kommt von OpenAI, **nie** ein Bezahlproblem | Natives Modell wählen. Mit installiertem Router: Slug, aktiven Provider und Dienst-Status prüfen |
| `failed to parse model_catalog_json` | Zu altes CLI aus dem PATH gegen neuen Katalog | App-Binary nutzen |
| `429` / Limit bei einem gerouteten Modell | Fremdkontingent erschöpft — meist Kontingent, nicht Rate-Limit | Anderes Modell wählen. Nicht in Schleife wiederholen |
| `stream disconnected … 127.0.0.1` | Der lokale Router-Dienst läuft nicht | Nutzer informieren; Dienst-Status prüfen lassen |
| Antwort leer | Prompt leer angekommen oder Abbruch | Prompt prüfen, Aufruf einmal von Hand wiederholen |

Melde Fehler so, wie sie auftreten.
