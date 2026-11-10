# Vegan Strength – Architektur nach Etappe 4

Die App wird direkt als statische Website ausgeliefert. HTML, CSS und native JavaScript-Module benötigen keinen Build-Schritt und laden keine externen Laufzeitbibliotheken. Lokal muss ein HTTP-Server verwendet werden; `file://` ist kein unterstützter Einstiegspunkt.

## Zuständigkeiten

| Bereich | Verantwortung |
| --- | --- |
| `index.html`, `styles/app.css` | Bestehende Oberfläche und Gestaltung |
| `src/main.js` | Browser-Einstieg und Behandlung von Startfehlern |
| `src/app.js` | Initialisierung, aktueller Datenstand und Reihenfolge der Schreibaktionen |
| `src/data/` | Unveränderte freie Vorlagen und Lebensmittel; zusätzlicher Übungskatalog mit stabilen Bewegungs-/Varianten-IDs |
| `src/domain/` | Validierung der v2-Daten und Trainingsentwürfe, lokale Kalendertage, Proteinberechnung, Statistik, Profil-/Planvalidierung, Wochenvorgaben und Progressionsvorschläge |
| `src/storage/` | Asynchrones Repository vor IndexedDB; alter localStorage-Adapter für Kompatibilitätstests |
| `src/features/` | Startseite, freies und geplantes Training, Planübersicht/Profil, Protein, Verlauf und Einstellungen |
| `src/services/` | Pausentimer, Backup-Dateien und PWA-Ereignisse |
| `src/ui/` | Navigation und gemeinsame Anzeigeformatierung |
| `sw.js` | Vollständiger Release-Cache und Offline-Auslieferung |

Fachfunktionen in `domain/` kennen weder DOM noch Browser-Speicher. Features erhalten ihren Datenzugriff und ihre Aktionen bei der Initialisierung; sie verwenden IndexedDB und localStorage nicht direkt. Die produktive App verwendet ausschließlich den IndexedDB-Adapter. Ist dieser nicht verfügbar, erscheint die Wiederherstellungsansicht; es gibt keinen automatischen localStorage-Fallback.

## Lesen und Schreiben

1. Das Repository migriert gegebenenfalls den alten Speicher und lädt den bestätigten Datenstand samt Trainingsentwürfen. Bei nicht lesbaren Daten wird die Fehler- und Originaldatenansicht verwendet.
2. Die Oberfläche zeigt diesen bestätigten Datenstand. Offene Trainingseingaben werden getrennt gehalten und automatisch gesichert.
3. Eine schreibende Benutzeraktion läuft in einer gemeinsamen Warteschlange. Ihr neuer Datenstand wird aus dem zuletzt bestätigten Stand abgeleitet.
4. Das Repository prüft und speichert den Kandidaten. Erst nach erfolgreichem Schreiben übernimmt die App ihn als aktiven Stand.
5. Die Speicherstatusanzeige und die betroffene Ansicht werden aktualisiert. Bei Fehlern bleiben der alte Datenstand und die Eingaben erhalten.

Die Warteschlange umfasst auch Import-Dateilesen und die zugehörige Bestätigung. Während ein Workout gespeichert wird, sind seine Eingabefelder und die Speicherschaltfläche gesperrt. Schnelle Mehrfachklicks erzeugen keine doppelten Workout-Abschlüsse. Andere Änderungen, etwa am Proteintracker, bauen die Trainingsfelder nicht neu auf.

Die asynchrone Repository-Schnittstelle umfasst `load()`, `write(candidate, options)`, `loadTraining()`, `saveTraining()`, `loadProgram()`, `saveProgram()`, `previous()`, `migration()`, `conflict()` und `removePrevious()` sowie `loaded`, `problem` und den verfügbaren Originaltext `raw`. Ein normales Schreiben prüft in derselben IndexedDB-Transaktion die zuletzt gelesene Revision und erhöht sie. Veraltete Fenster dürfen weder Daten noch bestätigte Entwürfe überschreiben. `versionchange` schließt bestehende Verbindungen; blockierte Öffnungen erzeugen einen sichtbaren Fehler.

Unveränderte alte App-Versionen können weiterhin in ihren früheren localStorage-Schlüssel schreiben. Diese Änderungen werden beim nächsten Lese-/Schreibzugriff erkannt und nicht automatisch eingespielt. Bei einem ausdrücklich bestätigten Import können sowohl der bisherige Datenbankstand als auch dieser zusätzliche Datenzweig gesichert werden. Eine atomare Transaktion über IndexedDB und fremde alte localStorage-Schreiber gibt es nicht.

