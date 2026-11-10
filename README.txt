VEGAN STRENGTH – ANDROID PWA

Inhalt: index.html, styles/, src/, manifest.webmanifest, sw.js, icon-192.png, icon-512.png.

Schnell testen: python3 -m http.server 4173 --bind 127.0.0.1 starten und http://127.0.0.1:4173 im Browser öffnen. Die JavaScript-Module benötigen HTTP/HTTPS; direktes Öffnen über file:// wird nicht unterstützt.

Für Android installieren:
1. Die App-Dateien einschließlich styles/ und src/ auf einem statischen HTTPS-Host bereitstellen (z. B. GitHub Pages oder Netlify). Es ist kein Build-Schritt erforderlich.
2. Die HTTPS-Adresse in Chrome auf Android öffnen.
3. Chrome-Menü (⋮) > App installieren / Zum Startbildschirm hinzufügen.
4. Einmal vollständig online laden. Danach ist die App auch offline nutzbar.

Daten: ausschließlich im lokalen Browser-Speicher (IndexedDB). Vorhandene v2-Daten aus localStorage werden abgesichert übernommen. Keine Serverdatenbank, keine Anmeldung. In Einstellungen regelmäßig ein JSON-Backup exportieren. Das Löschen von Website-Daten oder Wechsel des Browsers löscht die lokal gespeicherten Einträge. Backups lassen sich importieren.

WICHTIG: Für Android-PWA-Funktionalität ist HTTPS oder localhost notwendig. Zum Aktualisieren alle geöffneten Tabs bzw. Fenster der App schließen und anschließend erneut öffnen. Eine neue Version aktiviert sich erst nach dem Schließen der bisherigen Version.

DATENSICHERHEIT UND WIEDERAUFNAHME (Etappe 5)
- Datenbank: vegan-strength, Version 3. Eigene Lebensmittel, Settings, Lebensmitteleinträge, Trainings, Entwürfe, Pläne, Migrationszustand und Wiederherstellungskopien liegen in getrennten Stores. Vorhandene Datenbankbestände der Versionen 1 und 2 werden transaktional erweitert; alte Einträge, Entwürfe und Sicherungen bleiben erhalten.
- Bei der ersten Übernahme wird der bisherige Rohstand unverändert in der Datenbank gesichert. Erst danach wird er validiert, transaktional übernommen und zurückgelesen. IDs, Reihenfolge, Werte und Proteinberechnung bleiben erhalten.
- Die alten Schlüssel vegan-strength-v2 und vegan-strength-v2-before-import bleiben zunächst als Originalkopien erhalten. Nach erfolgreicher Umstellung werden sie nicht mehr parallel beschrieben und nicht bei jedem Start erneut importiert. Der Vermerk vegan-strength-storage verhindert eine versehentliche erneute Übernahme, falls ein früher aktiver Datenbankbestand fehlt.
- Beschädigte oder unbekannte Daten werden nicht still bereinigt. Originaldaten sind über den Fehlerhinweis herunterladbar, sofern sie gelesen werden konnten. Die Migrationskopie ist unter „Mehr“ separat herunterladbar.
- Ohne verfügbaren Gerätespeicher entsteht kein leerer Ersatzbestand in localStorage. Andere Fenster und blockierte Speicheraktualisierungen werden gemeldet. Bei Änderungen durch eine alte App-Version bleiben beide Datenstände erhalten; sie werden nicht automatisch zusammengeführt.
- Trainingseingaben werden ab der Eingabe gebündelt nach etwa 250 ms gespeichert. Der sichtbare Status bestätigt erst den erfolgreichen Abschluss. Nach einem Neustart werden Auswahl, Satzwerte, Häkchen und Timer-Endzeit wiederhergestellt. Eine noch nicht bestätigte Eingabe kann bei sofortigem Prozessabbruch fehlen.
- Beim Workout-Abschluss werden Training und Entfernung des zugehörigen Entwurfs in derselben Transaktion gespeichert. Schlägt diese fehl, bleiben Historie und bestätigter Entwurf unverändert.
- Vollständige JSON-Backups haben Version 5 und enthalten Profil, Pläne, Trainingszuordnungen, eingefrorene Übungsvorgaben, Ausführungsbewertungen, Entwürfe, Timer, eigene Produkte, Portionseinheiten und Zielhistorie. Versionen 2, 3 und 4 bleiben importierbar; Version 2 bleibt separat exportierbar; dieser Export enthält ausschließlich Ziel, Lebensmittel und abgeschlossene Trainings. Die zugrunde liegenden v2-Feldnamen und Bedeutungen bleiben erhalten.
- Ein Import wird vollständig geprüft und vor dem Ersetzen bestätigt. Der bisherige Datenstand einschließlich offener Eingaben wird in derselben Transaktion gesichert. Die Sicherung vor dem letzten Import lässt sich unter „Mehr“ herunterladen. Jeder weitere Import ersetzt diese eine Sicherung.
- Vollständige Backups enthalten keine verschachtelten Wiederherstellungskopien. Migrationskopie und Sicherung vor dem Import sind separat herunterladbar. Regelmäßig eine Backup-Datei außerhalb des Browsers speichern.
- „Alle lokalen Daten löschen“ entfernt auch Entwürfe, Wiederherstellungskopien und alte v2-Schlüssel. Ein dauerhafter Löschzustand verhindert bei Unterbrechung das Wiedereinspielen alter Daten. Falls das Entfernen alter Kopien fehlschlägt, zeigt die App den noch offenen Abschluss an und setzt ihn beim erneuten Laden fort.

