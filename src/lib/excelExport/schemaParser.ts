import { z } from "zod";
import { normalizeHeader } from "./totalPolicy";
import type { ColumnTotal } from "./totalPolicy";

export type { ColumnTotal } from "./totalPolicy";

export type ColumnType =
  | "currency"
  | "percentage"
  | "integer"
  | "number"
  | "date"
  | "text";

export interface TableParameter {
  name: string;          // "Montant du prêt"
  ref: string;           // "C3" — cellule d'input existante
  value?: number | string;   // Optionnel si formula est fourni (cellule calculée)
  type: ColumnType;
  unit?: string;         // "€", "%", "ans"
  formula?: string | null;       // Formule pour cellule paramètre calculée (ex: "=DATE(YEAR(C10),12,31)-DATE(YEAR(C10),1,1)+1").
                                  // Préférer l'anglais invariant (tons/FONCTIONS EN, virgules), mais
                                  // le builder convertit les formules FR (MAX.SI.ENS, ;, etc.) à la volée.
  formula_label?: string | null; // Formule adaptée au format utilisateur (affichage guide, optionnel)
}

export interface ColumnValidation {
  type: "list";
  ref_table?: string;
  ref_column?: string;
  formula_range?: string; // ex: "RefProduits!$B$2:$B$10"
}

export interface TableColumn {
  header: string;
  type: ColumnType;
  formula: string | null;       // null = colonne input (statique)
  formula_en: string | null;     // version anglaise invariante
  description?: string;
  validation?: ColumnValidation;
  total?: ColumnTotal;           // "sum" | "once" | "none" | "auto" (défaut "auto")
}

export interface ReferenceTable {
  name: string;                       // "Table Produits" — nom court pour identifier la table
  sheet_name: string;                 // "DonneesProduits" — nom de l'onglet Excel (max 31 chars, sans caractères spéciaux)
  start_ref: string;                 // "DonneesProduits!A1" — cellule de début (incluant le nom de feuille)
  headers: string[];                  // ["Catégorie", "Produit", "Prix"]
  rows: (string | number | null)[][]; // valeurs (les null sont laissés vides)
  column_types?: ColumnType[];        // optionnel : format de chaque colonne (currency/percentage/integer/date/text/number)
  description?: string;
}

export interface RowTotalColumn {
  header: string;                       // "Total ligne", "Total HT", etc.
  type?: ColumnType;                    // défaut: currency. Format de la cellule total
  formula_en?: string | null;           // Optionnel: formule de total personnalisée (placeholder {row}).
                                        // Si null/absent: SUM automatique des colonnes numériques précédentes.
}

export interface TableSchema {
  type: "complex_table";
  title: string;
  parameters: TableParameter[];
  columns: TableColumn[];
  data_start_row: number;
  sample_rows: number;
  reference_tables?: ReferenceTable[];    // tables de référence (lookup) écrites dans un onglet séparé
  row_total_column?: RowTotalColumn;       // Optionnel: colonne "Total de ligne" à droite du tableau
  total_row?: boolean | "auto";            // Optionnel (défaut "auto"): ajoute une ligne de totaux en bas
  total_row_label?: string;               // Optionnel: libellé dynamique (déduit du contexte si absent)
}

export class SchemaValidationError extends Error {
  constructor(
    public readonly issues: z.ZodIssue[],
    public readonly raw: unknown
  ) {
    super(`Schéma table invalide: ${issues.map((i) => i.message).join("; ")}`);
    this.name = "SchemaValidationError";
  }
}

const CELL_REF_REGEX = /^[A-Z]{1,3}[0-9]{1,3}$/; // "A1", "AB12", "C3"

const VALID_COLUMN_TYPES = [
  "currency",
  "percentage",
  "integer",
  "number",
  "date",
  "text",
] as const;

const COLUMN_TYPE_ALIASES: Record<string, ColumnType> = {
  devise: "currency",
  monetaire: "currency",
  money: "currency",
  monetary: "currency",
  euro: "currency",
  eur: "currency",
  "$": "currency",
  percent: "percentage",
  pourcentage: "percentage",
  taux: "percentage",
  rate: "percentage",
  "%": "percentage",
  int: "integer",
  entier: "integer",
  count: "integer",
  nombre: "integer",
  whole: "integer",
  numeric: "number",
  numerique: "number",
  decimal: "number",
  float: "number",
  double: "number",
  string: "text",
  texte: "text",
  boolean: "text",
  bool: "text",
  booleen: "text",
  datetime: "date",
  "date-time": "date",
  timestamp: "date",
};

