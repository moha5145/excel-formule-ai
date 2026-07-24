import ExcelJS from "exceljs";
import JSZip from "jszip";
import { type ExportFormat, postProcessFormula, convertToUsInvariant } from "./excelExport/postProcessFormula";
import { isComplexResponse, extractTableSchema, validateSchema, SchemaValidationError } from "./excelExport/schemaParser";
import { buildComplexWorkbook } from "./excelExport/complexExcelBuilder";
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
): { params: SimParam[]; columns: SimColumn[]; formulaRaw: string; resultLabel: string } {
  const params: SimParam[] = [];
  const columns: SimColumn[] = [];
  const formulaRaw = "";
  const resultLabel = "Résultat";

  // La 1ʳᵉ colonne est "Ligne" (normalisée par extractTables) — on l'exclut
  const headers = table.headers.slice(1);

  for (let c = 0; c < headers.length; c++) {
    const colLetter = String.fromCharCode(67 + c); // C=67, D=68, E=69
    columns.push({ letter: colLetter, header: headers[c], params: [] });
  }

  const dataStartRow = 10;

  for (let rowIdx = 0; rowIdx < table.rows.length; rowIdx++) {
    const row = table.rows[rowIdx];

    for (let colIdx = 0; colIdx < headers.length; colIdx++) {
      const value = row[colIdx + 1]?.trim() || "";
      if (!value) continue;

      const col = columns[colIdx];
      const cellRef = `${col.letter}${dataStartRow + rowIdx}`;

      const isResultCol = colIdx === headers.length - 1;

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
      let dateValue: Date | undefined;
      let unit = "";

      if (isText) {
        paramType = 'text';
        rawValue = value;
        paramValue = 0;
      } else if (isDate) {
        paramType = 'date';
        rawValue = value;
        paramValue = 0;
        let m = value.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
        if (m) dateValue = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
        else {
          m = value.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
          if (m) dateValue = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
        }
      } else if (hasPercent || (numVal > 0 && numVal < 1 && /\d/.test(value))) {
        paramType = 'percentage';
        rawValue = value;
        paramValue = hasPercent ? numVal / 100 : numVal;
        unit = "%";
      } else {
        paramType = detectParamType(col.header);
        rawValue = value;
        paramValue = numVal;

        if (/%|taux|tx/i.test(col.header)) { unit = "%"; paramType = 'percentage'; paramValue = numVal > 0 && numVal < 1 ? numVal : numVal / 100; }
        else if (/€|euro|montant|salaire|prime|loyer/i.test(col.header)) unit = "€";
        else if (/dur[ée]e|ann[ée]e|ans|annuel/i.test(col.header)) unit = "ans";
        else if (/mois/i.test(col.header)) unit = "mois";
        else if (/jour/i.test(col.header)) unit = "jours";
      }

      const param: SimParam = {
        name: value,
        value: paramValue,
        rawValue,
        dateValue,
        type: isResultCol ? 'number' : paramType,
        unit: isResultCol ? "" : unit,
        cellRef,
        colLetter: col.letter,
        colName: col.header,
        rowIndex: rowIdx,
        isResult: isResultCol,
      };

      params.push(param);
      col.params.push(param);
    }
  }

  return { params, columns, formulaRaw, resultLabel };
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

// Extrait la formule anglaise cachée dans le commentaire HTML <!-- FORMULA_EN: ... -->
export function extractEnglishFormula(markdown: string): string {
  const match = markdown.match(/<!--\s*FORMULA_EN:\s*(=.+?)\s*-->/);
  return match ? match[1].trim() : "";
}

interface ExtractedTable {
  headers: string[];
  rows: string[][];
}

interface SimParam {
  name: string;
  value: number;
  rawValue: string;
  dateValue?: Date;
  type: 'percentage' | 'currency' | 'integer' | 'number' | 'text' | 'date';
  unit: string;
  cellRef: string;
  colLetter: string;
  colName: string;
  rowIndex: number;
  isResult?: boolean;
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

  // Normalisation : s'assurer que la 1ère colonne est "Ligne"
  for (const t of tables) {
    if (!/^ligne$/i.test(t.headers[0]?.trim())) {
      t.headers.unshift("Ligne");
      for (let r = 0; r < t.rows.length; r++) {
        t.rows[r].unshift(`Ligne ${r + 1}`);
      }
    }
  }

  return tables;
}

// Ajoute la colonne "Ligne" aux tableaux Markdown d'une réponse (pour affichage)
export function normalizeTablesInResponse(response: string): string {
  const lines = response.split("\n");
  const out: string[] = [];
  let inTable = false;
  let inCodeBlock = false;
  let hasLigne = false;
  let buffer: string[] = [];

  const isSepLine = (l: string) => {
    const c = l.split("|").filter((_, i, a) => i > 0 && i < a.length - 1);
    return c.length > 0 && c.every(x => /^\s*:?-+:?\s*$/.test(x.trim()));
  };

  const flushTable = () => {
    if (buffer.length === 0) return;
    if (!hasLigne) {
      const headerCells = buffer[0].split("|");
      if (headerCells.length >= 3) {
        headerCells.splice(1, 0, " Ligne ");
        buffer[0] = headerCells.join("|");
      }
      let dataIdx = 0;
      for (let i = 1; i < buffer.length; i++) {
        if (isSepLine(buffer[i])) {
          // Insérer " Ligne " dans le séparateur aussi pour garder le nb de colonnes
          const cells = buffer[i].split("|");
          if (cells.length >= 3) {
            cells.splice(1, 0, " :--- ");
            buffer[i] = cells.join("|");
          }
          continue;
        }
        dataIdx++;
        const cells = buffer[i].split("|");
        if (cells.length >= 3) {
          cells.splice(1, 0, ` Ligne ${dataIdx} `);
          buffer[i] = cells.join("|");
        }
      }
    }
    out.push(...buffer);
    buffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith("```")) { inCodeBlock = !inCodeBlock; out.push(rawLine); continue; }
    if (inCodeBlock) { out.push(rawLine); continue; }

    const isTableRow = line.startsWith("|") && line.endsWith("|");
    if (isTableRow) {
      const cellsForSep = line.split("|").filter((_, i, a) => i > 0 && i < a.length - 1);
      const isSep = cellsForSep.length > 0 && cellsForSep.every(c => /^\s*:?-+:?\s*$/.test(c.trim()));
      if (isSep) { buffer.push(rawLine); continue; }

      const cells = line.split("|").filter((_, i, a) => i > 0 && i < a.length - 1);
      if (!inTable) {
        flushTable();
        inTable = true;
        hasLigne = /^ligne$/i.test(cells[0]?.trim());
        buffer = [rawLine];
      } else {
        buffer.push(rawLine);
      }
    } else {
      if (inTable) { inTable = false; flushTable(); }
      out.push(rawLine);
    }
  }
  if (inTable) flushTable();
  return out.join("\n");
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
  format: ExportFormat = "libreoffice-fr",
  mode?: "formula_only" | "simple_table" | "complex_table"
): Promise<void> {
  // Only explicit complex mode (or auto-overridden to complex) may use the TABLE_SCHEMA path.
  // simple_table/formula_only skip it entirely — even if the LLM leaked a malformed schema comment,
  // we fall back to the plain path so users never see "Schema de tableau complexe invalide".
  if (mode === "complex_table" && isComplexResponse(response)) {
    const rawSchema = extractTableSchema(response);
    if (rawSchema === null) {
      console.warn("TABLE_SCHEMA détecté mais JSON illisible, fallback mode simple");
    } else {
      try {
        const schema = validateSchema(rawSchema);
        const workbook = new ExcelJS.Workbook();
        const { workbook: built, warnings } = buildComplexWorkbook(workbook, schema, response, prompt, format);
        if (warnings.length > 0) {
          console.warn("Complex export warnings:", warnings);
        }
        const blob = await patchWorkbookForceCalc(built);
        triggerFileDownload(blob, prompt);
        return;
      } catch (e) {
        if (e instanceof SchemaValidationError) {
          console.error("Schema validation failed:", e.issues);
          throw new Error(
            "Schéma de tableau complexe invalide. Erreurs : " +
            e.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
          );
        }
        throw e;
      }
    }
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Excel-Formule AI";
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
  t1.value = "EXCEL-FORMULE AI — EXEMPLE DE FORMULE";
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
  demCell.font = { name: "Segoe UI", size: 12, italic: false, bold: true, color: { argb: SLATE_900 } };
  demCell.alignment = { wrapText: true, vertical: "top" };
  sheet1.getRow(4).height = 30;

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

  // ── Sous-titre : description de la demande
  sheet2.mergeCells("A3:H3");
  const sub = sheet2.getCell("A3");
  sub.value = prompt;
  sub.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: SLATE_900 } };
  sub.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  sheet2.getRow(3).height = 28;

  // ── Pré-extraction des paramètres de simulation
  let simParams: SimParam[] = [];
  let simColumns: SimColumn[] = [];
  let simFormulaRaw = formulaRaw;
  let hasTable = false;

  if (tables.length > 0) {
    const { params, columns, formulaRaw: extracted } = extractSimulationParams(tables[0]);
    simParams = params;
    simColumns = columns;
    simFormulaRaw = extracted || formulaRaw;
    hasTable = simParams.length > 0 && !!simFormulaRaw;
  }

  // ── Formule active
  const DATA_START_ROW = mode === "complex_table" ? 10 : 5;
  let activeFormula = "";
  const englishFormula = extractEnglishFormula(response);
  if (englishFormula) {
    activeFormula = postProcessFormula(englishFormula, format);
  } else if (simFormulaRaw) {
    activeFormula = convertToUsInvariant(simFormulaRaw, format);
    activeFormula = postProcessFormula(activeFormula, format);
  }

  // ── Inline <!-- PARAM ref = value --> dans la formule
  const paramRefs: { ref: string; value: number }[] = [];
  const paramRegex = /<!--\s*PARAM\s+(\$?[A-Z]+\$?\d+)\s*=\s*([\d.,]+)\s*-->/g;
  let pm;
  while ((pm = paramRegex.exec(response)) !== null) {
    const ref = pm[1].replace(/\$/g, "");
    const val = parseFloat(pm[2].replace(/,/g, "."));
    if (!isNaN(val)) paramRefs.push({ ref, value: val });
  }
  if (activeFormula) {
    for (const pr of paramRefs) {
      const m = pr.ref.match(/^([A-Z]+)(\d+)$/);
      if (!m) continue;
      const col = m[1];
      const row = m[2];
      const patterns = [
        `$${col}$${row}`,       // $C$5  (most specific first)
        `$${col}${row}`,        // $C5
        `${col}$${row}`,        // C$5
        `${col}${row}`,         // C5
      ];
      for (const p of patterns) {
        const escaped = p.replace(/\$/g, '\\$');
        activeFormula = activeFormula.replace(
          new RegExp(`(?<![A-Z])${escaped}(?![\\d.])`, 'g'),
          String(pr.value)
        );
      }
    }
  }

  // ── Tableau en premier, formule + explication en dessous
  let nextRow = 4;

  if (hasTable) {
    // ── Headers du tableau
    const simHeaderRow = sheet2.getRow(nextRow);
    simHeaderRow.height = 24;

    const headerCell = (colIdx: number) => {
      const cell = simHeaderRow.getCell(colIdx);
      cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: WHITE } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = {
        top: { style: "thin", color: { argb: "FF475569" } },
        bottom: { style: "medium", color: { argb: "FF1E293B" } },
        left: { style: "thin", color: { argb: "FF475569" } },
        right: { style: "thin", color: { argb: "FF475569" } },
      };
      return cell;
    };

    headerCell(2).value = "Ligne";

    for (let c = 0; c < simColumns.length; c++) {
      headerCell(3 + c).value = simColumns[c].header;
    }
    nextRow++;

    // ── Lignes de données
    const GOLD_BORDER = "FFD97706";
    const LIGHT_YELLOW = "FFFEF3C7";
    const numRows = Math.max(...simColumns.map(c => c.params.length), 0);
    const isComplex = mode === "complex_table";

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
        const isResult = param?.isResult;

        if (isResult) {
          cell.font = { name: "Segoe UI", size: 11, color: { argb: "FF166534" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } };
          cell.border = {
            top: { style: "thin", color: { argb: "FF16A34A" } },
            bottom: { style: "thin", color: { argb: "FF16A34A" } },
            left: { style: "thin", color: { argb: "FF16A34A" } },
            right: { style: "thin", color: { argb: "FF16A34A" } },
          };
        } else {
          cell.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: SLATE_900 } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_YELLOW } };
          cell.border = {
            top: { style: "thin", color: { argb: GOLD_BORDER } },
            bottom: { style: "thin", color: { argb: GOLD_BORDER } },
            left: { style: "thin", color: { argb: GOLD_BORDER } },
            right: { style: "thin", color: { argb: GOLD_BORDER } },
          };
        }
        cell.alignment = { horizontal: "right", vertical: "middle" };

        if (param) {
          if (isResult && activeFormula) {
            let rowFormula = activeFormula;
            if (isComplex) {
              const cellRefRegex = new RegExp(`(?<!:)(\\b[A-Z]{1,3})${DATA_START_ROW}\\b(?![:(])`, 'g');
              rowFormula = rowFormula.replace(cellRefRegex, (_m, col) => `${col}${DATA_START_ROW + r}`);
            } else {
              const rowRefs = [...new Set(
                (rowFormula.match(/[A-Z]{1,3}(\d+)/g) || [])
                  .map(ref => parseInt(ref.match(/\d+/)?.[0] || "0", 10))
                  .filter(n => n > 0)
              )].sort((a, b) => a - b);
              const minRow = rowRefs.length > 0 ? rowRefs[0] : DATA_START_ROW;
              if (minRow !== DATA_START_ROW) {
                const delta = DATA_START_ROW - minRow;
                rowFormula = rowFormula.replace(/(\$?)([A-Z]{1,3})(\$?)(\d+)/g, (_m, cd, col, rd, rowStr) => {
                  return rd === "$" ? _m : `${cd}${col}${rd}${parseInt(rowStr, 10) + delta}`;
                });
              }
              const cellRefRegex = new RegExp(`(?<!:)(\\b[A-Z]{1,3})${DATA_START_ROW}\\b(?![:(])`, 'g');
              rowFormula = rowFormula.replace(cellRefRegex, (_m, col) => `${col}${DATA_START_ROW + r}`);
            }
            cell.value = { formula: rowFormula.replace(/^=/, "") };
            cell.numFmt = "#,##0.00";
          } else if (param.type === "text") {
            cell.value = param.rawValue;
            cell.alignment = { horizontal: "left", vertical: "middle" };
          } else if (param.type === "date") {
            if (param.dateValue) {
              cell.value = param.dateValue;
              cell.numFmt = "dd/mm/yyyy";
            } else {
              cell.value = param.rawValue;
            }
            cell.alignment = { horizontal: "center", vertical: "middle" };
          } else if (param.type === "percentage") {
            cell.value = param.value;
            cell.numFmt = '0.00%';
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

    // ── Formule + instructions en dessous du tableau
    nextRow++;

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

    sheet2.mergeCells(`B${nextRow}:H${nextRow}`);
    const secTitle = sheet2.getCell(`B${nextRow}`);
    secTitle.value = isComplex
      ? "🧪  Modifiez les valeurs jaunes, les résultats (colonne verte) se recalculent automatiquement."
      : "📋  Formule à copier-coller dans votre classeur";
    secTitle.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: SLATE_900 } };
    sheet2.getRow(nextRow).height = 22;
    nextRow++;

    const displayFormula = formulaRaw || simFormulaRaw;
    if (displayFormula) {
      writeSection(nextRow, "Formule :", displayFormula);
      nextRow++;
    }

    sheet2.mergeCells(`B${nextRow}:H${nextRow}`);
    const instrCell = sheet2.getCell(`B${nextRow}`);
    instrCell.value = isComplex
      ? "Copiez la formule pour l'utiliser dans votre classeur."
      : "Copiez la formule ci-dessus et collez-la dans une cellule vide. Adaptez les références si nécessaire.";
    instrCell.font = { name: "Segoe UI", size: 9, italic: true, color: { argb: SLATE_500 } };
    sheet2.getRow(nextRow).height = 18;
    nextRow += 2;
  } else {
    // Pas de tableau : message + formule
    nextRow += 2;
    if (formulaRaw) {
      sheet2.mergeCells(`B${nextRow}:H${nextRow}`);
      const noTableExplain = sheet2.getCell(`B${nextRow}`);
      noTableExplain.value = "ℹ️  Aucun tableau d'exemple dans la réponse. La formule est disponible dans l'onglet \"Formule & Guide\".";
      noTableExplain.font = { name: "Segoe UI", size: 10, italic: true, color: { argb: SLATE_500 } };
      sheet2.getRow(nextRow).height = 18;
      nextRow += 2;
    }
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
  const blob = await patchWorkbookForceCalc(workbook);
  triggerFileDownload(blob, prompt);
}

export async function patchWorkbookForceCalc(workbook: ExcelJS.Workbook): Promise<Blob> {
  const rawBuffer = await workbook.xlsx.writeBuffer();
  const zip = await JSZip.loadAsync(rawBuffer);

  for (const filename of Object.keys(zip.files)) {
    if (filename.startsWith("xl/worksheets/sheet") && filename.endsWith(".xml")) {
      let xml = await zip.file(filename)!.async("string");
      xml = xml.replace(/<f>([^<]*)<\/f>/g, '<f ca="1">$1</f>');
      xml = xml.replace(/<f ([^>]*?)>/g, (match, attrs: string) => {
        if (/\bca\s*=/.test(attrs)) return match;
        return `<f ca="1" ${attrs}>`;
      });
      zip.file(filename, xml);
    }
  }

  const patchedBuffer = await zip.generateAsync({ type: "nodebuffer" });
  return new Blob([patchedBuffer as unknown as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function triggerFileDownload(blob: Blob, prompt: string): void {
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
