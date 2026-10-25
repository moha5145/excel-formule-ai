import { describe, it, expect } from "vitest";
import { resolveTotalLabel, resolveTotals, shouldSumColumn } from "./totalPolicy";
import type { TableSchema } from "./schemaParser";

function makeInvoiceSchema(overrides: Partial<TableSchema> = {}): TableSchema {
  return {
    type: "complex_table",
    title: "Commande avec liste déroulante dynamique",
    parameters: [{ name: "Taux TVA applicable", ref: "C5", value: 0.2, type: "percentage", unit: "%" }],
    columns: [
      { header: "Catégorie", type: "text", formula: null, formula_en: null, total: "none" },
      { header: "Produit", type: "text", formula: null, formula_en: null, total: "none" },
      { header: "Quantité", type: "integer", formula: null, formula_en: null, total: "sum" },
      { header: "Prix Unitaire", type: "currency", formula: null, formula_en: null, total: "none" },
      { header: "Total HT", type: "currency", formula: "=E{row}*F{row}", formula_en: "=E{row}*F{row}", total: "sum" },
      { header: "Total TTC", type: "currency", formula: "=G{row}*(1+$C$5)", formula_en: "=G{row}*(1+$C$5)", total: "sum" },
    ],
    data_start_row: 10,
    sample_rows: 4,
    total_row: true,
    ...overrides,
  };
}

