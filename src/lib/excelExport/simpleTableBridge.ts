import { type TableSchema, type TableColumn, type TableParameter } from "./schemaParser";
import { extractTables, extractFormula, extractEnglishFormula } from "../excelExport";

export function convertSimpleTableToSchema(response: string, promptTitle?: string): TableSchema | null {
  if (!response) return null;

  const tables = extractTables(response);
  if (tables.length === 0) return null;

  const table = tables[0];
  // La première colonne est "Ligne", on la retire
  const headers = table.headers.slice(1);
  if (headers.length < 2) return null;

  const formulaFr = extractFormula(response);
  const formulaEn = extractEnglishFormula(response) || formulaFr;
  if (!formulaFr) return null;

  // Extraire les paramètres éventuels <!-- PARAM C5 = 100 -->
  const parameters: TableParameter[] = [];
  const paramRegex = /<!--\s*PARAM\s+(\$?[A-Z]+\$?\d+)\s*=\s*([\d.,]+)\s*-->/g;
  let pm;
  while ((pm = paramRegex.exec(response)) !== null) {
    const ref = pm[1].replace(/\$/g, "");
    const val = parseFloat(pm[2].replace(/,/g, "."));
    if (!isNaN(val)) {
      parameters.push({
        name: `Paramètre ${ref}`,
        ref,
        value: val,
        type: "number",
      });
    }
  }

  // Détecter le numéro de ligne utilisé dans la formule (ex: C10 -> 10, C5 -> 5)
  // On exclut les réfs de paramètres ($C$5, C5...)
  const paramRefs = new Set(parameters.map((p) => p.ref.toUpperCase()));
  const rowMatches = [...formulaFr.matchAll(/([A-Z]{1,3})(\d+)/g)];
  let detectedRow: string | null = null;
  for (const match of rowMatches) {
    const fullRef = match[0].toUpperCase();
    if (!paramRefs.has(fullRef)) {
      detectedRow = match[2];
      break;
    }
  }

  const rowToReplace = detectedRow || "10";
  const rowRegex = new RegExp(`(\\b[A-Z]{1,3})${rowToReplace}\\b`, "g");
  const rowPlaceholderFormulaFr = formulaFr.replace(rowRegex, "$1{row}");
  const rowPlaceholderFormulaEn = formulaEn.replace(rowRegex, "$1{row}");

  // Déduire les colonnes : la dernière colonne est le résultat, les autres sont inputs
  const columns: TableColumn[] = headers.map((header, idx) => {
    const isResult = idx === headers.length - 1;
    let type: TableColumn["type"] = "number";
    const lower = header.toLowerCase();
    if (/%|taux|tva|pourcent/i.test(lower)) type = "percentage";
    else if (/€|euro|prix|montant|total|salaire|prime/i.test(lower)) type = "currency";
    else if (/date/i.test(lower)) type = "date";
    else if (/nom|libellé|texte|produit|client|article/i.test(lower)) type = "text";
    else if (/quantité|nb|nombre|durée|années|mois|jours/i.test(lower)) type = "integer";

    if (isResult) {
      return {
        header,
        type,
        formula: rowPlaceholderFormulaFr,
        formula_en: rowPlaceholderFormulaEn,
        description: "Résultat calculé",
      };
    }

    return {
      header,
      type,
      formula: null,
      formula_en: null,
      description: "Donnée d'entrée",
    };
  });

  return {
    type: "complex_table",
    title: promptTitle ? promptTitle.slice(0, 60) : "Tableau de calcul",
    parameters,
    columns,
    data_start_row: parseInt(rowToReplace, 10) || 10,
    sample_rows: Math.max(1, table.rows.length),
  };
}
