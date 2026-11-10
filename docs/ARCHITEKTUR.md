# Vegan Strength – Architektur nach Etappe 6

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

Die asynchrone Repository-Schnittstelle umfasst `load()`, `write(candidate, options)`, `querySessions(options)`, `loadTraining()`, `saveTraining()`, `loadProgram()`, `saveProgram()`, `loadNutrition()`, `saveNutrition()`, `previous()`, `migration()`, `conflict()` und `removePrevious()` sowie `loaded`, `problem` und den verfügbaren Originaltext `raw`. Ein normales Schreiben prüft in derselben IndexedDB-Transaktion die zuletzt gelesene Revision und erhöht sie. Veraltete Fenster dürfen weder Daten noch bestätigte Entwürfe überschreiben. `versionchange` schließt bestehende Verbindungen; blockierte Öffnungen erzeugen einen sichtbaren Fehler.

Unveränderte alte App-Versionen können weiterhin in ihren früheren localStorage-Schlüssel schreiben. Diese Änderungen werden beim nächsten Lese-/Schreibzugriff erkannt und nicht automatisch eingespielt. Bei einem ausdrücklich bestätigten Import können sowohl der bisherige Datenbankstand als auch dieser zusätzliche Datenzweig gesichert werden. Eine atomare Transaktion über IndexedDB und fremde alte localStorage-Schreiber gibt es nicht.

## Datenbank und Migration

Datenbankname: `vegan-strength`, Datenbankversion: **3**, internes Schema: **3**. Upgrades von Version 1 und 2 erfolgen in einer IDB-Upgrade-Transaktion. Version 1 erhält zusätzlich den Store `plans` und einen leeren Planbestand. Version 3 ergänzt `customFoods` und einen leeren Ernährungsbestand in `settings`. Bestehende Kerndaten, Pläne, Entwürfe und Wiederherstellungsbytes werden nicht umgeschrieben. Ein Abbruch rollt auch den Versionswechsel zurück.

| Store | Inhalt |
| --- | --- |
| `settings` | Profilrecord mit dem bisherigen Proteinziel; separater Ernährungsrecord mit Portionseinheiten und datierter Zielhistorie |
| `customFoods` | Wiederverwendbare Produkte mit stabiler ID, Name, g/ml, Protein pro 100 und interner Reihenfolge |
| `entries` | Bisherige Lebensmitteleinträge, zusätzlich interne Reihenfolge; Index auf `date` |
| `sessions` | Bisherige Sessions einschließlich aller Sätze; interne Reihenfolge, Indizes auf `date` und `workout` |
| `drafts` | Aktiver Trainingszustand mit Auswahl, Übungsvorlage, Eingabewerten, Häkchen und Timer |
| `plans` | Profil, unveränderliche Plan-Startprofile, 32 datierte Slots je Plan, bestätigte Vorgaben und separate Session-Zuordnungen |
| `meta` | Migrationsphase, Schema, Revision und Referenz auf die alten Originalbytes |
| `recovery` | Unveränderter Migrationsstand, Sicherung vor Import und gegebenenfalls ein älterer Datenzweig |

Die internen `order`-Felder erhalten die ursprüngliche Array-Reihenfolge unabhängig von der Sortierung der IDB-Schlüssel. Beim Lesen werden sie geprüft und aus dem öffentlichen v2-Datenmodell entfernt. IDs und Nutzwerte werden nicht neu erzeugt oder umgerechnet.

Beim ersten Start wird der alte Rohtext einschließlich einer vorhandenen Sicherung vor Import gespeichert, bevor er geparst oder transformiert wird. Die Phasen sind `pending` → `verifying` → `ready`. Der Kopiervorgang ist eine Transaktion über alle beteiligten Stores. Danach werden Kerndaten, Entwürfe, Plan- und Ernährungsbestand zurückgelesen, validiert und gegen den erwarteten Stand verglichen. Erst nach dieser Prüfung wird die Migration aktiviert. Wiederholte Starts können an den gespeicherten Phasen ansetzen; parallele Starts prüfen den aktuellen Zustand innerhalb ihrer Transaktionen.

Die alten Schlüssel `vegan-strength-v2` und `vegan-strength-v2-before-import` bleiben als unveränderte Kopien erhalten, werden aber nicht mehr parallel beschrieben. Der localStorage-Vermerk `vegan-strength-storage` erkennt einen fehlenden früher aktiven Datenbankbestand. In diesem Fall ist eine ausdrückliche Wiederherstellung erforderlich; ein veralteter Snapshot wird nicht automatisch wiederbelebt.

