# Modul 06 — Handoff: langen Chat verdichten und übergeben

**Wann:** bei Interview-Antwort A oder C (Teil des Brücken-Pfads). Eigenständig installierbar — auch wer nur den Picker eingerichtet hat (B), profitiert davon, siehe unten.
**Ziel:** Per `/handoff` wird aus einem langen Gespräch ein kompaktes Übergabedokument, mit dem ein frischer Chat sofort weiterarbeitet.
**Beleg am Ende:** ein echter `/handoff`-Lauf in der App, dessen Dokument im Chat steht und als Datei existiert.

## Wozu das gut ist

Zwei Probleme, eine Lösung.

**Erstens: lange Gespräche werden teuer und träge.** Jeder Turn schleppt den kompletten bisherigen Verlauf mit. Irgendwann ist mehr Kontext Altlast als Arbeit, die App wird langsam, und die automatische Verdichtung greift ein — mit ungewissem Ergebnis. Ein Handoff schneidet das ab: Du nimmst den *Stand* mit, nicht den *Weg*.

**Zweitens: das Modell lässt sich nicht mitten im Gespräch wechseln.** Das ist keine Bequemlichkeitsfrage, sondern die Verdichtungsfalle aus `LEARNINGS.md`: Die serverseitige Gesprächsverdichtung läuft am Router vorbei und trägt den alten Modellnamen mit. Wer im laufenden Thread umschaltet, bekommt Abbrüche und `remote compact task`-Fehler. Der Handoff ist der saubere Weg — und der einzige, der zuverlässig funktioniert.

## Schritt 1 — Ist-Zustand prüfen

```bash
for d in "$HOME/.codex/skills/handoff" "$HOME/.claude/skills/handoff"; do
  if [ -L "$d" ]; then echo "$d: SYMLINK — nicht anfassen"
  elif [ -d "$d" ]; then echo "$d: existiert bereits"
  else echo "$d: frei"
  fi
done
```

**Symlinks nie überschreiben** — dann verwaltet der Nutzer den Skill selbst.

## Schritt 2 — Vorhandenes sichern

```bash
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$HOME/.config/bridge-picker/backups/$STAMP"
mkdir -p "$BACKUP"
cp -R "$HOME/.codex/skills/handoff" "$BACKUP/codex-handoff" 2>/dev/null || true
cp -R "$HOME/.claude/skills/handoff" "$BACKUP/claude-handoff" 2>/dev/null || true
echo "Backup: $BACKUP"
```

## Schritt 3 — Skills kopieren

| Quelle im Repo | Ziel | Ergibt |
|---|---|---|
| `skills/codex/handoff/` | `$HOME/.codex/skills/handoff/` | `/handoff` in ChatGPT Work/Codex |
| `skills/claude/handoff/` | `$HOME/.claude/skills/handoff/` | `/handoff` in Claude Cowork/Code |

Beide Vorlagen sind inhaltlich identisch — der Skill ist app-unabhängig. Installiere nur, was der Nutzer wirklich benutzt.

```bash
REPO="<Pfad zu diesem Repo>"
[ -f "$REPO/INSTALL.md" ] || echo "REPO zeigt nicht auf dieses Repo!"

install_skill() {   # $1 = Quelle im Repo, $2 = Zielverzeichnis
  if [ -L "$2" ]; then echo "ÜBERSPRUNGEN (Symlink): $2"; return 0; fi
  mkdir -p "$2"
  cp -R "$1/." "$2/"      # der Punkt macht den Lauf wiederholbar
  echo "Installiert: $2"
}

install_skill "$REPO/skills/codex/handoff"  "$HOME/.codex/skills/handoff"
install_skill "$REPO/skills/claude/handoff" "$HOME/.claude/skills/handoff"
```

Readback:

```bash
head -5 "$HOME/.codex/skills/handoff/SKILL.md" 2>/dev/null
head -5 "$HOME/.claude/skills/handoff/SKILL.md" 2>/dev/null
```

## Schritt 4 — App neu starten

Skills werden beim Start eingelesen. Die betroffene App **komplett beenden** (nicht nur das Fenster schließen) und neu öffnen.

## Schritt 5 — Abnahme (der Beleg)

In der App, in einem Gespräch mit etwas Inhalt:

```
/handoff
```

Erwartet: ein Dokument mit den Abschnitten Ziel, Stand, Entscheidungen, Artefakte, Regeln, offene Aufgaben und **Nächster Prompt** — im Chat sichtbar und als Datei geschrieben. Lass dir den Dateipfad zeigen und prüfe, dass die Datei existiert.

