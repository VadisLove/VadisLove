# ISO/IEC 25002:2024 – Zusammenfassung & Leitfaden

## 1. Einleitung und Anwendungsbereich (Scope)
Die **ISO/IEC 25002:2024** ist Teil der international anerkannten **SQuaRE-Familie** (*Systems and software Quality Requirements and Evaluation*, ISO/IEC 25000-Reihe). Sie legt einen einheitlichen Rahmen fest für die Definition, Struktur, Semantik und Anwendung von Qualitätsmodellen in der System- und Softwaretechnik.

Da moderne digitale Systeme und IT-Dienste exponentiell komplexer werden, reicht eine reine Fokussierung auf funktionale Anforderungen nicht mehr aus. Das Dokument bietet Richtlinien, wie nicht-funktionsbezogene Qualitätsmerkmale systematisch spezifiziert, gemessen und evaluiert werden können, um den Wert für Stakeholder zu maximieren und Risiken zu minimieren.

---

## 2. Die SQuaRE-Standardfamilie im Überblick
Die SQuaRE-Reihe ist in fünf Kernbereiche (Divisionen) sowie eine Management- und eine Erweiterungsdivision unterteilt:
* **ISO/IEC 2500n (Quality Management Division):** Gemeinsame Modelle, Begriffe und Management-Leitfäden (z. B. ISO/IEC 25000, 25001, 25002).
* **ISO/IEC 2501n (Quality Model Division):** Detaillierte Qualitätsmodelle für Produkte, Daten, IT-Dienste und Quality-in-Use (z. B. ISO/IEC 25010, 25012, TS 25011, 25019).
* **ISO/IEC 2502n (Quality Measurement Division):** Messrahmen, mathematische Definitionen und praktische Anleitungen für Qualitätsmaße (z. B. ISO/IEC 25022, 25023, 25024).
* **ISO/IEC 2503n (Quality Requirements Division):** Spezifikation von Qualitätsanforderungen (z. B. ISO/IEC 25030).
* **ISO/IEC 2504n (Quality Evaluation Division):** Anforderungen und Richtlinien für die Qualitätsbewertung und Evaluierungsprozesse (z. B. ISO/IEC 25040).
* **ISO/IEC 25050–25099 (Extension Division):** Erweiterungen für neue Technologien (z. B. Cloud, KI) und Usability-Berichte.

---

## 3. Zentrale Begriffe und Definitionen (Terms & Definitions)
* **Attribut (Attribute):** Eine inhärente Eigenschaft oder ein Merkmal einer Entität, das quantitativ oder qualitativ messbar ist.
* **ICT-Produkt (ICT Product):** Ein Produkt, das Information und Kommunikationstechnologien nutzt und Teil eines Informationssystems ist (inkl. Hardware, Firmware, Software, Daten).
* **Informationssystem (Information System):** Ein System aus Software, Hardware, Kommunikationseinrichtungen, Daten und den Benutzern in einer bestimmten Umgebung zur Erfüllung von Informationsverarbeitungszielen.
* **IT-Dienst (IT Service):** Ein Dienst, der IT-Systeme als Werkzeuge nutzt, um Einzelpersonen oder Unternehmen einen geschäftlichen Nutzen zu verschaffen.
* **Produktqualität (Product Quality):** Die Fähigkeit eines Systems oder seiner Komponenten, unter bestimmten Bedingungen gestellte und implizite Qualitätsanforderungen zu erfüllen.
* **Quality-in-Use:** Das Ausmaß, in dem ein System oder Produkt in einem bestimmten Nutzungskontext die Bedürfnisse der Stakeholder erfüllt oder übertrifft, um bestimmte Ziele oder Ergebnisse zu erreichen.
* **Qualitätsmodell (Quality Model):** Ein definierter Satz von Merkmalen und Beziehungen zwischen ihnen, der als Rahmen für die Spezifikation von Qualitätsanforderungen und die Qualitätsbewertung dient.
* **Zielentität (Target Entity):** Der grundlegende Gegenstand von Interesse, über den Informationen geführt und der gemessen werden muss (z. B. ICT-Produkte, Daten, IT-Dienste).

---

