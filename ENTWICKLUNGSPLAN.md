# Vegan Strength – Bestandsanalyse und Entwicklungsplan

Bestandsaufnahme: 9. November 2026, vor Beginn der Umsetzung. Die Abschnitte 1–8 dokumentieren diesen Ausgangsstand; der aktuelle Umsetzungsstand folgt in Abschnitt 9.

## 1. Projektstruktur und Ausgangslage

```text
vegan-strength-android/
├── index.html             HTML, CSS, Datenmodell, Geschäftslogik und UI
├── manifest.webmanifest   Name, Startpfad, Standalone-Anzeige und Icons
├── sw.js                  Service Worker und App-Cache
├── icon-192.png
├── icon-512.png
└── README.txt             Installation und Hinweise zur Speicherung
```

Die Anwendung verwendet JavaScript ohne Framework, Paketmanager oder Build-Schritt. Es gibt keine extern geladenen Laufzeitbibliotheken, kein Backend und keine Anmeldung. Ein funktionierendes Git-Repository und automatisierte Tests sind im bereitgestellten Projekt nicht vorhanden; das Verzeichnis `.git` ist leer. Die vorhandenen `.agents`- und `.codex`-Verzeichnisse enthalten keine Projektanweisungen.

Empfehlung: die kleine statische PWA schrittweise modularisieren. Ein Framework-Wechsel und ein nativer Android-Umbau sind für die Anforderungen derzeit nicht erforderlich.

## 2. Anforderungen und vorhandene Funktionen

| Anforderung | Im Code vorhanden | Geplante Ergänzung |
| --- | --- | --- |
| Android / Mobile First | Dunkles Kartenlayout, feste untere Navigation, numerische Tastaturen, Safe-Area-Abstand | Größere Touch-Ziele, stabile Eingabefokussierung, Prüfung mit Android-Tastatur und kleinen Displays |
| Installation / Offline | Manifest, zwei Icons, Installationsbutton nach Browserereignis, Service Worker mit App-Cache | Verlässlicher Update-Ablauf, Offline-Start und Installation auf Android praktisch prüfen |
| Workout-Tracker | Vier Vorlagen, Wiederholungen/Sekunden, kg, Satzhäkchen, automatische Pausen, Übernahme letzter Werte, Historie und Details | Entwürfe automatisch sichern, Einheiten und Varianten explizit machen, bessere Detailansicht |
| Individueller 8-Wochen-Plan | Upper A, Lower A, Upper B, Lower B + Upper; allgemeiner Progressionstext | Planstart, Wochenzustand, konkrete Wochenvorgaben und Progressionsvorschläge |
| Veganer Proteintracker | 12 Standardlebensmittel, eigene Einträge, Mengen, Datumsauswahl, Tagesziel und Löschen | Eigene Produkte dauerhaft als wiederverwendbare Bibliothek speichern |
| Fortschrittsdiagramme | Proteinbalken für sieben Tage, Sieben-Tage-Mittelwert und Trainingsanzahl | Kraftverläufe pro vergleichbarer Übung, längere Ernährungszeiträume und Zielbezug |
| Lokale Speicherung | Ein JSON-Dokument in localStorage | Versionierte, transaktionale IndexedDB-Speicherung mit abgesicherter Migration |
| JSON-Backup | Export mit Version 2; bestätigender, ersetzender Import | Strenge Formatprüfung, Vorschau, Sicherung vor Import und vollständiges neues Backup |
| Einfache Trainingsbedienung | Satzabhaken startet übungsspezifischen Timer; letzte Eingaben innerhalb der Sitzung | Wiederaufnahme nach Neuladen, sichtbarer Speicherstatus, weniger vollständige UI-Neuaufbauten |

Die im Code erkennbaren Funktionen müssen als bestehendes Verhalten erhalten bleiben. Ihre tatsächliche Funktion auf einem Android-Gerät ist durch die Quellcodeanalyse allein noch nicht bestätigt.

## 3. Bestehender Datenvertrag

Speicherort: `localStorage`, Schlüssel **`vegan-strength-v2`**. Der gespeicherte Zustand enthält diese Felder:

