import { describe, it, expect } from "vitest";
import { resolveFormulaTemplate, convertToUsInvariant } from "./postProcessFormula";

describe("postProcessFormula", () => {
  describe("convertToUsInvariant", () => {
    it("devrait traduire les fonctions françaises en anglais et changer les séparateurs", () => {
      const frFormula = "=SI(A1; SOMME(B1:B10); 0)";
      expect(convertToUsInvariant(frFormula, "excel-fr")).toBe("=IF(A1, SUM(B1:B10), 0)");
    });

    it("devrait remplacer VRAI/FAUX par TRUE/FALSE", () => {
      expect(convertToUsInvariant("=SI(A1; VRAI; FAUX)", "excel-fr")).toBe("=IF(A1, TRUE, FALSE)");
    });
  });

  describe("resolveFormulaTemplate", () => {
    it("devrait remplacer {row} par le numéro de ligne", () => {
      const template = "=A{row}+B{row}";
      expect(resolveFormulaTemplate(template, 10, "excel-en", true)).toBe("=A10+B10");
    });

    it("devrait convertir la formule en anglais si isAlreadyEnglish est false", () => {
      const template = "=SI(A{row}; SOMME(B{row}:C{row}); 0)";
      expect(resolveFormulaTemplate(template, 10, "excel-fr", false)).toBe("=IF(A10, SUM(B10:C10), 0)");
    });

    it("devrait appliquer les prefixes _xlfn si format n'est pas sheets", () => {
      const template = "=IFS(A{row}=1, 1, A{row}=2, 2)";
      expect(resolveFormulaTemplate(template, 10, "excel-en", true)).toBe("=_xlfn.IFS(A10=1, 1, A10=2, 2)");
    });

    it("devrait convertir XLOOKUP en INDEX/MATCH pour LibreOffice", () => {
      const template = "=XLOOKUP(A{row}, B1:B10, C1:C10)";
      // Pour libreoffice-en
      expect(resolveFormulaTemplate(template, 10, "libreoffice-en", true)).toBe(
        "=INDEX(C1:C10, MATCH(A10, B1:B10, 0))"
      );
      // Pour libreoffice-fr
      expect(resolveFormulaTemplate(template, 10, "libreoffice-fr", true)).toBe(
        "=INDEX(C1:C10, MATCH(A10, B1:B10, 0))"
      );
    });

    it("devrait traduire FILTRE/TRIER et appliquer le préfixe _xlfn._xlws (sinon #NOM ?)", () => {
      const template = '=FILTRE(C10:C14;F10:F14="Impayée")';
      expect(resolveFormulaTemplate(template, 10, "excel-fr", false)).toBe(
        '=_xlfn._xlws.FILTER(C10:C14,F10:F14="Impayée")'
      );
      expect(resolveFormulaTemplate("=TRIER(C10:C14)", 10, "excel-fr", false)).toBe(
        "=_xlfn._xlws.SORT(C10:C14)"
      );
    });

    it("devrait préfixer _xlfn pour UNIQUE/SEQUENCE mais pas pour Google Sheets", () => {
      expect(resolveFormulaTemplate("=UNIQUE(C10:C14)", 10, "excel-en", true)).toBe(
        "=_xlfn.UNIQUE(C10:C14)"
      );
      expect(resolveFormulaTemplate("=SEQUENCE(10)", 10, "excel-en", true)).toBe(
        "=_xlfn.SEQUENCE(10)"
      );
      expect(resolveFormulaTemplate("=FILTER(C10:C14,F10:F14=\"Impayée\")", 10, "sheets-en", true)).toBe(
        '=FILTER(C10:C14,F10:F14="Impayée")'
      );
    });
  });
});
