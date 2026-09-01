# Modul 02 — Die Brücke: andere Abos per Slash-Command aufrufen

**Wann:** bei Interview-Antwort A oder C.
**Ziel:** Aus der App, in der du gerade arbeitest, lässt sich per `/claude`, `/codex` oder `/gemini` ein Auftrag an einen anderen Dienst schicken — Antwort landet im selben Chat.
**Beleg am Ende:** je installierter Brücke ein echter Testlauf mit „pong".

## Das Prinzip in zwei Sätzen

Jede Desktop-Agent-App darf Shell-Befehle ausführen. Jeder Anbieter liefert ein offizielles CLI, das sich mit dem **Abo** anmeldet und headless eine Frage beantwortet. Die Brücke ist deshalb nur ein kleiner Skill, der den Auftrag in einen sauberen Prompt packt, das CLI aufruft und die Antwort zeigt.

Kein Web-Wrapper, keine UI-Automation, kein inoffizieller Proxy. Das ist keine Bequemlichkeit, sondern die Bedingung: Abo-Logins in Dritt-Tools riskieren Kontosperren.

## Wichtig: was eine Brücke ist — und was nicht

- **Frage-Antwort-Delegation.** Das fremde Modell bekommt einen eigenständigen Prompt und gibt Text zurück. Fertig.
- **Keine beabsichtigte Dateiübergabe.** Der Aufruf startet in einem neutralen Arbeitsverzeichnis (`/tmp`), nicht in deinem Projekt, und übergeben wird nur der Prompt. Das fremde Modell übernimmt nicht deinen Thread und bekommt dein Projekt nicht gezeigt.

  **Das ist Sorgfalt, keine erzwungene Isolation.** Die CLIs laufen mit deinen Benutzerrechten; kein Flag hier sperrt sie technisch aus deinem Dateisystem aus. Ein fremdes Modell, das Werkzeuge benutzen darf, *könnte* vom Arbeitsverzeichnis aus weiterlaufen. Wer harte Grenzen braucht — fremder Code, Kundendaten, alles Vertrauliche — verlässt sich nicht auf die Brücke, sondern auf die Sandbox-Mechanismen der jeweiligen App.
- **Kein Kontext-Dump.** Übergeben wird ein kompakter, für sich verständlicher Prompt — keine Secrets, keine API-Keys, keine Memories, keine internen Instructions, keine kompletten Chatverläufe.
- Willst du echte Datei-Arbeit von einem anderen Modell, ist die Brücke das falsche Werkzeug. Dann öffnest du die andere App.

## Schritt 1 — Ist-Zustand prüfen

Installiere nur Brücken zu Diensten, für die laut Modul 01 ein **angemeldetes CLI** existiert. Eine Brücke zu einem CLI ohne Abo ist ein garantierter Fehlschlag.

Zielverzeichnisse (beide existieren nur, wenn die jeweilige App installiert ist):

```bash
ls -d "$HOME/.codex/skills"  2>/dev/null || echo "kein Codex-Skill-Verzeichnis"
ls -d "$HOME/.claude/skills" 2>/dev/null || echo "kein Claude-Skill-Verzeichnis"
```

Prüfe, was schon da ist, bevor du irgendetwas kopierst:

```bash
for d in "$HOME/.codex/skills/claude" "$HOME/.codex/skills/gemini" \
         "$HOME/.claude/skills/codex" "$HOME/.claude/skills/gemini"; do
  if [ -L "$d" ]; then echo "$d: SYMLINK — nicht anfassen"
  elif [ -d "$d" ]; then echo "$d: existiert bereits"
  else echo "$d: frei"
  fi
done
```

**Symlinks nie überschreiben.** Zeigt ein Zielpfad auf ein anderes Verzeichnis, verwaltet der Nutzer diesen Skill selbst. Melde das und lass die Finger davon.

## Schritt 2 — Vorhandenes sichern

Existiert ein Zielverzeichnis bereits als echtes Verzeichnis, lege vor dem Überschreiben eine zeitgestempelte Kopie an:

```bash
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$HOME/.config/bridge-picker/backups/$STAMP"
mkdir -p "$BACKUP"
cp -R "$HOME/.codex/skills/claude" "$BACKUP/codex-claude" 2>/dev/null || true
echo "Backup: $BACKUP"
```