```json
{
  "goal": 150,
  "entries": [
    {
      "id": "food-1",
      "date": "2026-11-09",
      "name": "Naturtofu",
      "amount": 200,
      "protein": 15
    }
  ],
  "sessions": [
    {
      "id": "session-1",
      "date": "2026-11-09",
      "workout": "Upper A",
      "exercises": [
        {
          "name": "Klimmzüge",
          "sets": [{ "reps": 2, "kg": 0, "done": true }]
        }
      ]
    }
  ]
}
```

Wichtige Semantik:

- `protein` bezeichnet Gramm Protein **pro 100 g/ml**, nicht den Proteinwert der Portion. Tagesprotein ist die Summe von `amount * protein / 100`.
- `date` ist ein lokaler Kalendertag im Format `YYYY-MM-DD`. Bei einer Migration nicht in UTC-Tage umwandeln.
- `kg: 0` ist ein gültiger Wert. Körpergewichtsübungen dürfen dadurch nicht als fehlend gelten.
- `reps` wird bei Planks auch für Sekunden verwendet. Alte Einträge dürfen nicht pauschal als Wiederholungen interpretiert werden.
- `done` entscheidet über abgeschlossene Sätze. Auch nicht abgehakte Sätze sind Teil gespeicherter Sessions und müssen erhalten bleiben.
- Neue Sessions werden vorne eingefügt; Nahrungsmitteleinträge werden hinten angefügt. Reihenfolge und IDs bei Migration und Wiederherstellung erhalten.
- Übungen haben derzeit keine stabilen IDs. Die Übernahme letzter Trainingswerte verwendet Übungspositionen innerhalb gleichnamiger Workouts.
- Trainingsentwürfe liegen ausschließlich in der Variablen `drafts`. Eigene Lebensmittel sind nur als verzehrte Einträge gespeichert, nicht als Produktkatalog.

Der JSON-Export ergänzt `app: "Vegan Strength"`, `version: 2` und `exportedAt` als ISO-Zeitstempel. Ein Export kann bis zu 30.000 Nahrungsmitteleinträge und 10.000 Sessions enthalten, bevor die aktuelle Validierung ablehnt; der Import begrenzt die Dateigröße auf 15 MiB. Außerdem begrenzt die aktuelle Bereinigung Übungen und Sätze und kann Werte ändern. Diese Regeln sind keine verlustfreie Migrationsroutine.

## 4. Priorisierte Befunde

| Priorität | Befund und Fundstelle | Konsequenz / Maßnahme |
| --- | --- | --- |
| P0 | Ladefehler werden durch leere Standarddaten ersetzt (`index.html:15`). | Der nächste Speichervorgang kann den ursprünglichen Stand überschreiben. Rohdaten bewahren und Wiederherstellung anbieten. |
| P0 | `persist()` meldet Fehler nur per Alert und gibt keinen Erfolg zurück (`index.html:15`, `18`, `23`). | Workout-Abschluss und Import können trotz fehlgeschlagener Speicherung Erfolg melden; Entwürfe können verschwinden. Erfolg erst nach bestätigtem Schreiben anzeigen. |
| P0 | Import ignoriert App-Kennung und Version; fehlende Arrays werden leer, Einträge still gefiltert (`index.html:14`, `23`). | Fremde oder beschädigte JSON-Dateien können nach Bestätigung Nutzerdaten durch einen leeren oder verkürzten Stand ersetzen. Explizite Formatprüfung und Importvorschau einführen. |
| P0 | Ein `null`-Element in Übungen oder Sätzen kann `cleanData()` abbrechen (`index.html:14`). | Beim Laden kann ein einzelner defekter Datensatz den gesamten sichtbaren Bestand leeren. Fehler gezielt melden, Original behalten. |
| P1 | Entwürfe sind flüchtig und Eingaben werden erst bei `change` übernommen (`index.html:15`, `17`). | Neuladen oder Prozessende verliert laufendes Training. Entwürfe ab `input` sichern und Schreibstatus berücksichtigen. |
| P1 | `cleanData()` gibt ausschließlich die bisherigen Felder zurück (`index.html:14`). | Neue Felder würden beim Laden/Import verschwinden. Künftige Schemata benötigen versionsspezifische Leser und Migrationen. |
| P1 | Die nächste Einheit richtet sich nur nach `sessions.length % 4` (`index.html:16`). | Manuelle Workout-Auswahl und Wiederholungen können unpassende Empfehlungen erzeugen. Planfortschritt explizit speichern. |
| P1 | Wochenzählung besitzt nur eine untere Datumsgrenze (`index.html:16`). | Zukünftige importierte Sessions zählen mit. Wochenintervall auf Montag bis folgenden Montag begrenzen. |
| P1 | Datumsprüfung kontrolliert nur das Zeichenmuster (`index.html:14`, `19`). | Nicht existierende Kalenderdaten können importiert werden. Kalenderdaten tatsächlich validieren, problematische Altwerte erhalten und melden. |
| P1 | Der Service Worker löscht bei Aktivierung alle anderen Cache-Namen derselben Origin (`sw.js:1`). | Caches anderer Apps auf derselben Domain können betroffen sein. Bereinigung auf eigene Cache-Präfixe begrenzen. |
| P1 | Cache-first mit festem Cache-Namen sowie sofortigem `skipWaiting()` / `clients.claim()` (`sw.js:1`). | Geänderte Dateien können veraltet bleiben; Releases mit zusätzlichen Modulen können Versionsmischungen begünstigen. Vollständige Release-Caches und bewusste Update-Aktivierung vorsehen. |
| P2 | Alle Bereiche inklusive Trainingsinputs werden bei `render()` neu aufgebaut (`index.html:22`). | Unnötige DOM-Arbeit und mögliche Fokusverluste. Nur betroffene Ansichten aktualisieren. |
| P2 | Ausgangswerte und Fortschrittsziele sind fest im HTML hinterlegt (`index.html:4`). | Profil und Planwerte sind nicht individuell veränderbar. In zukünftigen Einstellungen und Plänen speichern. |