Bestätigtes Löschen schreibt zunächst transaktional einen leeren Bestand, entfernt die Wiederherstellungskopien und setzt die Phase `clearing`. Danach werden die alten localStorage-Schlüssel entfernt. Unterbricht dieser Abschluss, wird er beim erneuten Laden fortgesetzt. Eine Fehlermeldung unterscheidet diesen Fall von einem vollständig abgebrochenen Schreibvorgang. Der nicht personenbezogene Speichervermerk bleibt bestehen.

Änderungen am Datenbankschema benötigen eine explizite Datenbank-/Schemaversion und eine weitere getestete Migration. Die App- und Backup-Version sind davon unabhängig.

## Datenkompatibilität

- Die bisherigen Datenfelder `goal`, `entries` und `sessions` behalten ihre Namen und Bedeutung.
- Alte v2-Backups und vollständige v2-Rohdaten ohne Exportmetadaten bleiben importierbar.
- Der separate v2-Export bleibt für ältere App-Versionen verfügbar; er enthält keine laufenden Trainingsentwürfe.
- Vollständige Backups verwenden `app: "Vegan Strength"`, `version: 5`, `exportedAt`, die bisherigen Datenfelder sowie `training`, `program` und `nutrition`. Versionen 2–4 bleiben lesbar. Alte Backups erhalten einen leeren Ernährungsbestand; v2/v3 zusätzlich einen leeren Planbestand.
- IDs, Reihenfolge, Dezimalwerte, Null-Gewichte und nicht abgeschlossene Sätze bleiben erhalten. Zeitbasierte Übungen verwenden im Altformat weiterhin `reps` für Sekunden.
- Die App-/Cache-Version `2.5.1` ist unabhängig von der Backup- und Datenbankversion.

`training` enthält `current` als Workout-Index, `drafts` als Zuordnung der Workout-Indizes zu den damaligen Workout-/Übungsnamen und Sätzen sowie `timer: { seconds, endAt }`. Freie Entwürfe werden weiterhin gegen die alten Vorlagen geprüft. Planentwürfe verwenden den Schlüssel `plan:<slotId>`, eine optionale `activeDraft`-Auswahl und einen eingefrorenen `context` mit Plan-/Slot-ID, Woche, Bewegungs-/Varianten-IDs, Einheiten, Gewichtsbedeutung, Satzvorgaben und Bewertungen. Namen und Satzanzahlen werden gegen diese geprüften Vorgaben validiert. Unfertige Eingaben dürfen als Strings erhalten bleiben, ohne in den gespeicherten Workout-Daten numerische Grenzwerte zu umgehen. Bei der Darstellung werden sie als HTML-Attributwerte escaped. Zukünftige Änderungen der Vorlagen benötigen auch einen Umgang mit bestehenden Entwürfen.

Backups werden vollständig geprüft; unbekannte Versionen und Felder werden nicht still entfernt. Vor dem bestätigten Import wird der bisherige Bestand einschließlich noch offener Eingaben in derselben Transaktion gesichert. Der v2-Kompatibilitätsexport enthält nur das bisherige Kerndatenformat; Profil, Ausführungsbewertungen, Varianten-Metadaten, Zuordnungen, Entwürfe, Lebensmittelbibliothek, Portionseinheiten und Zielhistorie werden dabei nicht exportiert. Normale Backups enthalten keine rekursiv verschachtelten Wiederherstellungskopien. Diese sind unter „Mehr“ separat herunterladbar.

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


## Lebensmittelbibliothek und Ernährungsverlauf

`nutrition` enthält `foods: [{ id, name, unit, protein }]`, `entryUnits: [{ entryId, unit }]` und `goals: [{ date, goal }]`. `unit` ist ausschließlich `g` oder `ml`; `protein` bleibt Gramm Protein pro 100 dieser Einheit. Produkte dürfen gleiche Namen mit unterschiedlichen Nährwerten besitzen. Produktreihenfolge und IDs bleiben bei Export und Wiederherstellung erhalten.

