import ExcelJS from "exceljs";
import JSZip from "jszip";
import { type ExportFormat, postProcessFormula, convertToUsInvariant } from "./excelExport/postProcessFormula";
export type { ExportFormat };

// Nettoie la syntaxe Markdown pour l'affichage brut en cellule Excel
function cleanMarkdownFormatting(text: string): string {
  const cleaned = text
    .replace(/^\s*#{1,6}\s+/, "") // Titres #, ##, ###
    .replace(/^\s*---+\s*$/, "") // Séparateurs horizontaux ---
    .replace(/^\s*\*\*\*+\s*$/, "") // Séparateurs ***
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Liens Markdown [texte](url) → texte
    .replace(/\*\*([^*]+)\*\*/g, "$1") // Gras **texte**
    .replace(/\*([^*]+)\*/g, "$1") // Italique *texte*
    .replace(/`([^`]+)`/g, "$1") // Code inline `code`
    .replace(/^\s*[-*]\s+/, "• ") // Listes puces
    .replace(/^\s*\d+\.\s+/, (m) => m.trim() + " ") // Listes numérotées
    .trim();
  return cleaned;
}



// Détecte le type d'un paramètre depuis son nom
function detectParamType(name: string): SimParam['type'] {
  const lower = name.toLowerCase();
  if (/%|taux|tx|inter[êe]t|interest|rendement/i.test(lower)) return 'percentage';
  if (/montant|€|euro|salaire|prime|pret|emprunt|loyer|chiffre|ca\b/i.test(lower)) return 'currency';
  if (/dur[ée]e|ann[ée]e(s)?|mois|jour(s)?|nb|nombre|p[ée]riode|term|fois/i.test(lower)) return 'integer';
  return 'number';
}

// Extrait les paramètres de simulation depuis un tableau Markdown multi-colonnes
function extractSimulationParams(
  table: ExtractedTable
): { params: SimParam[]; columns: SimColumn[]; formulaRaw: string } {
  const params: SimParam[] = [];
  const columns: SimColumn[] = [];
  let formulaRaw = "";

  // Headers = première ligne du tableau (header row), en excluant "Ligne"
  const headers = table.headers.slice(1);

  // Initialiser les colonnes
  for (let c = 0; c < headers.length; c++) {
    const colLetter = String.fromCharCode(67 + c); // C=67, D=68, E=69
    columns.push({ letter: colLetter, header: headers[c], params: [] });
  }

  // Extraire les données (rows 1 à N-1, exclure la dernière ligne si formule)
  const lastRow = table.rows[table.rows.length - 1];
  const hasFormulaRow = lastRow.some(cell => cell.startsWith("="));
  const dataEndRow = hasFormulaRow ? table.rows.length - 1 : table.rows.length;

  const dataStartRow = 10;

  for (let rowIdx = 0; rowIdx < dataEndRow; rowIdx++) {
    const row = table.rows[rowIdx];

    for (let colIdx = 0; colIdx < headers.length; colIdx++) {
      const value = row[colIdx + 1]?.trim() || "";
      if (!value) continue;

      const col = columns[colIdx];
      const cellRef = `${col.letter}${dataStartRow + rowIdx}`;

      // Détecter le type
      const isDate = /\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(value) ||
                     /\d{4}-\d{2}-\d{2}/.test(value);
      const cleaned = value.replace(/\s/g, "").replace(/%/g, "").replace(/€|euro/gi, "").replace(",", ".");
      const numVal = Number(cleaned);
      const hasPercent = /%/.test(value);
      const isText = isNaN(numVal) && !isDate && !hasPercent;

      let paramType: SimParam['type'];
      let rawValue: string;
      let paramValue: number;
      let unit = "";
      let needsDivideBy100 = false;

      if (isText) {
        paramType = 'text';
        rawValue = value;
        paramValue = 0;
      } else if (isDate) {
        paramType = 'date';
        rawValue = value;
        paramValue = 0;
      } else if (hasPercent || (numVal > 0 && numVal < 1 && /\d/.test(value))) {
        paramType = 'percentage';
        rawValue = value;
        paramValue = numVal > 0 && numVal < 1 ? numVal * 100 : numVal;
        needsDivideBy100 = true;
        unit = "%";
      } else {
        paramType = detectParamType(col.header);
        rawValue = value;
        paramValue = numVal;

        // Unité depuis le header
        if (/%|taux|tx/i.test(col.header)) { unit = "%"; needsDivideBy100 = true; paramType = 'percentage'; }
        else if (/€|euro|montant|salaire|prime|loyer/i.test(col.header)) unit = "€";
        else if (/dur[ée]e|ann[ée]e|ans|annuel/i.test(col.header)) unit = "ans";
        else if (/mois/i.test(col.header)) unit = "mois";
        else if (/jour/i.test(col.header)) unit = "jours";
      }

      const param: SimParam = {
        name: value,
        value: paramValue,
        rawValue,
        type: paramType,
        unit,
        cellRef,
        colLetter: col.letter,
        colName: col.header,
        rowIndex: rowIdx,
        needsDivideBy100,
      };

      params.push(param);
      col.params.push(param);
    }
  }

  // Détecter la formule
  if (hasFormulaRow) {
    const formulaCell = lastRow.find(cell => cell.startsWith("="));
    if (formulaCell) formulaRaw = formulaCell;
  }

  return { params, columns, formulaRaw };
}

// Réécrit une formule pour la simulation : texte → littéraux, taux → /100
function rewriteFormulaForSimulation(
  formula: string,
  params: SimParam[],
  dataStartRow: number
): string {
  let rewritten = formula;

  // Pour chaque paramètre texte isolé (pas dans une plage), remplacer par "valeur"
  for (const param of params) {
    if (param.type !== 'text') continue;

    const cellRef = param.cellRef;
    const escaped = cellRef.replace(/\$/g, "\\$/");

    // Vérifier si la référence est dans une plage (ex: C10:C12)
    const isInRange = new RegExp(`:\\s*${escaped}|${escaped}\\s*:`, "i").test(rewritten);
    if (isInRange) continue;

    // Référence isolée → remplacer par "valeur"
    const regex = new RegExp(`\\b${escaped}(?!\\w)`, "g");
    rewritten = rewritten.replace(regex, `"${param.rawValue}"`);
  }

  // Ajouter /100 pour les taux
  for (const param of params) {
    if (!param.needsDivideBy100) continue;

    const cellRef = param.cellRef;
    const escaped = cellRef.replace(/\$/g, "\\$");

    // Vérifier si déjà /100
    const hasDivide = new RegExp(`${escaped}/100`).test(formula);
    if (hasDivide) continue;

    // Vérifier si en contexte de comparaison
    const hasComparison = new RegExp(`${escaped}\\s*[<>=]`).test(formula);
    if (hasComparison) continue;

    // Ajouter /100
    const rateRegex = new RegExp(`(${escaped})(?!\\w|/100)`, "g");
    rewritten = rewritten.replace(rateRegex, "$1/100");
  }

  return rewritten;
}

// Extrait la formule depuis le code Markdown
export function extractFormula(markdown: string): string {
  // Recherche d'un bloc de code avec une formule
  const codeBlockRegex = /```(?:excel|sheets|xlsx|txt|vba)?\s*\n([\s\S]*?)\n\s*```/gi;
  let match;
  while ((match = codeBlockRegex.exec(markdown)) !== null) {
    const content = match[1].trim();
    if (content.startsWith("=")) {
      return content;
    }
  }

  // Fallback : ligne qui commence par = (avec une longueur minimum pour éviter les faux positifs)
  const lines = markdown.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("=") && trimmed.length > 4 && /[A-Z(]/.test(trimmed.substring(1, 5))) {
      return trimmed;
    }
  }

  return "";
}

interface ExtractedTable {
  headers: string[];
  rows: string[][];
}

interface SimParam {
  name: string;
  value: number;
  rawValue: string;
  type: 'percentage' | 'currency' | 'integer' | 'number' | 'text' | 'date';
  unit: string;
  cellRef: string;
  colLetter: string;
  colName: string;
  rowIndex: number;
  needsDivideBy100: boolean;
}

interface SimColumn {
  letter: string;
  header: string;
  params: SimParam[];
}

// Extrait les tableaux Markdown pour en faire des données structurées
export function extractTables(markdown: string): ExtractedTable[] {
  const tables: ExtractedTable[] = [];
  const lines = markdown.split("\n");
  let currentTable: ExtractedTable | null = null;
  let inTable = false;
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("```")) { inCodeBlock = !inCodeBlock; continue; }
    if (inCodeBlock) continue;

    const isTableRow = line.startsWith("|") && line.endsWith("|");

    if (isTableRow) {
      const cells = line
        .split("|")
        .map((cell) => {
          let c = cell.trim();
          c = c.replace(/\*\*([^*]+)\*\*/g, "$1"); // Gras **texte**
          c = c.replace(/\*([^*]+)\*/g, "$1"); // Italique *texte*
          c = c.replace(/`([^`]+)`/g, "$1"); // Code inline `code`
          c = c.replace(/^'([^']+)'$/, "$1"); // Quotes simples 'texte'
          return c.trim();
        })
        .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);

      const isSeparator = cells.every((cell) => /^\s*:?-+:?\s*$/.test(cell));
      if (isSeparator) { continue; }

      if (!inTable) {
        inTable = true;
        currentTable = { headers: cells, rows: [] };
      } else if (currentTable) {
        currentTable.rows.push(cells);
      }
    } else {
      if (inTable && currentTable) {
        tables.push(currentTable);
        currentTable = null;
        inTable = false;
      }
    }
  }
  if (inTable && currentTable) { tables.push(currentTable); }
  return tables;
}

// Nettoie le Markdown et retourne un tableau de { text, isHeader, isSub }
type LineType = { text: string; isHeader: boolean; isBullet: boolean; isEmpty: boolean };

function parseExplanationLines(markdown: string): LineType[] {
  const lines = markdown.split("\n");
  const result: LineType[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) { inCodeBlock = !inCodeBlock; continue; }
    if (inCodeBlock) continue;

    // Ignorer les lignes de tableau
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) continue;
    // Ignorer les séparateurs horizontaux purs
    if (/^-{3,}$/.test(trimmed) || /^\*{3,}$/.test(trimmed)) continue;

    if (!trimmed) {
      result.push({ text: "", isHeader: false, isBullet: false, isEmpty: true });
      continue;
    }

    const isHeader = /^#{1,6}\s+/.test(trimmed);
    const isBullet = /^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed);
    const cleaned = cleanMarkdownFormatting(trimmed);

    if (cleaned) {
      result.push({ text: cleaned, isHeader, isBullet, isEmpty: false });
    }
  }
  return result;
}

export async function downloadFormulaAsExcel(
  response: string,
  prompt: string,
  format: ExportFormat = "libreoffice-fr"
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Excel-Compta AI";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  const formulaRaw = extractFormula(response);
  const tables = extractTables(response);
  const explanationLines = parseExplanationLines(response);

  // ─────────────────────────────────────────────────────────────
  // CRÉATION DES ONGLETS (l'ordre détermine l'ordre d'affichage)
  // ─────────────────────────────────────────────────────────────
  const sheet2 = workbook.addWorksheet("Exemple Pratique");
  const sheet1 = workbook.addWorksheet("Formule & Guide");

  // ─────────────────────────────────────────────────────────────
  // ONGLET : FORMULE & GUIDE
  // ─────────────────────────────────────────────────────────────
  sheet1.views = [{ showGridLines: true }];

  // Helpers styles
  const SLATE_900 = "FF0F172A";
  const SLATE_700 = "FF334155";
  const SLATE_500 = "FF64748B";
  const YELLOW    = "FFEAB308";
  const WHITE     = "FFFFFFFF";
  const AMBER     = "FFCA8A04";
  const LIGHT_BG  = "FFF8FAFC";

  // ── Titre
  sheet1.mergeCells("A1:H1");
  const t1 = sheet1.getCell("A1");
  t1.value = "EXCEL-COMPTA AI — FORMULE COMPTABLE";
  t1.font = { name: "Segoe UI", size: 16, bold: true, color: { argb: WHITE } };
  t1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
  t1.alignment = { vertical: "middle", horizontal: "center" };
  sheet1.getRow(1).height = 42;

  // ── Barre jaune déco
  sheet1.mergeCells("A2:H2");
  sheet1.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: YELLOW } };
  sheet1.getRow(2).height = 5;

  // ── Demande utilisateur
  const setLabel = (cell: string, text: string) => {
    sheet1.getCell(cell).value = text;
    sheet1.getCell(cell).font = { name: "Segoe UI", size: 10, bold: true, color: { argb: SLATE_700 } };
    sheet1.getCell(cell).alignment = { vertical: "top" };
  };

  setLabel("A4", "Demande :");
  sheet1.mergeCells("B4:H4");
  const demCell = sheet1.getCell("B4");
  demCell.value = prompt;
  demCell.font = { name: "Segoe UI", size: 10, italic: true, color: { argb: SLATE_700 } };
  demCell.alignment = { wrapText: true, vertical: "top" };
  sheet1.getRow(4).height = 24;

  // ── Formule générée
  setLabel("A6", "Formule :");
  sheet1.getCell("A6").alignment = { wrapText: true, vertical: "top" };
  sheet1.mergeCells("B6:H6");
  const frCell = sheet1.getCell("B6");
  frCell.value = formulaRaw || "Aucune formule détectée";
  frCell.font = { name: "Consolas", size: 11, bold: true, color: { argb: AMBER } };
  frCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_BG } };
  frCell.alignment = { wrapText: true, vertical: "middle" };
  frCell.border = {
    top: { style: "thin", color: { argb: "FFE2E8F0" } },
    bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
    left: { style: "thin", color: { argb: "FFE2E8F0" } },
    right: { style: "thin", color: { argb: "FFE2E8F0" } },
  };
  sheet1.getRow(6).height = 30;

  // ── Séparateur avant les explications
  const sepRow = 9;
  setLabel(`A${sepRow}`, "Explication :");

  let currentLineIdx = sepRow;
  let prevEmpty = false;
  for (const entry of explanationLines) {
    if (entry.isEmpty) {
      if (!prevEmpty) { currentLineIdx++; }
      prevEmpty = true;
      continue;
    }
    prevEmpty = false;

    sheet1.mergeCells(`B${currentLineIdx}:H${currentLineIdx}`);
    const lineCell = sheet1.getCell(`B${currentLineIdx}`);
    lineCell.value = entry.text;
    lineCell.alignment = { wrapText: true, vertical: "top" };

    if (entry.isHeader) {
      lineCell.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: SLATE_900 } };
      sheet1.getRow(currentLineIdx).height = 22;
    } else if (entry.isBullet) {
      lineCell.font = { name: "Segoe UI", size: 10, color: { argb: SLATE_700 } };
      sheet1.getRow(currentLineIdx).height = 18;
    } else {
      lineCell.font = { name: "Segoe UI", size: 10, color: { argb: SLATE_700 } };
      sheet1.getRow(currentLineIdx).height = 18;
    }
    currentLineIdx++;
  }

  // Largeurs colonnes onglet 1
  sheet1.getColumn(1).width = 18; // Labels
  for (let c = 2; c <= 8; c++) {
    sheet1.getColumn(c).width = 18;
  }

  // ─────────────────────────────────────────────────────────────
  // ONGLET : EXEMPLE PRATIQUE
  // ─────────────────────────────────────────────────────────────
  sheet2.views = [{ showGridLines: true }];

  // ── Titre
  sheet2.mergeCells("A1:H1");
  const t2 = sheet2.getCell("A1");
  t2.value = "EXEMPLE PRATIQUE DE SIMULATION";
  t2.font = { name: "Segoe UI", size: 14, bold: true, color: { argb: WHITE } };
  t2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
  t2.alignment = { vertical: "middle", horizontal: "center" };
  sheet2.getRow(1).height = 36;

  // ── Barre jaune déco
  sheet2.mergeCells("A2:H2");
  sheet2.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: YELLOW } };
  sheet2.getRow(2).height = 4;

  let nextRow = 4;

  // ── Calcul du dataStartRow AVANT tout affichage
  // Layout: row4=title, row5=formula, row6=instructions(+2), row8=simtitle(+1), row9=headers(+1) → dataStartRow=10
  const simDataStartRow = 4 + 1 + 1 + 2 + 1 + 1; // = 10

  // ── Pré-extraction des paramètres de simulation
  let simParams: SimParam[] = [];
  let simColumns: SimColumn[] = [];
  let simFormulaRaw = formulaRaw;
  let zone1Formula = "";

  if (tables.length > 0) {
    const { params, columns, formulaRaw: extracted } = extractSimulationParams(tables[0]);
    simParams = params;
    simColumns = columns;
    simFormulaRaw = extracted || formulaRaw;

    if (simParams.length > 0 && simFormulaRaw) {
      zone1Formula = rewriteFormulaForSimulation(simFormulaRaw, simParams, simDataStartRow);
      zone1Formula = postProcessFormula(zone1Formula, format);
    }
  }

  // ── Section formule à copier-coller
  const writeSection = (row: number, label: string, value: string) => {
    const labelCell = sheet2.getCell(`B${row}`);
    labelCell.value = label;
    labelCell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: SLATE_500 } };

    sheet2.mergeCells(`C${row}:H${row}`);
    const valCell = sheet2.getCell(`C${row}`);
    valCell.value = value;
    valCell.font = { name: "Consolas", size: 11, bold: true, color: { argb: AMBER } };
    valCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_BG } };
    valCell.alignment = { wrapText: true, vertical: "middle" };
    valCell.border = {
      top: { style: "thin", color: { argb: "FFE2E8F0" } },
      bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
      left: { style: "thin", color: { argb: "FFE2E8F0" } },
      right: { style: "thin", color: { argb: "FFE2E8F0" } },
    };
    sheet2.getRow(row).height = 28;
  };

  // Titre de la section formule
  sheet2.mergeCells(`B${nextRow}:H${nextRow}`);
  const secTitle = sheet2.getCell(`B${nextRow}`);
  secTitle.value = "📋  Formule prête à coller";
  secTitle.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: SLATE_900 } };
  sheet2.getRow(nextRow).height = 22;
  nextRow++;

  // Utiliser la formule réécrite si disponible, sinon l'originale
  const displayFormula = zone1Formula || formulaRaw;

  if (displayFormula) {
    writeSection(nextRow, "Formule :", displayFormula);
    nextRow++;
  }

  // Note instructions
  sheet2.mergeCells(`B${nextRow}:H${nextRow}`);
  const instrCell = sheet2.getCell(`B${nextRow}`);
  instrCell.value = "👆  Copiez la formule ci-dessus et collez-la dans une cellule vide de votre classeur.";
  instrCell.font = { name: "Segoe UI", size: 9, italic: true, color: { argb: SLATE_500 } };
  sheet2.getRow(nextRow).height = 18;
  nextRow += 2;

  // ── SIMULATION INTERACTIVE (Zone 2)
  if (simParams.length > 0 && simFormulaRaw) {
    // ── Titre section simulation
    sheet2.mergeCells(`B${nextRow}:H${nextRow}`);
    const simTitle = sheet2.getCell(`B${nextRow}`);
    simTitle.value = "🧪  Simulez votre formule — Modifiez les valeurs en jaune";
    simTitle.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: SLATE_900 } };
    sheet2.getRow(nextRow).height = 22;
    nextRow++;

    // ── Headers du tableau de simulation
    const simHeaderRow = sheet2.getRow(nextRow);
    simHeaderRow.height = 24;

    // Colonne B : "Ligne"
    const labelHeader = simHeaderRow.getCell(2);
    labelHeader.value = "Ligne";
    labelHeader.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: WHITE } };
    labelHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
    labelHeader.alignment = { horizontal: "center", vertical: "middle" };
    labelHeader.border = {
      top: { style: "thin", color: { argb: "FF475569" } },
      bottom: { style: "medium", color: { argb: "FF1E293B" } },
      left: { style: "thin", color: { argb: "FF475569" } },
      right: { style: "thin", color: { argb: "FF475569" } },
    };

    // Colonnes de données : headers depuis simColumns
    for (let c = 0; c < simColumns.length; c++) {
      const cell = simHeaderRow.getCell(3 + c);
      cell.value = simColumns[c].header;
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
    nextRow++;

    // ── Lignes de données
    const GOLD_BORDER = "FFD97706";
    const LIGHT_YELLOW = "FFFEF3C7";

    // Nombre de lignes = max des params par colonne
    const numRows = Math.max(...simColumns.map(c => c.params.length), 0);

    for (let r = 0; r < numRows; r++) {
      const row = sheet2.getRow(nextRow);
      row.height = 22;

      // Colonne B : label "Ligne N"
      const labelCell = row.getCell(2);
      labelCell.value = `Ligne ${r + 1}`;
      labelCell.font = { name: "Segoe UI", size: 10, color: { argb: "FF475569" } };
      labelCell.alignment = { vertical: "middle" };

      // Colonnes de données
      for (let c = 0; c < simColumns.length; c++) {
        const col = simColumns[c];
        const param = col.params[r];
        const cell = row.getCell(3 + c);

        cell.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: SLATE_900 } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_YELLOW } };
        cell.alignment = { horizontal: "right", vertical: "middle" };
        cell.border = {
          top: { style: "thin", color: { argb: GOLD_BORDER } },
          bottom: { style: "thin", color: { argb: GOLD_BORDER } },
          left: { style: "thin", color: { argb: GOLD_BORDER } },
          right: { style: "thin", color: { argb: GOLD_BORDER } },
        };

        if (param) {
          if (param.type === "text") {
            cell.value = param.rawValue;
            cell.alignment = { horizontal: "left", vertical: "middle" };
          } else if (param.type === "date") {
            cell.value = param.rawValue;
            cell.alignment = { horizontal: "center", vertical: "middle" };
          } else if (param.type === "percentage") {
            cell.value = param.value;
            cell.numFmt = '0.0"%"';
          } else if (param.type === "currency") {
            cell.value = param.value;
            cell.numFmt = "#,##0.00";
          } else if (param.type === "integer") {
            cell.value = param.value;
            cell.numFmt = "0";
          } else {
            cell.value = param.value;
            cell.numFmt = "#,##0.##";
          }
        }
      }
      nextRow++;
    }

    // ── Ligne séparatrice
    const sepRow1 = sheet2.getRow(nextRow);
    sepRow1.height = 4;
    for (let c = 2; c <= 2 + simColumns.length; c++) {
      const cell = sepRow1.getCell(c);
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    }
    nextRow++;

    // ── Ligne Résultat (formule active)
    const resultRowSim = sheet2.getRow(nextRow);
    resultRowSim.height = 26;

    const resLabel = resultRowSim.getCell(2);
    resLabel.value = "→ Résultat";
    resLabel.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF166534" } };
    resLabel.alignment = { vertical: "middle" };

    // Formule réécrite (cellule verte active)
    let activeFormula = rewriteFormulaForSimulation(simFormulaRaw, simParams, simDataStartRow);
    activeFormula = convertToUsInvariant(activeFormula, format);
    activeFormula = postProcessFormula(activeFormula, "libreoffice-en");

    const resCell = resultRowSim.getCell(3);
    resCell.value = { formula: activeFormula.replace(/^=/, "") };
    resCell.font = { name: "Consolas", size: 12, bold: true, color: { argb: "FF166534" } };
    resCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } };
    const isTextFormula = /&\s*["']|["']\s*&|TEXTE\s*\(|TEXT\s*\(/i.test(activeFormula);
    resCell.numFmt = isTextFormula ? "@" : "#,##0.00";
    resCell.alignment = { horizontal: "right", vertical: "middle" };
    resCell.border = {
      top: { style: "medium", color: { argb: "FF16A34A" } },
      bottom: { style: "medium", color: { argb: "FF16A34A" } },
      left: { style: "medium", color: { argb: "FF16A34A" } },
      right: { style: "medium", color: { argb: "FF16A34A" } },
    };

    nextRow += 2;

    // ── Zone 3 : Instructions
    sheet2.mergeCells(`B${nextRow}:H${nextRow}`);
    const instrCellSim = sheet2.getCell(`B${nextRow}`);
    instrCellSim.value = "💡  Modifiez les valeurs jaunes pour tester d'autres scénarios. La formule verte se recalcule automatiquement.";
    instrCellSim.font = { name: "Segoe UI", size: 9, italic: true, color: { argb: SLATE_500 } };
    sheet2.getRow(nextRow).height = 18;
    nextRow++;

    sheet2.mergeCells(`B${nextRow}:H${nextRow}`);
    const instrCellSim2 = sheet2.getCell(`B${nextRow}`);
    instrCellSim2.value = "📋  Copiez la formule ci-dessus (Zone 1) pour l'utiliser dans votre classeur.";
    instrCellSim2.font = { name: "Segoe UI", size: 9, italic: true, color: { argb: SLATE_500 } };
    sheet2.getRow(nextRow).height = 18;
    nextRow += 2;
  } else {
    // Pas de tableau : juste un message clair et de l'espace vide
    sheet2.mergeCells(`B${nextRow}:H${nextRow}`);
    const noTableMsg = sheet2.getCell(`B${nextRow}`);
    noTableMsg.value = "ℹ️  Aucune donnée d'exemple détectée dans la réponse IA.";
    noTableMsg.font = { name: "Segoe UI", size: 10, italic: true, color: { argb: SLATE_500 } };
    sheet2.getRow(nextRow).height = 18;
    nextRow++;

    sheet2.mergeCells(`B${nextRow}:H${nextRow}`);
    const noTableHint = sheet2.getCell(`B${nextRow}`);
    noTableHint.value = "   Utilisez la formule ci-dessus (Zone 1) dans votre propre classeur.";
    noTableHint.font = { name: "Segoe UI", size: 9, color: { argb: SLATE_500 } };
    sheet2.getRow(nextRow).height = 18;
    nextRow += 2;
  }

  // Largeurs colonnes onglet 2
  sheet2.getColumn(1).width = 4;
  sheet2.getColumn(2).width = 22;
  for (let c = 3; c <= 8; c++) {
    sheet2.getColumn(c).width = 18;
  }

  // ─────────────────────────────────────────────────────────────
  // GÉNÉRATION + PATCH XML (ca="1" pour forcer recalcul)
  // ─────────────────────────────────────────────────────────────
  const rawBuffer = await workbook.xlsx.writeBuffer();
  const zip = await JSZip.loadAsync(rawBuffer);

  // Patch : ajouter ca="1" sur chaque <f> pour forcer LibreOffice à réinterpréter
  for (const filename of Object.keys(zip.files)) {
    if (filename.startsWith("xl/worksheets/sheet") && filename.endsWith(".xml")) {
      let xml = await zip.file(filename)!.async("string");
      // <f>content</f> → <f ca="1">content</f>
      xml = xml.replace(/<f>([^<]*)<\/f>/g, '<f ca="1">$1</f>');
      // <f t="shared" si="0"> → <f ca="1" t="shared" si="0"> (skip si ca existe déjà)
      xml = xml.replace(/<f ([^>]*?)>/g, (match, attrs: string) => {
        if (/\bca\s*=/.test(attrs)) return match; // déjà présent
        return `<f ca="1" ${attrs}>`;
      });
      zip.file(filename, xml);
    }
  }

  const patchedBuffer = await zip.generateAsync({ type: "nodebuffer" });
  const blob = new Blob([patchedBuffer as unknown as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;

  const sanitizedPrompt = prompt
    .toLowerCase()
    .replace(/[éèêë]/g, "e").replace(/[àâä]/g, "a").replace(/[îï]/g, "i").replace(/[ôö]/g, "o").replace(/[ùûü]/g, "u").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 35);
  a.download = `formule-${sanitizedPrompt || "excel"}-${Date.now()}.xlsx`;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