## 5. Zielarchitektur

HTML und CSS zunächst ohne sichtbare Umgestaltung auslagern, anschließend fachliche Zuständigkeiten trennen. JavaScript-Module bleiben statisch hostbar; Tests dürfen Entwicklungswerkzeuge verwenden, ohne Laufzeitabhängigkeiten oder einen Produkt-Build zu erzwingen.

```text
index.html
styles/app.css
src/
  app.js
  data/workouts.js
  data/foods.js
  storage/repository.js
  storage/local-storage.js
  storage/indexed-db.js
  storage/migrations.js
  domain/validation.js
  domain/protein.js
  domain/progression.js
  domain/statistics.js
  features/training.js
  features/protein.js
  features/progress.js
  features/settings.js
  services/timer.js
  services/backup.js
  services/pwa.js
tests/fixtures/
sw.js
manifest.webmanifest
```

Die UI greift über eine gemeinsame asynchrone Repository-Schnittstelle auf Daten zu. Erst arbeitet diese mit dem bestehenden localStorage-Format, anschließend mit IndexedDB. Fachfunktionen kennen weder DOM noch Datenbank. Konfigurationen erhalten stabile Workout-, Übungs- und Varianten-IDs; historische Namen und Werte bleiben bestehen.

IndexedDB erhält fachlich getrennte Stores für `settings`, `entries`, `sessions`, `customFoods`, `drafts`, `plans`, `meta` und `recovery`. Indizes auf Datum und Workout unterstützen Historie und Auswertung. Die interne Datenbankversion wird unabhängig von der JSON-Backup-Version geführt. Zunächst nur die für den jeweiligen Entwicklungsschritt benötigten Stores einführen.

## 6. Etappen mit Abnahmekriterien

### Etappe 1 – Bestand absichern und Datenfehler behandeln

1. Vor funktionalen Änderungen einen wiederherstellbaren Quellcode-Stand sichern; Testdaten ausschließlich als synthetische Fixtures anlegen.
2. Referenzfälle für gültiges v2, leere Daten, defekte JSON-Daten, ungültige Unterobjekte und Speicherfehler erfassen.
3. Ladefehler sichtbar behandeln; Rohdaten nicht automatisch überschreiben. Export der Originaldaten zur Wiederherstellung ermöglichen.
4. Schreibvorgänge liefern Erfolg oder Fehler. Bei Fehlern keine Erfolgsmeldung, keinen Entwurfsverlust und keinen unbemerkten Wechsel des aktiven Datenstands zulassen.
5. Import vor Änderungen vollständig prüfen: unterstützte Version, Struktur, reale Kalenderdaten, Zahlenbereiche, IDs und Duplikate. Für beschädigte Altbestände einen ausdrücklich ausgewiesenen Wiederherstellungsweg anbieten; nichts still entfernen.
6. Vor Import eine Zusammenfassung mit Eintragszahlen und Zielwert sowie eine Sicherung des bisherigen Zustands bereitstellen. Der normale Import bleibt nach Bestätigung ersetzend.

