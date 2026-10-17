export interface EvaluationContext {
  row?: number;
  cells?: Record<string, number | string | boolean | null | undefined>;
}

// Token types pour l'analyseur lexical
type TokenType = "NUMBER" | "STRING" | "IDENT" | "OP" | "COMMA" | "COLON" | "LPAREN" | "RPAREN";

interface Token {
  type: TokenType;
  value: string;
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = expr.trim().replace(/^=+/, "");

  while (i < s.length) {
    const ch = s[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(s[i + 1] || ""))) {
      let numStr = "";
      while (i < s.length && (/[0-9.]/.test(s[i]) || s[i] === " ")) {
        if (s[i] !== " ") numStr += s[i];
        i++;
      }
      if (i < s.length && s[i] === "%") {
        tokens.push({ type: "NUMBER", value: String(parseFloat(numStr) / 100) });
        i++;
      } else {
        tokens.push({ type: "NUMBER", value: numStr });
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      let str = "";
      while (i < s.length && s[i] !== quote) {
        str += s[i];
        i++;
      }
      i++;
      tokens.push({ type: "STRING", value: str });
      continue;
    }

    if (/[a-zA-Z_$]/.test(ch) || ch === "{") {
      let ident = "";
      while (i < s.length && /[a-zA-Z0-9_${}]/.test(s[i])) {
        ident += s[i];
        i++;
      }
      tokens.push({ type: "IDENT", value: ident });
      continue;
    }

    if (ch === "(") {
      tokens.push({ type: "LPAREN", value: "(" });
      i++;
      continue;
    }

    if (ch === ")") {
      tokens.push({ type: "RPAREN", value: ")" });
      i++;
      continue;
    }

    if (ch === ":" && s[i + 1] !== "=") {
      tokens.push({ type: "COLON", value: ":" });
      i++;
      continue;
    }

    if (ch === "," || ch === ";") {
      tokens.push({ type: "COMMA", value: "," });
      i++;
      continue;
    }

    const twoCharOps = ["<=", ">=", "<>", "!=", "=="];
    const matchedTwo = twoCharOps.find((op) => s.startsWith(op, i));
    if (matchedTwo) {
      tokens.push({ type: "OP", value: matchedTwo });
      i += matchedTwo.length;
      continue;
    }

    if (["<", ">", "+", "-", "*", "/", "^"].includes(ch)) {
      tokens.push({ type: "OP", value: ch });
      i++;
      continue;
    }

    if (ch === "=") {
      tokens.push({ type: "OP", value: "==" });
      i++;
      continue;
    }

    i++;
  }

  return tokens;
}

// Convertit lettre Excel en index (A -> 1, C -> 3)
function colLetterToIndex(col: string): number {
  let res = 0;
  for (let k = 0; k < col.length; k++) {
    res = res * 26 + (col.charCodeAt(k) - 64);
  }
  return res;
}

// Convertit index en lettre (1 -> A, 3 -> C)
function indexToColLetter(idx: number): string {
  let letter = "";
  let n = idx;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter || "A";
}

class Parser {
  private tokens: Token[];
  private pos = 0;
  private context: EvaluationContext;

  constructor(tokens: Token[], context: EvaluationContext) {
    this.tokens = tokens;
    this.context = context;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    return this.tokens[this.pos++];
  }

  public parse(): any {
    if (this.tokens.length === 0) return 0;
    const res = this.parseExpression();
    return res;
  }

  private parseExpression(): any {
    return this.parseComparison();
  }

  private parseComparison(): any {
    let left = this.parseAdditive();

    while (this.peek() && ["<", ">", "<=", ">=", "==", "!=", "<>"].includes(this.peek()!.value)) {
      const op = this.consume().value;
      const right = this.parseAdditive();

      if (typeof left === "string" && left.startsWith("#")) return left;
      if (typeof right === "string" && right.startsWith("#")) return right;

      if (op === "<") left = left < right;
      else if (op === ">") left = left > right;
      else if (op === "<=") left = left <= right;
      else if (op === ">=") left = left >= right;
      else if (op === "==") left = left == right;
      else if (op === "!=" || op === "<>") left = left != right;
    }

    return left;
  }

