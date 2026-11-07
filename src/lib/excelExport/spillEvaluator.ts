export type CellValue = string | number | boolean | null;

export interface SpillResult {
  rows: number;
  cols: number;
  values: CellValue[][];
}

export type CellGetter = (sheetName: string, row: number, col: number) => CellValue;
export type SheetPredicate = (sheetName: string) => boolean;

type Value =
  | { kind: "scalar"; value: CellValue }
  | { kind: "matrix"; values: CellValue[][] };

type Token =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "id"; v: string }
  | { t: "op"; v: string }
  | { t: "(" }
  | { t: ")" }
  | { t: "," }
  | { t: ":" }
  | { t: "!" }
  | { t: "%" };

const FRENCH_FN: Record<string, string> = {
  FILTRE: "FILTER",
  TRIER: "SORT",
  TRIERPAR: "SORTBY",
  UNIQUE: "UNIQUE",
  SEQUENCE: "SEQUENCE",
  ASSEMB: "VSTACK",
  ASSEMB_V: "VSTACK",
  ASSEMB_H: "HSTACK",
  PRENDRE: "TAKE",
  EXCLURE: "DROP",
  CHOISIRLIGNES: "CHOOSEROWS",
  CHOISIRCOLS: "CHOOSECOLS",
  REDIMENSIONNER: "EXPAND",
  FRACTIONNER_TEXTE: "TEXTSPLIT",
  ALEA_ENTRE_BORNES: "RANDARRAY",
};

function scalar(value: CellValue): Value {
  return { kind: "scalar", value };
}

function asMatrix(v: Value): CellValue[][] {
  return v.kind === "matrix" ? v.values : [[v.value]];
}

function isBroadcastable(v: Value): boolean {
  return v.kind === "scalar" || (v.values.length === 1 && v.values[0].length === 1);
}

function broadcastScalar(v: Value): CellValue {
  return v.kind === "scalar" ? v.value : v.values[0][0];
}

function asScalar(v: Value | undefined): CellValue {
  if (!v) return null;
  return v.kind === "scalar" ? v.value : v.values[0]?.[0] ?? null;
}

