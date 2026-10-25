import type { TableColumn, TableSchema } from "./schemaParser";

export type ColumnTotal = "sum" | "none" | "auto" | "once";

const NUMERIC_TYPES = new Set(["currency", "percentage", "integer", "number"]);

// En-têtes qui ne représentent JAMAIS une grandeur additive : même un
// "total": "sum" erroné du modèle est ignoré (années, dates, IDs, taux...).
const NEVER_SUM_HEADER_PATTERNS: RegExp[] = [
  /prix\s*unitaire/,
  /cout\s*unitaire/,
  /unit\s*price/,
  /unit\s*cost/,
  /\btaux\b/,
  /\brate\b/,
  /pourcentage/,
  /percent/,
  /remise/,
  /discount/,
  /annee/,
  /\byear\b/,
  /\bmois\b/,
  /\bmonth\b/,
  /\bjour\b/,
  /\bday\b/,
  /date/,
  /duree/,
  /duration/,
  /\bage\b/,
  /exercice/,
  /numero/,
  /\bnum\b/,
  /\bn[°o]\b/,
  /\bref\b/,
  /\bid\b/,
  /identifiant/,
];

// Exclusions « souples » : un "total": "sum" explicite peut les rétablir.
const EXCLUDED_HEADER_PATTERNS: RegExp[] = [
  /moyenne/,
  /average/,
  /mediane/,
  /median/,
  /indice/,
  /\bindex\b/,
];

const AGGREGATE_FORMULA_PATTERN =
  /(COUNTIFS?|NB\.SI(\.ENS)?|SUMIFS?|SOMME\.SI(\.ENS)?|MAXIFS?|MAX\.SI(\.ENS)?|MINIFS?|MIN\.SI(\.ENS)?|AVERAGEIFS?|MOYENNE\.SI(\.ENS)?|SUMPRODUCT|SOMMEPROD)/;

const INCLUDED_HEADER_PATTERNS: RegExp[] = [
  /total/,
  /sous[- ]?total/,
  /montant/,
  /amount/,
  /quantite/,
  /quantity/,
  /\bqty\b/,
  /nombre/,
  /count/,
  /budget/,
  /vente/,
  /sales/,
  /chiffre\s*d.affaires/,
  /\bca\b/,
  /salaire/,
  /salary/,
  /prime/,
  /bonus/,
  /stock/,
  /inventaire/,
  /heures?/,
  /hours?/,
  /jours?/,
  /days?/,
  /\bkm\b/,
  /litres?/,
  /charge/,
  /frais/,
  /depense/,
  /impot/,
  /taxe/,
  /\btva\b/,
  /janvier/,
  /fevrier/,
  /mars/,
  /avril/,
  /\bmai\b/,
  /juin/,
  /juillet/,
  /aout/,
  /septembre/,
  /octobre/,
  /novembre/,
  /decembre/,
  /trimestre/,
  /\bq[1-4]\b/,
  /semaine/,
  /week/,
  /^(19|20)\d{2}$/,
];

export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[$€%]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isNumericType(type: TableColumn["type"]): boolean {
  return NUMERIC_TYPES.has(type);
}

function isCalculated(column: TableColumn): boolean {
  return Boolean(column.formula || column.formula_en);
}

function formulaText(column: TableColumn): string {
  return `${column.formula ?? ""} ${column.formula_en ?? ""}`.toUpperCase();
}

// Agrégation (NB.SI.ENS, COUNTIFS, MAX.SI.ENS...) évaluée pour chaque ligne.
function isAggregateColumn(column: TableColumn): boolean {
  return AGGREGATE_FORMULA_PATTERN.test(formulaText(column));
}

