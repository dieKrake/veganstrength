# Vegan Strength – Architektur nach Etappe 2

Die App wird direkt als statische Website ausgeliefert. HTML, CSS und native JavaScript-Module benötigen keinen Build-Schritt und laden keine externen Laufzeitbibliotheken. Lokal muss ein HTTP-Server verwendet werden; `file://` ist kein unterstützter Einstiegspunkt.

## Zuständigkeiten

| Bereich | Verantwortung |
| --- | --- |
| `index.html`, `styles/app.css` | Bestehende Oberfläche und Gestaltung |
| `src/main.js` | Browser-Einstieg und Behandlung von Startfehlern |
| `src/app.js` | Initialisierung, aktueller Datenstand und Reihenfolge der Schreibaktionen |
| `src/data/` | Bisherige Workout- und Lebensmittelvorlagen |
| `src/domain/` | v2-Validierung, lokale Kalendertage, Proteinberechnung und Statistik |
| `src/storage/` | Asynchrones Repository vor dem bisherigen localStorage-Adapter |
| `src/features/` | Startseite, Training, Protein, Verlauf und Einstellungen |
| `src/services/` | Pausentimer, Backup-Dateien und PWA-Ereignisse |
| `src/ui/` | Navigation und gemeinsame Anzeigeformatierung |
| `sw.js` | Vollständiger Release-Cache und Offline-Auslieferung |

Fachfunktionen in `domain/` kennen weder DOM noch Browser-Speicher. Features erhalten ihren Datenzugriff und ihre Aktionen bei der Initialisierung; sie verwenden `localStorage` nicht direkt. Dadurch kann eine andere Speicherimplementierung angeschlossen werden, ohne die einzelnen Ansichten auf IndexedDB umzuschreiben.

## Lesen und Schreiben

1. Das Repository lädt den v2-Datenstand. Bei nicht lesbaren Daten wird die bestehende Fehler- und Originaldatenansicht verwendet.
2. Die Oberfläche zeigt diesen bestätigten Datenstand. Trainingsentwürfe bleiben davon getrennt im Trainingsmodul.
3. Eine schreibende Benutzeraktion läuft in einer gemeinsamen Warteschlange. Ihr neuer Datenstand wird aus dem zuletzt bestätigten Stand abgeleitet.
4. Das Repository prüft und speichert den Kandidaten. Erst nach erfolgreichem Schreiben übernimmt die App ihn als aktiven Stand.
5. Die Speicherstatusanzeige und die betroffene Ansicht werden aktualisiert. Bei Fehlern bleiben der alte Datenstand und die Eingaben erhalten.

Die Warteschlange umfasst auch Import-Dateilesen und die zugehörige Bestätigung. Während ein Workout gespeichert wird, sind seine Eingabefelder und die Speicherschaltfläche gesperrt. Schnelle Mehrfachklicks erzeugen keine doppelten Workout-Abschlüsse. Andere Änderungen, etwa am Proteintracker, bauen die Trainingsfelder nicht neu auf.

Die asynchrone Repository-Schnittstelle umfasst `load()`, `write(candidate, options)`, `previous()` und `removePrevious()` sowie den Status `loaded`, `problem` und den gelesenen Originaltext `raw`. Der aktuelle Adapter implementiert intern weiterhin synchrone localStorage-Operationen. Die Warteschlange ist kein Ersatz für tabübergreifende Datenbanktransaktionen; Änderungen anderer Fenster werden weiterhin über den Vergleich mit dem zuletzt gelesenen Rohstand erkannt.

## Datenkompatibilität

- Primärer Schlüssel: `vegan-strength-v2`.
- Sicherung vor Import: `vegan-strength-v2-before-import`.
- Datenfelder und ihre Bedeutung: `goal`, `entries` und `sessions`; keine Schemaänderung.
- JSON-Backup: weiterhin `app: "Vegan Strength"` und `version: 2`.
- IDs, Reihenfolge, Dezimalwerte, Null-Gewichte und nicht abgeschlossene Sätze bleiben erhalten. Zeitbasierte Übungen verwenden im Altformat weiterhin `reps` für Sekunden.
- Die App-/Cache-Version `2.1.0` ist unabhängig von der Backup-Version.

Etappe 3 ergänzt IndexedDB und dauerhafte Trainingsentwürfe. Die geplante Migration muss den unveränderten Originalstand sichern, transaktional übernehmen, zurücklesen und prüfen. Sie ist in Etappe 2 noch nicht implementiert.

## Offline-Releases

`sw.js` führt HTML, CSS, Manifest, Icons und den vollständigen Modulgraphen in `ASSETS` auf. Alle Dateien müssen erfolgreich im neuen Cache liegen, bevor ein Release installiert ist. Das Vorladen umgeht den HTTP-Cache. Ein neuer Worker erzwingt keine Aktivierung über einer geöffneten Vorgängerversion; zum Wechsel müssen deren Tabs/Fenster geschlossen werden.

Ein aktiver Worker liest ausschließlich aus seinem Release-Cache. Fehlende Module werden nicht durch HTML oder Dateien aus einem anderen Release ersetzt. Bei einer fehlgeschlagenen Installation bleibt die bisherige Version verfügbar. Es werden nur alte Caches mit dem App-Präfix entfernt; lokale Nutzerdaten gehören nicht zum Service-Worker-Cache.

Bei jeder neuen Laufzeitdatei die Asset-Liste ergänzen. Bei jeder Veröffentlichung geänderter Laufzeitdateien die Cache-Version erhöhen und alle App-Dateien gemeinsam bereitstellen. Domain, Protokoll und Port möglichst beibehalten, damit die bisherigen Browserdaten erreichbar bleiben.

## Prüfung

`npm test` führt ohne Installation zusätzlicher Pakete die Daten-, Modul- und Service-Worker-Tests aus. Die UI-Tests verwenden echte Module mit synthetischem Speicher und einem kleinen DOM-Ersatz. Sie prüfen fachliches Verhalten und die Fehlerbehandlung, nicht das Rendering eines Android-Browsers.

Der Modulgraph-Test meldet importierte Dateien, die im Offline-Cache fehlen. Die Offline-Tests prüfen auch Unterverzeichnis-Hosting, Installationsabbruch und die Trennung von Releases. Ein Browser-Neustart mit abgeschaltetem lokalen Server ergänzt diese Tests. Installation, Flugmodus und Prozessneustarts auf einem echten Android-Gerät bleiben Teil der späteren Geräteabnahme.