function inferColumnTypeFromHeader(header: string): ColumnType {
  const raw = header.toLowerCase();
  const normalized = normalizeHeader(header);
  if (/taux|pourcentage|percent|\brate\b|ratio|coefficient/.test(normalized)) {
    return "percentage";
  }
  if (
    /%/.test(raw) &&
    !/montant|total|prix|euro|cout|salaire|prime|budget|vente|valeur|frais|charge|tva/.test(normalized)
  ) {
    return "percentage";
  }
  if (/\bdate\b|datetime|echeance/.test(normalized)) return "date";
  if (/montant|total|prix|euro|cout|salaire|prime|budget|vente|valeur|frais|charge|tva|devise|\bca\b/.test(normalized)) {
    return "currency";
  }
  if (/quantite|nombre|\bnb\b|annee|mois|jour|duree|age|\bcount\b|\bqty\b|heure/.test(normalized)) {
    return "integer";
  }
  if (/statut|nom|libelle|produit|categorie|client|texte|description|service|region|pays|type|commentaire/.test(normalized)) {
    return "text";
  }
  return "number";
}

// Tolérant : le modèle produit parfois des types hors enum ("string", "count",
// "monétaire", "bool"…). On normalise au lieu de rejeter tout le schéma.
export function normalizeColumnType(raw: unknown, header?: unknown): ColumnType {
  // Un en-tête/nom "Date..." est TOUJOURS une date, même si le modèle a mis
  // "text"/"number" : sinon YEAR()/MONTH() renvoient #VALEUR! sur une chaîne.
  if (typeof header === "string" && /\bdate\b/.test(normalizeHeader(header))) {
    return "date";
  }
  if (typeof raw === "string") {
    const value = raw
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if ((VALID_COLUMN_TYPES as readonly string[]).includes(value)) {
      return value as ColumnType;
    }
    const alias = COLUMN_TYPE_ALIASES[value];
    if (alias) return alias;
  }
  return inferColumnTypeFromHeader(typeof header === "string" ? header : "");
}

const ColumnTypeSchema = z.preprocess(
  (raw) => normalizeColumnType(raw),
  z.enum(VALID_COLUMN_TYPES)
);

function normalizeTotal(raw: unknown): ColumnTotal {
  if (raw === true) return "sum";
  if (raw === false) return "none";
  if (typeof raw === "string") {
    const value = raw.trim().toLowerCase();
    if (["sum", "somme", "total", "yes", "oui", "true"].includes(value)) return "sum";
    if (["none", "no", "non", "false", "aucun", "off"].includes(value)) return "none";
    if (["once", "unique", "first", "premiere", "valeur", "reference"].includes(value)) return "once";
    if (["auto", "automatique", ""].includes(value)) return "auto";
  }
  return "auto";
}

function normalizeTotalRow(raw: unknown): boolean | "auto" {
  if (raw === true || raw === false) return raw;
  if (typeof raw === "string") {
    const value = raw.trim().toLowerCase();
    if (["true", "yes", "oui", "1"].includes(value)) return true;
    if (["false", "no", "non", "0", "none"].includes(value)) return false;
  }
  return "auto";
}

const TotalSchema = z.preprocess(
  (raw) => normalizeTotal(raw),
  z.enum(["sum", "once", "none", "auto"])
);

const TotalRowSchema = z.preprocess(
  (raw) => normalizeTotalRow(raw),
  z.union([z.boolean(), z.literal("auto")])
);

const TotalRowLabelSchema = z.preprocess(
  (raw) =>
    typeof raw === "string" && raw.trim()
      ? raw.trim().slice(0, 40)
      : undefined,
  z.string().min(1).max(40).optional()
);

const TableParameterObjectSchema = z.object({
  name: z.string().min(1).max(80),
  ref: z.string().regex(CELL_REF_REGEX, "ref doit être une référence de cellule type 'C3'"),
  value: z.union([z.number(), z.string().min(1)]).optional(),
  type: ColumnTypeSchema,
  unit: z.string().max(10).optional(),
  formula: z.union([z.string().min(1).max(500), z.null()]).optional(),
  formula_label: z.union([z.string().min(1).max(500), z.null()]).optional(),
}).superRefine((param, ctx) => {
  // Un paramètre doit avoir soit une valeur (constante) soit une formule (cellule calculée)
  if (param.value === undefined && (param.formula === undefined || param.formula === null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Paramètre "${param.name}": doit avoir soit "value" (constante) soit "formula" (cellule calculée)`,
      path: ["value"],
    });
  }
  // Une formule doit commencer par "="
  if (param.formula !== undefined && param.formula !== null && !param.formula.startsWith("=")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Paramètre "${param.name}": formula doit commencer par "="`,
      path: ["formula"],
    });
  }
});

