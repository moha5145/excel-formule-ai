import ExcelJS from "exceljs";

// Dictionnaire complet de traduction Français -> Anglais des fonctions Excel courantes
const FRENCH_TO_ENGLISH_FUNCTIONS: Record<string, string> = {
  // Logique
  "SI.CONDITIONS": "IFS",
  "SI.NON.DISP": "IFNA",
  "SIERREUR": "IFERROR",
  "SI": "IF",
  "ESTERREUR": "ISERROR",
  "ESTERR": "ISERR",
  "ESTNA": "ISNA",
  "ESTVIDE": "ISBLANK",
  "ESTNUM": "ISNUMBER",
  "ESTTEXTE": "ISTEXT",
  "ET": "AND",
  "OU": "OR",
  "NON": "NOT",

  // Math & Statistiques
  "SOMME.SI.ENS": "SUMIFS",
  "SOMME.SI": "SUMIF",
  "SOMME": "SUM",
  "NB.SI.ENS": "COUNTIFS",
  "NB.SI": "COUNTIF",
  "NB.VIDE": "COUNTBLANK",
  "NBVAL": "COUNTA",
  "NB": "COUNT",
  "MOYENNE.SI.ENS": "AVERAGEIFS",
  "MOYENNE.SI": "AVERAGEIF",
  "MOYENNE": "AVERAGE",
  "GRANDE.VALEUR": "LARGE",
  "PETITE.VALEUR": "SMALL",
  "ARRONDI.SUP": "ROUNDUP",
  "ARRONDI.INF": "ROUNDDOWN",
  "ARRONDI": "ROUND",
  "SOMMEPROD": "SUMPRODUCT",
  "PRODUIT": "PRODUCT",
  "MAX": "MAX",
  "MIN": "MIN",
  "RANG": "RANK",
  "ENT": "INT",
  "ABS": "ABS",
  "MOD": "MOD",

  // Recherche & Tableaux
  "RECHERCHEV": "VLOOKUP",
  "RECHERCHEH": "HLOOKUP",
  "RECHERCHEX": "XLOOKUP",
  "EQUIVX": "XMATCH",
  "EQUIV": "MATCH",
  "INDEX": "INDEX",
  "CHOISIR": "CHOOSE",
  "DECALER": "OFFSET",
  "INDIRECT": "INDIRECT",
  "COLONNE": "COLUMN",
  "LIGNE": "ROW",
  "TRANSPOSE": "TRANSPOSE",
  "TRIERPAR": "SORTBY",
  "TRIER": "SORT",
  "UNIQUE": "UNIQUE",
  "FILTRE": "FILTER",

  // Finance
  "VPM": "PMT",
  "AMORLIN": "SLN",
  "AMORDEG": "DB",
  "DDB": "DDB",
  "VAN": "NPV",
  "TRI": "IRR",
  "TAUX": "RATE",
  "NPM": "NPER",
  "VC": "FV",
  "VA": "PV",

  // Texte
  "CONCATENER": "CONCATENATE",
  "CONCAT": "CONCAT",
  "TEXTE": "TEXT",
  "GAUCHE": "LEFT",
  "DROITE": "RIGHT",
  "STXT": "MID",
  "NBCAR": "LEN",
  "TROUVER": "FIND",
  "CHERCHER": "SEARCH",
  "SUBSTITUER": "SUBSTITUTE",
  "REMPLACER": "REPLACE",
  "EPURAGE": "CLEAN",
  "SUPPRESPACE": "TRIM",
  "MINUSCULE": "LOWER",
  "MAJUSCULE": "UPPER",
  "NOMPROPRE": "PROPER",

  // Date & Heure
  "AUJOURDHUI": "TODAY",
  "MAINTENANT": "NOW",
  "FIN.MOIS": "EOMONTH",
  "NB.JOURS.OUVRES": "NETWORKDAYS",
  "NO.SEMAINE": "WEEKNUM",
  "JOURSEM": "WEEKDAY",
  "DATEDIF": "DATEDIF",
  "ANNEE": "YEAR",
  "MOIS": "MONTH",
  "JOUR": "DAY",
  "DATE": "DATE",
  "JOURS": "DAYS",
};

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

