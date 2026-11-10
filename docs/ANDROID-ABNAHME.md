# Vegan Strength – Android-Abnahme

Stand: 10. November 2026. Prüfkandidat: App/Cache 2.5.1, Datenbank/Schema 3, vollständiges Backup 5.

Die lokale Browserprüfung und 153 automatisierte Tests sind bestanden. Die folgende Prüfung auf einem echten Android-Gerät ist **offen**. Der Desktop-Browser ersetzt weder Android-Systemdialoge noch das Verhalten installierter PWAs nach Prozessende.

## Voraussetzungen

- Den vollständigen Stand einschließlich `src/`, `styles/`, Icons, Manifest und `sw.js` gemeinsam über HTTPS bereitstellen. Auf dem Smartphone bedeutet `localhost` das Smartphone selbst; der Desktop-Testserver ist darüber nicht erreichbar. Die aktuelle Umsetzung wurde noch nicht veröffentlicht.
- Für bestehende persönliche Einträge zuerst auf der bisherigen Website ein vollständiges JSON-Backup exportieren und die Datei außerhalb der Browserdaten aufbewahren. Bei einer anderen Domain, einem anderen Browser oder anderem Port das Backup ausdrücklich importieren; diese Speicherbereiche sind getrennt.
- Möglichst dieselbe bisherige HTTPS-Adresse verwenden. Alte Appfenster nach vollständig geladenem Update schließen und neu öffnen. Unter „Mehr“ muss die Cache-Prüfung 2.5.1 bestätigen.
- Für die Prüfung synthetische Produkte/Trainings verwenden. Vor einem ersetzenden Testimport einen Export erstellen; der Import zeigt eine Vorschau und sichert den vorherigen Bestand.

## Prüftabelle

| Prüfung | Ablauf und erwartetes Ergebnis | Android-Status |
| --- | --- | --- |
| Erststart | HTTPS-Adresse in Chrome öffnen. Alle Tabs und Schaltflächen funktionieren; unter Mehr sind alle Offline-Dateien der Version 2.5.1 vorhanden. | Offen |
| Installation | Chrome-Menü „App installieren“ / „Zum Startbildschirm hinzufügen“ bzw. angebotenen Installationsbutton verwenden. Vom Startbildschirm im eigenen Appfenster öffnen; Navigation und Safe Areas prüfen. | Offen |
| Offline-Start | Nach bestätigtem vollständigen Cache Flugmodus einschalten, App schließen und vom Startbildschirm neu öffnen. Start, Training, Protein und Verlauf bleiben verfügbar. | Offen |
| Training und Tastatur | Werte mit Dezimalstellen eingeben, Sätze abhaken, Reserve erfassen. Numerische Tastatur, sichtbarer Fokus, erreichbare Satzhäkchen und Pausentimer prüfen. | Offen |
| Bildschirm aus / App-Wechsel | 120-Sekunden-Pause starten, Bildschirm ausschalten bzw. zu einer anderen App wechseln. Beim Zurückkehren stimmt die Restzeit; abgelaufene Pausen starten nicht neu. Hintergrundvibration ist nicht garantiert. | Offen |
| Prozessneustart | Auf die sichtbare Speicherbestätigung warten. App aus der Übersicht schließen bzw. Prozess beenden und neu öffnen. Bestätigte Werte, Häkchen und Auswahl sind erhalten. | Offen |
| Workout-Abschluss | Ein synthetisches Workout abschließen. Es erscheint genau einmal in Historie und zugehörigem Plan; nur sein Entwurf wird entfernt. | Offen |
| Kraftverlauf | Gleiche Planvariante und Last vergleichen; andere Variante separat wählen. Plank zeigt Sekunden, Hantelwerte bleiben pro Hantel. Tabelle und Originaltraining stimmen überein. | Offen |
| Gesamte Historie | Bei mehr als 20 Testtrainings weiterblättern; Workout und einschließliches Datum filtern. Auch ältere Trainings und nicht abgehakte Sätze bleiben erreichbar. | Offen |
| Produkte und Portionen | Produkt speichern, Portion erfassen, Produktwerte ändern. Die alte Portion und Tagesproteinsumme bleiben unverändert. App neu starten: Produkt bleibt auswählbar. | Offen |
| Android-Dateiauswahl | Vollständiges Backup in Android-Dateien speichern. In einem gesicherten Testbestand über den System-Dateidialog wiederherstellen; Anzahl, Profil, Pläne, Produkte, Entwürfe und Werte prüfen. | Offen |
| Update | Mit geöffnetem Entwurf ein vollständig veröffentlichtes Nachfolge-Release online suchen. Erst nach bestätigter Sicherung alle Appfenster schließen. Neue Version erhält Daten, Entwurf und Timer-Endzeit. Kein erzwungenes Neuladen. | Offen |
| Netzfehler bei Updatesuche | Flugmodus aktivieren und Update suchen. Fehlermeldung erscheint, die bestehende App bleibt bedienbar und Daten unverändert. | Offen |

## Bereits im lokalen Browser geprüft

- Vorhandener synthetischer Bestand einschließlich Produkt, Plan und zwei Trainingsentwürfen blieb erhalten; ein v5-Export ist inhaltlich exakt gleich zum vorherigen Export.
- Kraftdiagramme und Tabellen mit 32 synthetischen Trainings, kg pro Hantel, Sekunden, festen Lasten und der zweiten Historienseite bei 390 × 844 Pixeln geprüft.
- Wechsel 2.5.0 → 2.5.1 bei geöffnetem Entwurf: neue Satzeingabe, Satzhäkchen und fortgeschrittene Timer-Endzeit erhalten.
- Neustart in einem neuen Tab bei gestopptem Testserver: Kraftauswertung, zweite Historienseite und Cache-Vollständigkeitsprüfung funktionieren; Updatesuche meldet den Netzfehler. Keine JavaScript-Fehler im geprüften Ablauf.

Ergebnisse auf dem Handy mit Gerät, Android-/Chrome-Version, Datum und beobachteten Abweichungen ergänzen. Bis diese Tabelle geprüft ist, bleibt die Android-Abnahme offen.
