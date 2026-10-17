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

  it("devrait supporter les pourcentages (ex: 20% -> 0.2)", () => {
    expect(evaluateFormula("100 * 20%", {})).toBe(20);
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

  it("devrait retourner une chaîne d'erreur propre en cas de division par zéro ou syntaxe inconnue", () => {
    expect(evaluateFormula("10 / 0", {})).toBe("#DIV/0!");
    expect(evaluateFormula("UNKNOWN_FUNC(1, 2)", {})).toBe("#VALEUR!");
  });
});
