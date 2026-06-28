export type ExportFormat = "excel-en" | "excel-fr" | "libreoffice-en" | "libreoffice-fr";

const FRENCH_TO_ENGLISH: Record<string, string> = {
  SI: "IF", SIERREUR: "IFERROR", "SI.NON.DISP": "IFNA", "SI.CONDITIONS": "IFS",
  ET: "AND", OU: "OR", NON: "NOT",
  SOMME: "SUM", "SOMME.SI": "SUMIF", "SOMME.SI.ENS": "SUMIFS",
  NB: "COUNT", "NB.SI": "COUNTIF", "NB.SI.ENS": "COUNTIFS", NBVAL: "COUNTA",
  MOYENNE: "AVERAGE", "MOYENNE.SI": "AVERAGEIF", "MOYENNE.SI.ENS": "AVERAGEIFS",
  MAX: "MAX", MIN: "MIN", SOMMEPROD: "SUMPRODUCT", PRODUIT: "PRODUCT",
  "MAX.SI": "MAXIFS", "MAX.SI.ENS": "MAXIFS",
  "MIN.SI": "MINIFS", "MIN.SI.ENS": "MINIFS",
  ARRONDI: "ROUND", "ARRONDI.SUP": "ROUNDUP", "ARRONDI.INF": "ROUNDDOWN",
  "ARRONDI.MATH": "MROUND",
  ENT: "INT", ABS: "ABS", MOD: "MOD",
  TEXTE: "TEXT", NBCAR: "LEN", GAUCHE: "LEFT", DROITE: "RIGHT",
  STXT: "MID", SUBSTITUE: "SUBSTITUTE", CONCAT: "CONCAT", LIER: "CONCATENATE",
  QUOTIENT: "QUOTIENT",
  RECHERCHEV: "VLOOKUP", RECHERCHEH: "HLOOKUP", RECHERCHEX: "XLOOKUP",
  RECHERCHE: "SEARCH", CHERCHE: "FIND",
  EQUIV: "MATCH", EQUIVX: "XMATCH", INDEX: "INDEX",
  DECALER: "OFFSET",
  VPM: "PMT", VAN: "NPV", TRI: "IRR", TAUX: "RATE", NPM: "NPER", VC: "FV", VA: "PV",
  AUJOURDHUI: "TODAY", MAINTENANT: "NOW", DATE: "DATE",
  ANNEE: "YEAR", MOIS: "MONTH", JOUR: "DAY",
  VAL: "VALUE",
};

export function postProcessFormula(formula: string, format: ExportFormat): string {
  let result = formula;
  if (format === "libreoffice-en") {
    result = convertXlookupToIndexMatch(result, "en");
  }
  if (format === "libreoffice-fr") {
    result = convertXlookupToIndexMatch(result, "fr");
  }

  // Inject _xlfn. for modern Excel functions so they work in LibreOffice & Excel when exported via ExcelJS
  const modernFns = ["MAXIFS", "MINIFS", "IFS", "IFNA", "CONCAT", "TEXTJOIN", "SWITCH", "XLOOKUP", "XMATCH"];
  for (const fn of modernFns) {
    const regex = new RegExp(`(?:_xlfn\\.)?(\\b${fn}\\b)(?=\\s*\\()`, "gi");
    result = result.replace(regex, "_xlfn.$1");
  }

  return result;
}

export function convertToUsInvariant(formula: string, format: ExportFormat): string {
  if (format === "excel-en" || format === "libreoffice-en") {
    return formula;
  }

  let result = formula;

  // 1. Traduire les noms de fonctions FR → EN
  const keys = Object.keys(FRENCH_TO_ENGLISH).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const escaped = key.replace(/\./g, "\\.");
    result = result.replace(new RegExp(`\\b${escaped}(?=\\s*\\()`, "gi"), FRENCH_TO_ENGLISH[key]);
  }

  // 2. Remplacer VRAI/FAUX → TRUE/FALSE (même sans parenthèse)
  result = result.replace(/\bVRAI\b/gi, "TRUE").replace(/\bFAUX\b/gi, "FALSE");

  // 3. Convertir séparateurs et décimaux
  let out = "";
  let inString = false;
  for (let i = 0; i < result.length; i++) {
    const c = result[i];
    if (c === '"') { inString = !inString; out += c; continue; }
    if (inString) { out += c; continue; }
    if (c === ";") { out += ","; continue; }
    if (c === ",") {
      const prev = result[i - 1];
      const next = result[i + 1];
      if (prev && /\d/.test(prev) && next && /[\d%]/.test(next)) {
        out += "."; continue;
      }
    }
    out += c;
  }

  return out;
}

// --- XLOOKUP → INDEX+MATCH (private) ---

interface XlookupCall {
  start: number;
  end: number;
  args: string[];
}

function convertXlookupToIndexMatch(formula: string, locale: "en" | "fr"): string {
  const lookupFn = locale === "en" ? "XLOOKUP" : "RECHERCHEX";
  const matchFn = locale === "en" ? "MATCH" : "EQUIV";
  const ifErrorFn = locale === "en" ? "IFERROR" : "SIERREUR";
  const sep = locale === "en" ? "," : ";";

  const calls = findFunctionCalls(formula, lookupFn, sep);
  if (calls.length === 0) return formula;

  let result = formula;
  for (const call of calls) {
    if (call.args.length < 3) continue;

    const lookupArg = call.args[0].trim();
    const arrayArg = call.args[1].trim();
    const returnArg = call.args[2].trim();
    const inner = `INDEX(${returnArg}${sep} ${matchFn}(${lookupArg}${sep} ${arrayArg}${sep} 0))`;

    let replacement: string;
    if (call.args.length >= 4 && call.args[3].trim() !== "" && call.args[3].trim() !== '""') {
      replacement = `${ifErrorFn}(${inner}${sep} ${call.args[3].trim()})`;
    } else {
      replacement = inner;
    }

    result = result.slice(0, call.start) + replacement + result.slice(call.end);
  }

  return result;
}

function findFunctionCalls(formula: string, fnName: string, sep: string): XlookupCall[] {
  const calls: XlookupCall[] = [];
  const searchStr = fnName + "(";
  let searchIdx = 0;

  while (true) {
    const fnStart = formula.indexOf(searchStr, searchIdx);
    if (fnStart === -1) break;

    const argsStart = fnStart + searchStr.length;
    let depth = 0;
    let inString = false;
    let argsEnd = argsStart;
    const args: string[] = [];
    let currentArg = "";

    for (let i = argsStart; i < formula.length; i++) {
      const c = formula[i];
      if (c === '"') { inString = !inString; currentArg += c; continue; }
      if (inString) { currentArg += c; continue; }

      if (c === '(') { depth++; currentArg += c; continue; }
      if (c === ')') {
        if (depth === 0) {
          argsEnd = i + 1;
          if (currentArg.trim()) args.push(currentArg.trim());
          break;
        }
        depth--;
        currentArg += c;
        continue;
      }

      if (depth === 0 && c === sep[0]) {
        args.push(currentArg.trim());
        currentArg = "";
        continue;
      }

      currentArg += c;
    }

    calls.push({ start: fnStart, end: argsEnd, args });
    searchIdx = argsEnd;
  }

  return calls;
}