## Datenbank und Migration

Datenbankname: `vegan-strength`, Datenbankversion: **2**, internes Schema: **2**. Der Upgrade-Vorgang von Version 1 ergänzt in einer IDB-Upgrade-Transaktion den Store `plans`, setzt einen leeren Planbestand und erhöht Schema und Revision. Bestehende Datenrecords, freie Entwürfe und Wiederherstellungsbytes werden nicht umgeschrieben. Ein Abbruch rollt auch den Versionswechsel zurück.

| Store | Inhalt |
| --- | --- |
| `settings` | Profilrecord mit dem bisherigen Proteinziel |
| `entries` | Bisherige Lebensmitteleinträge, zusätzlich interne Reihenfolge; Index auf `date` |
| `sessions` | Bisherige Sessions einschließlich aller Sätze; interne Reihenfolge, Indizes auf `date` und `workout` |
| `drafts` | Aktiver Trainingszustand mit Auswahl, Übungsvorlage, Eingabewerten, Häkchen und Timer |
| `plans` | Profil, unveränderliche Plan-Startprofile, 32 datierte Slots je Plan, bestätigte Vorgaben und separate Session-Zuordnungen |
| `meta` | Migrationsphase, Schema, Revision und Referenz auf die alten Originalbytes |
| `recovery` | Unveränderter Migrationsstand, Sicherung vor Import und gegebenenfalls ein älterer Datenzweig |

Die internen `order`-Felder erhalten die ursprüngliche Array-Reihenfolge unabhängig von der Sortierung der IDB-Schlüssel. Beim Lesen werden sie geprüft und aus dem öffentlichen v2-Datenmodell entfernt. IDs und Nutzwerte werden nicht neu erzeugt oder umgerechnet.

Beim ersten Start wird der alte Rohtext einschließlich einer vorhandenen Sicherung vor Import gespeichert, bevor er geparst oder transformiert wird. Die Phasen sind `pending` → `verifying` → `ready`. Der Kopiervorgang ist eine Transaktion über alle beteiligten Stores. Danach werden Daten und Entwürfe zurückgelesen, validiert und gegen den erwarteten Stand verglichen. Erst nach dieser Prüfung wird die Migration aktiviert. Wiederholte Starts können an den gespeicherten Phasen ansetzen; parallele Starts prüfen den aktuellen Zustand innerhalb ihrer Transaktionen.

Die alten Schlüssel `vegan-strength-v2` und `vegan-strength-v2-before-import` bleiben als unveränderte Kopien erhalten, werden aber nicht mehr parallel beschrieben. Der localStorage-Vermerk `vegan-strength-storage` erkennt einen fehlenden früher aktiven Datenbankbestand. In diesem Fall ist eine ausdrückliche Wiederherstellung erforderlich; ein veralteter Snapshot wird nicht automatisch wiederbelebt.

Bestätigtes Löschen schreibt zunächst transaktional einen leeren Bestand, entfernt die Wiederherstellungskopien und setzt die Phase `clearing`. Danach werden die alten localStorage-Schlüssel entfernt. Unterbricht dieser Abschluss, wird er beim erneuten Laden fortgesetzt. Eine Fehlermeldung unterscheidet diesen Fall von einem vollständig abgebrochenen Schreibvorgang. Der nicht personenbezogene Speichervermerk bleibt bestehen.

Änderungen am Datenbankschema benötigen eine explizite Datenbank-/Schemaversion und eine weitere getestete Migration. Die App- und Backup-Version sind davon unabhängig.

## Datenkompatibilität

- Die bisherigen Datenfelder `goal`, `entries` und `sessions` behalten ihre Namen und Bedeutung.
- Alte v2-Backups und vollständige v2-Rohdaten ohne Exportmetadaten bleiben importierbar.
- Der separate v2-Export bleibt für ältere App-Versionen verfügbar; er enthält keine laufenden Trainingsentwürfe.
- Vollständige Backups verwenden `app: "Vegan Strength"`, `version: 4`, `exportedAt`, die bisherigen Datenfelder sowie `training` und `program`. Vollständige v3-Backups bleiben lesbar und erhalten einen leeren Planbestand.
- IDs, Reihenfolge, Dezimalwerte, Null-Gewichte und nicht abgeschlossene Sätze bleiben erhalten. Zeitbasierte Übungen verwenden im Altformat weiterhin `reps` für Sekunden.
- Die App-/Cache-Version `2.3.2` ist unabhängig von der Backup- und Datenbankversion.

