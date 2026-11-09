VEGAN STRENGTH – ANDROID PWA

Inhalt: index.html, styles/, src/, manifest.webmanifest, sw.js, icon-192.png, icon-512.png.

Schnell testen: python3 -m http.server 4173 --bind 127.0.0.1 starten und http://127.0.0.1:4173 im Browser öffnen. Die JavaScript-Module benötigen HTTP/HTTPS; direktes Öffnen über file:// wird nicht unterstützt.

Für Android installieren:
1. Die App-Dateien einschließlich styles/ und src/ auf einem statischen HTTPS-Host bereitstellen (z. B. GitHub Pages oder Netlify). Es ist kein Build-Schritt erforderlich.
2. Die HTTPS-Adresse in Chrome auf Android öffnen.
3. Chrome-Menü (⋮) > App installieren / Zum Startbildschirm hinzufügen.
4. Einmal vollständig online laden. Danach ist die App auch offline nutzbar.

Daten: ausschließlich im lokalen Browser-Speicher (localStorage). Keine Serverdatenbank, keine Anmeldung. In Einstellungen regelmäßig ein JSON-Backup exportieren. Das Löschen von Website-Daten oder Wechsel des Browsers löscht die lokal gespeicherten Einträge. Backups lassen sich importieren.

WICHTIG: Für Android-PWA-Funktionalität ist HTTPS oder localhost notwendig. Zum Aktualisieren alle geöffneten Tabs bzw. Fenster der App schließen und anschließend erneut öffnen. Eine neue Version aktiviert sich erst nach dem Schließen der bisherigen Version.

DATENSICHERHEIT (Etappe 1)
- Speicherformat und Schlüssel bleiben unverändert: vegan-strength-v2, JSON-Backup Version 2.
- Beschädigte oder unbekannte Daten werden nicht still bereinigt oder überschrieben. Der Hinweis oben in der App bietet den unveränderten Originalstand zum Herunterladen an, sofern er gelesen werden konnte.
- Ein Backup muss vollständig gültig sein. App-Kennung, Version, Kalenderdaten, Zahlen, IDs und Unterobjekte werden geprüft. Auch der vollständige bisherige Rohdatenstand (goal, entries, sessions) ohne Export-Metadaten bleibt importierbar.
- Vor dem bestätigten Ersetzen wird der bisherige Originalstand unter vegan-strength-v2-before-import gesichert. Schlägt diese Sicherung fehl, wird der Import abgebrochen. Die letzte Sicherung lässt sich unter „Mehr“ herunterladen und über die Dateiauswahl wieder importieren, sofern sie gültig ist. Jeder weitere Import ersetzt diese eine Sicherung.
- Speicherfehler lassen den aktiven Datenstand und laufende Trainingseingaben unverändert. Nach Änderungen in einem anderen Fenster müssen die Daten erneut geladen werden; der aktuelle Trainingsentwurf bleibt dabei erhalten.
- „Alle lokalen Daten löschen“ leert auch die Sicherung vor dem letzten Import. Beim Löschen aller Website-Daten geht ebenfalls beides verloren; regelmäßig ein Backup außerhalb des Browsers speichern.
- Trainingsentwürfe sind in dieser Etappe weiterhin nur bis zum Neuladen der Seite vorhanden. Dauerhafte Entwürfe folgen mit IndexedDB in Etappe 3.

ENTWICKLUNG UND TESTS
Lokal bereitstellen: python3 -m http.server 4173 --bind 127.0.0.1
Danach http://127.0.0.1:4173 öffnen. Browserdaten dieser Adresse sind von anderen Domains und Ports getrennt.

Regressionstests (Node.js 24, ohne Zusatzpakete):
npm test
Alternativ: node --test --test-isolation=none --test-reporter=spec tests/*.test.cjs

Die Tests führen die echten Anwendungsmodule mit synthetischem Speicher und einem kleinen DOM-Ersatz aus. Zusätzliche Service-Worker-Tests prüfen den vollständigen Modul-Cache und Offline-Antworten, auch bei Hosting in einem Unterverzeichnis. Sie ersetzen keine Android-Gerätetests. Die Fixture tests/fixtures/v2.json enthält ausschließlich erfundene Testdaten.

ARCHITEKTUR (Etappe 2)
- index.html enthält die Oberfläche, styles/app.css das bisherige Design und src/main.js den Einstiegspunkt.
- src/features/ enthält die Ansichten und ihre Bedienlogik; src/domain/ enthält Berechnungen und Validierung ohne DOM- oder Datenbankzugriff.
- src/storage/repository.js bietet die asynchrone Speicherschnittstelle. Dahinter arbeitet weiterhin der v2-localStorage-Adapter. Schreibaktionen werden innerhalb einer App-Instanz nacheinander verarbeitet.
- Timer, JSON-Backup und PWA-Integration liegen in src/services/. Die Navigation aktualisiert die jeweils betroffene Ansicht; bestehende Trainingsfelder bleiben bei fachfremden Änderungen bestehen.
- sw.js speichert das komplette Release unter vegan-strength-v2.1.0. Bei neuen Laufzeitdateien muss die Asset-Liste erweitert und bei veröffentlichten Änderungen die Cache-Version angehoben werden. Die Tests melden fehlende Module im Offline-Cache.
- package.json stellt nur den Testbefehl und den JavaScript-Modultyp bereit. Es gibt keine npm-Abhängigkeiten; npm install ist nicht nötig. Die App-Version 2.1.0 ändert weder Backup-Version 2 noch die bisherigen Speicherschlüssel.
- Weitere Hinweise zur Struktur und zur nächsten Speicherumstellung stehen in docs/ARCHITEKTUR.md.