Nenne dem Nutzer den Backup-Pfad. Er gehört in den Beleg.

## Schritt 3 — Skills kopieren

Aus diesem Repo, jeweils **nur für Dienste, die der Nutzer wirklich hat**:

| Quelle im Repo | Ziel | Ergibt |
|---|---|---|
| `skills/codex/claude/` | `$HOME/.codex/skills/claude/` | `/claude` in ChatGPT Work/Codex |
| `skills/codex/gemini/` | `$HOME/.codex/skills/gemini/` | `/gemini` in ChatGPT Work/Codex |
| `skills/claude/codex/` | `$HOME/.claude/skills/codex/` | `/codex` in Claude Cowork/Code |
| `skills/claude/gemini/` | `$HOME/.claude/skills/gemini/` | `/gemini` in Claude Cowork/Code |

Den Skill für die eigene App gibt es nicht — Codex braucht kein `/codex`.

```bash
REPO="$(pwd)"   # Wurzel dieses Repos

install_skill() {   # $1 = Quelle im Repo, $2 = Zielverzeichnis
  if [ -L "$2" ]; then echo "ÜBERSPRUNGEN (Symlink): $2"; return 0; fi
  mkdir -p "$2"
  cp -R "$1/." "$2/"      # der Punkt ist wichtig, siehe unten
  echo "Installiert: $2"
}

install_skill "$REPO/skills/codex/claude"  "$HOME/.codex/skills/claude"
install_skill "$REPO/skills/codex/gemini"  "$HOME/.codex/skills/gemini"
install_skill "$REPO/skills/claude/codex"  "$HOME/.claude/skills/codex"
install_skill "$REPO/skills/claude/gemini" "$HOME/.claude/skills/gemini"
```

**Warum `cp -R "$1/." "$2/"` und nicht `cp -R "$1" "$2"`:** Die zweite Form ist nicht wiederholbar. Beim ersten Lauf legt sie das Zielverzeichnis an, beim zweiten kopiert sie die Quelle **in** das bestehende Ziel hinein — und du hast `~/.codex/skills/claude/claude/SKILL.md`. Der Slash-Command verschwindet dann scheinbar grundlos. Mit `/.` kopierst du den Inhalt, und ein zweiter Lauf überschreibt einfach.

Führe nur die Zeilen aus, die zum Interview passen. Danach Readback:

```bash
head -5 "$HOME/.codex/skills/claude/SKILL.md" 2>/dev/null
head -5 "$HOME/.claude/skills/codex/SKILL.md" 2>/dev/null
```

## Schritt 4 — Codex-Binary im Skill eintragen

Der `/codex`-Skill ruft standardmäßig das Binary der ChatGPT-Desktop-App auf. Existiert das auf diesem Rechner nicht (Linux, oder App nicht installiert), passe im Skill die eine Zeile auf den PATH-`codex` an — und notiere im Skill, dass die PATH-Version älter sein kann.

```bash
ls -l /Applications/ChatGPT.app/Contents/Resources/codex 2>/dev/null \
  || echo "Kein App-Binary — im Skill auf 'codex' aus dem PATH umstellen"
```

## Schritt 5 — App neu starten

Skills werden beim Start eingelesen. Bitte den Nutzer, die betroffene App **komplett zu beenden** (nicht nur das Fenster zu schließen) und neu zu öffnen. Erst danach tauchen die Slash-Commands auf.

## Modellwahl per Zuruf

Die Skills lesen den Modellwunsch aus deinem Auftrag — du schreibst ihn einfach dazu:

| Du sagst | Was passiert |
|---|---|
| `/claude nutze Opus <Auftrag>` | `claude -p --model opus` |
| `/claude nutze Sonnet <Auftrag>` | `claude -p --model sonnet` |
| `/claude nutze Fable <Auftrag>` | `claude -p --model fable` — nur, falls dein Claude-Plan dieses Modell enthält |
| `/claude <Auftrag>` (ohne Zuruf) | Standardmodell deines Plans |
| `/codex nutze <name> <Auftrag>` | `codex exec -m <slug>` — gültige Slugs zeigt `codex debug models` |
| `/gemini nutze pro <Frage>` | `gemini -m gemini-3-pro -p …` |
| `/gemini <Frage>` (ohne Zuruf) | Standardmodell (Flash) — schont das Kontingent |