const TableParameterSchema = z.preprocess((raw) => {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const param = raw as Record<string, unknown>;
    return { ...param, type: normalizeColumnType(param.type, param.name) };
  }
  return raw;
}, TableParameterObjectSchema);

const ColumnValidationSchema = z.object({
  type: z.literal("list"),
  ref_table: z.string().optional(),
  ref_column: z.string().optional(),
  formula_range: z.string().optional(),
});

const TableColumnObjectSchema = z.object({
  header: z.string().min(1).max(60),
  type: ColumnTypeSchema,
  formula: z.union([z.string().min(1).max(500), z.null()]),
  formula_en: z.union([z.string().min(1).max(500), z.null()]),
  description: z.string().max(200).optional(),
  validation: ColumnValidationSchema.optional(),
  total: TotalSchema,
}).superRefine((col, ctx) => {
  // Cohérence : si formula existe, formula_en doit exister aussi (et inversement)
  if ((col.formula === null) !== (col.formula_en === null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Colonne "${col.header}": formula et formula_en doivent être null ou non-null ensemble`,
      path: ["formula"],
    });
  }
  // Une formule doit commencer par "="
  if (col.formula !== null && !col.formula.startsWith("=")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Colonne "${col.header}": formula doit commencer par "="`,
      path: ["formula"],
    });
  }
});

const TableColumnSchema = z.preprocess((raw) => {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const column = raw as Record<string, unknown>;
    return {
      ...column,
      type: normalizeColumnType(column.type, column.header),
    };
  }
  return raw;
}, TableColumnObjectSchema);

const ReferenceTableSchema = z.object({
  name: z.string().min(1).max(60),
  sheet_name: z.string()
    .min(1).max(31)
    .regex(/^[A-Za-z0-9_]+$/, "sheet_name doit contenir uniquement lettres, chiffres et _ (max 31 caractères, sans espaces)"),
  start_ref: z.string()
    .min(1).max(50)
    .regex(/^[A-Za-z0-9_]+![A-Z]{1,3}[0-9]{1,3}$/, "start_ref doit etre au format 'NomFeuille!A1'"),
  headers: z.array(z.string().min(1).max(60)).min(1).max(20),
  rows: z.array(
    z.array(z.union([z.string().max(200), z.number(), z.null()])).max(20)
  ).max(500),
  column_types: z.array(ColumnTypeSchema).optional(),
  description: z.string().max(200).optional(),
}).superRefine((rt, ctx) => {
  if (rt.column_types && rt.column_types.length !== rt.headers.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Table "${rt.name}": column_types doit avoir la même longueur que headers`,
      path: ["column_types"],
    });
  }
  if (rt.rows.length > 0 && rt.rows[0].length > rt.headers.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Table "${rt.name}": une ligne a plus de colonnes que headers`,
      path: ["rows"],
    });
  }
});

const RowTotalColumnSchema = z.object({
  header: z.string().min(1).max(60),
  type: ColumnTypeSchema.optional(),
  formula_en: z.union([z.string().min(1).max(500), z.null()]).optional(),
});

const NUMERIC_COLUMN_TYPES: ColumnType[] = ["currency", "percentage", "integer", "number"];

const TableSchemaZod = z.object({
  type: z.literal("complex_table"),
  title: z.string().min(1).max(120),
  parameters: z.array(TableParameterSchema).max(20).default([]),
  columns: z.array(TableColumnSchema).min(2).max(50),
  data_start_row: z.number().int().min(2).max(100).default(10),
  sample_rows: z.number().int().min(1).max(100).default(3),
  reference_tables: z.array(ReferenceTableSchema).max(10).optional(),
  row_total_column: RowTotalColumnSchema.optional(),
  total_row: TotalRowSchema,
  total_row_label: TotalRowLabelSchema,
}).superRefine((schema, ctx) => {
  // Règle F4: si au moins 1 colonne est input (formula === null),
  // parameters doit être non-vide
  const inputColumns = schema.columns.filter((c) => c.formula === null);
  if (inputColumns.length > 0 && (!schema.parameters || schema.parameters.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Le schéma contient des colonnes input (formula: null) mais parameters est vide",
      path: ["parameters"],
    });
  }
  // Pivot léger : pour qu'une colonne "Total de ligne" ait du sens, il doit y avoir
  // AU MOINS une colonne numérique sommable (currency/percentage/integer/number).
  if (schema.row_total_column) {
    const summable = schema.columns.filter((c) => NUMERIC_COLUMN_TYPES.includes(c.type));
    if (summable.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "row_total_column est défini mais aucune colonne n'est sommable (currency/percentage/integer/number)",
        path: ["row_total_column"],
      });
    }
  }
  // total_row: true sans colonne sommable n'est PAS une erreur : la ligne de
  // totaux est simplement omise (le modèle peut se tromper sans bloquer l'export).
});

