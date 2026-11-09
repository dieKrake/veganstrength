VEGAN STRENGTH – ANDROID PWA

Inhalt: index.html, manifest.webmanifest, sw.js, icon-192.png, icon-512.png.

Schnell testen: index.html im Browser öffnen. Die lokale Speicherung funktioniert je nach Browser auch hier, aber Installation und zuverlässiges Offline-Caching erfordern HTTPS.

Für Android installieren:
1. Den gesamten Ordner auf einem statischen HTTPS-Host bereitstellen (z. B. GitHub Pages oder Netlify).
2. Die HTTPS-Adresse in Chrome auf Android öffnen.
3. Chrome-Menü (⋮) > App installieren / Zum Startbildschirm hinzufügen.
4. Einmal vollständig online laden. Danach ist die App auch offline nutzbar.

Daten: ausschließlich im lokalen Browser-Speicher (localStorage). Keine Serverdatenbank, keine Anmeldung. In Einstellungen regelmäßig ein JSON-Backup exportieren. Das Löschen von Website-Daten oder Wechsel des Browsers löscht die lokal gespeicherten Einträge. Backups lassen sich importieren.

WICHTIG: Auf dem lokalen file://-Pfad funktionieren Service Worker und App-Installation nicht. Für Android-PWA-Funktionalität ist HTTPS oder localhost notwendig.

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
node --test --test-isolation=none --test-reporter=spec tests/data-safety.test.cjs

Die Tests führen den echten Anwendungscode mit synthetischem Speicher und einem kleinen DOM-Ersatz aus. Sie prüfen Daten- und Fehlerfälle, ersetzen aber keine Android-/Offline-Gerätetests. Die Fixture tests/fixtures/v2.json enthält ausschließlich erfundene Testdaten.