**Abnahme:** Gültige v2-Backups behalten IDs, Reihenfolge, Werte und Tagesprotein exakt bei. Fremde JSON-Dateien, beschädigte Backups und fehlgeschlagene Schreibvorgänge lassen den bisherigen gespeicherten Zustand unverändert. Die vorhandenen Kernabläufe bleiben bedienbar.

### Etappe 2 – Code ohne Funktionsänderung modularisieren

1. CSS, Stammdaten, Fachfunktionen, Speicherung und UI in kleinen Schritten aus `index.html` lösen.
2. Die Repository-Schnittstelle einführen, weiterhin mit dem Schlüssel `vegan-strength-v2` und unverändertem v2-Format.
3. Timer und Navigation getrennt verwalten; gezielte Ansichtsaktualisierung ermöglichen.
4. Jede neu ausgelagerte Laufzeitdatei im selben Release in den Service-Worker-Cache aufnehmen; Cache-Version aktualisieren und nur eigene alte Caches bereinigen.

**Abnahme:** Vorher/nachher identischer v2-Export ohne Exportzeitstempel; Workout, Lebensmitteleintrag, Zieländerung, Navigation und Timer funktionieren weiter. Die modularisierte Anwendung startet nach vollständigem Online-Laden auch offline.

### Etappe 3 – IndexedDB und dauerhafte Trainingsentwürfe

1. Den vorhandenen localStorage-Rohstand lesen und unverändert sichern, bevor eine Transformation erfolgt. Nicht den bisherigen verlustbehafteten `cleanData()`-Aufruf als Migration verwenden.
2. Gültige Datensätze mit bestehenden IDs, Reihenfolge und Zahlenwerten in einer IndexedDB-Transaktion übernehmen. Bei unbekannten oder beschädigten Daten Migration anhalten und den Originalstand zugänglich lassen.
3. Nach Schreiben den Datenstand zurücklesen und Anzahl, Inhalte, Reihenfolge, IDs und berechnete Proteinsummen vergleichen. Erst danach die Migration als abgeschlossen markieren und IndexedDB aktivieren.
4. Den alten Schlüssel als Migrationssnapshot behalten, aber nach erfolgreicher Umstellung nicht mehr parallel beschreiben oder bei jedem Start erneut importieren. Fortlaufende Rückwärtskompatibilität erfolgt über Exporte, nicht über konkurrierende Datenbanken.
5. Abbruch und erneuten Start idempotent behandeln. Mehrere Tabs, alte geöffnete Versionen und blockierte Datenbank-Upgrades berücksichtigen; widersprüchliche Schreibzugriffe während der Umstellung verhindern.
6. Bei nicht verfügbarer Datenbank keinen leeren Ersatzbestand anlegen. Klaren Fehler- und Wiederherstellungsweg anbieten; ein etwaiger Fallback muss den tatsächlichen aktiven Datenbestand berücksichtigen.
7. Trainingsentwürfe auf Eingabe speichern, Schreibvorgänge bündeln und ihren Abschluss sichtbar machen. Beim erneuten Öffnen Auswahl, Sätze und Häkchen wiederherstellen. Timer-Endzeit speichern und bei Rückkehr anhand der Uhrzeit aktualisieren.
8. Die Funktion „Alle lokalen Daten löschen“ auf die neuen App-Daten einschließlich Wiederherstellungskopien ausweiten; nach bewusstem Löschen keine Wiederbelebung aus dem alten Schlüssel zulassen.

**Abnahme:** Migration übersteht Wiederholung und simulierte Fehler ohne Teilbestand. Reload stellt bestätigte Entwurfseingaben wieder her. Ein Speicherausfall entfernt keinen aktiven Entwurf. Ein neues vollständiges Backup umfasst auch neue Datenarten und lässt sich verlustfrei wiederherstellen.

### Etappe 4 – Individueller 8-Wochen-Plan und Workout-Bedienung