TRAININGSPLAN VERWENDEN
1. Unter „Mehr“ > „Dein Profil & Home-Gym“ Ausgangswerte, Ausrüstung, Proteinziel und Gewichtsschritte prüfen. Verfügbare Kurzhantelgewichte können mit Semikolon getrennt eingetragen werden; leer bedeutet, dass Vorschläge den konfigurierten Schritt nutzen.
2. Unter „Training“ > „Dein 8-Wochen-Plan“ > „Plan starten oder neu beginnen“ das Datum für Upper A wählen. Der Plan hat 32 Einheiten im bisherigen Vierer-Split. Profileinstellungen werden beim Start als Plan-Ausgangsstand festgehalten; spätere Basiswertänderungen gelten für neue Pläne.
3. Eine Planeinheit aus der Wochenübersicht oder über die Startseite öffnen. Der Planbereich klappt beim Öffnen zu. Alte freie Entwürfe bleiben separat vorhanden und sind über „Freies Training“ erreichbar.
4. Übungen, Gewichtsbedeutung, Zielbereich und Pause ablesen. Bei Bedarf Wiederholungen in Reserve im letzten Satz und die saubere Ausführung erfassen. Der laufende Pausentimer bleibt über der unteren Navigation erreichbar.
5. Vollständig absolvierte Zielsätze schließen die Planeinheit ab. Ein bestätigtes Teiltraining speichert die tatsächlichen Werte und lässt die Einheit offen. Wiederholen zählt nicht als zweite Plan-Einheit; freie Trainings verändern den Planfortschritt nicht.
6. Offene Einheiten können verschoben, übersprungen und wieder eingeplant werden. Neue Pläne archivieren die bisherigen Pläne samt Zuordnungen. Die Empfehlung richtet sich nach offenen Planeinheiten, nicht nach der Gesamtzahl aller Workouts.
7. Unter „Letzte Werte & nächste Steigerung“ Vorschläge prüfen und ausdrücklich übernehmen. Sie gelten für neu geöffnete Plantrainings; vorhandene Entwürfe und vergangene Werte bleiben unverändert.

Die Zeitwerte sind Schätzungen aus Wiederholungsdauer, beidseitiger Ausführung, Seitenwechseln, Satzpausen, fünf Minuten Aufwärmen, Wechselzeiten und Puffer. Die Basispläne liegen rechnerisch bei etwa 28–38 Minuten innerhalb des 45-Minuten-Budgets. Die tatsächliche Trainingsdauer muss individuell überprüft werden.

ENTWICKLUNG UND TESTS
Lokal bereitstellen: python3 -m http.server 4173 --bind 127.0.0.1
Danach http://127.0.0.1:4173 öffnen. Browserdaten dieser Adresse sind von anderen Domains und Ports getrennt.