// Une formule calculée sans {row} (et sans ROW()) produit la même valeur sur
// toutes les lignes : la somme serait fausse (ex. SUMIFS sur des paramètres).
function isRowDependentFormula(column: TableColumn): boolean {
  const text = formulaText(column);
  return /\{ROW\}/.test(text) || /\bROW\s*\(/.test(text);
}

function isConstantCalculated(column: TableColumn): boolean {
  return isCalculated(column) && !isRowDependentFormula(column);
}

const CUMULATIVE_HEADER_PATTERN =
  /cumul|running|progressif|progressi|ytd|to date|depuis le debut/;

// Un cumul (ou une plage qui s'étend jusqu'à la ligne courante) ne se somme pas :
// seule la dernière valeur représente le total cumulé.
function isCumulativeColumn(column: TableColumn): boolean {
  if (CUMULATIVE_HEADER_PATTERN.test(normalizeHeader(column.header))) return true;
  return /\$?[A-Z]{1,3}\$?\d+:[A-Z]{1,3}\{ROW\}/.test(formulaText(column));
}

export function shouldSumColumn(column: TableColumn, schema: TableSchema): boolean {
  if (!isNumericType(column.type)) return false;

  // Un taux / pourcentage ne s'additionne jamais, même si "sum" est demandé.
  if (column.type === "percentage") return false;

  // Un cumul / running total ne se somme jamais.
  if (isCumulativeColumn(column)) return false;

  // Colonne calculée constante : même valeur sur chaque ligne → jamais sommée.
  if (isConstantCalculated(column)) return false;

  // Année, date, n°/ID, prix unitaire, taux... : jamais additifs.
  const header = normalizeHeader(column.header);
  if (NEVER_SUM_HEADER_PATTERNS.some((pattern) => pattern.test(header))) return false;

  // Agrégation ligne par ligne (critère variable via {row}) : on ne la somme
  // que si le modèle le demande, ou automatiquement dans un tableau croisé
  // (une ligne = une dimension, une colonne = une période).
  if (isCalculated(column) && isAggregateColumn(column)) {
    if (column.total === "none") return false;
    if (column.total === "sum") return true;
    return Boolean(schema.row_total_column);
  }

  if (column.total === "none") return false;
  if (column.total === "sum") return true;

  if (EXCLUDED_HEADER_PATTERNS.some((pattern) => pattern.test(header))) return false;
  if (INCLUDED_HEADER_PATTERNS.some((pattern) => pattern.test(header))) return true;

  // Tableau croisé (pivot) : les colonnes calculées de période sont sommables.
  if (schema.row_total_column && isCalculated(column)) return true;

  return false;
}

interface TotalLabelsRule {
  pattern: RegExp;
  label: string;
}

const LABEL_RULES: TotalLabelsRule[] = [
  { pattern: /facture|commande|devis|achat|invoice|order|quote/, label: "TOTAL" },
  { pattern: /budget|previsionnel|forecast/, label: "TOTAL GÉNÉRAL" },
  { pattern: /vente|sales|chiffre\s*d.affaires/, label: "TOTAL VENTES" },
  { pattern: /stock|inventaire|inventory/, label: "TOTAL STOCK" },
  { pattern: /tresorerie|cash\s*flow/, label: "TOTAL TRÉSORERIE" },
  { pattern: /echeancier|amortissement|remboursement|schedule/, label: "CUMUL" },
  { pattern: /effectif|salaire|paie|salary|payroll/, label: "TOTAL EFFECTIFS" },
  { pattern: /depense|charge|frais|expense/, label: "TOTAL CHARGES" },
];

export function resolveTotalLabel(schema: TableSchema): string {
  if (schema.total_row_label && schema.total_row_label.trim()) {
    return schema.total_row_label.trim();
  }

  const context = normalizeHeader(
    [schema.title, ...schema.columns.map((column) => column.header)].join(" ")
  );
  const rule = LABEL_RULES.find((candidate) => candidate.pattern.test(context));
  return rule ? rule.label : "TOTAUX";
}

export interface ResolvedTotals {
  showTotalRow: boolean;
  label: string;
  summable: boolean[];
  // Colonne constante : afficher la valeur une seule fois (première ligne).
  displayOnce: boolean[];
  // Colonne cumulée : afficher la dernière valeur (le cumul final).
  displayLast: boolean[];
}

export function resolveTotals(schema: TableSchema): ResolvedTotals {
  const summable = schema.columns.map((column) => shouldSumColumn(column, schema));
  const displayOnce = schema.columns.map(
    (column) =>
      isNumericType(column.type) &&
      !isCumulativeColumn(column) &&
      isConstantCalculated(column)
  );
  const displayLast = schema.columns.map(
    (column) => isNumericType(column.type) && isCumulativeColumn(column)
  );
  const hasSummableColumn = summable.some(Boolean);
  const sampleRows = schema.sample_rows ?? 3;

  // La ligne de totaux est portée par les colonnes sommable : un total_row: false
  // ne la supprime pas tant qu'une colonne de montant existe. Pour la désactiver,
  // il faut mettre "total": "none" sur toutes les colonnes numériques.
  let showTotalRow: boolean;
  if (schema.total_row === true) {
    showTotalRow = hasSummableColumn;
  } else {
    showTotalRow = hasSummableColumn && sampleRows >= 2;
  }

  return {
    showTotalRow,
    label: resolveTotalLabel(schema),
    summable,
    displayOnce,
    displayLast,
  };
}