describe("totalPolicy", () => {
  describe("shouldSumColumn", () => {
    it("somme les quantités et les totaux, ignore le prix unitaire", () => {
      const schema = makeInvoiceSchema();
      expect(schema.columns.map((column) => shouldSumColumn(column, schema))).toEqual([
        false,
        false,
        true,
        false,
        true,
        true,
      ]);
    });

    it("ne somme jamais une colonne percentage", () => {
      const schema = makeInvoiceSchema();
      const rate = { header: "Total TVA", type: "percentage" as const, formula: "=0.2", formula_en: "=0.2" };
      expect(shouldSumColumn(rate, schema)).toBe(false);
    });

    it("respecte total: none même si l'en-tête contient Total", () => {
      const schema = makeInvoiceSchema();
      const column = { header: "Total indicatif", type: "currency" as const, formula: "=1", formula_en: "=1", total: "none" as const };
      expect(shouldSumColumn(column, schema)).toBe(false);
    });

    it("respecte total: sum même si l'en-tête est ambigu", () => {
      const schema = makeInvoiceSchema();
      const column = { header: "Indice", type: "number" as const, formula: null, formula_en: null, total: "sum" as const };
      expect(shouldSumColumn(column, schema)).toBe(true);
    });

    it("ne somme pas la VNC ni l'annuité d'un tableau d'amortissement", () => {
      const schema: TableSchema = {
        type: "complex_table",
        title: "Calcul VNC après amortissement linéaire",
        parameters: [{ name: "Méthode", ref: "C5", value: "Linéaire", type: "text" }],
        columns: [
          { header: "Année", type: "integer", formula: null, formula_en: null },
          { header: "Coût d'acquisition", type: "currency", formula: null, formula_en: null },
          { header: "Annuité d'amortissement", type: "currency", formula: "=C{row}/D{row}", formula_en: "=C{row}/D{row}" },
          { header: "Valeur Nette Comptable (VNC)", type: "currency", formula: "=C{row}-G{row}", formula_en: "=C{row}-G{row}" },
        ],
        data_start_row: 10,
        sample_rows: 5,
      };
      const totals = resolveTotals(schema);
      expect(totals.summable).toEqual([false, false, false, false]);
      expect(totals.showTotalRow).toBe(false);
    });

    it("ne somme pas une agrégation répétée sur chaque ligne (COUNTIFS/NB.SI.ENS)", () => {
      const schema: TableSchema = {
        type: "complex_table",
        title: "Compteur de factures impayées > 1000€",
        parameters: [
          { name: "Statut recherché", ref: "C5", value: "Impayée", type: "text" },
          { name: "Montant minimum", ref: "C6", value: 1000, type: "currency" },
        ],
        columns: [
          { header: "Statut", type: "text", formula: null, formula_en: null },
          { header: "Montant (€)", type: "currency", formula: null, formula_en: null },
          {
            header: "Nombre de factures impayées > 1000€",
            type: "integer",
            formula: "=NB.SI.ENS(D10:D16;\">1000\";C10:C16;$C$5)",
            formula_en: "=COUNTIFS(D10:D16,\">1000\",C10:C16,$C$5)",
          },
        ],
        data_start_row: 10,
        sample_rows: 7,
        total_row: false,
      };
      const totals = resolveTotals(schema);
      expect(totals.summable).toEqual([false, true, false]);
      // L'agrégation constante est affichée une seule fois dans la ligne de totaux.
      expect(totals.displayOnce).toEqual([false, false, true]);
      expect(totals.showTotalRow).toBe(true);
    });

    it("ne somme jamais une agrégation constante même avec total: sum", () => {
      const schema = makeInvoiceSchema({
        columns: [
          { header: "Statut", type: "text", formula: null, formula_en: null },
          { header: "Montant (€)", type: "currency", formula: null, formula_en: null, total: "sum" },
          {
            header: "Nb Factures",
            type: "integer",
            formula: "=NB.SI.ENS(...)",
            formula_en: "=COUNTIFS(...)",
            total: "sum",
          },
        ],
      });
      const totals = resolveTotals(schema);
      expect(totals.summable).toEqual([false, true, false]);
      expect(totals.displayOnce).toEqual([false, false, true]);
    });

    it("ne somme pas un SOMME.SI.ENS constant ni un cumul (cas ventes par région)", () => {
      const schema = makeInvoiceSchema({
        title: "Somme des ventes par région et date",
        columns: [
          { header: "Date de vente", type: "date", formula: null, formula_en: null },
          { header: "Région", type: "text", formula: null, formula_en: null },
          {
            header: "Montant de vente (€)",
            type: "currency",
            formula: null,
            formula_en: null,
            total: "sum",
          },
          {
            header: "Ventes filtrées",
            type: "currency",
            formula: "=SOMME.SI.ENS($D$10:$D$15;$C$10:$C$15;$C$5)",
            formula_en: "=SUMIFS($D$10:$D$15,$C$10:$C$15,$C$5)",
            total: "sum",
          },
          {
            header: "Ventes cumulées (filtre)",
            type: "currency",
            formula: "=SOMME.SI.ENS($D$10:$D$15;$C$10:$C$15;$C$5)",
            formula_en: "=SUMIFS($D$10:$D$15,$C$10:$C$15,$C$5)",
            total: "sum",
          },
        ],
      });
      const totals = resolveTotals(schema);
      expect(totals.summable).toEqual([false, false, true, false, false]);
      expect(totals.displayOnce).toEqual([false, false, false, true, false]);
      expect(totals.displayLast).toEqual([false, false, false, false, true]);
    });

    it("ne somme jamais une année fiscale ni une date, même avec total: sum", () => {
      const schema = makeInvoiceSchema({
        title: "Extraire l'année fiscale d'une date",
        total_row: true,
        sample_rows: 5,
        columns: [
          { header: "Date", type: "date", formula: null, formula_en: null },
          {
            header: "Année Fiscale",
            type: "integer",
            formula: "=SI(MOIS(B{row})>=C5;ANNEE(B{row})+1;ANNEE(B{row}))",
            formula_en: "=IF(MONTH(B{row})>=C5,YEAR(B{row})+1,YEAR(B{row}))",
            total: "sum",
          },
        ],
      });
      const totals = resolveTotals(schema);
      expect(totals.summable).toEqual([false, false]);
      expect(totals.showTotalRow).toBe(false);
    });

    it("ignore total: sum sur un prix unitaire et sur un taux", () => {
      const schema = makeInvoiceSchema();
      const unitPrice = {
        header: "Prix Unitaire",
        type: "currency" as const,
        formula: null,
        formula_en: null,
        total: "sum" as const,
      };
      const rate = {
        header: "Taux de marge",
        type: "percentage" as const,
        formula: null,
        formula_en: null,
        total: "sum" as const,
      };
      expect(shouldSumColumn(unitPrice, schema)).toBe(false);
      expect(shouldSumColumn(rate, schema)).toBe(false);
    });

    it("ne somme pas un running total et affiche la dernière valeur", () => {
      const schema = makeInvoiceSchema({
        columns: [
          { header: "Montant (€)", type: "currency", formula: null, formula_en: null, total: "sum" },
          {
            header: "Cumul des ventes",
            type: "currency",
            formula: "=SOMME($D$10:D{row})",
            formula_en: "=SUM($D$10:D{row})",
            total: "sum",
          },
        ],
      });
      const totals = resolveTotals(schema);
      expect(totals.summable).toEqual([true, false]);
      expect(totals.displayOnce).toEqual([false, false]);
      expect(totals.displayLast).toEqual([false, true]);
    });

    it("somme une agrégation variable ({row}) uniquement avec total: sum", () => {
      const schema = makeInvoiceSchema();
      const rowAggregate = {
        header: "Salaire max du service",
        type: "currency" as const,
        formula: "=MAX.SI.ENS($D$10:$D$19;$C$10:$C$19;C{row})",
        formula_en: "=MAXIFS($D$10:$D$19,$C$10:$C$19,C{row})",
        total: "sum" as const,
      };
      const autoAggregate = { ...rowAggregate, total: "auto" as const };
      expect(shouldSumColumn(rowAggregate, schema)).toBe(true);
      expect(shouldSumColumn(autoAggregate, schema)).toBe(false);
      expect(
        resolveTotals({ ...schema, columns: [rowAggregate, autoAggregate] }).displayOnce
      ).toEqual([false, false]);
    });

    it("somme les colonnes de période d'un tableau croisé", () => {
      const schema: TableSchema = {
        type: "complex_table",
        title: "Budget marketing par service et par mois",
        parameters: [{ name: "Budget source", ref: "C5", value: 50000, type: "currency" }],
        columns: [
          { header: "Service", type: "text", formula: null, formula_en: null },
          { header: "Janvier", type: "currency", formula: "=SUMIFS(x;C{row})", formula_en: "=SUMIFS(x,C{row})" },
          { header: "Février", type: "currency", formula: "=SUMIFS(x;C{row})", formula_en: "=SUMIFS(x,C{row})" },
        ],
        data_start_row: 10,
        sample_rows: 4,
        row_total_column: { header: "Total trim.", type: "currency" },
        total_row: true,
      };
      const totals = resolveTotals(schema);
      expect(totals.summable).toEqual([false, true, true]);
      expect(totals.showTotalRow).toBe(true);
    });
  });

  describe("resolveTotals", () => {
    it("affiche la ligne de totaux pour une commande", () => {
      const totals = resolveTotals(makeInvoiceSchema());
      expect(totals.showTotalRow).toBe(true);
      expect(totals.label).toBe("TOTAL");
    });

    it("affiche quand même les totaux si une colonne de montant existe malgré total_row: false", () => {
      const totals = resolveTotals(makeInvoiceSchema({ total_row: false }));
      expect(totals.showTotalRow).toBe(true);
    });

    it("masque la ligne si toutes les colonnes numériques sont en total: none", () => {
      const schema = makeInvoiceSchema({
        total_row: false,
        columns: [
          { header: "Statut", type: "text", formula: null, formula_en: null },
          { header: "Montant (€)", type: "currency", formula: null, formula_en: null, total: "none" },
          { header: "Nombre de factures", type: "integer", formula: "=COUNTIFS(...)", formula_en: "=COUNTIFS(...)", total: "none" },
        ],
      });
      expect(resolveTotals(schema).showTotalRow).toBe(false);
    });

    it("masque la ligne en mode auto quand aucune colonne n'est sommable", () => {
      const schema = makeInvoiceSchema({
        total_row: "auto",
        columns: [
          { header: "Service", type: "text", formula: null, formula_en: null },
          { header: "Date", type: "date", formula: null, formula_en: null },
        ],
      });
      expect(resolveTotals(schema).showTotalRow).toBe(false);
    });

    it("masque la ligne en mode auto avec une seule ligne d'exemple", () => {
      const totals = resolveTotals(makeInvoiceSchema({ sample_rows: 1, total_row: "auto" }));
      expect(totals.showTotalRow).toBe(false);
    });

    it("conserve la ligne avec total_row true même sur une seule ligne", () => {
      const totals = resolveTotals(makeInvoiceSchema({ sample_rows: 1 }));
      expect(totals.showTotalRow).toBe(true);
    });
  });

  describe("resolveTotalLabel", () => {
    it("déduit TOTAL pour une commande", () => {
      expect(resolveTotalLabel(makeInvoiceSchema())).toBe("TOTAL");
    });

    it("déduit TOTAL GÉNÉRAL pour un budget", () => {
      expect(resolveTotalLabel(makeInvoiceSchema({ title: "Budget prévisionnel 2026" }))).toBe("TOTAL GÉNÉRAL");
    });

    it("déduit CUMUL pour un échéancier", () => {
      expect(resolveTotalLabel(makeInvoiceSchema({ title: "Échéancier de remboursement" }))).toBe("CUMUL");
    });

    it("retombe sur TOTAUX sans contexte identifiable", () => {
      expect(resolveTotalLabel(makeInvoiceSchema({ title: "Simulation diverse" }))).toBe("TOTAUX");
    });

    it("respecte un libellé explicite", () => {
      expect(resolveTotalLabel(makeInvoiceSchema({ total_row_label: "Sous-total général" }))).toBe(
        "Sous-total général"
      );
    });
  });
});