Regressionstests (Node.js 24):
npm ci
npm test
Alternativ: node --test --test-isolation=none --test-reporter=spec tests/*.test.cjs

Die Tests führen die echten Anwendungsmodule mit synthetischem Speicher und einem kleinen DOM-Ersatz aus. Zusätzliche Service-Worker-Tests prüfen den vollständigen Modul-Cache und Offline-Antworten, auch bei Hosting in einem Unterverzeichnis. IndexedDB- und Migrationstests verwenden fake-indexeddb als reine Entwicklungsabhängigkeit. Sie ersetzen keine Android-Gerätetests. Die Fixture tests/fixtures/v2.json enthält ausschließlich erfundene Testdaten.

ARCHITEKTUR (Etappe 5)
- index.html enthält die Oberfläche, styles/app.css das bisherige Design und src/main.js den Einstiegspunkt.
- src/features/ enthält die Ansichten und ihre Bedienlogik; src/domain/ enthält Berechnungen und Validierung ohne DOM- oder Datenbankzugriff.
- src/storage/repository.js bietet die asynchrone Speicherschnittstelle. Dahinter arbeitet jetzt der IndexedDB-Adapter; der alte Adapter bleibt für Kompatibilitätstests erhalten. Schreibaktionen werden innerhalb einer App-Instanz nacheinander verarbeitet.
- Timer, JSON-Backup und PWA-Integration liegen in src/services/. Die Navigation aktualisiert die jeweils betroffene Ansicht; bestehende Trainingsfelder bleiben bei fachfremden Änderungen bestehen.
- sw.js speichert das komplette Release unter vegan-strength-v2.4.2. Bei neuen Laufzeitdateien muss die Asset-Liste erweitert und bei veröffentlichten Änderungen die Cache-Version angehoben werden. Die Tests melden fehlende Module im Offline-Cache.
- package.json stellt den Testbefehl und den JavaScript-Modultyp bereit. Nur die Tests benötigen fake-indexeddb; die ausgelieferte PWA hat weiterhin keine npm-Laufzeitabhängigkeiten. App-/Cache-Version 2.4.2, Datenbankversion 3 und Backup-Version 5 sind unabhängig.
- Weitere Hinweise zur Struktur, zur Migration und zum Backup-Format stehen in docs/ARCHITEKTUR.md.

LEBENSMITTEL UND ERNÄHRUNGSVERLAUF
1. Unter Protein Name, Einheit (g oder ml) und Protein pro 100 eingeben. „In meiner Bibliothek speichern“ legt ein wiederverwendbares Produkt an, ohne eine Portion einzutragen. „Einmalige Portion eintragen“ bleibt für schnelle Einzeleinträge verfügbar.
2. Gespeicherte Produkte sind im Lebensmittel-Menü mit ★ markiert. Menge und Datum wählen und „Hinzufügen“ drücken. Bearbeiten und Entfernen in „Meine Lebensmittel“ verändern keine früher erfassten Portionen.
3. „Aus früheren Einträgen übernehmen“ bietet unterschiedliche frühere Produkte als Vorschläge. Alte g/ml-Angaben vor dem Speichern prüfen. Unterschiedliche Nährwerte bei gleichem Namen werden nicht automatisch zusammengeführt.
4. Mit den Tagespfeilen, „Heute“ oder dem Datumsfeld navigieren. „Für heute wiederholen“ kopiert eine alte Portion mit ihren damaligen Werten als neuen heutigen Eintrag.
5. Unter Verlauf 7, 28 oder 56 Tage auswählen. Das Diagramm zeigt die neuesten Tage zuerst im sichtbaren Bereich; ältere Tage sind horizontal erreichbar. Alle Tageswerte stehen auch als Tabelle bereit. Mittelwerte über alle Kalendertage und nur erfasste Tage werden getrennt bezeichnet. Die bisherige Sieben-Tage-Kennzahl bleibt erhalten.
6. Neue Ziele werden ab dem jeweiligen Änderungstag geführt. Die Historie beginnt beim ersten normalen Speichern dieser Version. Frühere unbekannte Ziele bleiben unbekannt. Mehrere Zieländerungen an einem Tag verwenden den zuletzt gespeicherten Wert.
7. Für einen Wechsel zwischen localhost, 127.0.0.1, Ports oder einer öffentlichen Domain ein vollständiges Backup exportieren und auf der Zieladresse wiederherstellen. Diese Adressen haben getrennte Browserdaten.

PRÜFSTAND ETAPPE 5 – 10. NOVEMBER 2026
131 automatisierte Tests bestehen, einschließlich Upgrade-Rollback, Produkt-/Portionshistorie, Kalendergrenzen, Zielhistorie, v2–v5-Backups, Speicherfehlern und unverändertem Trainingsverhalten.
Im lokalen Browser wurde der vorhandene synthetische Datenbankbestand erweitert, ohne Plan oder Entwürfe zu verlieren. Ein Produkt wurde gespeichert und geändert; die frühere Portion behielt ihren Nährwert. Ein v5-Download wurde auf einer separaten leeren Testadresse wiederhergestellt. Nach Abschalten des Servers startete ein neuer Tab mit dem vollständigen Bestand. Der dort offline erneut exportierte Bestand stimmt einschließlich Plan, beiden Entwürfen, Produkten, Portionseinheiten und Zielhistorie exakt mit dem importierten Backup überein (abgesehen vom Exportzeitstempel).
Die manuellen Browser-Abläufe wurden mit 2.4.1 geprüft. 2.4.2 ergänzt einen automatisiert geprüften Wiederherstellungsfall nach fehlerhaftem Neuladen sowie die neue Cache-Version.
Die echte Android-Geräteabnahme mit Installation, Flugmodus, System-Dateiauswahl und Prozessneustart bleibt offen. Kraftdiagramme folgen in Etappe 6.
