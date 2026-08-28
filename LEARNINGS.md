# LEARNINGS — was in der Praxis schiefgeht und was es bedeutet

Destillat aus mehreren Monaten Betrieb. Die meisten Fehlermeldungen in diesem Setup sagen nicht das, was sie sagen. Diese Seite übersetzt sie.

Für den installierenden Agenten: Schlag hier nach, bevor du einen Fehler wiederholst oder als „unbekannt" meldest.

---

## 1. Fehlerbilder und was sie wirklich heißen

| Meldung | Wörtlich gelesen | Tatsächlich |
|---|---|---|
| `429 exceeded retry limit` | Rate-Limit | Fast immer das **Kontingent**. Der Router verpackt die Kontingent-Meldung des Anbieters als 429. Warten hilft je nach Reset-Fenster stunden- oder tagelang nicht |
| `CreditsError` | Guthaben leer | Genau das — aber es kommt beim Nutzer als `429` an. Nicht mit einem Rate-Limit verwechseln |
| `GoUsageLimitError: Weekly usage limit reached. Resets in N days` | Wochenlimit | Stimmt, und es gilt **kontoweit** — auch für kostenlose Modelle desselben Kontos. Ein Gratis-Modell rettet dich nicht über das Limit |
| `not supported when using Codex with a ChatGPT account` | Modell nicht verfügbar | Kommt von OpenAI und ist **nie ein Bezahlproblem**. Die Anfrage ging ans ChatGPT-Konto statt an den Fremdanbieter → Routing prüfen. Kann auch ein veralteter Eintrag im nativen Katalog sein |
| `401 … not supported for format …` | Modell kaputt | Der Anbieter hat das **Antwortformat** dieses Modells gewechselt. Modell auf die passende Route umhängen oder aus dem Picker nehmen |
| `403 … requires explicit opt in` | Zugriff verweigert | Eine **kontobezogene Freigabe** fehlt (z. B. Hosting-Region). Sie hängt am Konto des jeweiligen Keys — ein Key aus einem anderen Workspace verliert sie wieder |
| `401 Insufficient balance` | Kein Guthaben | Du bist auf einem Endpunkt mit **Token-Abrechnung** gelandet statt auf dem Flat-Endpunkt. Endpunkt prüfen, nicht Guthaben nachladen |
| `500` / `Endpoint is unavailable` | Server kaputt | Anbieterseitige Störung. Lokal ist nichts falsch. Abwarten |
| `stream disconnected before completion: … 127.0.0.1` | Verbindung abgebrochen | Der lokale Router-Dienst **läuft nicht**. Kein Listener auf dem Port |
| `409 Provider … is hidden` | Provider gesperrt | Du hast den Provider selbst ausgeblendet (`providers disable`), das Gespräch läuft aber noch auf einem seiner Modelle. Neues Gespräch mit einem anderen Modell — siehe Abschnitt 4 |
| `gateway exited before becoming healthy` (Schleife) | Gateway startet nicht | Die **.env-Falle**, siehe unten |
| `unsupported scheme '<missing scheme>'` | Ungültige URL | In der abschattenden `.env` steht ein **leeres** `DATABASE_URL=`. Ein leerer Wert gilt als gesetzt |
| `failed to parse model_catalog_json` | Katalog kaputt | Zu **altes CLI aus dem PATH** gegen einen neueren Katalog. Das App-Binary nutzen |
| `IneligibleTierError: This client is no longer supported for Gemini Code Assist for individuals` (gemini) | Dein Konto ist gesperrt | Weder gesperrt noch lokal kaputt: **Google hat den Einzelnutzer-Zugang über das `gemini`-CLI abgeschaltet** (Stand 2026-08, verifiziert mit 0.57.0). Wiederholen hilft nie. Der funktionierende Weg ist Googles Nachfolger **Antigravity** (`agy --print`, headless verifiziert); ersatzweise der API-Key-Modus, oder ganz ohne Gemini weiterarbeiten. Details in `modules/01-cli-check.md` |
| `foreign_state_owner` im Log | Fremdzugriff | Eine **Kopie** des Repos (Scan-Tempordner, zweiter Checkout) wollte den Dienst starten und wurde korrekt abgewiesen. Der State ist in Ordnung |
| `OutputTextDelta` / nonkonformer Stream, `KeyError: 'id'` | Parser-Fehler | Der Anbieter liefert einen Stream in einem Format, das der Gateway nicht erwartet. Meist die Folge eines **Formatwechsels beim Anbieter** — Modell auf die richtige Route umhängen |
| `input_schema does not support oneOf, allOf, or anyOf at the top level` | Schema ungültig | Ein Anbieter mit striktem Validator lehnt die Werkzeug-Schemas ab. Tritt vor allem in **großen Threads mit vielen Werkzeugen** auf und zeigt sich oft nur als abgebrochener Stream. Dagegen laufen die Sanitizer aus `patches/` |

