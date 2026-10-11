import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { type ExportFormat, resolveFormulaTemplate } from "./postProcessFormula";
import { detectCsvDelimiter } from "../fileParser";
import { patchWorkbookForceCalc } from "../excelExport";

export interface NewColumnDefinition {
  header: string;
  formula: string;
  formula_en?: string;
  type?: "currency" | "percentage" | "integer" | "number" | "text" | "date";
  description?: string;
}

export interface WorkbookModificationConfig {
  rawBuffer: ArrayBuffer;
  fileName: string;
  sheetName?: string;
  newColumns: NewColumnDefinition[];
  format?: ExportFormat;
}

export interface ModificationResult {
  modifiedWorkbook: ExcelJS.Workbook;
  warnings: string[];
}

const BRAND_HEADER_BG = "FF166534"; // Vert émeraude distinctif pour marquer l'ajout IA élégamment
const BRAND_HEADER_FG = "FFFFFFFF";
const BORDER_COLOR = "FFCBD5E1";

function setCellFormatByType(cell: ExcelJS.Cell, type?: string): void {
  switch (type) {
    case "currency":
      cell.numFmt = "#,##0.00 \"€\"";
      break;
    case "percentage":
      cell.numFmt = "0.00%";
      break;
    case "integer":
      cell.numFmt = "#,##0";
      break;
    case "date":
      cell.numFmt = "dd/mm/yyyy";
      break;
    default:
      cell.numFmt = "General";
  }
}

export async function loadWorkbookFromBuffer(
  rawBuffer: ArrayBuffer,
  fileName: string
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const lowerName = fileName.toLowerCase();

  if (lowerName.endsWith(".csv")) {
    const text = new TextDecoder("utf-8").decode(rawBuffer);
    const delimiter = detectCsvDelimiter(text);
    const sheetData = XLSX.read(text, {
      type: "string",
      raw: false,
      FS: delimiter,
    });
    const firstSheetName = sheetData.SheetNames[0] || "CSV";
    const sheet = sheetData.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });

    const ws = workbook.addWorksheet(fileName.replace(/\.csv$/i, "").slice(0, 31) || "Données");
    for (let r = 0; r < rows.length; r++) {
      const row = ws.getRow(r + 1);
      const rowData = rows[r];
      for (let c = 0; c < rowData.length; c++) {
        row.getCell(c + 1).value = rowData[c] as ExcelJS.CellValue;
      }
      row.commit();
    }
    return workbook;
  }

  // Pour XLSX et XLS
  try {
    await workbook.xlsx.load(rawBuffer);
    return workbook;
  } catch {
    // Si ExcelJS échoue sur un XLS binaire ancien, passer par SheetJS pour reconstituer
    const sheetJsWb = XLSX.read(rawBuffer, { type: "array" });
    for (const sName of sheetJsWb.SheetNames) {
      const sheet = sheetJsWb.Sheets[sName];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
      const ws = workbook.addWorksheet(sName);
      for (let r = 0; r < rows.length; r++) {
        const row = ws.getRow(r + 1);
        const rowData = rows[r];
        for (let c = 0; c < rowData.length; c++) {
          row.getCell(c + 1).value = rowData[c] as ExcelJS.CellValue;
        }
        row.commit();
      }
    }
    return workbook;
  }
}

export async function modifyExistingWorkbook(
  config: WorkbookModificationConfig
): Promise<ModificationResult> {
  const warnings: string[] = [];
  const format = config.format || "excel-fr";
  const workbook = await loadWorkbookFromBuffer(config.rawBuffer, config.fileName);

  workbook.calcProperties.fullCalcOnLoad = true;

  // Sélectionner la feuille cible
  let targetSheet: ExcelJS.Worksheet | undefined;
  if (config.sheetName) {
    targetSheet = workbook.getWorksheet(config.sheetName);
  }
  if (!targetSheet) {
    targetSheet = workbook.worksheets[0];
  }

  if (!targetSheet) {
    throw new Error("Aucune feuille trouvée dans le classeur.");
  }

  // Déterminer la ligne d'en-tête et les dimensions réelles
  let headerRowIndex = 1;
  while (headerRowIndex <= 20 && targetSheet.getRow(headerRowIndex).actualCellCount === 0) {
    headerRowIndex++;
  }
  if (headerRowIndex > 20) headerRowIndex = 1;

  const headerRow = targetSheet.getRow(headerRowIndex);
  let maxColIndex = 0;
  headerRow.eachCell({ includeEmpty: false }, (_cell, colNumber) => {
    if (colNumber > maxColIndex) maxColIndex = colNumber;
  });
  if (maxColIndex === 0) {
    maxColIndex = targetSheet.columnCount || 1;
  }

  // Déterminer la dernière ligne de données
  let lastDataRowIndex = targetSheet.actualRowCount;
  if (lastDataRowIndex <= headerRowIndex) {
    lastDataRowIndex = headerRowIndex + 1;
  }

  // Appliquer l'ajout des nouvelles colonnes
  let currentColIndex = maxColIndex + 1;

  for (const newCol of config.newColumns) {
    // 1. En-tête
    const headerCell = targetSheet.getCell(headerRowIndex, currentColIndex);
    headerCell.value = newCol.header;
    headerCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: BRAND_HEADER_FG } };
    headerCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_HEADER_BG } };
    headerCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    headerCell.border = {
      top: { style: "thin", color: { argb: BORDER_COLOR } },
      bottom: { style: "medium", color: { argb: BRAND_HEADER_BG } },
      left: { style: "thin", color: { argb: BORDER_COLOR } },
      right: { style: "thin", color: { argb: BORDER_COLOR } },
    };

    // Ajuster largeur de colonne
    const colWidth = Math.max(14, newCol.header.length + 4);
    targetSheet.getColumn(currentColIndex).width = colWidth;

    // 2. Formule sur toutes les lignes de données réelles
    const formulaTemplate = newCol.formula_en || newCol.formula;
    const isAlreadyEnglish = Boolean(newCol.formula_en);

    for (let r = headerRowIndex + 1; r <= lastDataRowIndex; r++) {
      const dataCell = targetSheet.getCell(r, currentColIndex);

      try {
        const resolved = resolveFormulaTemplate(formulaTemplate, r, format, isAlreadyEnglish);
        dataCell.value = { formula: resolved.replace(/^=/, "") };
      } catch (err: unknown) {
        warnings.push(`Ligne ${r}, colonne ${newCol.header} : ${(err as Error).message}`);
        dataCell.value = "";
      }

      setCellFormatByType(dataCell, newCol.type);
      dataCell.border = {
        top: { style: "thin", color: { argb: BORDER_COLOR } },
        bottom: { style: "thin", color: { argb: BORDER_COLOR } },
        left: { style: "thin", color: { argb: BORDER_COLOR } },
        right: { style: "thin", color: { argb: BORDER_COLOR } },
      };
      dataCell.alignment = { vertical: "middle" };
    }

    currentColIndex++;
  }

  return { modifiedWorkbook: workbook, warnings };
}

export async function downloadModifiedWorkbookAsExcel(
  config: WorkbookModificationConfig
): Promise<{ warnings: string[]; blob: Blob }> {
  const { modifiedWorkbook, warnings } = await modifyExistingWorkbook(config);
  const blob = await patchWorkbookForceCalc(modifiedWorkbook);
  return { warnings, blob };
}