const SCHEMA_REGEX = /<!--\s*TABLE_SCHEMA:\s*(\{[\s\S]*?\})\s*-->/;

export function extractTableSchema(markdown: string): unknown | null {
  const match = markdown.match(SCHEMA_REGEX);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null; // JSON mal formé
  }
}

const DATE_FUNCTION_REGEX =
  /\b(YEAR|MONTH|DAY|DATE|EOMONTH|DATEDIF|DATEVALUE|ANNEE|MOIS|JOUR)\s*\(/i;

// La colonne B est réservée au libellé "Ligne". Une formule de type
// YEAR(B2)/MONTH(B{row}) est donc décalée d'une colonne : on la répare vers la
// colonne de date réelle, en conservant le placeholder {row}.
function replaceReservedLigneColumn(formula: string, dateColumnLetter: string): string {
  const protectedParts: string[] = [];
  const stash = (part: string): string => {
    protectedParts.push(part);
    return `\u0000${protectedParts.length - 1}\u0000`;
  };

  let result = formula
    .replace(/"[^"]*"/g, stash)
    .replace(
      /((?:'[^']+'|[A-Za-z_][A-Za-z0-9_.]*)!\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?)/g,
      stash
    );

  result = result.replace(
    /(\$?)B(\$?)(\{row(?:-1)?\}|\d+)/g,
    (_match, _dollar1: string, _dollar2: string, ref: string) =>
      `${dateColumnLetter}${ref.startsWith("{") ? ref : "{row}"}`
  );

  return result.replace(/\u0000(\d+)\u0000/g, (_match, index: string) =>
    protectedParts[Number(index)] ?? ""
  );
}

function repairDateFormulas(schema: TableSchema): void {
  const dateIndex = schema.columns.findIndex(
    (column) => column.type === "date" || /date/.test(normalizeHeader(column.header))
  );
  if (dateIndex < 0) return;
  const dateColumnLetter = String.fromCharCode(67 + dateIndex);

  for (const column of schema.columns) {
    for (const field of ["formula", "formula_en"] as const) {
      const formula = column[field];
      if (!formula || !DATE_FUNCTION_REGEX.test(formula)) continue;
      const repaired = replaceReservedLigneColumn(formula, dateColumnLetter);
      if (repaired !== formula) column[field] = repaired;
    }
  }
}

export function validateSchema(raw: unknown): TableSchema {
  const parsed = TableSchemaZod.safeParse(raw);
  if (!parsed.success) {
    throw new SchemaValidationError(parsed.error.issues, raw);
  }
  const schema = parsed.data as TableSchema;
  repairDateFormulas(schema);
  return schema;
}

export function isComplexResponse(markdown: string): boolean {
  return SCHEMA_REGEX.test(markdown);
}

export const NewColumnSchema = z.object({
  header: z.string().min(1, "En-tête de colonne requis"),
  type: z.enum(["text", "currency", "percentage", "integer", "number", "date"]).default("number"),
  formula: z.string().min(1, "Formule requise"),
  formula_en: z.string().optional(),
  description: z.string().optional(),
});

export const FileModificationSchema = z.object({
  target_sheet: z.string().optional(),
  new_columns: z.array(NewColumnSchema).min(1, "Au moins une nouvelle colonne requise"),
});

export type FileModification = z.infer<typeof FileModificationSchema>;

const FILE_MODIFICATION_REGEX = /<!--\s*FILE_MODIFICATION:\s*(\{[\s\S]*?\})\s*-->/;

export function extractFileModificationSchema(response: string): unknown | null {
  const match = response.match(FILE_MODIFICATION_REGEX);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export function validateFileModificationSchema(raw: unknown): FileModification {
  const result = FileModificationSchema.safeParse(raw);
  if (!result.success) {
    throw new SchemaValidationError(result.error.issues, raw);
  }
  return result.data;
}

export function isFileModificationResponse(markdown: string): boolean {
  return FILE_MODIFICATION_REGEX.test(markdown);
}