**Grundregel:** Ein `429` ist eine Diagnose-Aufforderung, kein Anlass für einen Retry. Wiederholen verbrennt genau das Kontingent, das gerade fehlt.

---

## 2. Die .env-Falle

Die eingebettete Gateway-Komponente ist ein Python-Prozess mit `python-dotenv`. Dessen `find_dotenv()` läuft **vom Arbeitsverzeichnis nach oben** und nimmt die erste `.env`, die es findet. Liegt in `$HOME` eine allgemeine `.env` — etwa mit einem `DATABASE_URL` aus einem ganz anderen Projekt — übernimmt das Gateway diesen Wert und startet nie durch.

Lösung: eine `.env` **im Router-Verzeichnis**, die nur einen Kommentar enthält und die globale abschattet. Zwei Details, die man leicht falsch macht:

- **Kein `DATABASE_URL=` hineinschreiben.** Leerer Wert = gesetzter Wert = neuer Fehler.
- Der Ausschluss gehört in `.git/info/exclude`, nicht in `.gitignore`. Letztere ist eine versionierte Projektdatei; sie zu ändern macht den Checkout schmutzig und kollidiert beim nächsten Update.

Das Muster ist verallgemeinerbar: Jedes Werkzeug, das `.env`-Dateien nach oben sucht, kann sich Konfiguration aus einem fremden Projekt einfangen.

---

## 3. Die Verdichtungslücke: Modell nie mitten im Gespräch wechseln

Codex hat neben der Basis-URL, die der Router übernimmt, **einen zweiten Weg** für die serverseitige Gesprächsverdichtung. Den lässt der Router bewusst unangetastet — er geht direkt zum Anbieter und trägt dabei den zuvor gewählten Modellnamen mit.

Folge: Wechselst du in einem langen Thread das Modell, versucht die Verdichtung weiterhin den alten Namen zu nutzen und der Lauf bricht ab (`remote compact task`-Fehler, wiederholte Verdichtungsmeldungen).

**Regel: ein Gespräch, ein Modell.** Für ein anderes Modell ein neues Gespräch öffnen.

Das ist keine Fehlkonfiguration, sondern eine strukturelle Lücke. Sie lässt sich lokal nicht schließen.

### Verwandt: die Kontextfenster-Falle

Neu aufgenommene Fremdmodelle bekommen einen **konservativen Standardwert** fürs Kontextfenster (typisch 131072) und eine Verdichtungsschwelle knapp darunter. Hat das Modell in Wirklichkeit ein 1M-Fenster, brichst du trotzdem bei rund 110–125k Tokens ab — die Verdichtung springt zu früh an und läuft dann in die Lücke oben.

Bei Abbrüchen in genau diesem Bereich zuerst dort nachsehen. Der Anbieter meldet die echten Limits oft gar nicht; der Wert muss von Hand gesetzt werden.

Und: Bildeingaben bei gerouteten Modellen **nicht** von Hand freischalten. Dann schickt Codex Bilder direkt an den Anbieter, der sie meist mit einem Format-Fehler ablehnt. Bei Text bleiben — für Bilder gibt es die eingebaute Vision-Brücke, die ein natives Modell das Bild beschreiben lässt.

---

## 4. Limits verstehen: was wirklich zählt

### Beim Flat-Abo bestimmt die Zahl der Turns dein Tempo

Wie ein Go-Plan intern zählt, **veröffentlicht der Anbieter nicht** — weder „so und so viele Anfragen" noch ein Token-Budget. Beobachtbar ist nur das Verhalten: Man läuft ins Limit, lange bevor eine Token-Rechnung eine Rolle spielte, und viele kleine Turns bringen einen dorthin schneller als wenige große.

