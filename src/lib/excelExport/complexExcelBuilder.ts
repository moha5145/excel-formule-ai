import ExcelJS from "exceljs";
import { type TableSchema, type TableColumn, type ReferenceTable } from "./schemaParser";
import { type ExportFormat, resolveFormulaTemplate, convertToUsInvariant } from "./postProcessFormula";
import { extractTables } from "../excelExport";
import { resolveTotals } from "./totalPolicy";
import { getExcelTheme } from "./excelTheme";

interface BuildResult {
  workbook: ExcelJS.Workbook;
  warnings: string[];
}

const SLATE_900 = "FF0F172A";
const SLATE_700 = "FF334155";
const SLATE_500 = "FF64748B";
const YELLOW    = "FFEAB308";
const WHITE     = "FFFFFFFF";
const AMBER     = "FFCA8A04";
const LIGHT_BG  = "FFF8FAFC";
const LIGHT_YELLOW = "FFFEF3C7";
const GOLD_BORDER = "FFD97706";
const GREEN_TEXT = "FF166534";
const GREEN_BG = "FFF0FDF4";
const GREEN_BORDER = "FF16A34A";

// Normalise un en-tête pour comparaison tolérante : minuscules, sans accents, sans espaces superflus,
// sans suffixe entre parenthèses (ex: "Actif (C)" → "actif")
function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // accents
    .replace(/\s+/g, " ")
    .replace(/\s*\(.*\)\s*$/, "") // suffixe "(C)"
    .trim();
}

// Nettoie la syntaxe Markdown pour le guide
function cleanMarkdownFormatting(text: string): string {
  return text
    .replace(/^\s*#{1,6}\s+/, "")
    .replace(/^\s*---+\s*$/, "")
    .replace(/^\s*\*\*\*+\s*$/, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*]\s+/, "• ")
    .replace(/^\s*\d+\.\s+/, (m) => m.trim() + " ")
    .trim();
}

function parseExplanationLines(markdown: string): string[] {
  const lines = markdown.split("\n");
  const result: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) { inCodeBlock = !inCodeBlock; continue; }
    if (inCodeBlock) continue;
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) continue;
    if (/^-{3,}$/.test(trimmed) || /^\*{3,}$/.test(trimmed)) continue;

    if (!trimmed) {
      result.push("");
      continue;
    }

    const cleaned = cleanMarkdownFormatting(trimmed);
    if (cleaned) {
      result.push(cleaned);
    }
  }
  return result;
}

function resolveColumnFormula(
  col: TableColumn,
  row: number,
  format: ExportFormat,
  warnings: string[]
): string {
  let template: string;
  let isAlreadyEnglish = false;

  if (col.formula_en && col.formula_en.startsWith("=")) {
    // formula_en est censée être en anglais, MAIS l'IA insère parfois des ';'
    // (séparateurs français) par erreur, même dans ce champ. On normalise les
    // séparateurs vers ',' avant de marquer la formule comme déjà anglaise,
    // pour éviter Err:508 dans LibreOffice (parenthèse manquante).
    template = convertToUsInvariant(col.formula_en, format);
    isAlreadyEnglish = true;
  } else if (col.formula && col.formula.startsWith("=")) {
    warnings.push(
      `Colonne "${col.header}": formula_en manquante, utilisation de convertToUsInvariant comme fallback.`
    );
    template = col.formula;
    isAlreadyEnglish = false;
  } else {
    throw new Error(`Colonne "${col.header}": aucune formule valide`);
  }

  // Si l'IA utilise {row-1} par erreur, on la nettoie ou on l'avertit
  if (template.includes("{row-1}")) {
    warnings.push(`Colonne "${col.header}": contient le placeholder {row-1} interdit. Remplacement par la ligne précédente.`);
    template = template.replace(/\{row-1\}/g, String(row - 1));
  }

  // isAlreadyEnglish=true : resolveFormulaTemplate ne relance pas convertToUsInvariant
  // (déjà fait ci-dessus), mais exécute bien postProcessFormula (_xlfn, XLOOKUP→INDEX/MATCH).
  return resolveFormulaTemplate(template, row, format, isAlreadyEnglish);
}

function setCellFormatByType(cell: ExcelJS.Cell, type: string): void {
  switch (type) {
    case "currency":
      cell.numFmt = "#,##0.00 \"€\"";
      break;
    case "percentage":
      cell.numFmt = "0.00%";
      break;
    case "integer":
      cell.numFmt = "0";
      break;
    case "date":
      cell.numFmt = "dd/mm/yyyy";
      break;
    default:
      cell.numFmt = "General";
  }
}

