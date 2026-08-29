# Modul 04 — Provider anbinden: OpenCode Go und (optional) OpenRouter

**Wann:** bei Interview-Antwort B oder C, nach Modul 03.
**Ziel:** Mindestens ein Fremdanbieter ist aktiv, sein Key liegt sicher auf der Platte, und eine sinnvolle Modellauswahl steht im Picker.
**Beleg am Ende:** ein „pong" über ein geroutetes Modell, end-to-end durch Codex.

**Variablen zuerst setzen.** Dieses Modul benutzt `$REPO` und `$ROUTER_DIR`. Steigst du hier ein (z. B. weil `install-state.json` die Module davor als `done` führt), setz sie neu — sonst zeigt `"$REPO/tools/…"` ins Leere:

```bash
REPO="<Pfad zu diesem Repo>"        # dort, wo INSTALL.md liegt
ROUTER_DIR="${CODEX_ROUTER_DIR:-$HOME/.local/share/codex-router}"
[ -f "$REPO/INSTALL.md" ] || echo "REPO zeigt nicht auf dieses Repo!"
```

Grundsatz: **Subscriptions vor APIs.** Ein Flat-Abo hat planbare Kosten. Token-APIs laufen unbemerkt ins Geld — besonders, wenn ein Agent im Hintergrund arbeitet und du das Ergebnis erst auf der Rechnung siehst.

## Reihenfolge

1. OpenCode Go — die empfohlene Basis (Flat-Abo statt Token-Abrechnung).
2. OpenRouter — optional, **nur die kostenlosen Modelle**.

### Zu den Konditionen von OpenCode Go