`training` enthält `current` als Workout-Index, `drafts` als Zuordnung der Workout-Indizes zu den damaligen Workout-/Übungsnamen und Sätzen sowie `timer: { seconds, endAt }`. Freie Entwürfe werden weiterhin gegen die alten Vorlagen geprüft. Planentwürfe verwenden den Schlüssel `plan:<slotId>`, eine optionale `activeDraft`-Auswahl und einen eingefrorenen `context` mit Plan-/Slot-ID, Woche, Bewegungs-/Varianten-IDs, Einheiten, Gewichtsbedeutung, Satzvorgaben und Bewertungen. Namen und Satzanzahlen werden gegen diese geprüften Vorgaben validiert. Unfertige Eingaben dürfen als Strings erhalten bleiben, ohne in den gespeicherten Workout-Daten numerische Grenzwerte zu umgehen. Bei der Darstellung werden sie als HTML-Attributwerte escaped. Zukünftige Änderungen der Vorlagen benötigen auch einen Umgang mit bestehenden Entwürfen.

Backups werden vollständig geprüft; unbekannte Versionen und Felder werden nicht still entfernt. Vor dem bestätigten Import wird der bisherige Bestand einschließlich noch offener Eingaben in derselben Transaktion gesichert. Der v2-Kompatibilitätsexport enthält nur das bisherige Kerndatenformat; Profil, Ausführungsbewertungen, Varianten-Metadaten, Zuordnungen und Entwürfe werden dabei nicht exportiert. Normale Backups enthalten keine rekursiv verschachtelten Wiederherstellungskopien. Diese sind unter „Mehr“ separat herunterladbar.

## Trainingsentwürfe und Timer

Eingaben, Auswahl und Häkchen markieren den Entwurf als geändert. Eine Verzögerung von etwa 250 ms bündelt schnelle Eingaben; jede tatsächliche Sicherung läuft in der zentralen Aktionswarteschlange. Der Speicherstatus bestätigt erst das erfolgreiche Ende der Transaktion. Bei Fehlern bleiben die Werte im aktuellen Fenster erhalten und können erneut gespeichert werden. Ein sofortiger Prozessabbruch vor dieser Bestätigung kann die letzte noch ausstehende Eingabe verlieren.

Der Workout-Abschluss schreibt Historie und Entfernung des passenden Entwurfs gemeinsam. Anstehende Autosaves aus einem älteren Entwurfszustand werden nach Import, Löschen oder Abschluss verworfen. Beim manuellen Neuladen bleiben lokale Eingaben erhalten; eine schon ausstehende Autosicherung wird angehalten, damit sie nicht ungefragt einen frisch geladenen fremden Entwurf ersetzt.

Ein laufender Timer speichert seine absolute Endzeit. Beim Wiederöffnen und Zurückkehren in die App wird die Restzeit aus der Uhrzeit ermittelt. Ein bereits abgelaufener Timer wird mit null Sekunden angezeigt und startet nicht erneut. Hintergrundvibration und das Überleben noch unbestätigter Schreibvorgänge werden nicht zugesichert.

## Offline-Releases

`sw.js` führt HTML, CSS, Manifest, Icons und den vollständigen Modulgraphen in `ASSETS` auf. Alle Dateien müssen erfolgreich im neuen Cache liegen, bevor ein Release installiert ist. Das Vorladen umgeht den HTTP-Cache. Ein neuer Worker erzwingt keine Aktivierung über einer geöffneten Vorgängerversion; zum Wechsel müssen deren Tabs/Fenster geschlossen werden.

Ein aktiver Worker liest ausschließlich aus seinem Release-Cache. Fehlende Module werden nicht durch HTML oder Dateien aus einem anderen Release ersetzt. Bei einer fehlgeschlagenen Installation bleibt die bisherige Version verfügbar. Es werden nur alte Caches mit dem App-Präfix entfernt; lokale Nutzerdaten gehören nicht zum Service-Worker-Cache.

Bei jeder neuen Laufzeitdatei die Asset-Liste ergänzen. Bei jeder Veröffentlichung geänderter Laufzeitdateien die Cache-Version erhöhen und alle App-Dateien gemeinsam bereitstellen. Domain, Protokoll und Port möglichst beibehalten, damit die bisherigen Browserdaten erreichbar bleiben.