function setCellValueByType(
  cell: ExcelJS.Cell,
  type: string,
  rawValue: string | number | Date | undefined
): void {
  setCellFormatByType(cell, type);
  if (rawValue === undefined || rawValue === "") {
    cell.value = "";
    return;
  }

  switch (type) {
    case "currency":
      cell.value = typeof rawValue === "number" ? rawValue : Number(rawValue) || 0;
      break;
    case "percentage":
      cell.value = typeof rawValue === "number" ? rawValue :
        Number(rawValue) > 1 ? Number(rawValue) / 100 : Number(rawValue) || 0;
      break;
    case "integer":
      cell.value = typeof rawValue === "number" ? rawValue : Number(rawValue) || 0;
      break;
    case "date":
      if (rawValue instanceof Date) {
        cell.value = rawValue;
      } else {
        const iso = String(rawValue).match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
        const fr = String(rawValue).match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
        let parsed: Date | null = null;
        if (iso) {
          parsed = new Date(Date.UTC(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10), 12, 0, 0));
        } else if (fr) {
          parsed = new Date(Date.UTC(parseInt(fr[3], 10), parseInt(fr[2], 10) - 1, parseInt(fr[1], 10), 12, 0, 0));
        }
        if (parsed) {
          // ExcelJS sérialise les dates en utilisant l'offset UTC du Date.
          // Construire à midi UTC garantit qu'un éventuel arrondi vers le serial
          // ne décale PAS la date d'un jour (ex: 01/01/2024 → 31/12/2023 sur
          // les fuseaux négatifs ou bord de fix ExcelJS).
          cell.value = parsed;
        } else {
          cell.value = String(rawValue);
        }
      }
      break;
    default:
      cell.value = typeof rawValue === "number" ? rawValue : String(rawValue ?? "");
  }
}

// Convertit un index de colonne 1-based en lettre Excel (1 → A, 27 → AA)
function columnIndexToLetter(index: number): string {
  let letter = "";
  let n = index;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter || "A";
}

// Détermine la plage de référence d'une liste déroulante.
// Priorité : formula_range explicite, sinon résolution via ref_table/ref_column
// dans les tables de référence du schéma.
function resolveColumnValidationRange(
  col: TableColumn,
  schema: TableSchema
): string | null {
  const validation = col.validation;
  if (!validation || validation.type !== "list") return null;

  if (validation.formula_range) return validation.formula_range;

  if (validation.ref_table && schema.reference_tables) {
    const refTable = schema.reference_tables.find(
      (t) => t.sheet_name === validation.ref_table || t.name === validation.ref_table
    );
    if (refTable) {
      let colIdx = 0;
      if (validation.ref_column) {
        const found = refTable.headers.findIndex(
          (h) => h.toLowerCase().trim() === validation.ref_column!.toLowerCase().trim()
        );
        if (found >= 0) colIdx = found;
      }
      const letter = columnIndexToLetter(colIdx + 1);
      const startDataRow = 2; // les en-têtes sont à la ligne 1
      const endDataRow = startDataRow + Math.max(0, refTable.rows.length - 1);
      return `${refTable.sheet_name}!$${letter}$${startDataRow}:$${letter}$${endDataRow}`;
    }
  }
  return null;
}

export interface CustomExportData {
  paramValues?: Record<string, string | number>;
  rowValues?: Record<string, string | number>[];
  sampleRows?: number;
  theme?: string;
}

