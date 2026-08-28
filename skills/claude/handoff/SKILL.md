---
name: handoff
description: Verdichte bei ausdrücklichem /handoff den aktuellen Chat zu einem kompakten Übergabedokument für ein neues Gespräch — Ziel, Stand, Entscheidungen, Artefakte, offene Aufgaben und ein fertiger Startprompt. Nutze diesen Skill, wenn ein Gespräch lang oder träge wird, ans Kontextlimit stösst, oder wenn das Modell gewechselt werden soll. Nicht für kurze Zusammenfassungen mitten im Gespräch.
---

# Handoff (Chat verdichten und übergeben)

Nutze diesen Skill nur bei ausdrücklichem `/handoff` oder einer klaren Bitte, das Gespräch zu übergeben.

Zweck: Aus einem langen Gespräch wird **ein Dokument**, mit dem ein frischer Chat sofort weiterarbeiten kann. Das spart Kontext (und damit Kontingent) und ist der einzige saubere Weg, das Modell zu wechseln — ein Wechsel mitten im Gespräch scheitert an der serverseitigen Verdichtung.

## Ablauf

1. **Variante bestimmen.** Sagt der Nutzer „kurz", schreibst du die Kurzfassung: **maximal 10 Bullets insgesamt**, nur Ziel, Stand, offene Aufgaben und Startprompt. Sonst die volle Struktur unten.

   Nennt er ein Zielmodell („für Opus", „für glm-5.3"), notiere das im Startprompt.

2. **Gespräch durchgehen und verdichten.** Nicht transkribieren, sondern destillieren. Was zählt, ist der Stand *jetzt* — nicht der Weg dorthin.

3. **Dokument schreiben** (Struktur unten), als Datei **und** im Chat.

4. **Datei ablegen** im Arbeitsordner:

   ```bash
   HANDOFF="handoff-$(date +%Y%m%d-%H%M%S).md"
   ```

   Existiert ein offensichtlicher Projektordner, kommt sie dorthin; sonst ins aktuelle Arbeitsverzeichnis. Nenne dem Nutzer den vollständigen Pfad.

5. **Im Chat zeigen.** Vollständig, nicht als Zusammenfassung der Zusammenfassung. Der Nutzer soll den Text direkt kopieren können, ohne die Datei zu öffnen.

## Struktur des Dokuments

```markdown
# Handoff: <Kurztitel>
Stand: <Datum, Uhrzeit>

## Ziel
Was soll am Ende erreicht sein? Zwei, drei Sätze. Kein Verlauf.

## Stand
Was ist fertig, was läuft, was ist blockiert. Konkret und prüfbar.

## Entscheidungen
- <Entscheidung> — <Begründung in einem Halbsatz>

Nur getroffene Entscheidungen, jeweils mit dem *Warum*. Das Warum ist der
Teil, den ein neuer Chat sonst nicht rekonstruieren kann und deshalb
versehentlich umwirft.

## Artefakte
Dateien (mit Pfad), Links, IDs, Branch- und Commit-Namen, Ordner.
Alles, was der neue Chat anfassen muss, mit genauer Adresse.

## Regeln und Präferenzen des Nutzers
Wie er arbeitet, was er nicht will, Sprache, Format, Stil, Werkzeuge.
Alles, was du im Lauf des Gesprächs gelernt hast und was sonst verloren geht.

## Offene Aufgaben und Risiken
- [ ] <Aufgabe>
- Risiko: <was schiefgehen kann und woran man es merkt>

## Nächster Prompt
> <Copy-paste-fertiger Startprompt für das neue Gespräch.>
```

Der **Nächste Prompt** ist der wichtigste Abschnitt. Er muss für sich allein funktionieren: Rolle, Ziel, wo die Artefakte liegen, was als Nächstes zu tun ist. Schreib ihn so, dass der Nutzer ihn ohne eine einzige Änderung absenden kann.

## Was nicht hineingehört

- **Keine Secrets.** Keine API-Keys, Tokens, Passwörter, Zugangsdaten, Inhalte von `*.secret`-Dateien. Auch nicht „gekürzt" oder „nur der Anfang". Steht im Gespräch ein Key, schreibst du `[REDACTED]` und benennst, um welchen es sich handelt.
- **Kein Transkript.** Keine Wiedergabe des Verlaufs, keine Zitate ganzer Antworten.
- **Kein Smalltalk**, keine Höflichkeitsfloskeln, keine Sackgassen — es sei denn, eine Sackgasse ist eine Erkenntnis („X funktioniert nicht, weil Y"). Dann gehört sie unter Entscheidungen.
- **Keine Doppelungen.** Jede Information genau einmal, im passendsten Abschnitt.
- **Nichts Erfundenes.** Was du nicht sicher weisst, lässt du weg oder markierst es als offen. Ein Handoff, der Dinge behauptet, ist schlimmer als keiner.

## Nach dem Handoff

Sag dem Nutzer in einem Satz, was jetzt zu tun ist: **neues Gespräch öffnen** (bei Modellwechsel: mit dem Zielmodell), Dokument einfügen, weiterarbeiten. Das alte Gespräch nicht fortsetzen — sonst war die Übung umsonst.

## Fehlerbilder

| Symptom | Ursache | Was tun |
|---|---|---|
| Das Dokument wird selbst sehr lang | Zu nah am Verlauf geblieben | Verdichten: Entscheidungen statt Weg, Stand statt Historie. Im Zweifel „kurz" |
| Datei lässt sich nicht schreiben | Kein Schreibrecht im Arbeitsordner | Im Chat zeigen, Pfad mit dem Nutzer klären |
| Der neue Chat fragt sofort nach | Artefakte oder Regeln zu dünn | Fehlendes ergänzen und den Startprompt nachschärfen |