Über einen Referral-Link ist der erste Monat oft günstiger (Größenordnung ~5 $, danach ~10 $/Monat). Du kannst [unseren Referral-Link](https://learn.ainauten.com/opencode) nutzen (Offenlegung: wir erhalten dann ein kleines Startguthaben, du in der Regel auch) — oder einen beliebigen anderen aus dem [Referral-Thread in r/opencode](https://www.reddit.com/r/opencode/comments/1ubzi1z/opencode_go_referral_thread_drop_your_links/).

**Nenne dem Nutzer diese Zahlen als Momentaufnahme, nicht als Zusage.** Preise und Aktionen ändern sich; verbindlich ist nur, was OpenCode selbst auf seiner Seite und im Konto anzeigt. Wenn dir Websuche zur Verfügung steht, darfst du kurz nach dem aktuellen Stand oder einem laufenden Deal suchen, bevor der Nutzer abschließt — aber zeig ihm die Quelle und lass **ihn** entscheiden. Abgeschlossen wird die Subscription vom Nutzer selbst im Browser, nie von dir.

Beides parallel geht; kostet nichts extra, gibt aber auch kein doppeltes Kontingent (siehe unten).

## Teil A — OpenCode Go

### A1 — Voraussetzung durch den Nutzer

Die Subscription muss **vor** der Einrichtung abgeschlossen und ein API-Key erstellt sein (im OpenCode-Konto). Ohne Subscription scheitert später alles mit einem irreführenden `429` — das sieht aus wie ein Rate-Limit, ist aber ein fehlendes Kontingent.

Warte, bis der Nutzer bestätigt, dass er Subscription und Key hat. Frage **nie** nach dem Key-Wert im Chat.

### A2 — Ist-Zustand prüfen

```bash
ROUTER_DIR="${CODEX_ROUTER_DIR:-$HOME/.local/share/codex-router}"
STATE_DIR="$HOME/.codex/codex-router"
cd "$ROUTER_DIR"

./bin/providers list
ls -l "$STATE_DIR"/opencode-go-api-key.secret 2>/dev/null || echo "Kein Key hinterlegt"
```

Ist der Provider schon aktiv und ein Key vorhanden: nichts überschreiben, direkt zu A5 (Kuration).

### A3 — Key ablegen (der Nutzer, nicht du)

Der Key wandert **nie** durch den Chat, nie in ein Shell-Argument, nie in ein Log. Zwei zulässige Wege:

**Weg 1 — der Nutzer legt die Datei selbst an.** Er öffnet ein Terminal und tippt:

```bash
install -m 700 -d "$HOME/.codex/codex-router"
umask 077
# Diesen Editor öffnet der NUTZER; du siehst den Inhalt nie.
nano "$HOME/.codex/codex-router/opencode-go-api-key.secret"
chmod 600 "$HOME/.codex/codex-router/opencode-go-api-key.secret"
```

In die Datei kommt **nur der Key**, eine Zeile, ohne Anführungszeichen und ohne Variablennamen.

**Weg 2 — über die Zwischenablage, mit Test vor dem Schreiben.** Der Nutzer kopiert den Key, dann:

```bash
node "$REPO/tools/opencode-keys.mjs" add haupt --use
```

Das Skript liest die Zwischenablage, prüft die Form, **testet den Key gegen den Anbieter und schreibt erst danach**. Ein abgelehnter Key überschreibt so nie einen funktionierenden. Details in `modules/05-picker-pflege.md`.

Readback ohne den Wert zu zeigen:

```bash
ls -l "$HOME/.codex/codex-router/opencode-go-api-key.secret"   # muss -rw------- sein
wc -c < "$HOME/.codex/codex-router/opencode-go-api-key.secret" # nur die Länge
```

Der Router verlangt persistente Credentials und überspringt Umgebungsvariablen für die Einrichtung bewusst — eine `export`-Zeile im Shell-Profil reicht also nicht.

### A4 — Provider aktivieren

```bash
cd "$ROUTER_DIR"
./bin/providers enable opencode-go
./bin/providers list
```

Danach Codex **komplett beenden und neu öffnen**. Ein laufender Prozess hält den alten Katalog.

### A5 — Modelle kuratieren

Ohne Kuration ist der Picker eine unbenutzbare Liste. Ziel: **eine Handvoll aktueller Modelle**, nicht alles, was der Anbieter führt.

Erst ansehen, was es gibt — dafür ist `discover-models` da. Es fragt nur den Anbieter-Katalog ab und **schreibt nichts**:

```bash
cd "$ROUTER_DIR"
./bin/discover-models opencode-go --refresh
```

**Nimm dafür nicht `curate-models`.** Ohne `--models`, `--free-only` oder `--remove` startet `curate-models` den **interaktiven Auswahldialog** und liest von stdin — in einer Agenten-Shell ohne Terminal hängt oder scheitert das. Und `--no-apply` ist kein Trockenlauf: es speichert die Auswahl trotzdem, es veröffentlicht sie nur nicht.

Dann bewusst auswählen und anwenden:

```bash
./bin/curate-models opencode-go --models <id1>,<id2>,<id3> --apply
```

Auswahlpolitik, die sich bewährt hat:

- **Pro Produktlinie nur die aktuelle Generation.** Nicht drei Versionsstände desselben Modells.
- **`-preview`, `-beta`, `-alpha`, `-legacy`, `-deprecated` überspringen.** Die wechseln dir unter den Händen weg.
- **Keine gerouteten Kopien nativer Modelle.** Ein GPT-Modell über einen Fremdanbieter ist ein teurer Doppelgänger von etwas, das du schon im Abo hast — und in der Liste kaum von ihm zu unterscheiden.
- **Große Kontextfenster markieren.** Für lange Threads brauchst du die; siehe Kontextfenster-Falle unten.

Interaktiv geht auch — aber das muss der **Nutzer in einem echten Terminal** machen, nicht du in einer Agenten-Shell:

```bash
./bin/curate-models opencode-go
```

Ohne `--models`/`--free-only`/`--remove` ist das genau der Auswahldialog. (Die Usage-Zeile des Werkzeugs nennt zusätzlich ein Wort `interactive`; das Argument wird beim gepinnten Stand ignoriert und ändert nichts.)

### A6 — Die Kontextfenster-Falle

Neu aufgenommene Modelle bekommen einen **konservativen Standardwert** fürs Kontextfenster (typisch 131072) und eine Verdichtungsschwelle knapp darunter. Hat das Modell in Wirklichkeit ein viel größeres Fenster, brichst du bei rund 110–125k Tokens ab, obwohl noch massig Platz wäre — die Verdichtung springt zu früh an und läuft dabei (siehe `LEARNINGS.md`) am Router vorbei.

Prüfen und korrigieren in `$HOME/.codex/codex-router/user-models.json`. Vorher sichern:

```bash
cp "$HOME/.codex/codex-router/user-models.json" \
   "$HOME/.codex/codex-router/user-models.json.bak-$(date +%Y%m%d-%H%M%S)"
```

Für ein Modell mit 1M-Fenster etwa `contextWindow: 1000000`, `autoCompact: 900000`. Danach Katalog neu bauen und Dienst neu starten:

```bash
cd "$ROUTER_DIR" && ./bin/refresh-catalog && node src/service.mjs restart
```

**Bildeingaben nicht von Hand freischalten.** Setzt du bei einem gerouteten Modell die Eingabe-Modalität auf Text **und** Bild, schickt Codex Bilder direkt an den Anbieter — und der lehnt sie oft mit einem Format-Fehler ab. Lass es bei Text; für Bilder gibt es die eingebaute Vision-Brücke, die das Bild von einem nativen Modell beschreiben lässt und den Text weiterreicht.

## Teil B — OpenRouter (optional)

OpenRouter ist als eigener Provider verdrahtet. Sinnvoll ist er hier für **eine** Sache: kostenlose Modelle.

```bash
cd "$ROUTER_DIR"
# Key wie in A3, nur in die Datei openrouter-api-key.secret
./bin/providers enable openrouter
./bin/discover-models openrouter --refresh          # nur ansehen, schreibt nichts
./bin/curate-models openrouter --models <freie-ids> --apply
```

Die Reihenfolge ist wichtig: erst der Key, dann `enable`. Und `--free-only` lässt sich **nicht** mit `--models` kombinieren — das Werkzeug bricht mit „Use --free-only, --models, or --remove by itself." ab. Wer die Auswahl dem Werkzeug überlassen will, nimmt `./bin/curate-models openrouter --free-only --apply` als eigenen Aufruf.

**Nur `:free`-Modelle kuratieren. Bezahlte OpenRouter-Modelle ausdrücklich nicht.** Der Grund ist nicht Prinzipienreiterei: Ein bezahltes Modell im Picker sieht genauso aus wie ein kostenloses, wird versehentlich gewählt und rechnet pro Token ab — ohne Deckel, ohne Warnung. Genau das Muster, das „Subscriptions vor APIs" vermeiden soll. `--free-only` bei der Kuration hilft, ersetzt aber nicht den Blick auf die Liste.

Was du dafür bekommst und was nicht:

- Kostenlos, aber **geteilte Kapazität**. `429` ist dort der Normalfall zu Stoßzeiten, kein Konfigurationsfehler.
- **Gratis-Tiers dürfen für Modelltraining genutzt werden.** Schick da nichts Vertrauliches durch — keine Kundendaten, keine unveröffentlichten Inhalte, keine Zugangsdaten.
- **Kein doppeltes Kontingent.** Läuft ein weiterer Dienst über denselben OpenRouter-Key, teilt er sich dasselbe Free-Kontingent. Mehr Kapazität entsteht nur durch *zusätzliche Anbieter*, nicht durch mehr Wege zum selben Konto.

## Schritt C — Abnahme (der Beleg)

```bash
CODEX_BIN="$( [ -x /Applications/ChatGPT.app/Contents/Resources/codex ] \
  && echo /Applications/ChatGPT.app/Contents/Resources/codex || command -v codex )"

"$CODEX_BIN" debug models | head -40         # zeigt die gültigen Slugs

cd /tmp && "$CODEX_BIN" exec -m <provider>/<modell> --skip-git-repo-check \
  "Antworte mit genau einem Wort: pong"
```

Zeige die echte Ausgabe. Danach den Nutzer bitten, die App neu zu starten und im Picker zu bestätigen, dass die erwarteten Einträge da sind.

## Fehlertabelle

| Meldung | Was es **wirklich** heißt | Was zu tun ist |
|---|---|---|
| `429 exceeded retry limit` | Meist das **Kontingent**, nicht ein Rate-Limit. Der Router verpackt die Kontingent-Meldung des Anbieters als 429 | Kontingent prüfen (`tools/opencode-keys.mjs status`). Nicht in Schleife wiederholen |
| `429 … usage limit reached. Resets in N days` | Wochenlimit erreicht — gilt **kontoweit**, auch für kostenlose Modelle desselben Kontos | Anderen Key-Slot aktivieren oder warten. Modul 05 |
| `429` bei OpenRouter-Free | Geteilte Gratis-Kapazität ist gerade voll | Später erneut, oder anderes freies Modell |
| `not supported when using Codex with a ChatGPT account` | Kommt von OpenAI, **nie** ein Bezahlproblem: die Anfrage ging ans ChatGPT-Konto statt an den Fremdanbieter | Routing prüfen — Slug richtig? Provider aktiv? Dienst neu gestartet? |
| `401 … not supported for format …` | Der Anbieter hat das Antwortformat des Modells gewechselt | Modell auf die passende Route umhängen (siehe `patches/`) oder aus dem Picker nehmen |
| `403 … requires explicit opt in` | Kontobezogene Freigabe fehlt (z. B. Hosting-Region). Diese Freigaben hängen am **Konto/Workspace des Keys** | Der Nutzer legt den Schalter im Anbieter-Konto um. Achtung: ein Key aus einem anderen Workspace verliert die Freigabe wieder |
| `401 Insufficient balance` | Endpunkt mit Token-Abrechnung ohne Guthaben | Beim Flat-Endpunkt bleiben. Kein Guthaben nachladen, wenn das Abo reicht |
| `500 / Endpoint is unavailable` | Anbieterseitige Störung | Abwarten, später erneut. Lokal ist nichts kaputt |
| Modellwechsel mitten im Chat schlägt fehl | **Verdichtungsfalle.** Die serverseitige Gesprächsverdichtung läuft am Router vorbei und trägt den alten Modellnamen mit | Modell **nie** mitten im Gespräch wechseln. Neues Gespräch öffnen |

### Zur Verdichtungsfalle im Klartext

Codex hat neben der Basis-URL, die der Router übernimmt, noch einen zweiten Weg für die serverseitige Gesprächsverdichtung. Den lässt der Router bewusst in Ruhe — er geht direkt zu OpenAI und trägt dabei den zuvor gewählten Modellnamen mit. Wechselst du also mitten in einem langen Thread das Modell, versucht die Verdichtung, den alten Namen zu verwenden, und der Lauf bricht ab.

Regel: **ein Gespräch, ein Modell.** Für ein anderes Modell ein neues Gespräch. Das ist keine Schwäche der Installation, sondern eine strukturelle Lücke.

## Rückweg

```bash
cd "$ROUTER_DIR"
./bin/providers disable opencode-go     # Katalog wird neu gebaut, Picker zeigt nur noch native Modelle
./bin/providers disable openrouter
./bin/provider-key opencode-go remove   # Key aus dem Router-Speicher entfernen
rm -f "$HOME/.codex/codex-router/opencode-go-api-key.secret"
```

Der Dienst läuft weiter, die Codex-Konfiguration bleibt unverändert — nur die gerouteten Modelle verschwinden. Danach Codex neu starten. Ein Provider lässt sich jederzeit mit `enable` zurückholen.

Die Subscription kündigt der Nutzer selbst im Anbieter-Konto. Das nimmt ihm keine Automatik ab.

## Abschluss

`install-state.json` → `steps.04-provider`:

```json
{ "status": "done",
  "providers": ["opencode-go"],
  "curated": ["<slug>", "<slug>"],
  "receipt": "pong über <provider>/<modell>, Slug aus 'codex debug models'",
  "at": "ISO-Datum" }
```

Nur `done`, wenn ein geroutetes Modell **end-to-end durch Codex** geantwortet hat. Ein erfolgreicher `providers enable` allein ist kein Beleg.