1. Profilvorgaben übernehmen: 34 Jahre, 189 cm, 84 kg, vegan, 150 g Protein, Oberkörperfokus, vier Einheiten à 45 Minuten, vorhandenes Home-Gym und Ausgangswerte 3 Klimmzüge / 6 Push-ups. Werte editierbar speichern.
2. Den bisherigen Vierer-Split als Ausgangspunkt erhalten. Einem neuen Plan Startdatum, acht Wochen, geplante Einheiten und individuelle Vorgaben zuordnen. Bestehende Sessions nicht nachträglich einem Plan zuweisen, ohne diese Zuordnung ausdrücklich festzulegen.
3. Pro Übungsvariante Satzanzahl, Wiederholungs- oder Sekundenbereich, Pause und Ausführungshinweise führen. Ring-/erhöhte Push-ups und beidseitige/einseitige Belastungen eindeutig unterscheiden; verfügbare Hantelgewichte und Steigerungsschritte konfigurierbar machen.
4. Fortschrittsvorschläge aus tatsächlich abgeschlossenen, vergleichbaren Sätzen ableiten: zuerst Wiederholungen im Zielbereich, anschließend Gewicht oder Variante. Bestätigung ermöglichen; keine automatische nachträgliche Änderung alter Trainingsdaten.
5. Wochen 1–2 für Ausgangswerte/Technik, 3–4 für Wiederholungssteigerung, 5–7 für weitere individuelle Progression und Woche 8 für Auswertung sowie bei Bedarf reduzierte Belastung konkret ausarbeiten. Die endgültigen Trainingsparameter vor Implementierung anhand geeigneter aktueller Fachquellen prüfen.
6. Geplante und tatsächlich absolvierte Einheiten getrennt führen. Ausgelassene, verschobene oder zusätzliche Einheiten dürfen die Empfehlung nicht allein über die Gesamtanzahl verschieben.
7. Die 45 Minuten als Zeitbudget für Aufwärmen, Sätze, einseitige Übungen, Pausen und Wechsel prüfen. Aktuelle Übung, letzte Werte, Vorschlag und Timer gut erreichbar anzeigen; Touch-Ziele mindestens 48 CSS-Pixel anstreben.

**Abnahme:** Ein Plan umfasst acht Wochen mit je vier geplanten Einheiten. Überspringen und Wiederholen bleiben möglich. Progressionsvorschläge sind nachvollziehbar und verändern keine Historie. Repräsentative Workouts werden mit realistischem Zeitbudget überprüft.

### Etappe 5 – Eigene Lebensmittel und Ernährungsverlauf

1. Einen Produktkatalog für eigene Lebensmittel mit Name, Einheit und Protein pro 100 g/ml ergänzen; wiederholte Verwendung, Bearbeitung und Entfernen ermöglichen.
2. Bereits erfasste Portionen als unveränderliche Momentaufnahme ihrer damaligen Produktwerte behalten. Änderungen im Katalog dürfen vergangene Proteinsummen nicht verändern.
3. Historische eigene Produkte optional als Vorschläge übernehmen. Gleichnamige Einträge mit unterschiedlichen Nährwerten nicht automatisch zusammenführen.
4. Tagesnavigation, schnelles Wiederholen eines Eintrags und Ansichten für 7, 28 und 56 Tage ergänzen. Für Mittelwerte ausweisen, ob alle Kalendertage oder nur erfasste Tage eingehen; den bisherigen Sieben-Kalendertage-Wert erhalten.
5. Bei künftig veränderlichen Tageszielen Zielhistorie führen. Für Altbestände keine früheren Zielwerte erfinden.

**Abnahme:** Ein eigenes Produkt ist nach Neustart auswählbar. Katalogänderungen verändern keine alten Portionen. Tages-, Diagramm- und Exportwerte stimmen überein, einschließlich Dezimalwerten und lokaler Datumsgrenzen.

### Etappe 6 – Kraftdiagramme und Android-/Offline-Abnahme

