import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildComplexWorkbook } from "./complexExcelBuilder";
import { type TableSchema } from "./schemaParser";

describe("complexExcelBuilder", () => {
  it("devrait générer un workbook complet sans crasher", () => {
    const workbook = new ExcelJS.Workbook();
    const schema: TableSchema = {
      type: "complex_table",
      title: "Tableau d'amortissement",
      parameters: [
        { name: "Montant du prêt", ref: "C5", value: 500000, type: "currency" },
        { name: "Taux annuel", ref: "C6", value: 0.012, type: "percentage" },
      ],
      columns: [
        { header: "Mois", type: "integer", formula: null, formula_en: null },
        { header: "Intérêts", type: "currency", formula: "=C{row}*$C$6/12", formula_en: "=C{row}*$C$6/12" },
      ],
      data_start_row: 10,
      sample_rows: 3,
    };

    const response = `
    Voici les explications.
    | Mois | Intérêts |
    |---|---|
    | 1 | 500 |
    | 2 | 499 |
    <!-- TABLE_SCHEMA: {"type": "complex_table"} -->
    `;

    const { workbook: result, warnings } = buildComplexWorkbook(
      workbook,
      schema,
      response,
      "Simuler prêt de 500k€",
      "excel-fr"
    );

    expect(result.worksheets.length).toBe(2);
    expect(result.getWorksheet("Tableau Interactif")).toBeDefined();
    expect(result.getWorksheet("Formule & Guide")).toBeDefined();
    expect(warnings.length).toBe(0);

    const sheet = result.getWorksheet("Tableau Interactif")!;
    // Vérifier les paramètres
    expect(sheet.getCell("C5").value).toBe(500000);
    // Vérifier les en-têtes
    expect(sheet.getCell("B10").value).toBe("Ligne");
    expect(sheet.getCell("C10").value).toBe("Mois");
    expect(sheet.getCell("D10").value).toBe("Intérêts");

    // Vérifier les données
    expect(sheet.getCell("B11").value).toBe("Ligne 1");
    // Mois (input)
    expect(sheet.getCell("C11").value).toBe(1);
    // Intérêts (formule)
    expect(sheet.getCell("D11").value).toEqual({ formula: "C11*$C$6/12" });
  });

  it("devrait écrire colonne Total ligne + ligne TOTAUX quand row_total_column + total_row sont définis", () => {
    const workbook = new ExcelJS.Workbook();
    const schema: TableSchema = {
      type: "complex_table",
      title: "Budget par service × mois",
      parameters: [
        { name: "Budget global", ref: "C5", value: 50000, type: "currency" },
      ],
      columns: [
        { header: "Service", type: "text", formula: null, formula_en: null },
        { header: "Janvier", type: "currency", formula: null, formula_en: null },
        { header: "Février", type: "currency", formula: null, formula_en: null },
      ],
      data_start_row: 10,
      sample_rows: 3,
      row_total_column: { header: "Total trim.", type: "currency" },
      total_row: true,
      total_row_label: "TOTAUX",
    };

    const response = `
    | Ligne | Service | Janvier | Février |
    |---|---|---|---|
    | Ligne 1 | Marketing | 12000 | 8000 |
    | Ligne 2 | Ventes | 9000 | 11000 |
    | Ligne 3 | Support | 5000 | 6000 |
    <!-- TABLE_SCHEMA: {"type": "complex_table"} -->
    `;

    const { workbook: result, warnings } = buildComplexWorkbook(
      workbook, schema, response, "Budget par service", "excel-fr"
    );

    expect(warnings.length).toBe(0);
    const sheet = result.getWorksheet("Tableau Interactif")!;

    // En-têtes : B="Ligne", C="Service", D="Janvier", E="Février", F="Total trim."
    expect(sheet.getCell("B10").value).toBe("Ligne");
    expect(sheet.getCell("C10").value).toBe("Service");
    expect(sheet.getCell("D10").value).toBe("Janvier");
    expect(sheet.getCell("E10").value).toBe("Février");
    expect(sheet.getCell("F10").value).toBe("Total trim.");

    // Ligne 1 (row 11) : F11 doit contenir SUM(D11:E11)
    expect(sheet.getCell("F11").value).toEqual({ formula: "SUM(D11:E11)" });

    // Ligne 2 (row 12) : F12 = SUM(D12:E12)
    expect(sheet.getCell("F12").value).toEqual({ formula: "SUM(D12:E12)" });

    // Ligne TOTAUX (après 3 lignes de données → row 14)
    expect(sheet.getCell("B14").value).toBe("TOTAUX");
    // D14 = SUM(D11:D13)
    expect(sheet.getCell("D14").value).toEqual({ formula: "SUM(D11:D13)" });
    // E14 = SUM(E11:E13)
    expect(sheet.getCell("E14").value).toEqual({ formula: "SUM(E11:E13)" });
    // F14 (intersection) = SUM(F11:F13)
    expect(sheet.getCell("F14").value).toEqual({ formula: "SUM(F11:F13)" });
  });

  it("devrait convertir une formule de paramètre FR en US-invariant (excel-fr) pour éviter Err :508", () => {
    // Cas observé en production : l'IA écrit dans param.formula une formule FR
    // avec séparateur ';' et nom de fonction traduit (MAX.SI.ENS). ExcelJS écrit
    // la formule telle quelle; Excel/LibreOffice ne reconnait pas ';' en locale
    // en-US et retourne Err :508. Le builder doit convertir ; → , et FR → EN.
    const workbook = new ExcelJS.Workbook();
    const schema: TableSchema = {
      type: "complex_table",
      title: "Salaire max par service",
      parameters: [
        { name: "Service recherché", ref: "C5", value: "Marketing", type: "text" },
        {
          name: "Salaire max du service ciblé (C5)",
          ref: "C6",
          type: "currency",
          formula: "=MAX.SI.ENS(D10:D16; C10:C16; $C$5)",
        },
      ],
      columns: [
        { header: "Service", type: "text", formula: null, formula_en: null },
        { header: "Salaire (€)", type: "currency", formula: null, formula_en: null },
      ],
      data_start_row: 10,
      sample_rows: 3,
    };

    const response = `
    | Ligne | Service | Salaire (€) |
    |---|---|---|
    | Ligne 1 | Marketing | 1000 |
    | Ligne 2 | Ventes | 2000 |
    | Ligne 3 | R&D | 3000 |
    <!-- TABLE_SCHEMA: {"type": "complex_table"} -->
    `;

    const { workbook: result } = buildComplexWorkbook(
      workbook, schema, response, "Salaire max", "excel-fr"
    );

    const sheet = result.getWorksheet("Tableau Interactif")!;
    // C6 doit contenir la formule US-invariante (, pas ;) avec _xlfn.MAXIFS
    expect(sheet.getCell("C6").value).toEqual({
      formula: "_xlfn.MAXIFS(D10:D16, C10:C16, $C$5)",
    });
  });
});
