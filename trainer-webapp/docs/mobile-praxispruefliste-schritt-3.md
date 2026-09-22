# Praxisprüfliste: Schritt 3 – Passwortverwaltung

Stand: 22.09.2026

Diese Liste dient der fachlichen Abnahme auf einem realen Mobilgerät. Für den
Test nur eigene oder ausdrücklich freigegebene Konten verwenden. Passwörter und
Einmalcodes nicht in Screenshots, Tickets oder Nachrichten festhalten.

## Öffentliche Wiederherstellung

1. Produktionsseite `/passwort-vergessen` ohne bestehende Anmeldung öffnen.
2. Die freigegebene Testadresse absenden.
3. Prüfen, dass die Seite nur die neutrale Bestätigung anzeigt.
4. Posteingang und Spam-Ordner prüfen und den neuesten Recovery-Link öffnen.
5. Ein neues Passwort mit mindestens acht Zeichen zweimal identisch eingeben.
6. Prüfen, dass danach eine neue Anmeldung erforderlich ist.
7. Mit dem neuen Passwort anmelden und den persönlichen Bereich öffnen.
8. Den verwendeten Link erneut öffnen; er darf keinen weiteren Reset erlauben.

Erwartetes Ergebnis: Der vollständige Ablauf funktioniert nur mit dem neuesten
gültigen Link, verrät keine Kontoexistenz und endet mit einem funktionsfähigen
neuen Login.

## Passwort im Profil ändern

1. Mit einem Passwortkonto anmelden und im Profil ein neues Passwort setzen.
2. Zuerst absichtlich ein falsches aktuelles Passwort eingeben.
3. Prüfen, dass keine Änderung erfolgt und eine verständliche Meldung erscheint.
4. Den Vorgang mit dem richtigen aktuellen Passwort wiederholen.
5. Prüfen, dass die aktuelle Sitzung bestehen bleibt.
6. Falls ein zweites Gerät angemeldet war, prüfen, dass dessen Sitzung beendet
   wurde.

Erwartetes Ergebnis: Nur das richtige aktuelle Passwort erlaubt die Änderung;
die aktuelle Sitzung bleibt bestehen und andere Sitzungen verlieren ihren
Zugriff.

## Optionaler OAuth-only-Fall

Dieser Abschnitt ist erst prüfbar, sobald ein OAuth-Provider freigegeben ist.
Im Profil eines OAuth-only-Kontos den Einmalcode anfordern, den erhaltenen Code
eingeben und ein Passwort setzen. Ohne bestätigte E-Mail darf kein
Passwortformular freigeschaltet werden.

## Ergebnis festhalten

- Gerät, Browser und Prüfdatum notieren.
- Jeden Abschnitt als bestanden, fehlgeschlagen oder nicht prüfbar markieren.
- Bei Fehlern nur Ablauf und sichtbare Meldung dokumentieren; keine Adressen,
  Links, Codes, Tokens oder Passwörter aufnehmen.
