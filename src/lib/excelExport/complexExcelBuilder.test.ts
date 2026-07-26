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

  it("ne doit pas corrompre une formule de paramètre déjà en anglais (DATE/YEAR sans ;)", () => {
    // Bug observé en production : l'IA écrit param.formula en anglais invariant
    // (=DATE(YEAR(C10),12,31)-...). Le builder convertit en US-invariant en
    // supposant la formule française → "12,31" devient "12.31" (décimal fictif)
    // → #VALEUR! dans Excel. L'heuristique doit détecter l'absence de ';' (donc
    // déjà anglais) et préserver les ',' comme séparateurs d'arguments.
    const workbook = new ExcelJS.Workbook();
    const schema: TableSchema = {
      type: "complex_table",
      title: "Répartition budget prorata",
      parameters: [
        { name: "Budget Annuel Total", ref: "C5", value: 120000, type: "currency" },
        {
          name: "Total jours dans l'année",
          ref: "C6",
          type: "integer",
          formula: "=DATE(YEAR(C10),12,31)-DATE(YEAR(C10),1,1)+1",
        },
      ],
      columns: [
        { header: "Date", type: "date", formula: null, formula_en: null },
        { header: "Jours mois", type: "integer", formula: "=DAY(EOMONTH(C{row},0))", formula_en: "=DAY(EOMONTH(C{row},0))" },
        { header: "Prorata", type: "percentage", formula: "=E{row}/$C$6", formula_en: "=E{row}/$C$6" },
      ],
      data_start_row: 10,
      sample_rows: 3,
    };

    const response = `
    | Ligne | Date | Jours mois | Prorata |
    |---|---|---|---|
    | Ligne 1 | 01/01/2024 | 31 | 8.47% |
    | Ligne 2 | 01/02/2024 | 29 | 7.92% |
    | Ligne 3 | 01/03/2024 | 31 | 8.47% |
    `;

    const { workbook: result, warnings } = buildComplexWorkbook(
      workbook, schema, response, "Répartition budget", "excel-fr"
    );

    expect(warnings.length).toBe(0);
    const sheet = result.getWorksheet("Tableau Interactif")!;

    // C6 formule US-invariante — les virgules d'arguments DOIVENT être préservées.
    // Construction attendue : "DATE(YEAR(C10),12,31)-DATE(YEAR(C10),1,1)+1"
    // (les virgules restent virgules, PAS transformées en points décimaux).
    expect(sheet.getCell("C6").value).toEqual({
      formula: "DATE(YEAR(C10),12,31)-DATE(YEAR(C10),1,1)+1",
    });
  });

  it("doit écrire les dates de colonne input sans décalage de fuseau horaire", () => {
    // Bug observé en production : les dates Markdown "01/01/2024" sont écrites
    // comme "31/12/2023" dans l'Excel généré. Cause : ExcelJS sérialise les
    // Date en serial via offset UTC ; les dates construites à minuit local sont
    // décalées d'un jour sur les fuseaux négatifs (ex: Europe/Paris UTC+1 →
    // 2024-01-01 00:00 local = 2023-12-31 23:00 UTC).
    const workbook = new ExcelJS.Workbook();
    const schema: TableSchema = {
      type: "complex_table",
      title: "Test date",
      parameters: [
        { name: "TVA", ref: "C5", value: 0.2, type: "percentage" },
      ],
      columns: [
        { header: "Date", type: "date", formula: null, formula_en: null },
        { header: "Montant", type: "currency", formula: null, formula_en: null },
      ],
      data_start_row: 10,
      sample_rows: 3,
    };

    const response = `
    | Ligne | Date | Montant |
    |---|---|---|
    | Ligne 1 | 01/01/2024 | 100 |
    | Ligne 2 | 15/06/2024 | 200 |
    | Ligne 3 | 31/12/2024 | 300 |
    `;

    const { workbook: result } = buildComplexWorkbook(
      workbook, schema, response, "Test date", "excel-fr"
    );

    const sheet = result.getWorksheet("Tableau Interactif")!;

    // Vérifier que chaque date est un Date JavaScript avec le BON jour/mois/année
    // (peu importe le fuseau horaire du serveur qui exécute le test).
    const d1 = sheet.getCell("C11").value as Date;
    const d2 = sheet.getCell("C12").value as Date;
    const d3 = sheet.getCell("C13").value as Date;

    expect(d1).toBeInstanceOf(Date);
    expect(d2).toBeInstanceOf(Date);
    expect(d3).toBeInstanceOf(Date);

    expect(d1.getFullYear()).toBe(2024);
    expect(d1.getMonth()).toBe(0);   // janvier = 0
    expect(d1.getDate()).toBe(1);

    expect(d2.getFullYear()).toBe(2024);
    expect(d2.getMonth()).toBe(5);   // juin = 5
    expect(d2.getDate()).toBe(15);

    expect(d3.getFullYear()).toBe(2024);
    expect(d3.getMonth()).toBe(11);  // décembre = 11
    expect(d3.getDate()).toBe(31);
  });

  it("doit écrire les en-têtes de la table de référence à la ligne exacte de start_ref", () => {
    // Bug observé en production (Err :508) : le builder écrivait toujours
    // titre L1 + description L2 + en-têtes L3 + données L4+, IGNORANT start_ref.
    // Les formules INDEX/MATCH pointant vers $B$2:$B$6 référençaient donc la
    // zone titre/description (lignes 1-2) au lieu des données réelles (lignes 4+.
    // Maintenant le builder respecte start_ref : en-têtes à start_ref, données à
    // start_ref+1. Si start_ref est < ligne 3, on saute titre/description.
    const workbook = new ExcelJS.Workbook();
    const schema: TableSchema = {
      type: "complex_table",
      title: "Bon de commande",
      parameters: [
        { name: "Taux TVA", ref: "C5", value: 0.20, type: "percentage" },
      ],
      columns: [
        { header: "Catégorie", type: "text", formula: null, formula_en: null },
        { header: "Produit", type: "text", formula: null, formula_en: null },
        { header: "Quantité", type: "integer", formula: null, formula_en: null },
        {
          header: "Prix unitaire", type: "currency",
          formula: '=IF(D{row}="", 0, INDEX(RefProduits!$C$2:$C$6, MATCH(D{row}, RefProduits!$B$2:$B$6, 0)))',
          formula_en: '=IF(D{row}="", 0, INDEX(RefProduits!$C$2:$C$6, MATCH(D{row}, RefProduits!$B$2:$B$6, 0)))',
        },
        { header: "Total HT", type: "currency", formula: "=E{row}*F{row}", formula_en: "=E{row}*F{row}" },
        { header: "Total TTC", type: "currency", formula: "=G{row}*(1+$C$5)", formula_en: "=G{row}*(1+$C$5)" },
      ],
      data_start_row: 10,
      sample_rows: 2,
      reference_tables: [{
        name: "Liste des produits et prix",
        sheet_name: "RefProduits",
        // start_ref=A1 → en-têtes à A1, données à partir de A2 (cohérent avec
        // la formule INDEX($C$2:$C$6) qui pointe vers A2..A6).
        start_ref: "RefProduits!A1",
        headers: ["Catégorie", "Produit", "Prix"],
        rows: [
          ["Électronique", "Ordinateur Portable", 1200],
          ["Électronique", "Écran 27 pouces", 350],
          ["Électronique", "Souris Sans Fil", 45],
          ["Mobilier", "Bureau Ergonomique", 550],
          ["Mobilier", "Chaise de Bureau", 250],
        ],
        column_types: ["text", "text", "currency"],
      }],
    };

    const { workbook: result, warnings } = buildComplexWorkbook(
      workbook, schema, "", "Bon de commande", "excel-fr"
    );

    // Aucun warning de décalage de ligne dans la table de référence.
    expect(warnings.filter((w) => w.includes("RefProduits") && w.includes("Décalage"))).toEqual([]);

    const refSheet = result.getWorksheet("RefProduits")!;
    // En-têtes à la ligne 1 (= start_ref ligne)
    expect(refSheet.getCell("A1").value).toBe("Catégorie");
    expect(refSheet.getCell("B1").value).toBe("Produit");
    expect(refSheet.getCell("C1").value).toBe("Prix");
    // Données à partir de la ligne 2 (= start_ref + 1)
    expect(refSheet.getCell("A2").value).toBe("Électronique");
    expect(refSheet.getCell("B2").value).toBe("Ordinateur Portable");
    expect(refSheet.getCell("C2").value).toBe(1200);
    expect(refSheet.getCell("B6").value).toBe("Chaise de Bureau");
    expect(refSheet.getCell("C6").value).toBe(250);

    // Pas de titre à A1 quand start_ref est < ligne 3 (sinon collision).
    // Ici start_ref=A1 ⇒ en-têtes en A1, donc A1 = "Catégorie" (PAS le titre).
    expect(refSheet.getCell("A1").value).not.toMatch(/LISTE DES PRODUITS/);
  });

  it("doit écrire titre + description si start_ref >= ligne 3 (sans collision)", () => {
    const workbook = new ExcelJS.Workbook();
    const schema: TableSchema = {
      type: "complex_table",
      title: "Bon de commande",
      parameters: [
        { name: "Taux TVA", ref: "C5", value: 0.20, type: "percentage" },
      ],
      columns: [
        { header: "Produit", type: "text", formula: null, formula_en: null },
        { header: "Prix", type: "currency",
          formula: '=IF(B{row}="", 0, INDEX(RefTable!$B$4:$B$8, MATCH(B{row}, RefTable!$B$4:$B$8, 0)))',
          formula_en: '=IF(B{row}="", 0, INDEX(RefTable!$B$4:$B$8, MATCH(B{row}, RefTable!$B$4:$B$8, 0)))' },
      ],
      data_start_row: 10,
      sample_rows: 2,
      reference_tables: [{
        name: "Tarifs",
        sheet_name: "RefTable",
        start_ref: "RefTable!A3",  // en-têtes à la ligne 3, données à partir de A4
        headers: ["Catégorie", "Produit", "Prix"],
        rows: [
          ["Électro", "A", 100],
          ["Électro", "B", 200],
          ["Mobilier", "C", 300],
          ["Mobilier", "D", 400],
          ["Mobilier", "E", 500],
        ],
        column_types: ["text", "text", "currency"],
        description: "Liste des tarifs",
      }],
    };

    const { workbook: result, warnings } = buildComplexWorkbook(
      workbook, schema, "", "Test", "excel-fr"
    );

    expect(warnings.filter((w) => w.includes("RefTable") && w.includes("Décalage"))).toEqual([]);

    const refSheet = result.getWorksheet("RefTable")!;
    // Titre en L1 (présent car start_ref à la ligne 3)
    expect(refSheet.getCell("A1").value).toMatch(/TARIFS/);
    // Description en L2
    expect(refSheet.getCell("A2").value).toBe("Liste des tarifs");
    // En-têtes à la ligne 3 (= start_ref)
    expect(refSheet.getCell("A3").value).toBe("Catégorie");
    expect(refSheet.getCell("B3").value).toBe("Produit");
    expect(refSheet.getCell("C3").value).toBe("Prix");
    // Données à partir de la ligne 4 (= start_ref + 1)
    expect(refSheet.getCell("A4").value).toBe("Électro");
    expect(refSheet.getCell("B4").value).toBe("A");
    expect(refSheet.getCell("C4").value).toBe(100);
    expect(refSheet.getCell("C8").value).toBe(500);
  });

  it("doit ordonner les onglets : interactif → tables de référence → guide en dernier", () => {
    // UX : l'utilisateur doit voir le tableau interactif d'abord, puis les tables
    // de référence (données scénario), puis le guide d'explications en dernier.
    const workbook = new ExcelJS.Workbook();
    const schema: TableSchema = {
      type: "complex_table",
      title: "Bon de commande",
      parameters: [
        { name: "TVA", ref: "C5", value: 0.20, type: "percentage" },
      ],
      columns: [
        { header: "Produit", type: "text", formula: null, formula_en: null },
        {
          header: "Prix", type: "currency",
          formula: '=IF(B{row}="", 0, INDEX(Ref1!$B$2:$B$3, MATCH(B{row}, Ref1!$B$2:$B$3, 0)))',
          formula_en: '=IF(B{row}="", 0, INDEX(Ref1!$B$2:$B$3, MATCH(B{row}, Ref1!$B$2:$B$3, 0)))',
        },
      ],
      data_start_row: 10,
      sample_rows: 2,
      reference_tables: [
        {
          name: "T1", sheet_name: "Ref1", start_ref: "Ref1!A1",
          headers: ["Cat", "Produit"], rows: [["A", "X"], ["B", "Y"]],
          column_types: ["text", "text"],
        },
        {
          name: "T2", sheet_name: "Ref2", start_ref: "Ref2!A1",
          headers: ["Cat", "Produit"], rows: [["C", "Z"], ["D", "W"]],
          column_types: ["text", "text"],
        },
      ],
    };

    const { workbook: result } = buildComplexWorkbook(
      workbook, schema, "", "Test ordre", "excel-fr"
    );

    const names = result.worksheets.map((w) => w.name);
    expect(names).toEqual(["Tableau Interactif", "Ref1", "Ref2", "Formule & Guide"]);
    expect(names[names.length - 1]).toBe("Formule & Guide");
  });
});
