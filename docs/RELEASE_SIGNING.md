# RELEASE_SIGNING – signierter Release-Build

Stand: 30.09.2026 (Version 0.8.3). Die Pipeline ist vorbereitet; **den Schlüssel erzeugst und verwahrst du selbst.** Er ist nicht ersetzbar: Geht er verloren, kann die App nie wieder als Update derselben App installiert werden (außerhalb des Play Stores) bzw. nur über den Play-Store-Weg „Upload-Schlüssel zurücksetzen“ ersetzt werden.

## Wichtig vorab: Umstieg von der Debug-APK
Die bisherigen APKs sind mit dem Debug-Schlüssel (`android/app/debug.keystore`) signiert. Eine Release-APK hat eine **andere Signatur**; Android lehnt sie als Update ab. Der Umstieg bedeutet: alte App deinstallieren (löscht die lokalen Daten!), neue installieren. **Vorher in der App ein Backup erstellen** (Einstellungen → Sicherung) und nach der Neuinstallation wiederherstellen.

## 1. Schlüssel erzeugen (einmalig, auf deinem Rechner, JDK 17+)
```
keytool -genkeypair -v -keystore travelbook-release.jks -alias travelbook \
  -keyalg RSA -keysize 2048 -validity 10000
```
Passwörter und Angaben selbst wählen und im Passwortmanager notieren. **Die Datei `travelbook-release.jks` und die Passwörter an mindestens zwei getrennten sicheren Orten aufbewahren** (z. B. Passwortmanager + verschlüsselter USB-Stick). Nie ins Repository legen (`*.jks` steht in `.gitignore`).

## 2. Schlüssel als GitHub-Secrets hinterlegen
Repository → Settings → Secrets and variables → Actions → New repository secret:
| Secret | Inhalt |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Ausgabe von `base64 -w0 travelbook-release.jks` (macOS: `base64 -i travelbook-release.jks`) |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore-Passwort |
| `ANDROID_KEY_ALIAS` | `travelbook` (oder dein Alias) |
| `ANDROID_KEY_PASSWORD` | Passwort des Schlüssels |

## 3. Bauen
Actions → „Android Release (signiert)“ → Run workflow. Ergebnis (Artifact `travelbook-release`): `app-release.apk` (zum Installieren) und `app-release.aab` (für den Play Store). Der Lauf prüft die Signatur mit `apksigner verify`.
Der Haken „test_signing“ baut mit einem Wegwerf-Schlüssel und dient nur dazu, die Pipeline ohne Secrets zu prüfen; dieses Ergebnis nie installieren oder weitergeben.

## Lokal bauen (optional)
`android/keystore.properties` (nicht einchecken) mit `storeFile=/pfad/travelbook-release.jks`, `storePassword=…`, `keyAlias=…`, `keyPassword=…` anlegen, dann `npm run android:sync` und `gradle -p android assembleRelease`. Ohne diese Angaben entsteht eine unsignierte Release-APK (nicht installierbar).

## Play Store (falls gewünscht)
- Hochgeladen wird die `.aab`. Empfohlen: „Play App Signing“; der eigene Schlüssel ist dann der Upload-Schlüssel.
- Zu klären vor einer Veröffentlichung (nicht Teil dieser Umsetzung): Datenschutzerklärung, Angaben zur Standortnutzung im Hintergrund (Foreground Service Typ `location`) in der Play Console, OSM-Kachelrichtlinie (ARCHITECTURE.md, ADR-002: Standardkacheln nicht für breite Veröffentlichung gedacht), Zielgruppen-/Inhaltsangaben. Die aktuellen Play-Richtlinien wurden hier nicht geprüft.