1. Pro Übung und vergleichbarer Variante den Verlauf abgeschlossener Sätze zeigen: Wiederholungen, verwendetes Gewicht und bei zeitbasierten Übungen Sekunden. Unterschiedliche Einheiten und Varianten nicht in eine gemeinsame Kraftkennzahl mischen.
2. Für Klimmzüge und Push-ups den Wiederholungsverlauf zeigen; bei Hantelübungen Gewicht und Wiederholungen gemeinsam sichtbar machen. Die Bedeutung von kg, etwa Gewicht pro Hantel, explizit definieren und alte uneindeutige Werte kennzeichnen.
3. Alte Übungen konservativ über Namen zuordnen; Originalnamen bewahren und unklare Zuordnungen nicht erraten. Historie vollständig zugänglich machen, auch wenn die aktuelle Startansicht weiterhin nur die letzten Einheiten zeigt.
4. Diagramme ohne externe Laufzeitdownloads erstellen, mit lesbaren Datenwerten und zugänglicher tabellarischer Alternative. Lange Historien über Datenbankindizes und gefilterte Abfragen laden.
5. Updates erst nach vollständig installiertem Release anbieten. Aktivierung mit laufenden Entwürfen abstimmen; neue und alte Module nicht vermischen. Offline-Status nicht allein mit erfolgreicher Registrierung gleichsetzen.
6. Auf Chrome für Android im Browser und installierter PWA prüfen: Erstinstallation, Flugmodus, Offline-Neustart, App-Wechsel, Bildschirmabschaltung, Prozessneustart, Update und JSON-Export/-Import über die Dateiauswahl. Timer beim Wiederöffnen korrekt darstellen; keine garantierte Hintergrundvibration voraussetzen.

**Abnahme:** Kraft- und Ernährungsverläufe stimmen mit den zugrunde liegenden Datensätzen überein. Erfassung, Wiederaufnahme, Historie und Backups funktionieren offline. Ein Update erhält Daten und bestätigte Entwürfe.

## 7. Backup-Kompatibilität und Veröffentlichung

- v2-Backups bleiben lesbar. Die bisherigen Feldnamen und Bedeutungen bleiben für Altbestände erhalten.
- Ein neues vollständiges Backup erhält eine eigene Version, sobald Profil, Produkte, Pläne oder Entwürfe ergänzt werden. Unbekannte zukünftige Versionen werden vor einem Import abgelehnt, nicht als v2 behandelt.
- Optional einen ausdrücklich als eingeschränkt bezeichneten v2-Export anbieten. Der alte v2-Importer kann neue Felder nicht erhalten; deshalb keine verlustfreie Rückwärtskompatibilität zur alten App versprechen.
- Datenbankmigration und Import sichern Originaldaten vor Veränderungen und ersetzen den aktiven Stand erst nach erfolgreicher Prüfung und Speicherung. ID-Konflikte nicht still deduplizieren.
- Bei Veröffentlichung möglichst dieselbe Origin behalten. Eine andere Domain, ein anderer Port oder ein anderer Browser erhält keinen automatischen Zugriff auf die bisherigen Browserdaten. Für einen nötigen Wechsel vorher exportieren und anschließend importieren.
- Die Anwendung bleibt lokal und ohne Konto nutzbar. Neue Produktfunktionen erfordern keine Serverdatenbank.

## 8. Durchgeführte Prüfung und Grenzen

Alle sechs vorhandenen Projektdateien wurden berücksichtigt; die drei Textbestandteile der Anwendung und die README vollständig gelesen. Die beiden PNG-Dateien besitzen die im Manifest angegebenen Abmessungen 192 × 192 und 512 × 512. JavaScript-Syntax, Manifest-JSON und Icon-Dateipfade wurden lokal geprüft.

Die bestehende Bereinigungsfunktion wurde isoliert mit synthetischen Daten ausgeführt:

- Ein gültiger v2-Beispieldatensatz wird unverändert übernommen.
- Ein fremdes JSON-Objekt wird als leerer Datenstand mit Ziel 150 akzeptiert.
- Unbekannte Felder werden entfernt.
- Das nicht existierende Datum `2026-99-99` wird akzeptiert.
- Ein `null`-Element in `exercises` löst einen Fehler aus.

Es wurden keine persönlichen Browserdaten gelesen oder migriert. Installation, Bedienung auf Android, Offline-Verhalten und Update-Wechsel wurden noch nicht praktisch getestet. Diese Prüfungen sind Teil der geplanten Abnahme, keine bereits bestätigten Eigenschaften.

**Erster Umsetzungsschritt:** Etappe 1 mit unverändertem v2-Datenformat und unverändertem Trainingsplan. Erst nach bestandener Absicherung folgt die Modularisierung und anschließend die IndexedDB-Migration.

## 9. Umsetzungsstand

### Etappe 1 – umgesetzt am 9. November 2026

