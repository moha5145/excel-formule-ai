import ExcelJS from "exceljs";
import { type TableSchema, type TableColumn, type ReferenceTable } from "./schemaParser";
import { type ExportFormat, resolveFormulaTemplate } from "./postProcessFormula";
import { extractTables } from "../excelExport";

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
    template = col.formula_en;
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
        if (iso) {
          cell.value = new Date(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10));
        } else if (fr) {
          cell.value = new Date(parseInt(fr[3], 10), parseInt(fr[2], 10) - 1, parseInt(fr[1], 10));
        } else {
          cell.value = String(rawValue);
        }
      }
      break;
    default:
      cell.value = typeof rawValue === "number" ? rawValue : String(rawValue ?? "");
  }
}

export function buildComplexWorkbook(
  workbook: ExcelJS.Workbook,
  schema: TableSchema,
  response: string,
  prompt: string,
  format: ExportFormat
): BuildResult {
  const warnings: string[] = [];

  workbook.creator = "Excel-Formule AI";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  // 1. Ajouter les feuilles (ordre : interactif puis guide)
  const sheetInteractif = workbook.addWorksheet("Tableau Interactif");
  const sheetGuide = workbook.addWorksheet("Formule & Guide");

  sheetInteractif.views = [{ showGridLines: true }];
  sheetGuide.views = [{ showGridLines: true }];

  const numCols = schema.columns.length;
  const lastColLetter = String.fromCharCode(66 + numCols); // B est "Ligne", donc C, D, E...
  const endColLetter = lastColLetter > "H" ? lastColLetter : "H";

  // --- ONGLET : TABLEAU INTERACTIF ---

  // L1 : Titre
  sheetInteractif.mergeCells(`A1:${endColLetter}1`);
  const t1 = sheetInteractif.getCell("A1");
  t1.value = schema.title.toUpperCase();
  t1.font = { name: "Segoe UI", size: 14, bold: true, color: { argb: WHITE } };
  t1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
  t1.alignment = { vertical: "middle", horizontal: "center" };
  sheetInteractif.getRow(1).height = 36;

  // L2 : Barre jaune
  sheetInteractif.mergeCells(`A2:${endColLetter}2`);
  sheetInteractif.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: YELLOW } };
  sheetInteractif.getRow(2).height = 4;

  // L3 : Description
  sheetInteractif.mergeCells(`A3:${endColLetter}3`);
  const descCell = sheetInteractif.getCell("A3");
  descCell.value = prompt;
  descCell.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: SLATE_900 } };
  descCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  sheetInteractif.getRow(3).height = 28;

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
      const labelCell = sheetInteractif.getCell(`${labelColLetter}${rowNum}`);
      labelCell.value = param.name;
      labelCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: SLATE_700 } };
      labelCell.alignment = { vertical: "middle", horizontal: "left" };

      // Cellule du paramètre
      const valCell = sheetInteractif.getCell(cellRef);

      // Déterminer le style selon le type : calculé (vert) ou statique (jaune)
      const isCalculated = param.formula !== undefined && param.formula !== null;
      const bgColor = isCalculated ? GREEN_BG : LIGHT_YELLOW;
      const borderColor = isCalculated ? GREEN_BORDER : GOLD_BORDER;
      const fontColor = isCalculated ? GREEN_TEXT : SLATE_900;

      valCell.font = { name: "Segoe UI", size: 10, bold: !isCalculated, color: { argb: fontColor } };
      valCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
      valCell.border = {
        top: { style: "thin", color: { argb: borderColor } },
        bottom: { style: "thin", color: { argb: borderColor } },
        left: { style: "thin", color: { argb: borderColor } },
        right: { style: "thin", color: { argb: borderColor } },
      };
      valCell.alignment = { vertical: "middle", horizontal: "right" };

      // Écrire la valeur OU la formule
      if (isCalculated) {
        // Paramètre calculé : injecter la formule via ExcelJS
        // Résoudre via postProcessFormula pour gérer LibreOffice/Excel format
        const resolved = resolveFormulaTemplate(param.formula!, 1, format, true);
        valCell.value = { formula: resolved.replace(/^=/, "") };
      } else if (param.type === "text") {
        valCell.value = String(param.value ?? "");
        valCell.alignment = { vertical: "middle", horizontal: "left" };
      } else {
        setCellValueByType(valCell, param.type, param.value);
      }

      // Appliquer le format numérique selon le type
      setCellFormatByType(valCell, param.type);
    }
    // Légende sous la zone paramètres (1ère ligne vide avant le tableau)
  }

  // Headers du tableau de données
  const startRow = schema.data_start_row || 10;
  const headerRow = sheetInteractif.getRow(startRow);
  headerRow.height = 24;

  const bHeader = headerRow.getCell(2); // Colonne B "Ligne"
  bHeader.value = "Ligne";
  bHeader.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: WHITE } };
  bHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
  bHeader.alignment = { horizontal: "center", vertical: "middle" };
  bHeader.border = {
    top: { style: "thin", color: { argb: "FF475569" } },
    bottom: { style: "medium", color: { argb: "FF1E293B" } },
    left: { style: "thin", color: { argb: "FF475569" } },
    right: { style: "thin", color: { argb: "FF475569" } },
  };

  for (let c = 0; c < numCols; c++) {
    const cell = headerRow.getCell(3 + c); // Colonne C, D, E...
    cell.value = schema.columns[c].header;
    cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin", color: { argb: "FF475569" } },
      bottom: { style: "medium", color: { argb: "FF1E293B" } },
      left: { style: "thin", color: { argb: "FF475569" } },
      right: { style: "thin", color: { argb: "FF475569" } },
    };
  }

  // Extraire les données d'exemple du Markdown si possible
  const mdTables = extractTables(response);
  const mdTable = mdTables[0];
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
  const sampleRowsCount = schema.sample_rows || 3;
  for (let r = 0; r < sampleRowsCount; r++) {
    const currRowIndex = startRow + 1 + r;
    const row = sheetInteractif.getRow(currRowIndex);
    row.height = 22;

    const labelCell = row.getCell(2);
    labelCell.value = `Ligne ${r + 1}`;
    labelCell.font = { name: "Segoe UI", size: 10, color: { argb: "FF475569" } };
    labelCell.alignment = { vertical: "middle" };

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
        cell.font = { name: "Segoe UI", size: 10, color: { argb: GREEN_TEXT } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_BG } };
        cell.border = {
          top: { style: "thin", color: { argb: GREEN_BORDER } },
          bottom: { style: "thin", color: { argb: GREEN_BORDER } },
          left: { style: "thin", color: { argb: GREEN_BORDER } },
          right: { style: "thin", color: { argb: GREEN_BORDER } },
        };
        // Appliquer le formatage numérique (numFmt)
        setCellFormatByType(cell, col.type);
      } else {
        // Colonne input
        let val: string | number | undefined = undefined;
        if (mdTable && colMappings[c] !== -1 && mdTable.rows[r]) {
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
        cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: SLATE_900 } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_YELLOW } };
        cell.border = {
          top: { style: "thin", color: { argb: GOLD_BORDER } },
          bottom: { style: "thin", color: { argb: GOLD_BORDER } },
          left: { style: "thin", color: { argb: GOLD_BORDER } },
          right: { style: "thin", color: { argb: GOLD_BORDER } },
        };
      }
      cell.alignment = { vertical: "middle", horizontal: col.type === "text" ? "left" : "right" };
    }
  }

  // Ligne d'instructions après le tableau
  const instrRowIndex = startRow + 1 + sampleRowsCount;
  sheetInteractif.mergeCells(`B${instrRowIndex}:H${instrRowIndex}`);
  const instrCell1 = sheetInteractif.getCell(`B${instrRowIndex}`);
  instrCell1.value = "💡 Modifiez les valeurs jaunes pour tester d'autres scénarios. Les résultats (verts) se recalculent automatiquement.";
  instrCell1.font = { name: "Segoe UI", size: 9, italic: true, color: { argb: SLATE_500 } };
  sheetInteractif.getRow(instrRowIndex).height = 18;

  // Largeurs colonnes Tableau Interactif
  sheetInteractif.getColumn(1).width = 4;
  sheetInteractif.getColumn(2).width = 24;
  for (let c = 3; c <= 3 + numCols + 1; c++) {
    sheetInteractif.getColumn(c).width = 18;
  }

  // --- ONGLET : FORMULES & GUIDE ---

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

  // --- ONGLET(S) : DONNÉES DE RÉFÉRENCE (lookup tables) ---
  if (schema.reference_tables && schema.reference_tables.length > 0) {
    for (const refTable of schema.reference_tables) {
      buildReferenceTableSheet(workbook, refTable, warnings);
    }
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

  // L1 : Titre
  sheet.mergeCells(`A1:${String.fromCharCode(64 + numCols)}1`);
  const titleCell = sheet.getCell("A1");
  titleCell.value = refTable.name.toUpperCase();
  titleCell.font = { name: "Segoe UI", size: 12, bold: true, color: { argb: WHITE } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  sheet.getRow(1).height = 28;

  // Description (si présente)
  let startRowIdx = 3;
  if (refTable.description) {
    sheet.mergeCells(`A2:${String.fromCharCode(64 + numCols)}2`);
    const descCell = sheet.getCell("A2");
    descCell.value = refTable.description;
    descCell.font = { name: "Segoe UI", size: 9, italic: true, color: { argb: SLATE_500 } };
    descCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    sheet.getRow(2).height = 18;
  }

  // Headers
  const headerRowIdx = startRowIdx;
  const headerRow = sheet.getRow(headerRowIdx);
  headerRow.height = 22;
  for (let c = 0; c < numCols; c++) {
    const cell = headerRow.getCell(1 + c);
    cell.value = refTable.headers[c];
    cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin", color: { argb: "FF475569" } },
      bottom: { style: "medium", color: { argb: "FF1E293B" } },
      left: { style: "thin", color: { argb: "FF475569" } },
      right: { style: "thin", color: { argb: "FF475569" } },
    };
  }

  // Vérification de cohérence avec start_ref
  const refMatch = refTable.start_ref.match(/^([A-Za-z0-9_]+)!([A-Z]{1,3})(\d+)$/);
  if (!refMatch) {
    warnings.push(`Table "${refTable.name}": start_ref "${refTable.start_ref}" invalide, ignoré`);
    return;
  }
  const expectedSheetName = refMatch[1];
  const expectedColLetter = refMatch[2];
  const expectedRowNum = parseInt(refMatch[3], 10);

  if (expectedSheetName !== refTable.sheet_name) {
    warnings.push(
      `Table "${refTable.name}": sheet_name=${refTable.sheet_name} mais start_ref pointe vers ${expectedSheetName}. ` +
      `Les formules du tableau interactif risquent de ne pas trouver les données.`
    );
  }

  // Décalage attendu entre la position attendue par les formules (start_ref)
  // et la position réelle d'écriture (headerRowIdx + 1, car header = ligne 0 dans la table de référence)
  const actualStartRow = headerRowIdx + 1; // 1ère ligne de données après header
  const rowOffset = expectedRowNum - actualStartRow;
  const actualStartCol = expectedColLetter.charCodeAt(0) - 64; // 'A' = 1
  // On ne décale pas les colonnes (on suppose que la 1ère colonne = A, ce qui est standard)
  // Si l'IA référence $I$10:$I$15 mais qu'on écrit en A4:A15, il y aura un mismatch → warning + on prévient
  if (expectedColLetter !== "A") {
    warnings.push(
      `Table "${refTable.name}": start_ref indique la colonne ${expectedColLetter} ` +
      `mais cette implementation écrit seulement en colonne A. Les formules INDEX/MATCH utilisant ` +
      `$${expectedColLetter}$${expectedRowNum} peuvent pointer vers une zone vide.`
    );
  }

  // Lignes de données
  for (let r = 0; r < refTable.rows.length; r++) {
    const row = sheet.getRow(actualStartRow + r);
    row.height = 20;
    const dataRow = refTable.rows[r];

    for (let c = 0; c < Math.min(numCols, dataRow.length); c++) {
      const cell = row.getCell(1 + c);
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

  // Largeurs colonnes
  for (let c = 1; c <= numCols; c++) {
    sheet.getColumn(c).width = 20;
  }

  // Note explicative en bas
  const noteRowIdx = actualStartRow + refTable.rows.length + 1;
  sheet.mergeCells(`A${noteRowIdx}:${String.fromCharCode(64 + numCols)}${noteRowIdx}`);
  const noteCell = sheet.getCell(`A${noteRowIdx}`);
  noteCell.value = `📋 Table de référence "${refTable.name}" — Les formules du tableau interactif pointent vers cette feuille (${refTable.sheet_name}).`;
  noteCell.font = { name: "Segoe UI", size: 9, italic: true, color: { argb: SLATE_500 } };
  noteCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  sheet.getRow(noteRowIdx).height = 18;

  // Report d'un warning si décalage de lignes détecté
  if (rowOffset !== 0) {
    warnings.push(
      `Table "${refTable.name}": les formules du tableau interactif référencent $${expectedColLetter}$${expectedRowNum} ` +
      `mais les données ont été écrites à la ligne ${actualStartRow}. ` +
      `Décalage de ${rowOffset} ligne(s) — les formules INDEX/MATCH risques de pointer vers la mauvaise plage.`
    );
  }
}
