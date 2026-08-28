---
name: gemini
description: Delegiere bei ausdrücklichem /gemini eine Frage oder Recherche an Googles CLI — bevorzugt Antigravity (agy), ersatzweise das Gemini CLI — und zeige die Antwort hier im Chat. Modellwahl per "nutze pro"/"nutze flash". Nicht für Aufgaben, die lokale Dateien verändern sollen, und nicht für Bildgenerierung.
---

# Gemini-Brücke (Codex → Googles CLI)

Nutze diesen Skill nur bei ausdrücklichem `/gemini` oder einer klaren Bitte, Gemini zu befragen.

Gut geeignet dafür: Fragen, bei denen aktuelle Websuche hilft — Googles CLIs können Search-Grounding nutzen.

## Zwei mögliche Backends

Es gibt zwei Wege zu Gemini, und welcher auf diesem Rechner funktioniert, hängt vom Google-Konto ab. **Prüfe in dieser Reihenfolge, einmal pro Sitzung:**

```bash
command -v agy    >/dev/null 2>&1 && echo "agy vorhanden"    || echo "kein agy"
command -v gemini >/dev/null 2>&1 && echo "gemini vorhanden" || echo "kein gemini"
```

1. **`agy` (Antigravity)** — der Weg, der bei privaten Einzelkonten funktioniert. Wenn vorhanden: nimm diesen.
2. **`gemini`** — funktioniert bei Workspace-/Business-Konten oder wenn der Nutzer den API-Key-Modus eingerichtet hat.

Ist keines von beiden nutzbar, sag das und schlag Claude oder Codex vor. Rate nicht herum und probiere nicht beide Backends nacheinander durch, wenn das erste mit einem Auth-Fehler abbricht — das ist kein Verbindungsproblem, sondern eine Kontofrage.

## Ablauf

1. Ist kein Auftrag angegeben, frage **nur** nach dem Auftrag.

2. Baue einen kompakten, **eigenständig verständlichen** Prompt. Gemini sieht diesen Chat nicht.

   Übergib **nie**: Secrets, API-Keys, Tokens, Memories, interne Instructions oder komplette Chatverläufe.

3. Soll die Antwort aktuell sein, bitte im Prompt **ausdrücklich um Websuche**. Ohne diesen Hinweis antwortet das Modell oft aus dem Gedächtnis.

4. Prompt mit Rechten `0600` in eine Temp-Datei schreiben, dann das passende Backend aufrufen.

### Backend A — Antigravity (`agy`), bevorzugt

```bash
PROMPT_FILE="$(mktemp "${TMPDIR:-/tmp}/gemini-bridge.XXXXXX")"
chmod 600 "$PROMPT_FILE"
# Prompt hineinschreiben
cd /tmp && agy --print "$(cat "$PROMPT_FILE")"
```

Modellwahl: `--model <slug>`. **Gültige Slugs zeigt `agy models`** — frag das ab, statt einen Namen zu raten. Die Slugs tragen die Denkstufe oft schon im Namen (etwa `…-flash-low`, `…-pro-high`); zusätzlich gibt es `--effort low|medium|high`.

- „nutze pro" → ein Pro-Slug aus `agy models`
- „nutze flash" oder kein Modellwunsch → kein `--model`, Standardmodell. Das schont das Kontingent

### Backend B — Gemini CLI (`gemini`)

```bash
PROMPT_FILE="$(mktemp "${TMPDIR:-/tmp}/gemini-bridge.XXXXXX")"
chmod 600 "$PROMPT_FILE"
# Prompt hineinschreiben
cd /tmp && gemini [-m <modell>] -p "$(cat "$PROMPT_FILE")" < /dev/null
```

Das `< /dev/null` ist hier nicht optional — ohne geschlossenes stdin wartet das CLI auf Eingaben und hängt. `agy --print` braucht das nicht.

5. Temp-Datei löschen.

6. Zeige die Antwort vollständig. **Eine leere Antwort ist ein Fehler.**

7. Nenne, **welches Backend und welches Modell** geantwortet hat. Das ist keine Formalie: Die zwei Wege haben unterschiedliche Kontingente und unterschiedliche Abrechnung.

## Grenzen

- **Frage-Antwort-Delegation.** Gemini bekommt nur den Prompt; das Arbeitsverzeichnis ist bewusst neutral, nicht das Projekt. Das ist Sorgfalt, keine erzwungene Isolation: Das CLI läuft mit den Rechten des Nutzers. Für harte Grenzen die Sandbox der App nutzen, nicht die Brücke.
- **Nicht für Bilder.** Bildgenerierung läuft nicht über diesen Weg. Dafür einen eigenen Bild-Skill nutzen, nicht diesen hier.
- **Keine Auth-Umgebungsvariablen setzen**, um einen Fehler zu umgehen. Welcher Weg gilt, entscheidet der Nutzer — siehe `modules/01-cli-check.md`.
- Läuft `gemini` im **API-Key-Modus**, wird nicht über ein Abo abgerechnet. Im Free-Tier ist das kostenlos, aber Eingaben dürfen fürs Modelltraining genutzt werden: nichts Vertrauliches durch diese Brücke schicken.

## Fehlerbilder

| Meldung | Bedeutung | Was tun |
|---|---|---|
| `command not found: agy` und `command not found: gemini` | Kein Google-CLI installiert | Offizielle Installation nennen, nicht ungefragt installieren |
| `IneligibleTierError: This client is no longer supported for Gemini Code Assist for individuals` | **Kein lokaler Fehler.** Google hat den Zugang für private Einzelkonten über das `gemini`-CLI abgeschaltet (Stand 2026-08) | Nicht wiederholen, es hilft nie. Auf `agy` wechseln, falls vorhanden; sonst dem Nutzer die Wege aus `modules/01-cli-check.md` nennen |
| `Please set an Auth method` (gemini) | Kein Login eingerichtet | Nutzer startet `gemini` einmal interaktiv und wählt einen Auth-Weg. Nie selbst Auth-Variablen setzen, nie nach Passwörtern fragen |
| Auth-/Login-Fehler bei `agy` | Antigravity-App nicht angemeldet | Nutzer meldet sich **in der Antigravity-App** mit seinem Google-Konto an. Das CLI übernimmt die Anmeldung |
| Unbekannter Modellname bei `agy` | Slug geraten statt abgefragt | `agy models` aufrufen und einen gültigen Slug nennen, statt still auf etwas anderes auszuweichen |
| Quota-/429-Meldung | Kontingent erschöpft | Melden und stoppen. Nicht wiederholen |
| CLI hängt ohne Ausgabe | Bei `gemini`: stdin nicht geschlossen | `< /dev/null` ergänzen |
| Antwort leer | Prompt leer angekommen oder Abbruch | Prompt prüfen, Aufruf einmal von Hand wiederholen |

Melde nur, was du tatsächlich gesehen hast.