  private parseAdditive(): any {
    let left = this.parseMultiplicative();

    while (this.peek() && (this.peek()!.value === "+" || this.peek()!.value === "-")) {
      const op = this.consume().value;
      const right = this.parseMultiplicative();

      // Propagation des erreurs Excel (ne jamais concaténer d'erreurs en string)
      if (typeof left === "string" && left.startsWith("#")) return left;
      if (typeof right === "string" && right.startsWith("#")) return right;

      if (op === "+") {
        left = typeof left === "string" || typeof right === "string"
          ? String(left) + String(right)
          : Number(left) + Number(right);
      } else {
        left = Number(left) - Number(right);
      }
    }

    return left;
  }

  private parseMultiplicative(): any {
    let left = this.parseUnary();

    while (this.peek() && (this.peek()!.value === "*" || this.peek()!.value === "/")) {
      const op = this.consume().value;
      const right = this.parseUnary();

      // Propagation des erreurs
      if (typeof left === "string" && left.startsWith("#")) return left;
      if (typeof right === "string" && right.startsWith("#")) return right;

      if (op === "*") {
        left = Number(left) * Number(right);
      } else {
        if (Number(right) === 0) throw new Error("#DIV/0!");
        left = Number(left) / Number(right);
      }
    }

    return left;
  }

  private parseUnary(): any {
    if (this.peek() && (this.peek()!.value === "+" || this.peek()!.value === "-")) {
      const op = this.consume().value;
      const val = this.parseUnary();
      if (typeof val === "string" && val.startsWith("#")) return val;
      return op === "-" ? -Number(val) : Number(val);
    }
    return this.parsePrimary();
  }

  private parsePrimary(): any {
    const token = this.peek();
    if (!token) return 0;

    if (token.type === "NUMBER") {
      this.consume();
      return parseFloat(token.value);
    }

    if (token.type === "STRING") {
      this.consume();
      return token.value;
    }

    if (token.type === "LPAREN") {
      this.consume();
      const val = this.parseExpression();
      if (this.peek() && this.peek()!.type === "RPAREN") {
        this.consume();
      }
      return val;
    }

    if (token.type === "IDENT") {
      this.consume();
      const name = token.value;

      // Est-ce un appel de fonction ?
      if (this.peek() && this.peek()!.type === "LPAREN") {
        this.consume();
        const args: any[] = [];
        if (this.peek() && this.peek()!.type !== "RPAREN") {
          args.push(...this.parseArgument());
          while (this.peek() && this.peek()!.type === "COMMA") {
            this.consume();
            args.push(...this.parseArgument());
          }
        }
        if (this.peek() && this.peek()!.type === "RPAREN") {
          this.consume();
        }
        return this.evaluateFunction(name.toUpperCase(), args);
      }

      // Est-ce une plage de cellules (ex: C1:E1) hors fonction ?
      if (this.peek() && this.peek()!.type === "COLON") {
        this.consume();
        const rightToken = this.peek();
        if (rightToken && rightToken.type === "IDENT") {
          this.consume();
          return this.resolveIdentifier(name);
        }
      }

      // Sinon c'est une référence de cellule ou variable
      return this.resolveIdentifier(name);
    }

    this.consume();
    return 0;
  }

  // Parse un argument pouvant être soit une expression soit une plage type C1:E1
  private parseArgument(): any[] {
    const startToken = this.peek();
    if (startToken && startToken.type === "IDENT") {
      const nextToken = this.tokens[this.pos + 1];
      if (nextToken && nextToken.type === "COLON") {
        const thirdToken = this.tokens[this.pos + 2];
        if (thirdToken && thirdToken.type === "IDENT") {
          this.consume(); // start
          this.consume(); // :
          this.consume(); // end
          return this.expandCellRange(startToken.value, thirdToken.value);
        }
      }
    }
    return [this.parseExpression()];
  }