Als Arbeitsregel taugt das trotzdem, und sie dreht die Intuition um:

- Ein einziger großer Auftrag an ein starkes Modell ist **ein** Turn.
- Zwanzig kleine Rückfragen, Retries und Werkzeug-Runden sind **zwanzig**.

**Nicht die großen Modelle fressen dein Kontingent, sondern viele kleine Turns.** Ein Agent, der in Schleife nachhakt, kommt teurer als ein durchdachter Einzelauftrag.

Praktisch heißt das:

- Aufträge vorne sauber formulieren, statt sich in zehn Runden heranzutasten.
- Automatische Retries begrenzen. Ein Retry auf ein Kontingent-429 ist reine Verschwendung.
- **Parallele Threads drosseln.** Fünf gleichzeitig laufende Agenten multiplizieren den Verbrauch, nicht die Ergebnisse.
- Beim eigenen Verhalten hinsehen, nicht schätzen — dafür sind die Picker-Verbrauchslabels aus Modul 05 da. Sie zeigen **deine lokale Aktivität**, nicht dein Restkontingent; verbindlich ist allein die Anzeige im Anbieter-Konto.

### Zwei Limit-Ebenen, die man auseinanderhalten muss

- **Rollierendes 5-Stunden-Fenster:** kurzfristige Drosselung. Löst sich von selbst, wenn man eine Weile nichts tut.
- **Rollierendes Wochenfenster:** hartes Ende bis zum Reset. Ein zweiter Key aus einem anderen Konto hilft, ein anderes Modell im selben Konto nicht.

Beide Fenster rollen — sie setzen nicht zu einer festen Uhrzeit zurück, sondern lassen die ältesten Turns nach und nach herausfallen. Die Meldung nennt meist ein Reset-Datum; das ist der Zeitpunkt, ab dem wieder genug herausgefallen ist, keine Kalendergrenze.

Wer eine Meldung als „nur Rate-Limit" abtut und weiter probiert, verbrennt beide Ebenen gleichzeitig.

### Wochenlimit erreicht — was jetzt wirklich hilft

Der Fehler ist unspektakulär, die richtige Reaktion aber nicht offensichtlich. Der Reihe nach:

1. **Zweiter Key?** Dann umschalten: `opencode-keys.mjs auto`. Das ist der einzige Weg, der sofort wieder Kapazität bringt.
2. **Kein zweiter Key?** Dann den Provider **vorübergehend ausblenden**, statt tagelang gegen `429` zu laufen:

   ```bash
   cd "$ROUTER_DIR" && ./bin/providers disable opencode-go
   ```

   Der Picker zeigt danach nur noch die nativen Modelle, der Dienst läuft weiter, die Codex-Konfiguration bleibt unverändert. Du arbeitest normal über dein ChatGPT-Abo weiter, statt in jedem zweiten Thread über einen toten Fremdanbieter zu stolpern.
3. **Nach dem Reset zurückholen:** `./bin/providers enable opencode-go`, dann Codex komplett beenden und neu öffnen.

Zwei Dinge, die man dabei wissen muss:

- **Ein ausgeblendeter Provider erzeugt einen eigenen Fehler.** Läuft ein Gespräch noch auf einem seiner Modelle, meldet der Router `409 Provider opencode-go is hidden`. Das ist kein Defekt — es ist die Ansage, dass dieses Gespräch ein anderes Modell braucht. Und weil ein Modellwechsel mitten im Gespräch an der Verdichtungslücke scheitert (Abschnitt 3), heißt das: **neues Gespräch** mit einem nativen Modell.
- **Der Modell-Sync macht das nicht rückgängig.** Er filtert nach den aktivierten Providern; ein ausgeblendeter bleibt ausgeblendet, bis du ihn selbst zurückholst.

### Was Token-Verbrauch aufbläht