- Der Ausgangscode ist im Git-Commit `424b8fc` gesichert.
- Laden und Import prüfen das vollständige v2-Format, ohne Werte zu verändern oder Einträge zu entfernen. Unbekannte Felder und Versionen werden abgelehnt, Originaldaten bleiben erhalten.
- Ladefehler werden sichtbar gemeldet. Der gelesene Originalstand lässt sich unverändert herunterladen; automatische Schreibvorgänge auf einen leeren Ersatzbestand sind gesperrt.
- Alle Änderungen ersetzen den aktiven Datenstand erst nach erfolgreichem Speichern. Workout-Abschluss, Lebensmitteleinträge, Löschen und Zieländerungen behandeln Fehler; Entwürfe bleiben bei fehlgeschlagenen Schreibvorgängen erhalten.
- Der bestätigte Import zeigt vorher eine Zusammenfassung und sichert den bisherigen Rohstand unter `vegan-strength-v2-before-import`. Diese Sicherung ist nach Neustart herunterladbar. Misslingt ihre Erstellung, wird der Import abgebrochen.
- Änderungen eines anderen Fensters seit dem letzten Laden werden vor einem Schreibvorgang erkannt. Dies verhindert veraltete Schreibvorgänge in den getesteten Abläufen; eine tabübergreifende Transaktionsgarantie erfordert weiterhin die spätere IndexedDB-Architektur.
- Der Service-Worker-Cache wurde auf `vegan-strength-v2.0.1` angehoben; die Bereinigung betrifft nur Cache-Namen dieser App. Ein abgestimmter Update-Dialog folgt weiterhin in einer späteren Etappe.
- 40 automatisierte Regressionstests prüfen unter anderem v2-Export/Import, Reihenfolge und Dezimalwerte, Kalenderdaten, beschädigte Unterobjekte, unbekannte Felder, Speicherfehler, Importabbruch, Wiederherstellung und Cache-Isolation. Ausführung siehe README.txt.
- Im lokalen Browser wurden Lebensmittel-Erfassung, Erhalt nach Neuladen, v2-Importvorschau, Sicherungsschaltfläche, importierte Trainingshistorie und das Layout bei 390 × 844 Pixeln geprüft. Es wurden ausschließlich synthetische Daten auf einer lokalen Testadresse verwendet. Kein Ersatz für die spätere Android-Geräte- und Offline-Abnahme.

Speicherformat, Schlüssel, Proteinberechnung und bestehender Trainingsplan sind unverändert. Nächste Etappe: Modularisierung mit v2 als unverändertem Datenvertrag.

### Etappe 2 – umgesetzt am 9. November 2026

- Die bisherigen CSS-Regeln liegen unverändert in `styles/app.css`; `index.html` bindet `src/main.js` als Modul ein. Fachlogik, Stammdaten, Speicherung, Features, Timer, Backup und PWA sind getrennt. Die tatsächliche Struktur ist in `docs/ARCHITEKTUR.md` beschrieben.
- Die UI verwendet eine asynchrone Repository-Schnittstelle vor dem bisherigen localStorage-Adapter. Eine gemeinsame Aktionswarteschlange verarbeitet Änderungen nacheinander; neue Kandidaten beruhen auf dem zuletzt bestätigten Datenstand. Ein laufender Workout-Abschluss sperrt seine Felder und verhindert doppelte Speicherung.
- Navigation und Timer sind unabhängig von den Feature-Ansichten. Fachfremde Änderungen bauen bestehende Trainingsfelder nicht neu auf. Geänderte Werte erscheinen beim Wechsel in die betreffende Ansicht.
- HTML-Oberfläche, CSS-Regeln sowie alle Trainings- und Lebensmittelvorlagen wurden gegen Commit `6fb9f3b` abgeglichen. Der v2-Export des synthetischen Referenzbestands ist bei identischem Exportzeitpunkt textgleich zum vorherigen Export.
- Cache-Version `vegan-strength-v2.1.0` umfasst den vollständigen Modulgraphen. Ein Update wartet auf das Schließen der vorherigen App-Version. Offline-Antworten verwenden ausschließlich den Cache des jeweiligen Workers. Unvollständige Releases können die Installation nicht abschließen.
- Die 40 bisherigen Regressionstests bestehen weiterhin. Zusätzliche Tests prüfen die Aktionswarteschlange, verzögerte Schreibvorgänge, die Workout-Sperre, Erhalt von Trainingsfeldern, Modul-Cache, Unterverzeichnis-Hosting und fehlgeschlagene Installationen. Ausführung: `npm test`, ohne Zusatzpakete.
- Im Browser wurden Protein-Erfassung, Satzeingabe, automatischer Pausentimer und Erhalt des gespeicherten Workouts nach Neustart geprüft. Nach Abschalten des lokalen Servers funktionierten Seitenneuladen, Start in einem neuen Tab, weitere Protein-Erfassung und v2-Backup-Export. Der heruntergeladene Testexport enthielt die erwarteten Werte. Dies ersetzt weiterhin keine Abnahme auf einem echten Android-Gerät.