  private expandCellRange(startRef: string, endRef: string): any[] {
    const cleanStart = startRef.replace(/\{row\}/g, String(this.context.row || 1)).replace(/\$/g, "").toUpperCase();
    const cleanEnd = endRef.replace(/\{row\}/g, String(this.context.row || 1)).replace(/\$/g, "").toUpperCase();

    const mStart = cleanStart.match(/^([A-Z]+)(\d+)$/);
    const mEnd = cleanEnd.match(/^([A-Z]+)(\d+)$/);

    if (!mStart || !mEnd) {
      return [this.resolveIdentifier(cleanStart), this.resolveIdentifier(cleanEnd)];
    }

    const startCol = colLetterToIndex(mStart[1]);
    const endCol = colLetterToIndex(mEnd[1]);
    const startRow = parseInt(mStart[2], 10);
    const endRow = parseInt(mEnd[2], 10);

    const minCol = Math.min(startCol, endCol);
    const maxCol = Math.max(startCol, endCol);
    const minRow = Math.min(startRow, endRow);
    const maxRow = Math.max(startRow, endRow);

    const values: any[] = [];
    for (let c = minCol; c <= maxCol; c++) {
      const colLetter = indexToColLetter(c);
      for (let r = minRow; r <= maxRow; r++) {
        values.push(this.resolveIdentifier(`${colLetter}${r}`));
      }
    }
    return values;
  }

  private evaluateFunction(name: string, args: any[]): any {
    switch (name) {
      case "IF":
      case "SI": {
        const cond = Boolean(args[0]);
        return cond ? args[1] : (args[2] ?? 0);
      }
      case "IFERROR":
      case "SIERREUR": {
        const val = args[0];
        if (
          val === undefined ||
          val === null ||
          (typeof val === "string" && val.startsWith("#")) ||
          (typeof val === "number" && !isFinite(val))
        ) {
          return args[1] ?? 0;
        }
        return val;
      }
      case "SUM":
      case "SOMME": {
        return args.reduce((acc, curr) => acc + (Number(curr) || 0), 0);
      }
      case "AVERAGE":
      case "MOYENNE": {
        if (args.length === 0) return 0;
        const sum = args.reduce((acc, curr) => acc + (Number(curr) || 0), 0);
        return sum / args.length;
      }
      case "MAX": {
        const nums = args.map(Number).filter((n) => !isNaN(n));
        return nums.length > 0 ? Math.max(...nums) : 0;
      }
      case "MIN": {
        const nums = args.map(Number).filter((n) => !isNaN(n));
        return nums.length > 0 ? Math.min(...nums) : 0;
      }
      case "ROUND":
      case "ARRONDI": {
        const val = Number(args[0]) || 0;
        const decimals = Number(args[1]) || 0;
        const factor = Math.pow(10, decimals);
        return Math.round(val * factor) / factor;
      }
      case "ABS": {
        return Math.abs(Number(args[0]) || 0);
      }
      case "INT":
      case "ENT": {
        return Math.floor(Number(args[0]) || 0);
      }
      case "PRODUCT":
      case "PRODUIT": {
        return args.reduce((acc, curr) => acc * (Number(curr) || 0), 1);
      }
      // Fonctions financières
      case "PMT":
      case "VPM": {
        const rate = Number(args[0]) || 0;
        const nper = Number(args[1]) || 0;
        const pv = Number(args[2]) || 0;
        const fv = Number(args[3]) || 0;
        const type = Number(args[4]) || 0;
        if (rate === 0) return -(pv + fv) / nper;
        const pvif = Math.pow(1 + rate, nper);
        let pmt = (rate / (pvif - 1)) * -(pv * pvif + fv);
        if (type === 1) pmt /= (1 + rate);
        return pmt;
      }
      case "PV":
      case "VA": {
        const rate = Number(args[0]) || 0;
        const nper = Number(args[1]) || 0;
        const pmt = Number(args[2]) || 0;
        const fv = Number(args[3]) || 0;
        const type = Number(args[4]) || 0;
        if (rate === 0) return -pmt * nper - fv;
        const pvif = Math.pow(1 + rate, nper);
        return -(fv + (type === 1 ? pmt * (1 + rate) : pmt) * ((pvif - 1) / rate)) / pvif;
      }
      case "FV":
      case "VC": {
        const rate = Number(args[0]) || 0;
        const nper = Number(args[1]) || 0;
        const pmt = Number(args[2]) || 0;
        const pv = Number(args[3]) || 0;
        const type = Number(args[4]) || 0;
        if (rate === 0) return -pv - pmt * nper;
        const pvif = Math.pow(1 + rate, nper);
        return -pv * pvif - (type === 1 ? pmt * (1 + rate) : pmt) * ((pvif - 1) / rate);
      }
      case "NPER":
      case "NPM": {
        const rate = Number(args[0]) || 0;
        const pmt = Number(args[1]) || 0;
        const pv = Number(args[2]) || 0;
        const fv = Number(args[3]) || 0;
        const type = Number(args[4]) || 0;
        if (rate === 0) return -(pv + fv) / pmt;
        const z = type === 1 ? pmt * (1 + rate) : pmt;
        return Math.log((z - fv * rate) / (z + pv * rate)) / Math.log(1 + rate);
      }
      // Fonctions logiques
      case "AND":
      case "ET": {
        return args.every(Boolean);
      }
      case "OR":
      case "OU": {
        return args.some(Boolean);
      }
      case "NOT":
      case "NON": {
        return !Boolean(args[0]);
      }
      // Si la fonction n'est pas encore émulée, on lève une exception dédiée
      default:
        throw new Error("#UNSUPPORTED:" + name);
    }
  }