Werden Skill-Pakete und Brücken-Komponenten in den Kontext jeder gerouteten Anfrage geschrieben, kann ein trivialer Testlauf („Antworte mit genau einem Wort: pong") sechsstellige Tokenzahlen erzeugen, wo vorher einstellige standen. Auf einem Flat-Abo fällt das kaum auf. Auf einem Endpunkt mit Token-Abrechnung wäre es teuer.

Merksatz: **Kläre, wie dein Plan abrechnet, bevor du irgendetwas optimierst.** Bei einem Flat-Abo optimierst du die Zahl der Turns, bei Token-Abrechnung die Größe des Kontexts. Wer das verwechselt, optimiert am Limit vorbei.

---

## 5. Prinzipien

### Subscriptions vor APIs

Abos haben planbare Fixkosten. Token-APIs laufen unbemerkt ins Geld — besonders, wenn ein Agent im Hintergrund arbeitet und du das Ergebnis erst auf der Rechnung siehst. Alles in diesem Repo ist auf Abo-Nutzung ausgelegt.

Wo ein bezahlter Endpunkt dennoch verlockend aussieht: Er sieht im Picker exakt aus wie ein kostenloser. Ein Fehlgriff ist eine Frage der Zeit, nicht der Sorgfalt. Deshalb bei OpenRouter **nur `:free`-Modelle** kuratieren.

### Commit-Pinning statt Auto-Update

Ein Open-Source-Projekt entwickelt sich zwischen deinen Prüfterminen unbeaufsichtigt weiter. Ein Sicherheitsbefund gilt für **den Commit, gegen den er erhoben wurde** — nie für spätere.

Deshalb: fester Commit, kein `bin/update`, kein Auto-Upgrade. Ein Update ist eine bewusste Entscheidung mit erneuter Prüf-Battery.

Was ein Update in der Praxis bedeutet, wenn lokale Anpassungen existieren: Die kollidieren fast garantiert textuell mit dem neuen Stand. Der Weg ist dann nicht „ein Klick", sondern: lokale Änderungen committen, Branch vom neuen Stand, Patches einzeln neu einpassen, Tests laufen lassen, und vorher ein Backup-Branch. Plane das ein oder lass es bleiben.

Praktischer Nebeneffekt beim Prüfen: Läuft ein Sicherheitsscanner über ein Repo, arbeitet er oft mit einer **Kopie in einem Temp-Ordner**, die den Dienst zu starten versucht. Das erzeugt irreführende Logzeilen und kann den laufenden Dienst stören. Die Abweisung solcher Kopien ist korrekt und beschädigt nichts.

### Keys nie im Chat

API-Keys wandern nie durch einen Chat, nie in ein Shell-Argument, nie in ein Log, nie in eine Prozessliste. Der einzige zulässige Weg ist: Zwischenablage → Test gegen den Anbieter → Datei mit Rechten 0600.

Und: **erst testen, dann schreiben.** Ein abgelehnter Key darf nie einen funktionierenden überschreiben. Genau das macht das Skript aus `tools/`.

Kontobezogene Freigaben hängen am **Workspace des jeweiligen Keys**. Rotierst du auf einen Key aus einem anderen Konto, können Modelle wieder mit `403` sperren, obwohl der Key völlig in Ordnung ist.

### Gratis-Tiers dürfen fürs Training genutzt werden

Kostenlose Modell-Tiers sind selten geschenkt. Üblicherweise erlauben ihre Bedingungen die Nutzung deiner Eingaben für Modelltraining.

**Also: nichts Vertrauliches durch Gratis-Tiers.** Keine Kundendaten, keine unveröffentlichten Inhalte, keine Zugangsdaten, keine internen Dokumente. Für Wegwerf-Aufgaben, Formatierungen und Recherche sind sie hervorragend.

Und ein Kontingent-Missverständnis gleich mit: Zwei Wege zum **selben Konto** ergeben kein doppeltes Kontingent. Free-Limits zählen pro Konto, nicht pro Zugangsweg. Mehr Kapazität entsteht nur durch zusätzliche Anbieter.

### Nur offizielle CLIs für die Brücken

Abo-Logins gehören nie in Dritt-Tools. UI-Automation der Web-Oberflächen riskiert Kontosperren. Die offiziellen CLIs sind in den Abos enthalten und ausdrücklich vorgesehen — das ist der einzige Weg, der hier benutzt wird.

### Jeder Schritt mit Beleg

Ein Befehl, der ohne Fehler durchgelaufen ist, ist kein Beleg. Ein Beleg ist eine echte Ausgabe: ein „pong", ein Readback, ein Katalogeintrag, ein Dateipfad mit Rechten.

Das gilt besonders für Fremdmodelle: `providers enable` meldet Erfolg, lange bevor klar ist, ob das Modell antwortet.

---

## 6. Kleinkram, der Zeit kostet

- **Nach jeder Änderung am Katalog: App komplett beenden und neu öffnen.** Fenster schließen reicht nicht. Ein laufender Prozess hält den alten Katalog.
- **Verbrauchslabels verschwinden bei jedem Katalog-Neubau.** Das Label-Skript muss nach Kuration, Provider-Wechsel und Sync erneut laufen.
- **Doppelgänger im Picker.** Ein natives Modell und seine geroutete Kopie sehen fast gleich aus — die Schreibweise unterscheidet sich oft nur in Bindestrichen und einem Klammerzusatz. Geroutete Kopien nativer Modelle gar nicht erst kuratieren.
- **`./bin/status` braucht **keine** Port-Variable.** Der Router läuft beim gepinnten Stand auf **4202**. `4102` ist der alte Port aus früheren Versionen. Wer `MODEL_ROUTER_PORT=4102` davorsetzt, befragt die falsche Adresse und bekommt ein `unavailable`, obwohl alles läuft — die Variable gehört nur dann davor, wenn der Port bewusst umgestellt wurde.
- **Modelle verschwinden ohne Vorwarnung.** Zeitlich begrenzte Gratis-Aktionen enden; der Anbieter antwortet danach mit `401 … not supported`, und Codex zeigt das als `429`. Betroffene Threads brauchen ein neues Gespräch mit einem anderen Modell.
- **Native Modelle lassen sich router-seitig nicht verstecken.** Der Router darf den client-eigenen Katalog nicht überschreiben. Kein Umweg suchen — es geht nicht.
- **Nach einem Key-Wechsel muss die App neu starten.** Kein Watchdog nimmt dir das ab.
- **Der Picker veraltet still.** Ohne den Modell-Sync aus `modules/05-picker-pflege.md` bleibt deine Auswahl auf dem Stand des Installationstags: neue Modelle fehlen, abgeschaltete stehen als tote Slugs herum und melden sich als `429`. Das fällt erst auf, wenn man es sucht.
- **Ein Modell, das du aus dem Picker nimmst, kommt beim nächsten Sync zurück** — es steht ja weiter im Anbieter-Katalog. Dauerhaft raus hält es nur die `DENYLIST` im Sync-Skript.

---

## 7. Wenn nichts davon hilft

Diese Seite deckt die Fehlerbilder ab, die uns tatsächlich begegnet sind. Steht deines nicht hier, ist der Weg trotzdem derselbe — in dieser Reihenfolge:

1. **Nachschlagen statt raten.** Die Tabelle in Abschnitt 1 übersetzt die meisten Meldungen. Ein `429` ist fast nie ein Rate-Limit, ein `not supported…` nie ein Bezahlproblem.
2. **Rückweg nutzen.** Jedes Modul hat einen Rückweg-Abschnitt. Den betroffenen Baustein zurückdrehen und den Schritt **einmal** sauber wiederholen — mit den Belegen, die das Modul verlangt.
3. **Nicht in Schleife wiederholen.** Ein zweiter sauberer Versuch ist Diagnose. Ein zehnter verbrennt nur Kontingent.

Bleibt es kaputt, ist das ein Bug oder eine Lücke in der Anleitung — beides wollen wir wissen.

**Wo melden:** GitHub-Issue im Repo (Pull Requests genauso willkommen). Kein GitHub-Konto? E-Mail an **info@ainauten.com**.

**Was hineingehört**, damit der Report verwertbar ist:

- [ ] Modul und Schritt (z. B. „04-provider, Teil A5")
- [ ] Die exakte Fehlermeldung, wörtlich kopiert
- [ ] Auszug aus `install-state.json` zum betroffenen Schritt
- [ ] Betriebssystem und Version, `node --version`
- [ ] Router-Commit: `git -C ~/.local/share/codex-router log --oneline -1`
- [ ] Was schon versucht wurde, mit Ergebnis
- [ ] Erwartetes vs. tatsächliches Verhalten

**Was nicht hineingehört:** API-Keys, Tokens, Passwörter, Inhalte von `*.secret`-Dateien. Logs vor dem Abschicken durchsehen und Keys durch `[REDACTED]` ersetzen. Ein Key in einem Issue ist ein Sicherheitsvorfall, kein Detail.
