import { describe, it, expect } from "vitest";
import { evaluateFormula } from "./formulaEvaluator";

describe("formulaEvaluator", () => {
  it("devrait évaluer les opérations arithmétiques de base (+, -, *, /)", () => {
    expect(evaluateFormula("10 + 5", {})).toBe(15);
    expect(evaluateFormula("20 - 8", {})).toBe(12);
    expect(evaluateFormula("6 * 7", {})).toBe(42);
    expect(evaluateFormula("50 / 4", {})).toBe(12.5);
    expect(evaluateFormula("2 + 3 * 4", {})).toBe(14); // priorité opératoire
    expect(evaluateFormula("(2 + 3) * 4", {})).toBe(20);
  });

  it("devrait résoudre les références de cellules avec le contexte de ligne et de paramètres", () => {
    const context = {
      row: 10,
      cells: {
        C10: 250,
        D10: 4,
        C5: 0.20,
      },
    };

    expect(evaluateFormula("C{row} * D{row}", context)).toBe(1000);
    expect(evaluateFormula("C10 * $C$5", context)).toBe(50);
    expect(evaluateFormula("C{row} * (1 + $C$5)", context)).toBe(300);
  });

  it("devrait supporter les pourcentages (ex: 20% -> 0.2) et les cellules contenant des chaînes avec %", () => {
    expect(evaluateFormula("100 * 20%", {})).toBe(20);

    const context = {
      row: 10,
      cells: {
        C10: "200 000 €",
        F10: "0,36%",
      },
    };
    // (200000 * 0.0036) / 12 = 720 / 12 = 60
    expect(evaluateFormula("=(C{row} * F{row}) / 12", context)).toBe(60);
  });

  it("devrait supporter la fonction VPM / PMT avec un unaire moins comme =-VPM(...)", () => {
    const context = {
      row: 10,
      cells: {
        C10: 200000,
        D10: "3,5%",
        E10: 20,
      },
    };

    // Mensualité pour 200k€ à 3.5% sur 20 ans
    const result = evaluateFormula("=-VPM(D{row}/12; E{row}*12; C{row})", context);
    expect(typeof result).toBe("number");
    expect(Number(result)).toBeCloseTo(1159.92, 1);
  });

  it("devrait supporter la fonction IF / SI", () => {
    const context = {
      row: 1,
      cells: { C1: 1500, D1: 2000 },
    };
    expect(evaluateFormula("IF(C1 > 1000, 100, 50)", context)).toBe(100);
    expect(evaluateFormula("IF(C1 > 2000, 100, 50)", context)).toBe(50);
    expect(evaluateFormula("SI(C1 <= 1500; 10; 20)", context)).toBe(10);
  });

  it("devrait supporter SUM, AVERAGE, MIN, MAX, ROUND", () => {
    const context = {
      row: 1,
      cells: { C1: 10, D1: 20, E1: 30 },
    };
    expect(evaluateFormula("SUM(C1, D1, E1)", context)).toBe(60);
    expect(evaluateFormula("AVERAGE(C1, D1, E1)", context)).toBe(20);
    expect(evaluateFormula("MAX(C1, D1, E1)", context)).toBe(30);
    expect(evaluateFormula("MIN(C1, D1, E1)", context)).toBe(10);
    expect(evaluateFormula("ROUND(12.3456, 2)", context)).toBe(12.35);
  });

  it("devrait gérer les plages simples comme C1:E1 dans SUM", () => {
    const context = {
      row: 1,
      cells: { C1: 10, D1: 20, E1: 30 },
    };
    expect(evaluateFormula("SUM(C1:E1)", context)).toBe(60);
  });

  it("devrait propager proprement les erreurs sans les concaténer en chaîne de caractères", () => {
    const context = {
      row: 10,
      cells: {
        G10: "#VALEUR!",
        H10: 60,
      },
    };

    // Avant le fix, cela donnait "#VALEUR!60" ou "#VALEUR!#DIV/0!"
    expect(evaluateFormula("=G{row} + H{row}", context)).toBe("#VALEUR!");
  });

  it("devrait renvoyer #CALC_EXCEL pour les fonctions complexes non émulées", () => {
    expect(evaluateFormula("=SOME_COMPLEX_EXCEL_FUNC(1, 2)", {})).toBe("#CALC_EXCEL");
  });

  it("devrait renvoyer #DIV/0! en cas de vraie division par zéro", () => {
    expect(evaluateFormula("10 / 0", {})).toBe("#DIV/0!");
  });
});