Das v2-Datenformat und beide bisherigen localStorage-Schlüssel bleiben erhalten. IndexedDB und dauerhaft gespeicherte Entwürfe folgen in Etappe 3.

### Etappe 3 – umgesetzt am 9. November 2026

- Produktive Speicherung in IndexedDB (`vegan-strength`, Version 1) mit getrennten Stores für Einstellungen, Einträge, Sessions, Trainingsentwürfe, Metadaten und Wiederherstellungskopien. Es gibt keinen automatischen Schreib-Fallback auf localStorage.
- Die Migration sichert die Originalbytes vor der Validierung, übernimmt die Nutzdaten transaktional und liest sie vor der Aktivierung zurück. Die Tests prüfen auch veränderte Werte bei identischen Eintragszahlen. IDs, Array-Reihenfolge, Datumswerte, Dezimalwerte, Null-Gewichte, Sekunden und nicht abgeschlossene Sätze bleiben erhalten.
- Die alten localStorage-Schlüssel bleiben als Originalkopien verfügbar. Ein Speichervermerk verhindert die ungewollte erneute Übernahme nach Verlust des aktiven Datenbankbestands. Unterbrochene Übernahmen können erneut gestartet werden.
- Revisionsprüfungen in den Schreibtransaktionen verhindern veraltete Schreibvorgänge anderer aktueller Fenster. Änderungen durch alte localStorage-Schreiber werden erkannt; vorhandene Datenzweige werden nicht automatisch vermischt. Blockierte Öffnungen und `versionchange` haben sichtbare Fehler-/Wiederherstellungswege.
- Trainingsentwürfe werden ab `input` gebündelt gesichert, mit sichtbarer Bestätigung und erneutem Speicherversuch bei Fehlern. Auswahl, Satzwerte, Häkchen und Timer-Endzeit werden nach Neustart wiederhergestellt. Workout und Entfernung seines Entwurfs werden gemeinsam transaktional gespeichert.
- Vollständige Backups verwenden Version 3 und enthalten auch Entwürfe und Timer. v2-Import und separater v2-Export bleiben verfügbar. Die Sicherung vor Import umfasst auch noch offene Eingaben. Löschen entfernt die neuen Daten und Wiederherstellungskopien sowie die alten Schlüssel; der gespeicherte Löschzustand verhindert Wiederbelebung nach einer Unterbrechung.
- 84 automatisierte Tests bestehen, darunter Migrationsabbruch, Rückleseprüfung, paralleler Start, veraltete Fenster, fehlender Speicher, Wiederherstellung, Löschunterbrechung, Entwurfsneustart, atomarer Workout-Abschluss und v3-Roundtrip. `fake-indexeddb` ist nur eine Entwicklungsabhängigkeit; die ausgelieferte App bleibt ohne externe Laufzeitbibliotheken.
- Der Browser-Test hat den synthetischen Bestand der vorherigen App-Version tatsächlich von localStorage übernommen. Die heruntergeladene Migrationskopie stimmt mit dem vorherigen v2-Export überein. Nach dem Schließen und erneuten Öffnen bei ausgeschaltetem Server wurden Wiederholungen, Satzhäkchen und die zeitlich fortgeschrittene Pause wiederhergestellt. Die ebenfalls offline heruntergeladenen v3- und v2-Backups wurden geprüft: v3 enthält den Entwurf, beide erhalten sämtliche bisherigen Einträge und Trainings. Die spätere Android-Geräteabnahme bleibt erforderlich.

App-/Cache-Version: 2.2.1; Datenbank-/Schemaversion: 1; vollständiges Backup: Version 3. Nächste Etappe: individueller 8-Wochen-Plan und verbesserte Workout-Bedienung.
