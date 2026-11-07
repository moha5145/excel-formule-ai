import { describe, it, expect } from "vitest";
import {
  evaluateSpillFormula,
  parseCellAddress,
  indexToColLetter,
  type CellValue,
} from "./spillEvaluator";

function makeGrid(data: Record<string, CellValue>) {
  return {
    getCell: (_sheet: string, row: number, col: number): CellValue => {
      return data[`${indexToColLetter(col)}${row}`] ?? null;
    },
    hasSheet: () => true,
  };
}

const invoiceGrid = makeGrid({
  C5: "FAC-01", D5: "TechCorp", E5: "Impayée", F5: 1200,
  C6: "FAC-02", D6: "Nexus SA", E6: "Payée", F6: 800,
  C7: "FAC-03", D7: "Alpha EURL", E7: "Impayée", F7: 3000,
  C8: "FAC-04", D8: "Beta SAS", E8: "Payée", F8: 500,
  C9: "FAC-05", D9: "Gamma SARL", E9: "Impayée", F9: 1500,
});

describe("evaluateSpillFormula", () => {
  it("FILTER renvoie uniquement les lignes correspondantes", () => {
    const res = evaluateSpillFormula(
      '=FILTER(C5:C9,E5:E9="Impayée")',
      "T",
      invoiceGrid.getCell,
      invoiceGrid.hasSheet
    );
    expect(res).not.toBeNull();
    expect(res!.rows).toBe(3);
    expect(res!.cols).toBe(1);
    expect(res!.values.map((r) => r[0])).toEqual(["FAC-01", "FAC-03", "FAC-05"]);
  });

  it("FILTER supporte les comparaisons numériques", () => {
    const res = evaluateSpillFormula(
      "=FILTER(C5:C9,F5:F9>1000)",
      "T",
      invoiceGrid.getCell,
      invoiceGrid.hasSheet
    );
    expect(res!.values.map((r) => r[0])).toEqual(["FAC-01", "FAC-03", "FAC-05"]);
  });

  it("SORT(UNIQUE(...)) renvoie la liste triée sans doublons", () => {
    const res = evaluateSpillFormula(
      "=SORT(UNIQUE(D5:D9))",
      "T",
      invoiceGrid.getCell,
      invoiceGrid.hasSheet
    );
    expect(res!.rows).toBe(5);
    expect(res!.values.map((r) => r[0])).toEqual([
      "Alpha EURL",
      "Beta SAS",
      "Gamma SARL",
      "Nexus SA",
      "TechCorp",
    ]);
  });

  it("UNIQUE déduplique les valeurs répétées", () => {
    const res = evaluateSpillFormula(
      "=UNIQUE(E5:E9)",
      "T",
      invoiceGrid.getCell,
      invoiceGrid.hasSheet
    );
    expect(res!.rows).toBe(2);
    expect(res!.values.map((r) => r[0])).toEqual(["Impayée", "Payée"]);
  });

  it("UNIQUE ignore les lignes vides d'une plage plus grande que les données", () => {
    const res = evaluateSpillFormula(
      "=UNIQUE(C5:C14)",
      "T",
      invoiceGrid.getCell,
      invoiceGrid.hasSheet
    );
    expect(res!.rows).toBe(5);
    expect(res!.values.map((r) => r[0])).toEqual([
      "FAC-01",
      "FAC-02",
      "FAC-03",
      "FAC-04",
      "FAC-05",
    ]);
  });

  it("SEQUENCE renvoie la bonne forme", () => {
    const res = evaluateSpillFormula("=SEQUENCE(3,2)", "T", invoiceGrid.getCell, invoiceGrid.hasSheet);
    expect(res).toEqual({ rows: 3, cols: 2, values: [[1, 2], [3, 4], [5, 6]] });
  });

  it("SORT trie sur une colonne donnée", () => {
    const res = evaluateSpillFormula(
      "=SORT(C5:F9,4,-1)",
      "T",
      invoiceGrid.getCell,
      invoiceGrid.hasSheet
    );
    expect(res!.values.map((r) => r[0])).toEqual(["FAC-03", "FAC-05", "FAC-01", "FAC-02", "FAC-04"]);
  });

  it("gère les plages vides sans planter", () => {
    const res = evaluateSpillFormula(
      '=FILTER(C5:C9,E5:E9="Inconnu")',
      "T",
      invoiceGrid.getCell,
      invoiceGrid.hasSheet
    );
    expect(res!.rows).toBe(1);
    expect(res!.cols).toBe(1);
  });
});

describe("helpers d'adresses", () => {
  it("convertit les adresses A1", () => {
    expect(parseCellAddress("E5")).toEqual({ row: 5, col: 5 });
    expect(parseCellAddress("$AA$12")).toEqual({ row: 12, col: 27 });
  });

  it("convertit les index de colonnes", () => {
    expect(indexToColLetter(1)).toBe("A");
    expect(indexToColLetter(26)).toBe("Z");
    expect(indexToColLetter(27)).toBe("AA");
  });
});