## Prüfung

Nach `npm ci` führt `npm test` die Daten-, Modul-, IndexedDB-, Entwurfs- und Service-Worker-Tests aus. `fake-indexeddb` ist ausschließlich eine Entwicklungsabhängigkeit; es wird nicht von der PWA geladen. UI-Tests verwenden echte Module mit synthetischem Speicher und einem kleinen DOM-Ersatz. Transaktionsabbrüche, blockierte Öffnungen, veränderte Rücklesewerte und Schreibfehler werden gezielt simuliert.

Der Modulgraph-Test meldet importierte Dateien, die im Offline-Cache fehlen. Die Offline-Tests prüfen auch Unterverzeichnis-Hosting, Installationsabbruch und die Trennung von Releases. Ein Browser-Neustart mit abgeschaltetem lokalen Server ergänzt diese Tests. Installation, Flugmodus und Prozessneustarts auf einem echten Android-Gerät bleiben Teil der späteren Geräteabnahme.

## Planfortschritt und Progression

`program` enthält `profile`, `activePlanId`, `plans` und `links`. Jeder Plan hat genau acht Wochen mit je vier Slots. Ein Slot hält Planwoche und Workout-Index getrennt von seinem verschiebbaren Datum. `links` verknüpft ausschließlich ausdrücklich gestartete Plantrainings über Session-ID und Slot-ID; bestehende Sessions werden nicht nachträglich zugeordnet.

Ein vollständiger Abschluss schreibt Session, Link, Slotstatus und Entfernung des passenden Entwurfs in derselben Transaktion. Teiltrainings speichern einen Link mit `completed: false` und lassen den Slot offen. Wiederholungen hängen weitere Sessions an denselben Slot; sie verbrauchen keinen weiteren Slot. Überspringen und Verschieben sind ausdrückliche Aktionen. Der nächste Vorschlag ist der erste offene Slot in Planreihenfolge. Die Kalenderwoche wird aus lokalen Kalendertagen ohne DST-Stundenfehler berechnet.

Zielvorgaben werden beim Öffnen einer Planeinheit materialisiert. Bestätigte Steigerungen oder Variantenwechsel verändern nur später neu angelegte Planentwürfe. Bereits gespeicherte Entwürfe behalten ihre damaligen Vorgaben. Freie Vorlagen übernehmen letzte Werte nur aus unzugeordneten Trainings mit passendem Übungsnamen; geplante Varianten werden nicht anhand der Übungsposition in freie Vorlagen übertragen.

Die Progressionsfunktion vergleicht zwei Einheiten derselben Bewegung und Variante an unterschiedlichen Trainingstagen. Sie prüft alle Zielsätze, denselben Wiederholungsbereich und dieselbe Last, erfasste Reserve von mindestens zwei Wiederholungen und bestätigte saubere Technik. Laststeigerungen werden ab Woche 5 angeboten, in Woche 8 ausgesetzt und auf die konfigurierten Schritte bzw. das verfügbare Kurzhantelinventar begrenzt. Sprünge über zehn Prozent werden nicht vorgeschlagen. Bereits verwendete Leistungen lösen nach Übernahme einer neuen Vorgabe keine weitere Steigerung aus. Diese Regeln sind konservative Produktentscheidungen; sie garantieren keinen individuellen Trainingsfortschritt.

Körpergewichtsvarianten, Hantelgewichte pro Hand, Gesamtlasten und Sekunden werden ausdrücklich unterschieden. Leere Gewichte in abgehakten geplanten Hantelsätzen werden zur Korrektur gemeldet. Freies Training behält seinen bisherigen Datenvertrag. Falls ein Plan nach einer Wiederherstellung in einem anderen Fenster fehlt, bleiben dessen eingefrorene Entwurfswerte erhalten; vor einem Abschluss ohne Plan-Zuordnung ist eine ausdrückliche Bestätigung nötig.

Die Planung verwendet die angegebenen Ausgangswerte (34 Jahre, 189 cm, 84 kg, 3 Klimmzüge, 6 Push-ups), vier Einheiten à 45 Minuten und das vorhandene Home-Gym. Die Basisvorgaben und Zeitannahmen sind in `docs/TRAININGSPLAN.md` dokumentiert. Einstellungen des Proteintrackers bleiben unabhängig vom Planfortschritt erhalten.