Ein unbekannter Modellname ist ein Fehler, kein Anlass zum Raten: Der Skill nennt dann die gültigen Namen, statt still auf etwas anderes auszuweichen.

Faustregel fürs Kontingent: Nimm das kleine Modell, wenn die Frage klein ist. Viele kleine Aufrufe kosten mehr Limit als ein großer — siehe `LEARNINGS.md`.

## Schritt 6 — Abnahme (der Beleg)

Pro installierter Brücke ein echter Aufruf **in der App**, nicht nur im Terminal:

```
/claude Antworte mit genau einem Wort: pong
/codex  Antworte mit genau einem Wort: pong
/gemini Antworte mit genau einem Wort: pong
```

Zeige die echten Ausgaben. Leere Antwort = Fehler.

## Fehlerbilder

| Symptom | Ursache | Lösung |
|---|---|---|
| Slash-Command taucht nicht auf | App nicht neu gestartet, oder Skill im falschen Verzeichnis | App komplett beenden; Pfad per `ls` prüfen |
| `Please set an Auth method` | Gemini nicht angemeldet | Nutzer startet `gemini` interaktiv, „Login with Google" |
| `not supported when using Codex with a ChatGPT account` | Angefragtes Modell ist über den ChatGPT-Login nicht erreichbar | Natives Modell wählen; mit Router siehe `modules/03-router.md` |
| `429` / `usage limit` | Kontingent des Ziel-Abos erschöpft | Melden und warten oder Modell wechseln. Nicht in Schleife wiederholen |
| Antwort leer | Prompt leer angekommen oder CLI abgebrochen | Prompt-Datei prüfen, Aufruf einmal von Hand im Terminal wiederholen |

## Rückweg

```bash
rm -rf "$HOME/.codex/skills/claude" "$HOME/.codex/skills/gemini"
rm -rf "$HOME/.claude/skills/codex" "$HOME/.claude/skills/gemini"
# Backup zurückspielen, falls vorher etwas dort lag:
# cp -R "$HOME/.config/bridge-picker/backups/<STAMP>/codex-claude" "$HOME/.codex/skills/claude"
```

Danach App neu starten. Es bleibt nichts zurück — die Brücke ändert weder Konfiguration noch Netzwerkwege.

## Abschluss

`install-state.json` → `steps.02-bruecke`:

```json
{ "status": "done",
  "installed": ["codex/claude", "codex/gemini"],
  "receipt": "je Brücke pong in der App",
  "backup": "$HOME/.config/bridge-picker/backups/<STAMP>",
  "at": "ISO-Datum" }
```

## Eigene Modell-Kurzbefehle (optional): /deepseek, /glm & Co.

Die Codex-Brücke aus Claude heraus erreicht mit „nutze <Modell>" jedes Modell, das im Codex-Picker steht — auch die gerouteten Fremdmodelle, wenn der Picker (Module 03–05) installiert ist. Wer ein Modell häufig nutzt, kann sich dafür einen eigenen Slash-Befehl anlegen: eine Kopie des `/codex`-Skills, fest auf ein Modell verdrahtet.

Anleitung für den Agenten:

1. Frage den Nutzer, welches Modell und welcher Befehlsname (z. B. `/deepseek` → `opencode-go/deepseek-v4-flash`). Der Slug muss in `"$CODEX_BIN" debug models` existieren — nicht raten.
2. Kopiere `skills/claude/codex/SKILL.md` nach `~/.claude/skills/<befehlsname>/SKILL.md` und passe an: `name:` auf den Befehlsnamen, Beschreibung nennt das feste Modell, Schritt „Modellwahl" entfällt — der Aufruf nutzt immer `-m <fester-slug>`.
3. Hinweis in der Beschreibung ergänzen, wessen Kontingent das Modell verbraucht (z. B. OpenCode-Abo).
4. Testlauf: `/<befehlsname>` mit „Antworte mit genau einem Wort: pong" — Ausgabe zeigen.

Grenzen: Es bleibt eine Frage-Antwort-Brücke (kein Thread-Takeover, keine Dateiarbeit durch das Fremdmodell). Verschwindet das Modell beim Anbieter, schlägt der Befehl mit den bekannten Fehlerbildern fehl (LEARNINGS) — dann Skill-Ordner löschen oder auf einen neuen Slug umstellen. Rückweg: `~/.claude/skills/<befehlsname>/` entfernen.