function numArg(v: Value | undefined, fallback: number): number {
  if (!v) return fallback;
  const s = asScalar(v);
  if (s == null || s === "") return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

function boolArg(v: Value | undefined): boolean {
  return truthy(asScalar(v));
}

function truthy(v: CellValue): boolean {
  if (v == null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = String(v).trim().toLowerCase();
  return s !== "" && s !== "false" && s !== "0";
}

function compareValues(a: CellValue, b: CellValue): number {
  if (a == null && b == null) return 0;
  const na = a == null ? 0 : typeof a === "number" ? a : Number(a);
  const nb = b == null ? 0 : typeof b === "number" ? b : Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  const sa = String(a ?? "").toLowerCase();
  const sb = String(b ?? "").toLowerCase();
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function looseEqual(a: CellValue, b: CellValue): boolean {
  if ((a == null || a === "") && (b == null || b === "")) return true;
  const na = a == null || a === "" ? 0 : typeof a === "number" ? a : Number(a);
  const nb = b == null || b === "" ? 0 : typeof b === "number" ? b : Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na === nb;
  return String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();
}

function compareOp(op: string, a: CellValue, b: CellValue): CellValue {
  if (op === "=") return looseEqual(a, b);
  if (op === "<>") return !looseEqual(a, b);
  const cmp = compareValues(a, b);
  if (op === "<") return cmp < 0;
  if (op === ">") return cmp > 0;
  if (op === "<=") return cmp <= 0;
  if (op === ">=") return cmp >= 0;
  return false;
}

function broadcastMap(values: Value[], fn: (vals: CellValue[]) => CellValue): Value {
  if (values.every(isBroadcastable)) {
    return scalar(fn(values.map(broadcastScalar)));
  }
  const mats = values.map(asMatrix);
  const rows = Math.max(...mats.map((m) => m.length));
  const cols = Math.max(...mats.map((m) => m[0]?.length ?? 1));
  const out: CellValue[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: CellValue[] = [];
    for (let c = 0; c < cols; c++) {
      row.push(
        fn(
          values.map((_v, i) => {
            const m = mats[i];
            if (m.length === 1 && m[0].length === 1) return m[0][0];
            return m[r]?.[c] ?? null;
          })
        )
      );
    }
    out.push(row);
  }
  return { kind: "matrix", values: out };
}

function mapUnary(a: Value, fn: (v: CellValue) => CellValue): Value {
  return broadcastMap([a], ([v]) => fn(v));
}

function mapBinary(a: Value, b: Value, fn: (x: CellValue, y: CellValue) => CellValue): Value {
  return broadcastMap([a, b], ([x, y]) => fn(x, y));
}

function mapTernary(
  a: Value,
  b: Value,
  c: Value,
  fn: (x: CellValue, y: CellValue, z: CellValue) => CellValue
): Value {
  return broadcastMap([a, b, c], ([x, y, z]) => fn(x, y, z));
}

function keyOf(row: CellValue[]): string {
  return JSON.stringify(row.map((v) => (typeof v === "string" ? v.toLowerCase() : v)));
}

function isBlankRow(row: CellValue[]): boolean {
  return row.every((v) => v == null || v === "");
}

function fnFilter(array: Value, include: Value, ifEmpty?: Value): Value {
  const arr = asMatrix(array);
  const inc = asMatrix(include);
  const rows = arr.length;
  const cols = arr[0]?.length ?? 0;

  if (rows === 1 && inc.length === 1 && inc[0].length === cols && cols > 1) {
    const keep: number[] = [];
    for (let c = 0; c < cols; c++) {
      if (truthy(inc[0][c])) keep.push(c);
    }
    if (keep.length === 0) return ifEmpty ?? scalar("#CALC!");
    return { kind: "matrix", values: arr.map((row) => keep.map((c) => row[c])) };
  }

  if (inc.length === rows) {
    const keep: number[] = [];
    for (let r = 0; r < rows; r++) {
      if (truthy(inc[r][0])) keep.push(r);
    }
    if (keep.length === 0) return ifEmpty ?? scalar("#CALC!");
    return { kind: "matrix", values: keep.map((r) => arr[r].slice()) };
  }

  if (inc.length === 1 && inc[0].length === cols) {
    const keep: number[] = [];
    for (let c = 0; c < cols; c++) {
      if (truthy(inc[0][c])) keep.push(c);
    }
    if (keep.length === 0) return ifEmpty ?? scalar("#CALC!");
    return { kind: "matrix", values: arr.map((row) => keep.map((c) => row[c])) };
  }

  return scalar("#VALUE!");
}

function fnUnique(array: Value, byCol: boolean, exactlyOnce: boolean): Value {
  const arr = asMatrix(array);
  if (arr.length === 0) return scalar("#CALC!");
  const rows = arr.length;
  const cols = arr[0].length;

  if (byCol) {
    const seen = new Map<string, { values: CellValue[]; count: number }>();
    for (let c = 0; c < cols; c++) {
      const colVals = arr.map((row) => row[c]);
      if (isBlankRow(colVals)) continue;
      const key = keyOf(colVals);
      const entry = seen.get(key);
      if (entry) entry.count++;
      else seen.set(key, { values: colVals, count: 1 });
    }
    const colsOut = [...seen.values()]
      .filter((e) => !exactlyOnce || e.count === 1)
      .map((e) => e.values);
    const out: CellValue[][] = [];
    for (let r = 0; r < rows; r++) out.push(colsOut.map((col) => col[r]));
    return { kind: "matrix", values: out };
  }

  const seen = new Map<string, { row: CellValue[]; count: number }>();
  for (const row of arr) {
    if (isBlankRow(row)) continue;
    const key = keyOf(row);
    const entry = seen.get(key);
    if (entry) entry.count++;
    else seen.set(key, { row, count: 1 });
  }
  const rowsOut = [...seen.values()]
    .filter((e) => !exactlyOnce || e.count === 1)
    .map((e) => e.row);
  return { kind: "matrix", values: rowsOut };
}

function fnSort(array: Value, sortIndex: number, sortOrder: number, byCol: boolean): Value {
  const arr = asMatrix(array);
  if (arr.length === 0) return scalar("#CALC!");
  const order = sortOrder < 0 ? -1 : 1;

  if (byCol) {
    const cols = arr[0].length;
    const idx = Array.from({ length: cols }, (_, i) => i);
    idx.sort((a, b) => {
      const cmp = compareValues(arr[sortIndex - 1]?.[a] ?? null, arr[sortIndex - 1]?.[b] ?? null);
      return cmp !== 0 ? cmp * order : a - b;
    });
    return { kind: "matrix", values: arr.map((row) => idx.map((c) => row[c])) };
  }

  const idx = arr.map((_, i) => i);
  idx.sort((a, b) => {
    const cmp = compareValues(arr[a][sortIndex - 1] ?? null, arr[b][sortIndex - 1] ?? null);
    return cmp !== 0 ? cmp * order : a - b;
  });
  return { kind: "matrix", values: idx.map((i) => arr[i]) };
}

function fnSortBy(args: Value[]): Value {
  const arr = asMatrix(args[0]);
  const keys: Array<{ values: CellValue[]; order: number }> = [];
  let i = 1;
  while (i < args.length) {
    const by = asMatrix(args[i]).map((row) => row[0]);
    const order = i + 1 < args.length ? (numArg(args[i + 1], 1) < 0 ? -1 : 1) : 1;
    keys.push({ values: by, order });
    i += 2;
  }
  const idx = arr.map((_, j) => j);
  idx.sort((a, b) => {
    for (const k of keys) {
      const cmp = compareValues(k.values[a] ?? null, k.values[b] ?? null) * k.order;
      if (cmp !== 0) return cmp;
    }
    return a - b;
  });
  return { kind: "matrix", values: idx.map((j) => arr[j]) };
}

function fnSequence(rows: number, cols: number, start: number, step: number): Value {
  const nRows = Math.max(0, Math.floor(rows));
  const nCols = Math.max(0, Math.floor(cols));
  if (nRows === 0 || nCols === 0) return scalar("#CALC!");
  const out: CellValue[][] = [];
  let v = start;
  for (let r = 0; r < nRows; r++) {
    const row: CellValue[] = [];
    for (let c = 0; c < nCols; c++) {
      row.push(v);
      v += step;
    }
    out.push(row);
  }
  return { kind: "matrix", values: out };
}

function fnVStack(args: Value[]): Value {
  const mats = args.map(asMatrix);
  const cols = Math.max(...mats.map((m) => m[0]?.length ?? 0));
  const out: CellValue[][] = [];
  for (const m of mats) {
    for (const row of m) {
      const r = row.slice();
      while (r.length < cols) r.push(null);
      out.push(r);
    }
  }
  return { kind: "matrix", values: out };
}

function fnHStack(args: Value[]): Value {
  const mats = args.map(asMatrix);
  const rows = Math.max(...mats.map((m) => m.length));
  const out: CellValue[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: CellValue[] = [];
    for (const m of mats) {
      if (r < m.length) row.push(...m[r]);
      else row.push(...new Array(m[0]?.length ?? 0).fill(null));
    }
    out.push(row);
  }
  return { kind: "matrix", values: out };
}

function fnTake(array: Value, rowsArg: number, colsArg?: number): Value {
  const arr = asMatrix(array);
  const nr = arr.length;
  const nc = arr[0]?.length ?? 0;
  const takeRows = rowsArg >= 0 ? Math.min(rowsArg, nr) : Math.min(-rowsArg, nr);
  const rows = rowsArg >= 0 ? arr.slice(0, takeRows) : arr.slice(nr - takeRows);
  if (colsArg === undefined) return { kind: "matrix", values: rows.map((r) => r.slice()) };
  const takeCols = colsArg >= 0 ? Math.min(colsArg, nc) : Math.min(-colsArg, nc);
  return {
    kind: "matrix",
    values: rows.map((r) => (colsArg >= 0 ? r.slice(0, takeCols) : r.slice(nc - takeCols))),
  };
}

function fnDrop(array: Value, rowsArg: number, colsArg?: number): Value {
  const arr = asMatrix(array);
  const nr = arr.length;
  const nc = arr[0]?.length ?? 0;
  const dropRows = rowsArg >= 0 ? Math.min(rowsArg, nr) : Math.min(-rowsArg, nr);
  const rows = rowsArg >= 0 ? arr.slice(dropRows) : arr.slice(0, nr - dropRows);
  if (colsArg === undefined) return { kind: "matrix", values: rows.map((r) => r.slice()) };
  const dropCols = colsArg >= 0 ? Math.min(colsArg, nc) : Math.min(-colsArg, nc);
  return {
    kind: "matrix",
    values: rows.map((r) => (colsArg >= 0 ? r.slice(dropCols) : r.slice(0, nc - dropCols))),
  };
}

function fnChooseRows(array: Value, indices: number[]): Value {
  const arr = asMatrix(array);
  const nr = arr.length;
  const out = indices
    .map((i) => (i >= 0 ? i : nr + i))
    .filter((i) => i >= 0 && i < nr)
    .map((i) => arr[i]);
  return { kind: "matrix", values: out };
}

function fnChooseCols(array: Value, indices: number[]): Value {
  const arr = asMatrix(array);
  const nc = arr[0]?.length ?? 0;
  const cols = indices.map((i) => (i >= 0 ? i : nc + i)).filter((i) => i >= 0 && i < nc);
  return { kind: "matrix", values: arr.map((row) => cols.map((c) => row[c])) };
}

function fnToCol(array: Value, ignore: number, scanByCol: boolean): Value {
  const arr = asMatrix(array);
  const flat: CellValue[] = [];
  if (scanByCol) {
    const nc = arr[0]?.length ?? 0;
    for (let c = 0; c < nc; c++) for (let r = 0; r < arr.length; r++) flat.push(arr[r][c]);
  } else {
    for (const row of arr) flat.push(...row);
  }
  const filtered =
    ignore === 1 || ignore === 3 ? flat.filter((v) => v != null && v !== "") : flat;
  return { kind: "matrix", values: filtered.map((v) => [v]) };
}

function fnToRow(array: Value, ignore: number, scanByCol: boolean): Value {
  const col = fnToCol(array, ignore, scanByCol);
  return { kind: "matrix", values: [asMatrix(col).map((r) => r[0])] };
}

function fnWrapRows(array: Value, wrapCount: number, pad: CellValue): Value {
  const flat = asMatrix(array).flat();
  const n = Math.max(1, Math.floor(wrapCount));
  const out: CellValue[][] = [];
  for (let i = 0; i < flat.length; i += n) {
    const row = flat.slice(i, i + n);
    while (row.length < n) row.push(pad);
    out.push(row);
  }
  return { kind: "matrix", values: out };
}

function fnWrapCols(array: Value, wrapCount: number, pad: CellValue): Value {
  const flat = asMatrix(array).flat();
  const n = Math.max(1, Math.floor(wrapCount));
  const nCols = Math.ceil(flat.length / n);
  const out: CellValue[][] = [];
  for (let r = 0; r < n; r++) {
    const row: CellValue[] = [];
    for (let c = 0; c < nCols; c++) row.push(flat[c * n + r] ?? pad);
    out.push(row);
  }
  return { kind: "matrix", values: out };
}

function fnExpand(array: Value, rows: number, cols: number | undefined, pad: CellValue): Value {
  const arr = asMatrix(array);
  const nRows = Math.max(0, Math.floor(rows));
  const nCols = cols === undefined ? arr[0]?.length ?? 0 : Math.max(0, Math.floor(cols));
  const out: CellValue[][] = [];
  for (let r = 0; r < nRows; r++) {
    const row: CellValue[] = [];
    for (let c = 0; c < nCols; c++) row.push(arr[r]?.[c] ?? pad);
    out.push(row);
  }
  return { kind: "matrix", values: out };
}

function fnTextSplit(args: Value[]): Value {
  const text = asScalar(args[0]);
  if (text == null) return scalar(null);
  const colDelim = args[1] !== undefined ? String(asScalar(args[1]) ?? "") : "";
  const rowDelim = args[2] !== undefined ? String(asScalar(args[2]) ?? "") : "";
  const ignoreEmpty = boolArg(args[3]);

  let rows = [String(text)];
  if (rowDelim) rows = rows.flatMap((r) => r.split(rowDelim));
  let out: CellValue[][] = rows.map((r) => (colDelim ? r.split(colDelim) : [r]));
  if (ignoreEmpty) out = out.map((row) => row.filter((v) => v !== ""));
  const maxCols = Math.max(...out.map((r) => r.length));
  out = out.map((r) => {
    while (r.length < maxCols) r.push(null);
    return r;
  });
  return { kind: "matrix", values: out };
}

function datePart(v: CellValue, part: "year" | "month" | "day"): CellValue {
  if (v == null) return null;
  let d: Date;
  if (typeof v === "number") {
    d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
  } else {
    d = new Date(String(v));
  }
  if (Number.isNaN(d.getTime())) return null;
  if (part === "year") return d.getUTCFullYear();
  if (part === "month") return d.getUTCMonth() + 1;
  return d.getUTCDate();
}

function callFunction(rawName: string, args: Value[]): Value {
  let name = rawName.toUpperCase();
  name = FRENCH_FN[name] ?? name;

  switch (name) {
    case "FILTER":
      return fnFilter(args[0], args[1], args[2]);
    case "UNIQUE":
      return fnUnique(args[0], boolArg(args[1]), boolArg(args[2]));
    case "SORT":
      return fnSort(args[0], numArg(args[1], 1), numArg(args[2], 1), boolArg(args[3]));
    case "SORTBY":
      return fnSortBy(args);
    case "SEQUENCE":
      return fnSequence(numArg(args[0], 1), numArg(args[1], 1), numArg(args[2], 1), numArg(args[3], 1));
    case "VSTACK":
      return fnVStack(args);
    case "HSTACK":
      return fnHStack(args);
    case "TAKE":
      return fnTake(args[0], numArg(args[1], 0), args[2] !== undefined ? numArg(args[2], 0) : undefined);
    case "DROP":
      return fnDrop(args[0], numArg(args[1], 0), args[2] !== undefined ? numArg(args[2], 0) : undefined);
    case "CHOOSEROWS":
      return fnChooseRows(args[0], args.slice(1).map((a) => numArg(a, 0)));
    case "CHOOSECOLS":
      return fnChooseCols(args[0], args.slice(1).map((a) => numArg(a, 0)));
    case "TOCOL":
      return fnToCol(args[0], numArg(args[1], 0), boolArg(args[2]));
    case "TOROW":
      return fnToRow(args[0], numArg(args[1], 0), boolArg(args[2]));
    case "WRAPROWS":
      return fnWrapRows(args[0], numArg(args[1], 1), asScalar(args[2]));
    case "WRAPCOLS":
      return fnWrapCols(args[0], numArg(args[1], 1), asScalar(args[2]));
    case "EXPAND":
      return fnExpand(
        args[0],
        numArg(args[1], 0),
        args[2] !== undefined ? numArg(args[2], 0) : undefined,
        asScalar(args[3])
      );
    case "RANDARRAY":
      return fnSequence(numArg(args[0], 1), numArg(args[1], 1), 0, 0);
    case "TEXTSPLIT":
      return fnTextSplit(args);

    case "ISBLANK":
      return mapUnary(args[0], (v) => v == null || v === "");
    case "ISNUMBER":
      return mapUnary(args[0], (v) => typeof v === "number" || (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))));
    case "ISTEXT":
      return mapUnary(args[0], (v) => typeof v === "string" && v.trim() !== "" && isNaN(Number(v)));
    case "ISERROR":
      return mapUnary(args[0], (v) => typeof v === "string" && v.startsWith("#"));
    case "LEN":
      return mapUnary(args[0], (v) => String(v ?? "").length);
    case "LEFT":
      return mapBinary(args[0], args[1], (v, n) => String(v ?? "").slice(0, Number(n) || 0));
    case "RIGHT":
      return mapBinary(args[0], args[1], (v, n) => {
        const s = String(v ?? "");
        const k = Number(n) || 0;
        return k <= 0 ? "" : s.slice(-k);
      });
    case "MID":
      return mapTernary(args[0], args[1], args[2], (v, s, l) =>
        String(v ?? "").substr((Number(s) || 1) - 1, Number(l) || 0)
      );
    case "UPPER":
      return mapUnary(args[0], (v) => String(v ?? "").toUpperCase());
    case "LOWER":
      return mapUnary(args[0], (v) => String(v ?? "").toLowerCase());
    case "TRIM":
      return mapUnary(args[0], (v) => String(v ?? "").trim());
    case "EXACT":
      return mapBinary(args[0], args[1], (a, b) => String(a ?? "") === String(b ?? ""));
    case "AND": {
      const vals = args.flatMap((a) => asMatrix(a).flat());
      return scalar(vals.every(truthy));
    }
    case "OR": {
      const vals = args.flatMap((a) => asMatrix(a).flat());
      return scalar(vals.some(truthy));
    }
    case "NOT":
      return mapUnary(args[0], (v) => !truthy(v));
    case "ABS":
      return mapUnary(args[0], (v) => Math.abs(Number(v) || 0));
    case "ROUND":
      return mapBinary(args[0], args[1], (v, n) => {
        const k = Math.pow(10, Number(n) || 0);
        return Math.round((Number(v) || 0) * k) / k;
      });
    case "IF":
      return mapTernary(args[0], args[1], args[2], (c, a, b) => (truthy(c) ? a : b));
    case "IFERROR":
      return mapBinary(args[0], args[1], (a, b) => (typeof a === "string" && a.startsWith("#") ? b : a));
    case "YEAR":
      return mapUnary(args[0], (v) => datePart(v, "year"));
    case "MONTH":
      return mapUnary(args[0], (v) => datePart(v, "month"));
    case "DAY":
      return mapUnary(args[0], (v) => datePart(v, "day"));
    case "DATE":
      return mapTernary(args[0], args[1], args[2], (y, m, d) => {
        const yy = String(Number(y) || 0).padStart(4, "0");
        const mm = String(Number(m) || 0).padStart(2, "0");
        const dd = String(Number(d) || 0).padStart(2, "0");
        return `${yy}-${mm}-${dd}`;
      });
    case "TODAY":
      return scalar(new Date().toISOString().slice(0, 10));

    default:
      return scalar(null);
  }
}

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '"') {
      i++;
      let s = "";
      while (i < src.length) {
        if (src[i] === '"') {
          if (src[i + 1] === '"') {
            s += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        s += src[i++];
      }
      out.push({ t: "str", v: s });
      continue;
    }
    if (ch === "'") {
      i++;
      let s = "";
      while (i < src.length) {
        if (src[i] === "'") {
          if (src[i + 1] === "'") {
            s += "'";
            i += 2;
            continue;
          }
          i++;
          break;
        }
        s += src[i++];
      }
      out.push({ t: "id", v: s });
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      let s = "";
      while (i < src.length && /[0-9.]/.test(src[i])) s += src[i++];
      out.push({ t: "num", v: Number(s) });
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      let s = "";
      while (i < src.length && /[A-Za-z0-9_$.]/.test(src[i])) s += src[i++];
      out.push({ t: "id", v: s });
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === "<=" || two === ">=" || two === "<>" || two === "!=") {
      out.push({ t: "op", v: two === "!=" ? "<>" : two });
      i += 2;
      continue;
    }
    if (["=", "<", ">", "+", "-", "*", "/", "^", "&"].includes(ch)) {
      out.push({ t: "op", v: ch });
      i++;
      continue;
    }
    if (ch === "(") {
      out.push({ t: "(" });
      i++;
      continue;
    }
    if (ch === ")") {
      out.push({ t: ")" });
      i++;
      continue;
    }
    if (ch === ",") {
      out.push({ t: "," });
      i++;
      continue;
    }
    if (ch === ":") {
      out.push({ t: ":" });
      i++;
      continue;
    }
    if (ch === "!") {
      out.push({ t: "!" });
      i++;
      continue;
    }
    if (ch === "%") {
      out.push({ t: "%" });
      i++;
      continue;
    }
    i++;
  }
  return out;
}