export function buildComplexWorkbook(
  workbook: ExcelJS.Workbook,
  schema: TableSchema,
  response: string,
  prompt: string,
  format: ExportFormat,
  customData?: CustomExportData
): BuildResult {
  const warnings: string[] = [];

  workbook.creator = "Excel-Formule AI";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  // 1. Ajouter les feuilles (ordre : interactif → tables de référence → guide)
  // Le guide est créé EN DERNIER pour apparaître en dernière feuille (UX : les
  // données interactives et de référence sont visibles avant les explications).
  const sheetInteractif = workbook.addWorksheet("Tableau Interactif");

  sheetInteractif.views = [{ showGridLines: true }];

  const theme = getExcelTheme(customData?.theme);

  const numCols = schema.columns.length;
  const rowTotalColCount = schema.row_total_column ? 1 : 0;
  const lastColLetter = String.fromCharCode(66 + numCols + rowTotalColCount); // B est "Ligne/N°", donc C, D, E... + colonne Total ligne optionnelle
  const endColLetter = lastColLetter > "H" ? lastColLetter : "H";

  // --- ONGLET : TABLEAU INTERACTIF ---

  // L1 : Titre moderne élégant (aligné à gauche, typographie soignée)
  sheetInteractif.mergeCells(`B1:${endColLetter}1`);
  const t1 = sheetInteractif.getCell("B1");
  t1.value = schema.title;
  t1.font = { name: "Segoe UI", size: 14, bold: true, color: { argb: theme.titleText } };
  t1.alignment = { vertical: "middle", horizontal: "left" };
  sheetInteractif.getRow(1).height = 28;

  // L2 : Description / Sous-titre propre
  sheetInteractif.mergeCells(`B2:${endColLetter}2`);
  const descCell = sheetInteractif.getCell("B2");
  const isDuplicatePrompt = prompt && prompt.trim().toLowerCase() === schema.title.trim().toLowerCase();
  descCell.value = isDuplicatePrompt || !prompt ? "Modèle de simulation & calcul automatisé" : prompt.trim();
  descCell.font = { name: "Segoe UI", size: 10, italic: true, color: { argb: theme.subtitleText } };
  descCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  sheetInteractif.getRow(2).height = 20;

  // L3 : Séparateur d'accent discret
  sheetInteractif.mergeCells(`B3:${endColLetter}3`);
  sheetInteractif.getCell("B3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: theme.accent } };
  sheetInteractif.getRow(3).height = 2;

  // Zone paramètres (si présents)
  if (schema.parameters && schema.parameters.length > 0) {
    for (const param of schema.parameters) {
      const cellRef = param.ref;
      const m = cellRef.match(/^([A-Z]+)(\d+)$/);
      if (!m) continue;
      const colLetter = m[1];
      const rowNum = parseInt(m[2], 10);

      // Label dans la colonne à gauche
      const labelColLetter = String.fromCharCode(colLetter.charCodeAt(0) - 1);
      const labelColIdx = colLetter.charCodeAt(0) - 64 - 1;
      const labelCell = sheetInteractif.getCell(`${labelColLetter}${rowNum}`);
      labelCell.value = param.name;
      labelCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: theme.subtitleText } };
      labelCell.alignment = { vertical: "middle", horizontal: "left" };

      // S'assurer que la colonne du label ne coupe pas le texte (ex: "Mode de calcul assurance" -> 25 car.)
      if (labelColIdx >= 1) {
        const curColWidth = sheetInteractif.getColumn(labelColIdx).width || 16;
        sheetInteractif.getColumn(labelColIdx).width = Math.max(curColWidth, param.name.length + 3);
      }

      // Cellule du paramètre
      const valCell = sheetInteractif.getCell(cellRef);

      // Déterminer le style selon le type : calculé ou statique
      const isCalculated = param.formula !== undefined && param.formula !== null;
      const bgColor = isCalculated ? theme.calcBg : theme.inputBg;
      const borderColor = isCalculated ? theme.calcBorder : theme.inputBorder;
      const fontColor = isCalculated ? theme.calcTextColor : theme.inputTextColor;

      valCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: fontColor } };
      valCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
      valCell.border = {
        top: { style: "thin", color: { argb: borderColor } },
        bottom: { style: "thin", color: { argb: borderColor } },
        left: { style: "thin", color: { argb: borderColor } },
        right: { style: "thin", color: { argb: borderColor } },
      };
      valCell.alignment = { vertical: "middle", horizontal: "right" };

      // Écrire la valeur OU la formule
      const cleanRef = cellRef.replace(/\$/g, "");
      const customParamVal = customData?.paramValues?.[cellRef] ?? customData?.paramValues?.[cleanRef];
      const effectiveParamVal = customParamVal !== undefined ? customParamVal : param.value;

      if (isCalculated) {
        const resolved = resolveFormulaTemplate(param.formula!, 1, format, false);
        valCell.value = { formula: resolved.replace(/^=/, "") };
      } else if (param.type === "text") {
        valCell.value = String(effectiveParamVal ?? "");
        valCell.alignment = { vertical: "middle", horizontal: "left" };
      } else {
        setCellValueByType(valCell, param.type, effectiveParamVal);
      }

      // Appliquer le format numérique selon le type
      setCellFormatByType(valCell, param.type);
    }
  }

  // Headers du tableau de données
  // `data_start_row` désigne la PREMIÈRE LIGNE DE DONNÉES (contrat du schéma, cf.
  // route.ts et ComplexTablePreview). Les en-têtes sont donc écrits une ligne
  // au-dessus. C'est ce qui rend les formules de paramètres calculés du type
  // "=DATE(YEAR(C10),12,31)-DATE(YEAR(C10),1,1)+1" valides : C10 pointe bien sur
  // la première date de données, pas sur l'en-tête texte (qui provoquait #VALEUR!).
  // Si aucun paramètre n'est défini et qu'aucune formule ne référence de ligne fixe
  // comme $10 ou $11, on démarre dès la ligne 5 (en-tête L4) pour éviter un vide béant.
  const hasParams = Boolean(schema.parameters && schema.parameters.length > 0);
  const hasFixedRowRanges = schema.columns.some((c) =>
    Boolean((c.formula || c.formula_en || "").match(/\$[A-Z]+\$(10|11|12|13|14|15|16|17|18|19|20)/))
  );
  const dataStartRow = Math.max(
    (!hasParams && !hasFixedRowRanges && schema.data_start_row === 10)
      ? 5
      : (schema.data_start_row || 10),
    5
  );
  const headerRowIndex = dataStartRow - 1;

  const headerRow = sheetInteractif.getRow(headerRowIndex);
  headerRow.height = 32;

  // Extraire les données d'exemple du Markdown pour adapter l'en-tête de numérotation
  const mdTables = extractTables(response);
  const mdTable = mdTables[0];
  const hasExplicitLigneInMd = Boolean(mdTable?.headers?.[0]?.toLowerCase().includes("ligne"));

  const bHeader = headerRow.getCell(2); // Colonne B "N°" ou "Ligne"
  bHeader.value = hasExplicitLigneInMd ? "Ligne" : "N°";
  bHeader.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: theme.headerText } };
  bHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: theme.headerBg } };
  bHeader.alignment = { horizontal: "center", vertical: "middle" };
  bHeader.border = {
    top: { style: "thin", color: { argb: theme.headerBorder } },
    bottom: { style: "medium", color: { argb: theme.headerBorder } },
    left: { style: "thin", color: { argb: theme.headerBorder } },
    right: { style: "thin", color: { argb: theme.headerBorder } },
  };

  for (let c = 0; c < numCols; c++) {
    const cell = headerRow.getCell(3 + c); // Colonne C, D, E...
    cell.value = schema.columns[c].header;
    cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: theme.headerText } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: theme.headerBg } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: theme.headerBorder } },
      bottom: { style: "medium", color: { argb: theme.headerBorder } },
      left: { style: "thin", color: { argb: theme.headerBorder } },
      right: { style: "thin", color: { argb: theme.headerBorder } },
    };
  }

  // ── Colonne "Total de ligne" optionnelle (pivot léger) ──
  // Écrit le header juste après la dernière colonne de données.
  const rowTotal = schema.row_total_column;
  const rowTotalColIndex = rowTotal ? 3 + numCols : -1; // index Excel 1-based
  if (rowTotal) {
    const cell = headerRow.getCell(rowTotalColIndex);
    cell.value = rowTotal.header;
    cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FF475569" } },
      bottom: { style: "medium", color: { argb: "FF1E293B" } },
      left: { style: "medium", color: { argb: "FF1E293B" } },
      right: { style: "thin", color: { argb: "FF475569" } },
    };
  }

  const colMappings: number[] = [];
  if (mdTable) {
    for (let c = 0; c < numCols; c++) {
      const colHeader = normalizeHeader(schema.columns[c].header);
      // 1. Match exact après normalisation
      let mdIdx = mdTable.headers.findIndex((h) => normalizeHeader(h) === colHeader);
      // 2. Fallback : match sans suffixe entre parenthèses (ex: "Actif (C)" → "actif")
      if (mdIdx === -1) {
        mdIdx = mdTable.headers.findIndex((h) => {
          const norm = normalizeHeader(h);
          return norm === colHeader || norm.replace(/\s*\(.*\)\s*$/, "") === colHeader;
        });
      }
      // 3. Fallback positionnel : si header non trouvé, utiliser la position c+1
      //    (le markdown "Ligne" occupe la 1ère col, donc columns[0] = mdTable col 1)
      if (mdIdx === -1) {
        mdIdx = c + 1; // position attendue (Ligne=0, 1ère donnée=1)
      }
      colMappings.push(mdIdx);
    }
  }

  // Écriture des lignes de données
  const sampleRowsCount = customData?.sampleRows ?? schema.sample_rows ?? 3;
  for (let r = 0; r < sampleRowsCount; r++) {
    const currRowIndex = dataStartRow + r;
    const row = sheetInteractif.getRow(currRowIndex);
    row.height = 22;

    const rowBg = r % 2 === 0 ? "FFFFFFFF" : theme.zebraBg;

    const labelCell = row.getCell(2);
    labelCell.value = hasExplicitLigneInMd ? `Ligne ${r + 1}` : r + 1;
    labelCell.font = { name: "Segoe UI", size: 9, color: { argb: "FF64748B" } };
    labelCell.alignment = { vertical: "middle", horizontal: "center" };
    labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };
    labelCell.border = {
      top: { style: "thin", color: { argb: "FFE2E8F0" } },
      bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
      left: { style: "thin", color: { argb: "FFE2E8F0" } },
      right: { style: "thin", color: { argb: "FFE2E8F0" } },
    };

    for (let c = 0; c < numCols; c++) {
      const col = schema.columns[c];
      const cell = row.getCell(3 + c);

      if (col.formula || col.formula_en) {
        // Colonne calculée
        try {
          const resolved = resolveColumnFormula(col, currRowIndex, format, warnings);
          cell.value = { formula: resolved.replace(/^=/, "") };
        } catch (err: unknown) {
          warnings.push(`Erreur formule col "${col.header}" ligne ${currRowIndex}: ${(err as Error).message}`);
          cell.value = "";
        }
        cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: theme.calcTextColor } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };
        cell.border = {
          top: { style: "thin", color: { argb: theme.calcBorder } },
          bottom: { style: "thin", color: { argb: theme.calcBorder } },
          left: { style: "thin", color: { argb: theme.calcBorder } },
          right: { style: "thin", color: { argb: theme.calcBorder } },
        };
        // Appliquer le formatage numérique (numFmt)
        setCellFormatByType(cell, col.type);
      } else {
        // Colonne input
        let val: string | number | undefined = undefined;

        // 1. Priorité aux valeurs personnalisées saisies par l'utilisateur dans le simulateur
        if (customData?.rowValues?.[r]?.[col.header] !== undefined && customData.rowValues[r][col.header] !== "") {
          const rawCustom = customData.rowValues[r][col.header];
          if (typeof rawCustom === "number") {
            val = rawCustom;
          } else {
            const rawStr = String(rawCustom).trim();
            const hasPercent = /%/.test(rawStr);
            const cleaned = rawStr
              .replace(/\s/g, "")
              .replace(/%/g, "")
              .replace(/€|euro/gi, "")
              .replace(",", ".");
            const num = Number(cleaned);
            if (!isNaN(num) && cleaned !== "") {
              val = hasPercent ? num / 100 : num;
            } else {
              val = rawStr;
            }
          }
        } else if (mdTable && colMappings[c] !== -1 && mdTable.rows[r]) {
          // 2. Fallback aux données d'exemple du Markdown
          const rawStr = mdTable.rows[r][colMappings[c]]?.trim() || "";
          if (rawStr) {
            const hasPercent = /%/.test(rawStr);
            const cleaned = rawStr
              .replace(/\s/g, "")
              .replace(/%/g, "")
              .replace(/€|euro/gi, "")
              .replace(",", ".");
            const num = Number(cleaned);
            if (!isNaN(num)) {
              val = hasPercent ? num / 100 : num;
            } else {
              val = rawStr;
            }
          }
        }

        setCellValueByType(cell, col.type, val);
        cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: theme.inputTextColor } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: theme.inputBg } };
        cell.border = {
          top: { style: "thin", color: { argb: theme.inputBorder } },
          bottom: { style: "thin", color: { argb: theme.inputBorder } },
          left: { style: "thin", color: { argb: theme.inputBorder } },
          right: { style: "thin", color: { argb: theme.inputBorder } },
        };
      }
      cell.alignment = { vertical: "middle", horizontal: col.type === "text" ? "left" : "right" };

      // Liste déroulante native Excel pour les colonnes liées à une table de
      // référence (ou explicitement via col.validation).
      const validationRange = resolveColumnValidationRange(col, schema);
      if (validationRange) {
        cell.dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [validationRange],
          showErrorMessage: true,
          errorTitle: "Valeur invalide",
          error: "Veuillez choisir un élément dans la liste déroulante.",
        };
      }
    }

    // ── Cellule "Total de ligne" optionnelle (pivot léger) ──
    if (rowTotal) {
      const totalCell = row.getCell(rowTotalColIndex);
      const numericIndices = schema.columns
        .map((c, i) => ((["currency", "percentage", "integer", "number"].includes(c.type)) ? 3 + i : -1))
        .filter((i) => i >= 0);
      let sumExpr: string;
      if (numericIndices.length === 0) {
        sumExpr = "0";
      } else if (numericIndices.length === 1) {
        const letter = String.fromCharCode(64 + numericIndices[0]);
        sumExpr = `${letter}${currRowIndex}`;
      } else {
        let isContiguous = true;
        for (let k = 1; k < numericIndices.length; k++) {
          if (numericIndices[k] !== numericIndices[k - 1] + 1) { isContiguous = false; break; }
        }
        if (isContiguous) {
          const firstLetter = String.fromCharCode(64 + numericIndices[0]);
          const lastLetter = String.fromCharCode(64 + numericIndices[numericIndices.length - 1]);
          sumExpr = `${firstLetter}${currRowIndex}:${lastLetter}${currRowIndex}`;
        } else {
          sumExpr = numericIndices
            .map((i) => `${String.fromCharCode(64 + i)}${currRowIndex}`)
            .join(",");
        }
      }
      totalCell.value = { formula: `SUM(${sumExpr})` };
      const totalType = rowTotal.type || "currency";
      setCellFormatByType(totalCell, totalType);
      totalCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: theme.calcTextColor } };
      totalCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };
      totalCell.border = {
        top: { style: "thin", color: { argb: theme.calcBorder } },
        bottom: { style: "thin", color: { argb: theme.calcBorder } },
        left: { style: "medium", color: { argb: theme.headerBorder } },
        right: { style: "thin", color: { argb: theme.calcBorder } },
      };
      totalCell.alignment = { vertical: "middle", horizontal: "right" };
    }
  }

  // ── Ligne de totaux (verticale) ──
  // La politique partagée décide quelles colonnes sont sommables et quel libellé
  // afficher (dynamique selon le contexte du tableau).
  const totals = resolveTotals({ ...schema, sample_rows: sampleRowsCount });
  const hasTotalRow = totals.showTotalRow;
  const totalRowLabel = totals.label;
  const firstDataExpRow = dataStartRow;
  const lastDataExpRow = dataStartRow + sampleRowsCount - 1;

  if (hasTotalRow) {
    const totalRowIndex = lastDataExpRow + 1;
    const tRow = sheetInteractif.getRow(totalRowIndex);
    tRow.height = 24;

    const labelCell = tRow.getCell(2); // Colonne B "N° / Ligne"
    labelCell.value = totalRowLabel;
    labelCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: theme.totalText } };
    labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: theme.totalBg } };
    labelCell.alignment = { vertical: "middle", horizontal: "right" };
    labelCell.border = {
      top: { style: "thin", color: { argb: theme.headerBorder } },
      bottom: { style: "double", color: { argb: theme.totalBorder } },
      left: { style: "thin", color: { argb: theme.headerBorder } },
      right: { style: "thin", color: { argb: theme.headerBorder } },
    };

    for (let c = 0; c < numCols; c++) {
      const col = schema.columns[c];
      const cell = tRow.getCell(3 + c);
      if (totals.summable[c]) {
        const colLetter = String.fromCharCode(67 + c);
        const sumRange = `${colLetter}${firstDataExpRow}:${colLetter}${lastDataExpRow}`;
        cell.value = { formula: `SUM(${sumRange})` };
      } else if (totals.displayOnce[c]) {
        // Colonne calculée constante (COUNTIFS/SUMIFS sur critères) : on affiche
        // la valeur une seule fois au lieu de la sommer ou de laisser vide.
        const colLetter = String.fromCharCode(67 + c);
        cell.value = { formula: `${colLetter}${firstDataExpRow}` };
      } else if (totals.displayLast[c]) {
        // Cumul / running total : la dernière ligne porte le cumul final.
        const colLetter = String.fromCharCode(67 + c);
        cell.value = { formula: `${colLetter}${lastDataExpRow}` };
      } else {
        cell.value = ""; // colonne non sommable
      }
      setCellFormatByType(cell, col.type);
      cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: theme.totalText } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: theme.totalBg } };
      cell.border = {
        top: { style: "thin", color: { argb: theme.headerBorder } },
        bottom: { style: "double", color: { argb: theme.totalBorder } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
      cell.alignment = { vertical: "middle", horizontal: col.type === "text" ? "left" : "right" };
    }

    // Total de la colonne "Total ligne"
    if (rowTotal) {
      const cell = tRow.getCell(rowTotalColIndex);
      const colLetter = String.fromCharCode(67 + numCols);
      const sumRange = `${colLetter}${firstDataExpRow}:${colLetter}${lastDataExpRow}`;
      cell.value = { formula: `SUM(${sumRange})` };
      const totalType = rowTotal.type || "currency";
      setCellFormatByType(cell, totalType);
      cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: theme.totalText } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: theme.totalBg } };
      cell.border = {
        top: { style: "thin", color: { argb: theme.headerBorder } },
        bottom: { style: "double", color: { argb: theme.totalBorder } },
        left: { style: "medium", color: { argb: theme.headerBorder } },
        right: { style: "thin", color: { argb: theme.headerBorder } },
      };
      cell.alignment = { vertical: "middle", horizontal: "right" };
    }
  }

  // Ligne d'instructions discrète après le tableau
  const instrRowIndex = lastDataExpRow + (hasTotalRow ? 2 : 1);
  sheetInteractif.mergeCells(`B${instrRowIndex}:${endColLetter}${instrRowIndex}`);
  const instrCell1 = sheetInteractif.getCell(`B${instrRowIndex}`);
  instrCell1.value = "💡 Conseil : modifiez les cellules teintées pour tester d'autres scénarios. Retrouvez le détail des formules dans l'onglet « Formule & Guide ».";
  instrCell1.font = { name: "Segoe UI", size: 9, italic: true, color: { argb: "FF64748B" } };
  sheetInteractif.getRow(instrRowIndex).height = 20;

  // Volet figé : fige les lignes au-dessus des données pour garder les en-têtes visibles au défilement
  sheetInteractif.views = [
    {
      state: "frozen",
      ySplit: headerRowIndex,
      showGridLines: true,
    },
  ];

  // Filtres automatiques sur les en-têtes de colonnes
  sheetInteractif.autoFilter = {
    from: { row: headerRowIndex, column: 2 },
    to: { row: lastDataExpRow, column: 2 + numCols + rowTotalColCount },
  };

  // Largeurs colonnes Tableau Interactif (dynamiques)
  sheetInteractif.getColumn(1).width = 3;
  const curBWidth = sheetInteractif.getColumn(2).width;
  sheetInteractif.getColumn(2).width = Math.max(curBWidth || 8, hasExplicitLigneInMd ? 14 : 8);
  for (let c = 0; c < numCols; c++) {
    const col = schema.columns[c];
    let maxLen = col.header.length;
    for (let r = 0; r < sampleRowsCount; r++) {
      const customVal = customData?.rowValues?.[r]?.[col.header];
      const mdVal = mdTable?.rows[r]?.[colMappings[c]];
      const valStr = String(customVal ?? mdVal ?? "");
      maxLen = Math.max(maxLen, valStr.length);
    }
    const computedWidth = Math.max(14, Math.min(maxLen + 4, 38));
    sheetInteractif.getColumn(3 + c).width = computedWidth;
  }
  if (rowTotal) {
    sheetInteractif.getColumn(rowTotalColIndex).width = Math.max(16, rowTotal.header.length + 4);
  }

  // --- ONGLET(S) : DONNÉES DE RÉFÉRENCE (lookup tables) ---
  if (schema.reference_tables && schema.reference_tables.length > 0) {
    for (const refTable of schema.reference_tables) {
      buildReferenceTableSheet(workbook, refTable, warnings);
    }
  }

  // --- ONGLET : FORMULES & GUIDE (ajouté en dernier pour apparaître en fin de classeur) ---
  const sheetGuide = workbook.addWorksheet("Formule & Guide");
  sheetGuide.views = [{ showGridLines: true }];

  // L1 : Titre
  sheetGuide.mergeCells("A1:H1");
  const gt1 = sheetGuide.getCell("A1");
  gt1.value = "EXCEL-FORMULE AI — GUIDE DES FORMULES";
  gt1.font = { name: "Segoe UI", size: 14, bold: true, color: { argb: WHITE } };
  gt1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
  gt1.alignment = { vertical: "middle", horizontal: "center" };
  sheetGuide.getRow(1).height = 36;

  // L2 : Barre jaune
  sheetGuide.mergeCells("A2:H2");
  sheetGuide.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: YELLOW } };
  sheetGuide.getRow(2).height = 4;

  // Demande
  sheetGuide.getCell("A4").value = "Demande :";
  sheetGuide.getCell("A4").font = { name: "Segoe UI", size: 10, bold: true, color: { argb: SLATE_700 } };
  sheetGuide.mergeCells("B4:H4");
  const gDem = sheetGuide.getCell("B4");
  gDem.value = prompt;
  gDem.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: SLATE_900 } };
  gDem.alignment = { wrapText: true, vertical: "top" };
  sheetGuide.getRow(4).height = 30;

  // Liste des formules
  sheetGuide.getCell("A6").value = "Formules :";
  sheetGuide.getCell("A6").font = { name: "Segoe UI", size: 10, bold: true, color: { argb: SLATE_700 } };

  let currentLineIdx = 6;
  for (let c = 0; c < numCols; c++) {
    const col = schema.columns[c];
    if (col.formula) {
      sheetGuide.getCell(`B${currentLineIdx}`).value = col.header;
      sheetGuide.getCell(`B${currentLineIdx}`).font = { name: "Segoe UI", size: 10, bold: true, color: { argb: SLATE_700 } };

      sheetGuide.mergeCells(`C${currentLineIdx}:H${currentLineIdx}`);
      const formCell = sheetGuide.getCell(`C${currentLineIdx}`);
      formCell.value = col.formula;
      formCell.font = { name: "Consolas", size: 11, bold: true, color: { argb: AMBER } };
      formCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_BG } };
      formCell.alignment = { vertical: "middle" };
      formCell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
      sheetGuide.getRow(currentLineIdx).height = 24;
      currentLineIdx++;
    }
  }

  currentLineIdx += 2;
  sheetGuide.getCell(`A${currentLineIdx}`).value = "Explication :";
  sheetGuide.getCell(`A${currentLineIdx}`).font = { name: "Segoe UI", size: 10, bold: true, color: { argb: SLATE_700 } };

  const explanationLines = parseExplanationLines(response);
  for (const line of explanationLines) {
    if (!line) {
      currentLineIdx++;
      continue;
    }
    sheetGuide.mergeCells(`B${currentLineIdx}:H${currentLineIdx}`);
    const lineCell = sheetGuide.getCell(`B${currentLineIdx}`);
    lineCell.value = line;
    lineCell.font = { name: "Segoe UI", size: 10, color: { argb: SLATE_700 } };
    lineCell.alignment = { wrapText: true, vertical: "top" };
    sheetGuide.getRow(currentLineIdx).height = 20;
    currentLineIdx++;
  }

  sheetGuide.getColumn(1).width = 18;
  for (let c = 2; c <= 8; c++) {
    sheetGuide.getColumn(c).width = 18;
  }

  return { workbook, warnings };
}