  private resolveIdentifier(name: string): any {
    const row = this.context.row || 1;
    const resolvedRef = name.replace(/\{row\}/g, String(row)).replace(/\$/g, "").toUpperCase();

    if (this.context.cells && resolvedRef in this.context.cells) {
      const val = this.context.cells[resolvedRef];
      if (typeof val === "number") return val;
      if (typeof val === "boolean") return val;
      if (val === null || val === undefined) return 0;
      
      const str = String(val).trim();
      if (str === "") return 0;
      if (str.startsWith("#")) return str; // Propagation directe d'erreur

      // Parser les formats avec %, €, espaces et virgules
      const hasPercent = str.includes("%");
      const cleaned = str
        .replace(/\s/g, "")
        .replace(/€|euro/gi, "")
        .replace(/%/g, "")
        .replace(/,/g, ".");
      const num = parseFloat(cleaned);
      if (isNaN(num)) return str;
      return hasPercent ? num / 100 : num;
    }

    return 0;
  }
}

export function evaluateFormula(formula: string, context: EvaluationContext = {}): number | string | boolean {
  if (!formula || typeof formula !== "string") return 0;
  const clean = formula.trim().replace(/^=+/, "");
  if (!clean) return 0;

  try {
    const tokens = tokenize(clean);
    const parser = new Parser(tokens, context);
    const res = parser.parse();
    if (typeof res === "number") {
      if (isNaN(res)) return "#VALEUR!";
      if (!isFinite(res)) return "#DIV/0!";
      // Arrondir résidu flottant
      return Math.round(res * 100000000) / 100000000;
    }
    return res;
  } catch (err: unknown) {
    const msg = (err as Error).message;
    if (msg.startsWith("#UNSUPPORTED:")) {
      return "#CALC_EXCEL";
    }
    if (msg.startsWith("#")) return msg;
    return "#VALEUR!";
  }
}