Ein Handoff ohne den Abschnitt „Nächster Prompt" ist unvollständig.

## Wie der Nutzer das benutzt

Zwei Momente, in denen `/handoff` der richtige Griff ist. Erkläre sie ihm ausdrücklich — der Skill nützt nichts, wenn niemand weiß, wann er dran ist.

### Moment 1: Das Gespräch wird lang

Anzeichen: Die App reagiert träge, Antworten werden ungenauer, es tauchen Verdichtungshinweise auf, oder das Kontextlimit rückt näher.

1. `/handoff`
2. **Neues Gespräch** öffnen
3. Das Dokument (oder nur den Abschnitt „Nächster Prompt") einfügen
4. Weiterarbeiten — das alte Gespräch nicht mehr anfassen

Nicht warten, bis es klemmt. Ein Handoff bei 70 Prozent Kontext ist ein sauberer Schnitt; einer bei 98 Prozent wird selbst zum Problem, weil das Verdichten auch Kontext braucht.

### Moment 2: Ein anderes Modell soll übernehmen

Typisch: Die Recherche lief auf einem schnellen, günstigen Modell, jetzt soll das starke Modell den Entwurf schreiben. Oder umgekehrt: Der teure Teil ist fertig, der Rest ist Fleißarbeit.

**Regel: niemals im laufenden Chat umschalten.** Stattdessen:

1. `/handoff` (dem Skill dabei das Zielmodell nennen: „`/handoff` für Opus")
2. Neues Gespräch **mit dem Zielmodell** öffnen
3. Dokument einfügen

Warum das keine Umständlichkeit ist, sondern notwendig: siehe Verdichtungsfalle in `LEARNINGS.md`. Ein Modellwechsel im laufenden Thread bricht ab, und zwar oft erst nach mehreren Minuten Arbeit.

### Die Kurzfassung

Für kleine Übergaben:

```
/handoff kurz
```

Maximal zehn Bullets: Ziel, Stand, offene Aufgaben, Startprompt. Reicht für die meisten Modellwechsel.

## Grenzen, ehrlich benannt

- **Ein Handoff ist eine Verdichtung, kein Klon.** Details, die niemand als wichtig erkannt hat, gehen verloren. Deshalb gehört das *Warum* zu jeder Entscheidung — das ist der Teil, den der neue Chat sonst versehentlich umwirft.
- **Der Skill kann den alten Chat nicht lesen, wenn er nicht mehr offen ist.** Er verdichtet das laufende Gespräch. Ein bereits geschlossener Thread lässt sich so nicht nachträglich retten.
- **Keine Secrets im Dokument.** Der Skill ersetzt Keys durch `[REDACTED]`. Prüfe das trotzdem, bevor du ein Handoff-Dokument weitergibst oder in ein Repo legst — die Dateien landen im Arbeitsordner und werden leicht mitcommittet.
- **Qualität hängt am Ausgangsgespräch.** War der Thread schon wirr, wird das Handoff-Dokument es auch.

## Fehlerbilder

| Symptom | Ursache | Lösung |
|---|---|---|
| `/handoff` taucht nicht auf | App nicht neu gestartet, oder Skill im falschen Verzeichnis | App komplett beenden; Pfad per `ls` prüfen |
| Verschachteltes Verzeichnis `.../handoff/handoff/` | Kopie ohne `/.` zweimal gelaufen | Verzeichnis entfernen und Schritt 3 wie oben wiederholen |
| Dokument ist fast so lang wie der Chat | Zu nah am Verlauf | „kurz" verlangen oder das Verdichten wiederholen lassen |
| Neuer Chat fragt sofort nach Grundlagen | Artefakte oder Regeln zu dünn | Im alten Chat nachbessern, solange er noch offen ist |

## Rückweg

```bash
rm -rf "$HOME/.codex/skills/handoff" "$HOME/.claude/skills/handoff"
# Backup zurückspielen, falls vorher etwas dort lag:
# cp -R "$HOME/.config/bridge-picker/backups/<STAMP>/codex-handoff/." "$HOME/.codex/skills/handoff/"
```

Danach App neu starten. Bereits geschriebene Handoff-Dokumente bleiben liegen — das sind normale Dateien des Nutzers.

## Abschluss

`install-state.json` → `steps.06-handoff`:

```json
{ "status": "done",
  "installed": ["codex/handoff", "claude/handoff"],
  "receipt": "/handoff in der App gelaufen, Dokument im Chat + Datei unter <Pfad>",
  "backup": "$HOME/.config/bridge-picker/backups/<STAMP>",
  "at": "ISO-Datum" }
```