function buildReferenceTableSheet(
  workbook: ExcelJS.Workbook,
  refTable: ReferenceTable,
  warnings: string[]
): void {
  const sheet = workbook.addWorksheet(refTable.sheet_name);
  sheet.views = [{ showGridLines: true }];

  const numCols = refTable.headers.length;
  const endColLetter = String.fromCharCode(64 + numCols);

  // ── Parser start_ref : "RefProduits!A1" ou "Feuille!B4" ──
  // Contrat (route.ts) : start_ref pointe vers la cellule des EN-TÊTES de la
  // table. Les données commencent à la ligne suivante. Si l'IA veut un titre
  // et une description, elle DOIT placer start_ref à la ligne 3 (ex: "Feuille!A3").
  const refMatch = refTable.start_ref.match(/^([A-Za-z0-9_]+)!([A-Z]{1,3})(\d+)$/);
  if (!refMatch) {
    warnings.push(`Table "${refTable.name}": start_ref "${refTable.start_ref}" invalide, ignoré`);
    return;
  }
  const expectedSheetName = refMatch[1];
  const expectedColLetter = refMatch[2];
  const headerRowIdx = parseInt(refMatch[3], 10);
  const expectedColIdx = expectedColLetter.charCodeAt(0) - 64; // 'A' = 1

  if (expectedSheetName !== refTable.sheet_name) {
    warnings.push(
      `Table "${refTable.name}": sheet_name=${refTable.sheet_name} mais start_ref pointe vers ${expectedSheetName}. ` +
      `Les formules du tableau interactif risquent de ne pas trouver les données.`
    );
  }
  if (expectedColLetter !== "A") {
    warnings.push(
      `Table "${refTable.name}": start_ref indique la colonne ${expectedColLetter} ` +
      `mais cette implementation écrit les données à partir de la colonne A. ` +
      `Les formules INDEX/MATCH utilisant $${expectedColLetter}$$${headerRowIdx} peuvent pointer vers une zone vide.`
    );
  }

  // ── Titre + Description (uniquement s'il y a de la place AVANT start_ref) ──
  // On écrit le titre en L1 et la description en L2 uniquement si start_ref
  // est à la ligne >= 3. Sinon on saute pour ne pas collisionner avec les en-têtes.
  if (headerRowIdx >= 3) {
    // L1 : Titre
    sheet.mergeCells(`A1:${endColLetter}1`);
    const titleCell = sheet.getCell("A1");
    titleCell.value = refTable.name.toUpperCase();
    titleCell.font = { name: "Segoe UI", size: 12, bold: true, color: { argb: WHITE } };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
    titleCell.alignment = { vertical: "middle", horizontal: "center" };
    sheet.getRow(1).height = 28;
  }

  if (headerRowIdx >= 3 && refTable.description) {
    // L2 : Description
    sheet.mergeCells(`A2:${endColLetter}2`);
    const descCell = sheet.getCell("A2");
    descCell.value = refTable.description;
    descCell.font = { name: "Segoe UI", size: 9, italic: true, color: { argb: SLATE_500 } };
    descCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    sheet.getRow(2).height = 18;
  }

  // ── En-têtes à la position exacte donnée par start_ref ──
  const headerRow = sheet.getRow(headerRowIdx);
  headerRow.height = 22;
  for (let c = 0; c < numCols; c++) {
    const cell = headerRow.getCell(expectedColIdx + c);
    cell.value = refTable.headers[c];
    cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FF475569" } },
      bottom: { style: "medium", color: { argb: "FF1E293B" } },
      left: { style: "thin", color: { argb: "FF475569" } },
      right: { style: "thin", color: { argb: "FF475569" } },
    };
  }

  // ── Données : commencent à start_ref + 1 ──
  // C'est cette position que les formules INDEX/MATCH du tableau interactif
  // DOIVENT référencer (ex: si start_ref="A1", données à A2, B2, C2...).
  const actualStartRow = headerRowIdx + 1;

  for (let r = 0; r < refTable.rows.length; r++) {
    const row = sheet.getRow(actualStartRow + r);
    row.height = 20;
    const dataRow = refTable.rows[r];

    for (let c = 0; c < Math.min(numCols, dataRow.length); c++) {
      const cell = row.getCell(expectedColIdx + c);
      const rawValue = dataRow[c];
      const colType = refTable.column_types?.[c] || "text";

      if (rawValue === null || rawValue === undefined) {
        cell.value = "";
      } else if (typeof rawValue === "number") {
        cell.value = rawValue;
        setCellFormatByType(cell, colType);
      } else {
        // Essayer de parser les nombres en format FR (avec virgule décimale, espaces)
        const strVal = String(rawValue);
        if (colType !== "text" && strVal.trim() !== "") {
          const cleaned = strVal
            .replace(/\s/g, "")
            .replace(/€|euro/gi, "")
            .replace(/%/g, "")
            .replace(",", ".");
          const num = Number(cleaned);
          if (!isNaN(num) && cleaned !== "") {
            cell.value = num;
            setCellFormatByType(cell, colType);
            cell.alignment = { horizontal: "right", vertical: "middle" };
            continue;
          }
        }
        cell.value = strVal;
        cell.alignment = { horizontal: colType === "text" ? "left" : "right", vertical: "middle" };
      }
    }
  }

  // Largeurs colonnes (à partir de la 1ère colonne de la table)
  for (let c = 0; c < numCols; c++) {
    sheet.getColumn(expectedColIdx + c).width = 20;
  }

  // Note explicative en bas (sous les données)
  const noteRowIdx = actualStartRow + refTable.rows.length + 1;
  sheet.mergeCells(`${expectedColLetter}${noteRowIdx}:${endColLetter}${noteRowIdx}`);
  const noteCell = sheet.getCell(`${expectedColLetter}${noteRowIdx}`);
  noteCell.value = `📋 Table de référence "${refTable.name}" — Les formules du tableau interactif pointent vers cette feuille (${refTable.sheet_name}).`;
  noteCell.font = { name: "Segoe UI", size: 9, italic: true, color: { argb: SLATE_500 } };
  noteCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  sheet.getRow(noteRowIdx).height = 18;
}