Verzehrte Portionen behalten das bisherige v2-Format mit einer Momentaufnahme von Name, Menge und Protein pro 100. Ein Katalogprodukt zu bearbeiten oder zu entfernen verändert diese Portionen nicht. Die Einheit neuer Portionen wird separat über deren ID gespeichert. Bei Altbeständen bleibt die nicht bekannte Einheit ausdrücklich `g/ml`; der Import erfindet keine Zuordnung. Das Entfernen einer Portion entfernt auch ihre Einheitenzuordnung in derselben Transaktion. „Für heute wiederholen“ erzeugt eine neue ID mit heutigen Datum und den Originalwerten der Portion.

Historische Produkte werden nur als ausdrücklich zu ladende Vorschläge angeboten. Name, Nährwert und bekannte Einheit bestimmen die Unterscheidung; gleiche Namen mit unterschiedlichen Proteinwerten werden nicht zusammengeführt. Für alte g/ml-Werte muss die Einheit vor dem Speichern geprüft werden. Das Speichern eines Produkts allein erzeugt keinen Verzehreintrag.

Die Zielhistorie beginnt mit dem ersten normalen bestätigten Schreibvorgang dieser Version und dem an diesem lokalen Kalendertag beobachteten Ziel. Jede spätere Zieländerung gilt ab ihrem Änderungstag. Mehrere Änderungen am selben Tag behalten den zuletzt gespeicherten Tageswert. Vor dem ersten historischen Eintrag bleibt das damalige Ziel unbekannt. Ein Import übernimmt vorhandene v5-Zielhistorie exakt; alte Backups enthalten keine solche Historie. Der aktuelle Tagestracker kann das bekannte aktuelle `goal` anzeigen, während frühere Tage ohne Historie keinen Zielprozentsatz erhalten.

Die Statistik bietet 7, 28 und 56 lokale Kalendertage einschließlich heute. Der Kalendertage-Mittelwert zählt Tage ohne Einträge als 0; der separat bezeichnete Mittelwert erfasster Tage zählt jeden Tag mit mindestens einem Eintrag, auch bei 0 g Protein. Die bisherige Kennzahl „Ø letzte 7 Tage“ bleibt unabhängig von der gewählten Diagrammspanne erhalten. Zielerreichung zählt ausschließlich Tage mit bekanntem historischen Ziel. Das Diagramm ist horizontal scrollbar und öffnet bei den neuesten Tagen; alle Werte stehen zusätzlich in einer zugänglichen Tabelle. Ernährungs- und Kraftauswertung arbeiten aus dem weiterhin vollständig validiert geladenen App-Bestand. Die Trainingsliste verwendet jetzt gefilterte, blätterbare Leseabfragen über den vorhandenen Datumsindex. Ein vollständig verzögertes Laden sämtlicher App-Daten ist damit nicht eingeführt.

Produkt-, Portions- und Zieländerungen, Import sowie die Sicherung vor Import verwenden dieselbe Revisionsprüfung und atomare Transaktion wie die übrigen Nutzdaten. Ein fehlgeschlagener Schreibvorgang veröffentlicht keinen neuen Katalog und lässt Eingabefelder erhalten. Fehlerhafte gespeicherte Zusatzdaten führen zu einem sichtbaren Ladefehler mit Rohdatenexport; sie werden nicht als leerer Katalog akzeptiert.


## Kraftauswertung und Trainingshistorie

`domain/strength.js` erstellt ausschließlich abgeleitete Ansichten. Verknüpfte Plantrainings werden anhand Bewegungs-ID, Varianten-ID, Einheit und Gewichtsbedeutung gruppiert. Plan-IDs sind kein Teil des Vergleichsschlüssels: identische bekannte Varianten verschiedener Pläne können gemeinsam betrachtet werden. Unverknüpfte Daten bleiben in getrennten Gruppen je unverändertem Originalnamen. Ein eindeutiger bekannter Name kann Wiederholungen bzw. Sekunden erkennen lassen, bestätigt aber weder Variante noch Gewichtsbedeutung. Unbekannte Einheiten bleiben unbekannt; sie erzeugen keine Grafik mit erfundener Einheit.

Für Wiederholungen bzw. Sekunden werden nur abgehakte Sätze bei derselben tatsächlich erfassten Last verglichen. Pro Training wird der größte Satzwert gewählt; bei mehreren gleichen Werten bleibt der erste passende Satz maßgeblich. Der alternative Lastverlauf wählt die höchste Last je Training und dann den größten Wiederholungswert unter den Sätzen genau dieser Last. Er kombiniert keine Last mit Wiederholungen aus einem anderen Satz. Die Zahl der abgehakten Sätze bei dieser Last bleibt sichtbar. Null-Gewichte, Dezimalwerte und echte Null-Werte bleiben gültig. Nicht abgehakte Sätze fehlen im Diagramm, bleiben aber in den Details erhalten.