// Traduit les formules Excel du Français vers l'Anglais pour affichage (texte uniquement)
export function translateFrenchFormulaToEnglish(formula: string): string {
  let translated = formula.trim();

  // 1. Remplacer les noms de fonctions (les clés les plus longues d'abord pour éviter les conflits)
  const keys = Object.keys(FRENCH_TO_ENGLISH_FUNCTIONS).sort((a, b) => b.length - a.length);

  for (const key of keys) {
    // Échapper les points dans la clé pour la regex
    const escapedKey = key.replace(/\./g, "\\.");
    // Matcher le nom de fonction uniquement suivi d'une parenthèse ouvrante
    const regex = new RegExp(`\\b${escapedKey}(?=\\s*\\()`, "gi");
    translated = translated.replace(regex, FRENCH_TO_ENGLISH_FUNCTIONS[key]);
  }

  // 2. Remplacer les séparateurs d'arguments : ";" → ","
  // et les séparateurs décimaux : "," → "." uniquement hors chaînes de caractères
  let inString = false;
  let finalFormula = "";
  let i = 0;
  while (i < translated.length) {
    const char = translated[i];

    if (char === '"') {
      inString = !inString;
      finalFormula += char;
      i++;
      continue;
    }

    if (!inString) {
      if (char === ";") {
        finalFormula += ",";
      } else if (char === ",") {
        // Vérifier si c'est un séparateur décimal (chiffre avant ET chiffre/% après)
        const prev = translated[i - 1];
        const next = translated[i + 1];
        const isDecimalSeparator = prev && /\d/.test(prev) && next && /[\d%]/.test(next);
        if (isDecimalSeparator) {
          finalFormula += ".";
        } else {
          // C'est une virgule ordinaire (déjà un séparateur en anglais), conserver
          finalFormula += ",";
        }
      } else {
        finalFormula += char;
      }
    } else {
      finalFormula += char;
    }
    i++;
  }

  return finalFormula;
}

// Détecte le type d'un paramètre depuis son nom
function detectParamType(name: string): SimParam['type'] {
  const lower = name.toLowerCase();
  if (/%|taux|tx|inter[êe]t|interest|rendement/i.test(lower)) return 'percentage';
  if (/montant|€|euro|salaire|prime|pret|emprunt|loyer|chiffre|ca\b/i.test(lower)) return 'currency';
  if (/dur[ée]e|ann[ée]e(s)?|mois|jour(s)?|nb|nombre|p[ée]riode|term|fois/i.test(lower)) return 'integer';
  return 'number';
}

// Extrait les paramètres de simulation depuis un tableau Markdown
function extractSimulationParams(
  table: ExtractedTable
): { params: SimParam[]; formulaRaw: string } {
  const params: SimParam[] = [];
  let formulaRaw = "";

  for (const row of table.rows) {
    const cellRef = row[0]?.trim() || "";
    const description = row[1]?.trim() || "";
    const valueStr = row[2]?.trim() || "";
    const resultStr = row[3]?.trim() || "";

    // Si la colonne "Valeur" contient une formule → c'est la ligne de sortie
    if (valueStr.startsWith("=")) {
      formulaRaw = valueStr;
      continue;
    }

    // Nettoyer la valeur : retirer espaces, %, symboles monétaires
    const hasPercent = /%/.test(valueStr) || /%/.test(resultStr);
    const cleaned = valueStr
      .replace(/\s/g, "")
      .replace(/%/g, "")
      .replace(/€|euro/gi, "")
      .replace(",", ".");
    const numVal = Number(cleaned);
    if (isNaN(numVal) || valueStr === "") continue;

    const paramType = detectParamType(description);

    // Extraire l'unité depuis le résultat attendu OU la description
    // Ordre important : durée AVANT prêt car "Durée du Prêt" contient les deux
    let unit = "";
    if (/%|pourcent|taux/i.test(description)) unit = "%";
    else if (/dur[ée]e|ann[ée]e|ans|annuel/i.test(description)) unit = "ans";
    else if (/€|euro|montant|salaire|prime|loyer/i.test(description)) unit = "€";
    else if (/pr[êe]t|emprunt|chiffre/i.test(description)) unit = "€";
    else if (/mois/i.test(description)) unit = "mois";
    else if (/jour/i.test(description)) unit = "jours";

    // Pour les pourcentages : stocker la valeur pour affichage
    // Si l'IA génère 0.035 → afficher 3.5 (multiplier par 100)
    // Si l'IA génère 3.5 → afficher 3.5 (tel quel)
    let displayValue = numVal;
    let needsDivideBy100 = false;

    if (paramType === "percentage" || hasPercent) {
      // Stocker la valeur entière pour l'affichage (3.5 pour 3.5%, 20 pour 20%)
      // Le numFmt 0.0"%" affiche "3,5%" sans traiter la cellule comme un pourcentage
      // needsDivideBy100 = true TOUJOURS pour les pourcentages
      // La détection intelligente dans rewriteFormulaForSimulation décidera si
      // ajouter /100 ou non selon le contexte de la formule originale
      if (numVal > 0 && numVal < 1) {
        // L'IA a mis 0.035 → multiplier pour affichage
        displayValue = numVal * 100;
      } else {
        // L'IA a mis 3.5 → garder tel quel
        displayValue = numVal;
      }
      needsDivideBy100 = true;
      unit = "%";
    }

    params.push({
      name: description,
      value: displayValue,
      type: (paramType === "percentage" || hasPercent) ? "percentage" : paramType,
      unit,
      cellRef,
      needsDivideBy100,
    });
  }

  return { params, formulaRaw };
}