function isCellRef(s: string): boolean {
  return /^\$?[A-Za-z]{1,3}\$?\d+$/.test(s);
}

export function parseCellAddress(ref: string): { row: number; col: number } {
  const m = ref.replace(/\$/g, "").match(/^([A-Za-z]{1,3})(\d+)$/);
  if (!m) throw new Error(`Adresse invalide: ${ref}`);
  return { col: colLetterToIndex(m[1].toUpperCase()), row: parseInt(m[2], 10) };
}

function colLetterToIndex(col: string): number {
  let res = 0;
  for (let k = 0; k < col.length; k++) res = res * 26 + (col.charCodeAt(k) - 64);
  return res;
}

export function indexToColLetter(idx: number): string {
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
  private pos = 0;

  constructor(
    private tokens: Token[],
    private ctx: { sheet: string; getCell: CellGetter; hasSheet: SheetPredicate }
  ) {}

  public parse(): Value {
    return this.parseExpression();
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    return this.tokens[this.pos++];
  }

  private expect(t: Token["t"]): void {
    const tok = this.consume();
    if (!tok || tok.t !== t) throw new Error(`Token attendu: ${t}`);
  }

  private consumeId(): string {
    const tok = this.consume();
    if (!tok || tok.t !== "id") throw new Error("Identifiant attendu");
    return tok.v;
  }

  private parseExpression(): Value {
    return this.parseComparison();
  }

  private parseComparison(): Value {
    let left = this.parseConcat();
    while (this.peek()?.t === "op") {
      const op = (this.peek() as { t: "op"; v: string }).v;
      if (!["=", "<>", "<", ">", "<=", ">="].includes(op)) break;
      this.consume();
      const right = this.parseConcat();
      left = mapBinary(left, right, (a, b) => compareOp(op, a, b));
    }
    return left;
  }

  private parseConcat(): Value {
    let left = this.parseAdditive();
    while (this.peek()?.t === "op" && (this.peek() as { v: string }).v === "&") {
      this.consume();
      const right = this.parseAdditive();
      left = mapBinary(left, right, (a, b) => String(a ?? "") + String(b ?? ""));
    }
    return left;
  }

  private parseAdditive(): Value {
    let left = this.parseMultiplicative();
    while (this.peek()?.t === "op" && ["+", "-"].includes((this.peek() as { v: string }).v)) {
      const op = (this.consume() as { v: string }).v;
      const right = this.parseMultiplicative();
      left = mapBinary(left, right, (a, b) =>
        op === "+" ? Number(a || 0) + Number(b || 0) : Number(a || 0) - Number(b || 0)
      );
    }
    return left;
  }

  private parseMultiplicative(): Value {
    let left = this.parsePower();
    while (this.peek()?.t === "op" && ["*", "/"].includes((this.peek() as { v: string }).v)) {
      const op = (this.consume() as { v: string }).v;
      const right = this.parsePower();
      left = mapBinary(left, right, (a, b) => {
        const x = Number(a || 0);
        const y = Number(b || 0);
        return op === "*" ? x * y : y === 0 ? "#DIV/0!" : x / y;
      });
    }
    return left;
  }

  private parsePower(): Value {
    const left = this.parseUnary();
    if (this.peek()?.t === "op" && (this.peek() as { v: string }).v === "^") {
      this.consume();
      const right = this.parsePower();
      return mapBinary(left, right, (a, b) => Math.pow(Number(a || 0), Number(b || 0)));
    }
    return left;
  }

  private parseUnary(): Value {
    const tok = this.peek();
    if (tok?.t === "op" && (tok.v === "+" || tok.v === "-")) {
      this.consume();
      const val = this.parseUnary();
      return tok.v === "-"
        ? mapUnary(val, (v) => -Number(v || 0))
        : val;
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Value {
    let val = this.parsePrimary();
    while (this.peek()?.t === "%") {
      this.consume();
      val = mapUnary(val, (v) => Number(v || 0) / 100);
    }
    return val;
  }

  private parsePrimary(): Value {
    const tok = this.peek();
    if (!tok) throw new Error("Fin de formule inattendue");

    if (tok.t === "num") {
      this.consume();
      return scalar(tok.v);
    }
    if (tok.t === "str") {
      this.consume();
      return scalar(tok.v);
    }
    if (tok.t === "(") {
      this.consume();
      const v = this.parseExpression();
      this.expect(")");
      return v;
    }
    if (tok.t === "id") {
      this.consume();
      const name = tok.v;

      if (this.peek()?.t === "(") {
        this.consume();
        const args: Value[] = [];
        if (this.peek()?.t !== ")") {
          args.push(this.parseExpression());
          while (this.peek()?.t === ",") {
            this.consume();
            args.push(this.parseExpression());
          }
        }
        this.expect(")");
        return callFunction(name, args);
      }

      if (this.peek()?.t === "!") {
        this.consume();
        return this.parseCellRange(name);
      }

      if (/^TRUE$/i.test(name)) return scalar(true);
      if (/^FALSE$/i.test(name)) return scalar(false);
      if (isCellRef(name)) return this.parseCellRange(undefined, name);
      return scalar(null);
    }

    throw new Error(`Token inattendu: ${tok.t}`);
  }

  private parseCellRange(sheet?: string, first?: string): Value {
    const a = first ?? this.consumeId();
    if (!isCellRef(a)) return scalar(null);
    let b = a;
    if (this.peek()?.t === ":") {
      this.consume();
      b = this.consumeId();
    }
    const rangeSheet = sheet ?? this.ctx.sheet;
    if (!this.ctx.hasSheet(rangeSheet)) return scalar(null);
    const start = parseCellAddress(a);
    const end = parseCellAddress(b);
    const r1 = Math.min(start.row, end.row);
    const r2 = Math.max(start.row, end.row);
    const c1 = Math.min(start.col, end.col);
    const c2 = Math.max(start.col, end.col);
    if (r2 - r1 > 100000 || c2 - c1 > 2000) throw new Error("Plage trop grande");

    const values: CellValue[][] = [];
    for (let r = r1; r <= r2; r++) {
      const row: CellValue[] = [];
      for (let c = c1; c <= c2; c++) row.push(this.ctx.getCell(rangeSheet, r, c));
      values.push(row);
    }
    if (values.length === 1 && values[0].length === 1) return scalar(values[0][0]);
    return { kind: "matrix", values };
  }
}

export function evaluateSpillFormula(
  formula: string,
  currentSheet: string,
  getCell: CellGetter,
  hasSheet: SheetPredicate
): SpillResult | null {
  try {
    let src = formula.trim().replace(/^=+/, "");
    src = src.replace(/_xlfn\._xlws\./gi, "").replace(/_xlfn\./gi, "");
    const tokens = tokenize(src);
    if (tokens.length === 0) return null;
    const parser = new Parser(tokens, { sheet: currentSheet, getCell, hasSheet });
    const value = parser.parse();
    const values = asMatrix(value);
    if (values.length === 0 || (values[0]?.length ?? 0) === 0) return null;
    return { rows: values.length, cols: values[0].length, values };
  } catch {
    return null;
  }
}