`ui/strength-chart.js` erzeugt ein lokales SVG ohne externe Downloads. Die X-Abstände verwenden Kalendertage, die Y-Achse beginnt bei null. Zwischen fehlenden Tagen werden keine Nullwerte ergänzt. Planwerte werden verbunden; unbestätigte freie/ältere Werte sind nur Punkte. Gleichdatierte Trainings bleiben getrennte Werte und können in der Grafik überlappen; die Tabelle zeigt sie einzeln. Das Diagramm begrenzt die Darstellung auf die letzten 120 Werte. Die begleitende Tabelle enthält alle Werte der Auswahl, blätterbar zu 20 Zeilen, mit Zugang zum Originaltraining.

`features/strength.js` verwaltet Auswahl und Darstellung. `features/history.js` bietet Filter, Seiten und eine fokussierbare Detailansicht mit allen Originalwerten, Status und bekannten Planmetadaten. Filter werden beim Anwenden validiert. Antworten älterer Anfragen dürfen neuere Filter nicht überschreiben; Fehler behalten zuvor angezeigte Zeilen mit einem ausdrücklichen Hinweis.

`querySessions({ from, to, workout, offset, limit })` liest in einer Transaktion über `meta` und `sessions`. Es prüft die geladene Revision, nutzt den vorhandenen Index `date` rückwärts, springt über Daten oberhalb der Bis-Grenze und beendet unterhalb der Von-Grenze. Die Grenzen sind einschließlich. Es werden nur die angeforderten Seitenzeilen im Ergebnis gesammelt; passende Zeilen werden für die Gesamtzahl gezählt. Bei gleichem Datum ist die rückwärtige IDB-Schlüsselreihenfolge maßgeblich. `order` wird aus den Ergebniszeilen entfernt, ohne die gespeicherten Originalarrays umzuschreiben. Datenbanken ohne diesen Index können mit derselben Sortierung ausgelesen werden; dafür wird kein spontanes Schema-Upgrade vorgenommen. Der alte localStorage-Testadapter verwendet `domain/history.js` über den bereits geladenen Bestand.

Das Startladen validiert weiterhin den vollständigen Bestand. Die indexbasierten Leseabfragen und die Begrenzung der DOM-Zeilen verbessern die Historienansicht; sie stellen keinen vollständig neuen Lade-/Schreibansatz für große Datenbestände dar. Datenbank-/Schemaversion 3, v2-Kerndatenvertrag und vollständiges Backup 5 bleiben unverändert.

## Vollständigkeitsprüfung und Update-Vorbereitung

Der aktive Service Worker beantwortet `CHECK_OFFLINE` über einen MessageChannel mit `OFFLINE_STATUS`, `complete` und seiner Cache-Version. Er prüft alle Assets ausschließlich in seinem Release-Cache. Fehlende Dateien werden gemeldet, ohne Nutzdaten zu ändern. Die Oberfläche behandelt fehlende Kontrolle, alte Worker ohne Antwort, Zeitüberschreitung und Cache-Lücken als nicht bestätigte Offline-Bereitschaft. Eine vollständige Antwort ist eine Momentaufnahme; sie verhindert keine spätere browserseitige Cache-Freigabe.

Eine vollständig installierte wartende Version erhält einen sichtbaren Hinweis. Der Vorbereitungsbutton ruft `training.flush()` auf, wartet auf die gemeinsame Schreibwarteschlange und prüft `isSaved()` sowie den Speicherstatus. Erst bei Erfolg fordert die App zum Schließen aller Appfenster auf. Es gibt weder `skipWaiting` noch ein automatisches Neuladen. Profil-/Lebensmittelformulare sind keine Trainingsentwürfe und werden ausdrücklich vor dem Schließen übernommen. Der neue Worker aktiviert sich nach dem Schließen der bisherigen Clients; seine Aktivierung verändert weder IndexedDB noch Backups.

Die automatisierten Prüfungen umfassen unter anderem Cache-Lücken trotz erfolgreicher Registrierung, unbekannte alte Worker, vollständig installierte vs. noch ladende Updates und erfolgreiche/fehlgeschlagene Entwurfstransaktionen. Die Android-Abnahme ist getrennt in `ANDROID-ABNAHME.md` dokumentiert.