## 4. Struktur und Rahmenwerk von Qualitätsmodellen
Ein SQuaRE-Qualitätsmodell folgt einer klar definierten hierarchischen Struktur:
1. **Zielentität:** Der Fokusbereich (z. B. Softwareprodukt, Datenbestand, IT-Dienst).
2. **Qualitätsmerkmale (Quality Characteristics):** Decken gemeinsam die messbaren Qualitätseigenschaften der Zielentität ab.
3. **Qualitäts-Teilmerkmale (Quality Sub-characteristics):** Unterteilen Merkmale in spezifischere Aspekte, um die Abbildung auf messbare Eigenschaften zu erleichtern.
4. **Optionale Sub-Sub-Merkmale:** Detaillierungen für spezifische Nutzungsszenarien vor Ort.
5. **Qualitätsmaße (Quality Measures):** Mathematische Funktionen und Messmethoden zur Quantifizierung der Merkmale.

### Die vier Haupt-Qualitätsmodelle im SQuaRE-System:
* **Produkt-Qualitätsmodell (ISO/IEC 25010):** Für ICT-Produkte inklusive Software-, Hardware- und Kommunikationskomponenten.
* **Daten-Qualitätsmodell (ISO/IEC 25012):** Für Daten und die zugehörige Verwaltungstechnologie.
* **IT-Dienst-Qualitätsmodell (ISO/IEC TS 25011):** Für die Bereitstellung und Qualität von IT-Diensten.
* **Quality-in-Use-Modell (ISO/IEC 25019):** Beschreibt das verhaltenstechnische Wirkungsfeld des Systems im konkreten Nutzungskontext (*Context of Use*, bestehend aus Benutzern, Zielen, Umgebung und Systemkontext).

---

## 5. Richtlinien für die Anwendung und Modifikation
* **Konsistenz:** Bei der Anpassung von Qualitätsmodellen für Nischenprodukte müssen die konzeptionellen Definitionen der SQuaRE-Merkmale beibehalten werden.
* **Dokumentation:** Modifikationen von Teilmerkmalen müssen für die Rückverfolgbarkeit (Traceability) und Benchmarking-Zwecke dokumentiert werden.
* **Zielkonflikte (Trade-offs):** Die Verbesserung eines Merkmals kann andere beeinträchtigen (z. B. erhöhte Sicherheit kann die Benutzerfreundlichkeit einschränken; Software-Performance kann die Wartbarkeit durch erhöhte Komplexität senken).

---

## 6. Nutzung von Qualitätsmodellen in Lebenszyklus-Prozessen
Qualitätsmodelle unterstützen verschiedene Stakeholder (Kunden, Business Analysts, Entwickler, Architekten, Qualitätsmanager, Betreiber, Regulierungsbehörden) in fünf Kernprozessen:

1. **Qualitätsanforderungen definieren (Quality Requirements Definition):**
   * Übersetzung von Stakeholder-Bedürfnissen in qualitative Modelle und quantitative Maße (z. B. Antwortzeiten, Fehlertoleranz, Datenschutz, Datenverfügbarkeit).
2. **Qualitätstechnik & Design (Quality Engineering):**
   * Übersetzung von Anforderungen in architektonische und strukturelle Systemeigenschaften (z. B. Reduzierung von Kopplungen zur besseren Wartbarkeit, Einbau von Failsafe-Mechanismen).
3. **Qualitätsbewertung (Quality Evaluation):**
   * Verifizierung und Validierung mittels statischer/dynamischer Code-Analyse, Penetrationstests, Lasttests, Usability-Labs und Akzeptanztests.
4. **Qualitätsmessung (Quality Measurement):**
   * Nutzung standardisierter Maße (z. B. ISO/IEC 25023 für Produktqualität, ISO/IEC 25024 für Datenqualität, ISO/IEC 25022 für Quality-in-Use) zur objektiven Bewertung.
5. **Qualitätsmanagement (Quality Management):**
   * Steuerung über den gesamten Lebenszyklus, Zielsetzung, Lieferanten-/Vendor-Management, Risikobewertung und Investitionsentscheidungen (z. B. Systemmodernisierung oder -ablösung).