// Réécrit une formule pour la simulation : références → cellules Zone 2, taux/100, traduction
function rewriteFormulaForSimulation(
  formula: string,
  params: SimParam[],
  dataStartRow: number
): { en: string; fr: string } {
  const valueCol = "C";

  // Map : cellRef origine → cellule Zone 2
  const cellMap: Record<string, string> = {};
  for (let i = 0; i < params.length; i++) {
    cellMap[params[i].cellRef] = `${valueCol}${dataStartRow + i}`;
  }

  // Réécrire les références
  let rewritten = formula;
  for (const [origRef, targetRef] of Object.entries(cellMap)) {
    const escaped = origRef.replace(/\$/g, "\\$");
    const regex = new RegExp(`\\b${escaped}(?!\\w)`, "g");
    rewritten = rewritten.replace(regex, targetRef);
  }

  // Insérer /100 pour les taux — détection intelligente
  // Vérifie la formule ORIGINALE pour décider si /100 est nécessaire
  for (let i = 0; i < params.length; i++) {
    if (params[i].needsDivideBy100) {
      const origRef = params[i].cellRef;
      const targetCell = `${valueCol}${dataStartRow + i}`;
      const escapedOrig = origRef.replace(/\$/g, "\\$");

      // 1) La formule originale a-t-elle déjà /{cellRef}/100 ?
      const hasDivideBy100 = new RegExp(`${escapedOrig}/100`).test(formula);

      // 2) La cellule est-elle dans un contexte de comparaison (>=, <=, =, <, >) ?
      const hasComparison = new RegExp(`${escapedOrig}\\s*[<>=]`).test(formula);

      if (!hasDivideBy100 && !hasComparison) {
        // Ajouter /100 — ni déjà présent, ni en contexte de comparaison
        const rateRegex = new RegExp(`(${targetCell})(?!\\w|/100)`, "g");
        rewritten = rewritten.replace(rateRegex, "$1/100");
      }
    }
  }

  // Version EN : traduire fonctions + séparateurs
  const en = translateFrenchFormulaToEnglish(rewritten);

  // Version FR : garder noms FR, séparateurs ; (hors chaînes de caractères)
  let fr = "";
  let inStringFR = false;
  for (let k = 0; k < rewritten.length; k++) {
    const c = rewritten[k];
    if (c === '"') { inStringFR = !inStringFR; fr += c; continue; }
    if (!inStringFR && c === ",") { fr += ";"; } else { fr += c; }
  }

  return { en, fr };
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
  type: 'percentage' | 'currency' | 'integer' | 'number';
  unit: string;
  cellRef: string;
  needsDivideBy100: boolean;
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
  prompt: string
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Excel-Compta AI";
  workbook.created = new Date();
  workbook.modified = new Date();

  const formulaRaw = extractFormula(response);
  const tables = extractTables(response);
  const explanationLines = parseExplanationLines(response);
  // Version anglaise pour affichage (texte uniquement, pas de formule active)
  const formulaEnglish = formulaRaw ? translateFrenchFormulaToEnglish(formulaRaw) : "";

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

  // ── Formule version française (telle que générée)
  setLabel("A6", "Formule\n(version FR) :");
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

  // ── Formule version anglaise (à copier pour Excel anglais / Google Sheets)
  if (formulaEnglish && formulaEnglish !== formulaRaw) {
    setLabel("A7", "Formule\n(version EN) :");
    sheet1.getCell("A7").alignment = { wrapText: true, vertical: "top" };
    sheet1.mergeCells("B7:H7");
    const enCell = sheet1.getCell("B7");
    enCell.value = formulaEnglish;
    enCell.font = { name: "Consolas", size: 11, bold: true, color: { argb: "FF16803C" } }; // Vert
    enCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } }; // Green 50
    enCell.alignment = { wrapText: true, vertical: "middle" };
    enCell.border = {
      top: { style: "thin", color: { argb: "FFD1FAE5" } },
      bottom: { style: "thin", color: { argb: "FFD1FAE5" } },
      left: { style: "thin", color: { argb: "FFD1FAE5" } },
      right: { style: "thin", color: { argb: "FFD1FAE5" } },
    };
    sheet1.getRow(7).height = 30;

    // Note sous la formule anglaise
    sheet1.mergeCells("B8:H8");
    const noteCell = sheet1.getCell("B8");
    noteCell.value = "ℹ️  Version anglaise : à utiliser si votre Excel est en anglais ou pour Google Sheets. Collez-la dans une cellule vide.";
    noteCell.font = { name: "Segoe UI", size: 9, italic: true, color: { argb: SLATE_500 } };
    noteCell.alignment = { wrapText: true };
    sheet1.getRow(8).height = 18;
  }

  // ── Séparateur avant les explications
  const sepRow = formulaEnglish && formulaEnglish !== formulaRaw ? 10 : 9;
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

  // ── Calcul du dataStartRow AVANT tout affichage (pour Zone 1 et Zone 2)
  // Layout: row4=title, row5=FR(+1), row6=EN(+1), row7=instructions(+2), row9=simtitle(+1), row10=headers(+1) → dataStartRow=11
  const hasEN = formulaEnglish && formulaEnglish !== formulaRaw;
  const simDataStartRow = 4 + 1 + 1 + (hasEN ? 1 : 0) + 2 + 1 + 1; // = 12 ou 11

  // ── Pré-extraction des paramètres de simulation (pour Zone 1 et Zone 2)
  let simParams: SimParam[] = [];
  let simFormulaRaw = formulaRaw;
  let zone1FormulaFR = "";
  let zone1FormulaEN = "";

  if (tables.length > 0) {
    const { params, formulaRaw: extracted } = extractSimulationParams(tables[0]);
    simParams = params;
    simFormulaRaw = extracted || formulaRaw;

    if (simParams.length > 0 && simFormulaRaw) {
      const rewritten = rewriteFormulaForSimulation(simFormulaRaw, simParams, simDataStartRow);
      zone1FormulaFR = rewritten.fr;
      zone1FormulaEN = rewritten.en;
    }
  }

  // ── Section formules à copier-coller (point principal de valeur)
  const writeSection = (row: number, label: string, value: string, color: string, bgColor: string) => {
    const labelCell = sheet2.getCell(`B${row}`);
    labelCell.value = label;
    labelCell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: SLATE_500 } };

    sheet2.mergeCells(`C${row}:H${row}`);
    const valCell = sheet2.getCell(`C${row}`);
    valCell.value = value;
    valCell.font = { name: "Consolas", size: 11, bold: true, color: { argb: color } };
    valCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
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

  // Utiliser les formules réécrites (Zone 2) si disponibles, sinon les originales
  const displayFormulaFR = zone1FormulaFR || formulaRaw;
  const displayFormulaEN = zone1FormulaEN || formulaEnglish;

  if (displayFormulaFR) {
    writeSection(nextRow, "Version FR :", displayFormulaFR, AMBER, LIGHT_BG);
    nextRow++;
  }

  if (displayFormulaEN && displayFormulaEN !== displayFormulaFR) {
    writeSection(nextRow, "Version EN :", displayFormulaEN, "FF16803C", "FFF0FDF4");
    nextRow++;
  }

  // Note instructions
  sheet2.mergeCells(`B${nextRow}:H${nextRow}`);
  const instrCell = sheet2.getCell(`B${nextRow}`);
  instrCell.value = "👆  Copiez la formule ci-dessus et collez-la dans une cellule vide de votre classeur Excel.";
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
    const simHeaders = ["Paramètre", "Valeur", "Description"];
    for (let h = 0; h < simHeaders.length; h++) {
      const cell = simHeaderRow.getCell(h + 2);
      cell.value = simHeaders[h];
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

    // ── Lignes de paramètres (cellules d'entrée)
    const GOLD_BORDER = "FFD97706";
    const LIGHT_YELLOW = "FFFEF3C7";

    for (let i = 0; i < simParams.length; i++) {
      const p = simParams[i];
      const row = sheet2.getRow(nextRow);
      row.height = 22;

      // Colonne B : Nom du paramètre
      const nameCell = row.getCell(2);
      nameCell.value = p.name;
      nameCell.font = { name: "Segoe UI", size: 10, color: { argb: "FF475569" } };
      nameCell.alignment = { vertical: "middle" };

      // Colonne C : Valeur (cellule modifiable, fond jaune)
      const valCell = row.getCell(3);
      valCell.value = p.value;
      valCell.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: SLATE_900 } };
      valCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_YELLOW } };
      valCell.alignment = { horizontal: "right", vertical: "middle" };
      valCell.border = {
        top: { style: "thin", color: { argb: GOLD_BORDER } },
        bottom: { style: "thin", color: { argb: GOLD_BORDER } },
        left: { style: "thin", color: { argb: GOLD_BORDER } },
        right: { style: "thin", color: { argb: GOLD_BORDER } },
      };

      // Format selon le type
      if (p.type === "percentage") {
        valCell.numFmt = '0.0"%"';
      } else if (p.type === "currency") {
        valCell.numFmt = "#,##0.00";
      } else if (p.type === "integer") {
        valCell.numFmt = "0";
      } else {
        valCell.numFmt = "#,##0.##";
      }

      // Colonne D : Description/Unité
      const descCell = row.getCell(4);
      descCell.value = p.unit || "";
      descCell.font = { name: "Segoe UI", size: 9, italic: true, color: { argb: "FF64748B" } };
      descCell.alignment = { vertical: "middle" };

      nextRow++;
    }

    // ── Ligne séparatrice
    const sepRow = sheet2.getRow(nextRow);
    sepRow.height = 4;
    for (let c = 2; c <= 4; c++) {
      const cell = sepRow.getCell(c);
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    }
    nextRow++;

    // ── Ligne Résultat (formule active)
    const resultRowSim = sheet2.getRow(nextRow);
    resultRowSim.height = 26;

    // Label résultat
    const resLabel = resultRowSim.getCell(2);
    resLabel.value = "→ Résultat";
    resLabel.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF166534" } };
    resLabel.alignment = { vertical: "middle" };

    // Formule réécrite (cellule verte active)
    const { fr: formulaFR } = rewriteFormulaForSimulation(
      simFormulaRaw, simParams, simDataStartRow
    );

    const resCell = resultRowSim.getCell(3);
    resCell.value = { formula: formulaFR };
    resCell.font = { name: "Consolas", size: 12, bold: true, color: { argb: "FF166534" } };
    resCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } };
    resCell.numFmt = "#,##0.00";
    resCell.alignment = { horizontal: "right", vertical: "middle" };
    resCell.border = {
      top: { style: "medium", color: { argb: "FF16A34A" } },
      bottom: { style: "medium", color: { argb: "FF16A34A" } },
      left: { style: "medium", color: { argb: "FF16A34A" } },
      right: { style: "medium", color: { argb: "FF16A34A" } },
    };

    // Unité résultat
    const resUnit = resultRowSim.getCell(4);
    const lastParam = simParams[simParams.length - 1];
    resUnit.value = lastParam?.unit ? `/${lastParam.unit}` : "";
    resUnit.font = { name: "Segoe UI", size: 9, italic: true, color: { argb: "FF166534" } };
    resUnit.alignment = { vertical: "middle" };

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
  // GÉNÉRATION ET TÉLÉCHARGEMENT
  // ─────────────────────────────────────────────────────────────
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
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
