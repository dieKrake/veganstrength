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
