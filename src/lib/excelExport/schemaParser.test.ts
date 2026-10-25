import { describe, it, expect } from "vitest";
import {
  extractTableSchema,
  validateSchema,
  isComplexResponse,
  SchemaValidationError,
  extractFileModificationSchema,
  validateFileModificationSchema,
} from "./schemaParser";
import { resolveTotals } from "./totalPolicy";

describe("schemaParser", () => {
  describe("isComplexResponse", () => {
    it("devrait retourner true si le commentaire TABLE_SCHEMA est présent", () => {
      const response = `
      Voici le tableau :
      <!-- TABLE_SCHEMA: {"type": "complex_table", "title": "Test"} -->
      `;
      expect(isComplexResponse(response)).toBe(true);
    });

    it("devrait retourner false si le commentaire TABLE_SCHEMA est absent", () => {
      const response = `
      Voici le tableau :
      <!-- FORMULA_EN: =SUM(A1:A2) -->
      `;
      expect(isComplexResponse(response)).toBe(false);
    });
  });

  describe("extractTableSchema", () => {
    it("devrait extraire le JSON valide", () => {
      const response = `
      <!-- TABLE_SCHEMA: {"type": "complex_table", "title": "Test Table"} -->
      `;
      expect(extractTableSchema(response)).toEqual({
        type: "complex_table",
        title: "Test Table",
      });
    });

    it("devrait retourner null si le JSON est mal formé", () => {
      const response = `
      <!-- TABLE_SCHEMA: {"type": "complex_table", "title": "Test Table" -->
      `;
      expect(extractTableSchema(response)).toBeNull();
    });

    it("devrait retourner null si le commentaire est absent", () => {
      expect(extractTableSchema("Pas de schéma")).toBeNull();
    });
  });

  describe("validateSchema", () => {
    it("devrait valider un schéma minimal correct", () => {
      const raw = {
        type: "complex_table",
        title: "Simulation",
        columns: [
          { header: "Mois", type: "integer", formula: null, formula_en: null },
          { header: "Calcul", type: "number", formula: "=1+1", formula_en: "=1+1" },
        ],
        parameters: [
          { name: "Montant", ref: "C3", value: 1000, type: "number" }
        ],
        data_start_row: 10,
        sample_rows: 5,
      };
      const validated = validateSchema(raw);
      expect(validated.type).toBe("complex_table");
      expect(validated.title).toBe("Simulation");
      expect(
        validated.columns.map(({ header, type, formula, formula_en }) => ({
          header,
          type,
          formula,
          formula_en,
        }))
      ).toEqual(raw.columns);
      expect(validated.parameters).toEqual(raw.parameters);
      expect(validated.data_start_row).toBe(10);
      expect(validated.sample_rows).toBe(5);
      // Champs de totaux : "auto" par défaut, libellé déduit à l'exécution
      expect(validated.total_row).toBe("auto");
      expect(validated.total_row_label).toBeUndefined();
      expect(validated.row_total_column).toBeUndefined();
    });

    it("devrait normaliser les types hors enum au lieu de rejeter le schéma", () => {
      const raw = {
        type: "complex_table",
        title: "Types tolérants",
        columns: [
          { header: "Montant HT", type: "devise", formula: "=1+1", formula_en: "=1+1" },
          { header: "Nombre de factures", type: "count", formula: "=1+1", formula_en: "=1+1" },
          { header: "Statut", type: "flag", formula: "=1+1", formula_en: "=1+1" },
          { header: "Date d'échéance", type: "when", formula: "=1+1", formula_en: "=1+1" },
        ],
      };
      const validated = validateSchema(raw);
      expect(validated.columns.map((c) => c.type)).toEqual([
        "currency",
        "integer",
        "text",
        "date",
      ]);
    });

    it("devrait typer Date en date et réparer une formule qui référence la colonne B", () => {
      const raw = {
        type: "complex_table",
        title: "Extraire l'année fiscale d'une date",
        parameters: [
          { name: "Date de début", ref: "C5", value: "01/01/2024", type: "text" },
          { name: "Mois de début", ref: "C6", value: 7, type: "integer" },
        ],
        columns: [
          { header: "Date", type: "text", formula: null, formula_en: null },
          {
            header: "Année fiscale",
            type: "integer",
            formula: "=SI(MOIS(B2)>=7;ANNEE(B2)+1;ANNEE(B2))",
            formula_en: "=IF(MONTH(B2)>=7,YEAR(B2)+1,YEAR(B2))",
          },
        ],
        data_start_row: 5,
        sample_rows: 4,
      };
      const validated = validateSchema(raw);
      expect(validated.columns[0].type).toBe("date");
      expect(validated.parameters[0].type).toBe("date");
      expect(validated.columns[1].formula).toBe(
        "=SI(MOIS(C{row})>=7;ANNEE(C{row})+1;ANNEE(C{row}))"
      );
      expect(validated.columns[1].formula_en).toBe(
        "=IF(MONTH(C{row})>=7,YEAR(C{row})+1,YEAR(C{row}))"
      );
    });

    it("devrait réparer B{row} sans toucher aux références d'une autre feuille", () => {
      const raw = {
        type: "complex_table",
        title: "Année et somme",
        parameters: [{ name: "Mois de début", ref: "C5", value: 7, type: "integer" }],
        columns: [
          { header: "Date", type: "date", formula: null, formula_en: null },
          {
            header: "Année fiscale",
            type: "integer",
            formula:
              "=SI(MOIS(B{row})>=7;ANNEE(B{row})+1;ANNEE(B{row}))+SOMME(Ref!B10:B15)",
            formula_en:
              "=IF(MONTH(B{row})>=7,YEAR(B{row})+1,YEAR(B{row}))+SUM(Ref!B10:B15)",
          },
        ],
        data_start_row: 5,
        sample_rows: 4,
      };
      const validated = validateSchema(raw);
      expect(validated.columns[1].formula).toContain("MOIS(C{row})");
      expect(validated.columns[1].formula).toContain("ANNEE(C{row})");
      expect(validated.columns[1].formula).toContain("Ref!B10:B15");
      expect(validated.columns[1].formula_en).toContain("MONTH(C{row})");
      expect(validated.columns[1].formula_en).toContain("Ref!B10:B15");
    });

    it("devrait normaliser total, total_row et total_row_label fournis par le modèle", () => {
      const raw = {
        type: "complex_table",
        title: "Totaux tolérants",
        columns: [
          {
            header: "Montant",
            type: "currency",
            formula: null,
            formula_en: null,
            total: "SUM",
          },
          { header: "Libellé", type: "text", formula: "=1+1", formula_en: "=1+1" },
          {
            header: "Nb Factures",
            type: "integer",
            formula: "=NB.SI.ENS(...)",
            formula_en: "=COUNTIFS(...)",
            total: "unique",
          },
        ],
        parameters: [{ name: "Montant", ref: "C3", value: 100, type: "currency" }],
        total_row: "true",
        total_row_label: "  Total général  ",
      };
      const validated = validateSchema(raw);
      expect(validated.columns[0].total).toBe("sum");
      expect(validated.columns[2].total).toBe("once");
      expect(validated.total_row).toBe(true);
      expect(validated.total_row_label).toBe("Total général");
    });

    it("devrait lever une erreur si formula ou formula_en n'ont pas la même présence de null", () => {
      const raw = {
        type: "complex_table",
        title: "Simulation",
        columns: [
          { header: "Mois", type: "integer", formula: "=1+1", formula_en: null },
        ],
      };
      expect(() => validateSchema(raw)).toThrow(SchemaValidationError);
    });

    it("devrait lever une erreur si la formule ne commence pas par =", () => {
      const raw = {
        type: "complex_table",
        title: "Simulation",
        columns: [
          { header: "Mois", type: "integer", formula: "1+1", formula_en: "1+1" },
        ],
      };
      expect(() => validateSchema(raw)).toThrow(SchemaValidationError);
    });

    it("devrait lever une erreur si des colonnes sont d'input (formula: null) mais parameters est vide", () => {
      const raw = {
        type: "complex_table",
        title: "Simulation",
        columns: [
          { header: "Mois", type: "integer", formula: null, formula_en: null },
          { header: "Calcul", type: "number", formula: "=1+1", formula_en: "=1+1" },
        ],
        parameters: [],
      };
      expect(() => validateSchema(raw)).toThrow(SchemaValidationError);
    });

    it("devrait lever une erreur si ref n'est pas valide", () => {
      const raw = {
        type: "complex_table",
        title: "Simulation",
        columns: [
          { header: "Calcul", type: "number", formula: "=1+1", formula_en: "=1+1" },
        ],
        parameters: [
          { name: "Montant", ref: "invalid_ref", value: 1000, type: "number" }
        ],
      };
      expect(() => validateSchema(raw)).toThrow(SchemaValidationError);
    });

    it("devrait valider un schéma avec row_total_column + total_row (pivot léger)", () => {
      const raw = {
        type: "complex_table",
        title: "Budget par service × mois",
        parameters: [
          { name: "Budget global", ref: "C5", value: 50000, type: "currency" }
        ],
        columns: [
          { header: "Service", type: "text", formula: null, formula_en: null },
          { header: "Janvier", type: "currency", formula: "=SUMIFS(budget!D:D,budget!B:B,C{row})", formula_en: "=SUMIFS(budget!D:D,budget!B:B,C{row})" },
          { header: "Février", type: "currency", formula: "=SUMIFS(budget!D:D,budget!B:B,C{row})", formula_en: "=SUMIFS(budget!D:D,budget!B:B,C{row})" },
        ],
        data_start_row: 10,
        sample_rows: 3,
        row_total_column: { header: "Total trim.", type: "currency" },
        total_row: true,
        total_row_label: "TOTAUX",
      };
      const validated = validateSchema(raw);
      expect(validated.row_total_column?.header).toBe("Total trim.");
      expect(validated.total_row).toBe(true);
      expect(validated.total_row_label).toBe("TOTAUX");
    });

    it("devrait accepter un champ validation de type list sur une colonne", () => {
      const schema = {
        type: "complex_table",
        title: "Tableau Commandes",
        parameters: [{ name: "TVA", ref: "C5", value: 0.2, type: "percentage" }],
        columns: [
          {
            header: "Produit",
            type: "text",
            formula: null,
            formula_en: null,
            validation: { type: "list", ref_table: "RefProduits", ref_column: "Produit" },
          },
          { header: "Total", type: "currency", formula: "=10", formula_en: "=10" },
        ],
        reference_tables: [
          {
            name: "Produits",
            sheet_name: "RefProduits",
            start_ref: "RefProduits!A1",
            headers: ["Produit", "Prix"],
            rows: [["PC", 1000]],
          },
        ],
      };

      const parsed = validateSchema(schema);
      expect(parsed.columns[0].validation?.type).toBe("list");
      expect(parsed.columns[0].validation?.ref_table).toBe("RefProduits");
    });

    it("devrait accepter total: sum/none et total_row: auto", () => {
      const raw = {
        type: "complex_table",
        title: "Commande avec liste déroulante dynamique",
        parameters: [
          { name: "Taux TVA", ref: "C5", value: 0.2, type: "percentage" },
        ],
        columns: [
          { header: "Quantité", type: "integer", formula: null, formula_en: null, total: "sum" },
          { header: "Prix Unitaire", type: "currency", formula: null, formula_en: null, total: "none" },
          { header: "Total HT", type: "currency", formula: "=D{row}*E{row}", formula_en: "=D{row}*E{row}", total: "sum" },
        ],
        data_start_row: 10,
        sample_rows: 4,
        total_row: "auto",
      };

      const validated = validateSchema(raw);
      expect(validated.total_row).toBe("auto");
      expect(validated.columns[0].total).toBe("sum");
      expect(validated.columns[1].total).toBe("none");
      expect(validated.total_row_label).toBeUndefined();
    });

    it("devrait mettre total à auto par défaut sur une colonne", () => {
      const raw = {
        type: "complex_table",
        title: "Test",
        parameters: [{ name: "X", ref: "C5", value: 1, type: "integer" }],
        columns: [
          { header: "Mois", type: "integer", formula: null, formula_en: null },
          { header: "Calcul", type: "number", formula: "=1+1", formula_en: "=1+1" },
        ],
      };
      const validated = validateSchema(raw);
      expect(validated.columns[0].total).toBe("auto");
    });

    it("devrait accepter total_row: true sans colonne sommable (ligne omise)", () => {
      const raw = {
        type: "complex_table",
        title: "Toutes colonnes text",
        parameters: [{ name: "X", ref: "C5", value: 1, type: "integer" }],
        columns: [
          { header: "Service", type: "text", formula: null, formula_en: null },
          { header: "Note", type: "text", formula: null, formula_en: null },
        ],
        data_start_row: 10,
        sample_rows: 3,
        total_row: true,
      };
      const validated = validateSchema(raw);
      expect(validated.total_row).toBe(true);
      expect(resolveTotals(validated).showTotalRow).toBe(false);
    });

    it("devrait lever une erreur si row_total_column défini mais aucune colonne sommable", () => {
      const raw = {
        type: "complex_table",
        title: "Toutes colonnes text",
        parameters: [
          { name: "X", ref: "C5", value: 1, type: "integer" }
        ],
        columns: [
          { header: "Service", type: "text", formula: null, formula_en: null },
          { header: "Note", type: "text", formula: null, formula_en: null },
        ],
        data_start_row: 10,
        sample_rows: 3,
        row_total_column: { header: "Total" },
      };
      expect(() => validateSchema(raw)).toThrow(SchemaValidationError);
    });
  });

  describe("FileModificationSchema", () => {
    it("devrait extraire et valider un schéma de modification de fichier", () => {
      const response = `
      J'ai calculé la TVA pour votre tableau.
      <!-- FILE_MODIFICATION: {
        "target_sheet": "Feuille1",
        "new_columns": [
          { "header": "TVA 20%", "type": "currency", "formula": "=C{row}*0.2", "formula_en": "=C{row}*0.2" }
        ]
      } -->
      `;

      const raw = extractFileModificationSchema(response);
      expect(raw).not.toBeNull();
      const validated = validateFileModificationSchema(raw);
      expect(validated.target_sheet).toBe("Feuille1");
      expect(validated.new_columns).toHaveLength(1);
      expect(validated.new_columns[0].header).toBe("TVA 20%");
    });
  });
});
