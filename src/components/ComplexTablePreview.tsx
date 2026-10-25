"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import {
  type TableSchema,
  validateSchema,
  type FileModification,
  validateFileModificationSchema,
} from "@/lib/excelExport/schemaParser";
import { type FileContext } from "@/components/FormulaAssistant";
import { FileSpreadsheet, Plus, Download, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { evaluateFormula } from "@/lib/formulaEvaluator";
import { extractTables } from "@/lib/excelExport";

export interface CustomExportData {
  paramValues?: Record<string, string | number>;
  rowValues?: Record<string, string | number>[];
  sampleRows?: number;
  theme?: string;
}

interface ComplexTablePreviewProps {
  rawSchema?: unknown;
  fileModification?: unknown;
  fileContext?: FileContext | null;
  markdownResponse?: string;
  onDownloadExcel?: (customData?: CustomExportData) => void;
  onDownloadModifiedFile?: () => void;
}

function getColumnLetterFromIndex(cIdx: number): string {
  let n = 3 + cIdx; // 3 = C (car A=1, B=2 pour la colonne "Ligne")
  let letter = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function formatDisplayValue(val: unknown, type?: string): string {
  if (val === undefined || val === null || val === "") return "—";
  if (val === "#CALC_EXCEL") return "Calculé sous Excel";
  if (typeof val === "string" && val.startsWith("#")) return val;
  const num = Number(val);
  if (isNaN(num)) return String(val);

  if (type === "currency") {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(num);
  }
  if (type === "percentage") {
    const pctVal = num > 1 ? num / 100 : num;
    return new Intl.NumberFormat("fr-FR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(pctVal);
  }
  if (type === "integer") {
    return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(num);
  }
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(num);
}

export function ComplexTablePreview({
  rawSchema,
  fileModification,
  fileContext,
  markdownResponse,
  onDownloadExcel,
  onDownloadModifiedFile,
}: ComplexTablePreviewProps) {
  // 1. Détection du mode modification de fichier
  const modifSchema = useMemo<FileModification | null>(() => {
    if (fileModification) {
      try {
        return validateFileModificationSchema(fileModification);
      } catch {
        return null;
      }
    }
    if (rawSchema) {
      try {
        return validateFileModificationSchema(rawSchema);
      } catch {
        return null;
      }
    }
    return null;
  }, [fileModification, rawSchema]);

  // 2. Détection du mode tableau complexe standard (simulation)
  const schema = useMemo<TableSchema | null>(() => {
    if (modifSchema) return null;
    if (!rawSchema) return null;
    try {
      return validateSchema(rawSchema);
    } catch {
      return null;
    }
  }, [rawSchema, modifSchema]);

  const [sampleRows, setSampleRows] = useState<number>(() => schema?.sample_rows || 3);
  const [selectedTheme, setSelectedTheme] = useState<string>("corporate");
  const [paramValues, setParamValues] = useState<Record<number, string>>(() =>
    Object.fromEntries((schema?.parameters || []).map((p, i) => [i, String(p.value ?? "")]))
  );

  // Pré-remplissage des inputs à partir des données Markdown de l'IA
  const initialInputs = useMemo(() => {
    const inputs: Record<string, string> = {};
    if (!schema) return inputs;
    const mdTables = markdownResponse ? extractTables(markdownResponse) : [];
    const mdTable = mdTables[0];
    if (!mdTable) return inputs;

    const hasRowColInMd =
      mdTable.headers.length > 0 &&
      /^(ligne|n|no|num|#|id)$/i.test(normalizeHeader(mdTable.headers[0]));

    const numCols = schema.columns.length;
    for (let c = 0; c < numCols; c++) {
      const col = schema.columns[c];
      if (col.formula || col.formula_en) continue;

      const colNorm = normalizeHeader(col.header);
      let mdIdx = mdTable.headers.findIndex((h) => normalizeHeader(h) === colNorm);
      if (mdIdx === -1) {
        mdIdx = mdTable.headers.findIndex((h) => {
          const hNorm = normalizeHeader(h);
          return hNorm.length > 2 && colNorm.length > 2 && (hNorm.includes(colNorm) || colNorm.includes(hNorm));
        });
      }
      if (mdIdx === -1) {
        mdIdx = hasRowColInMd ? c + 1 : c;
      }

      if (mdIdx >= 0 && mdIdx < mdTable.headers.length) {
        for (let r = 0; r < Math.min(mdTable.rows.length, 30); r++) {
          const val = mdTable.rows[r]?.[mdIdx]?.trim();
          if (val !== undefined && val !== "") {
            inputs[`${r}-${c}`] = val;
          }
        }
      }
    }
    return inputs;
  }, [schema, markdownResponse]);

  const [inputValues, setInputValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (Object.keys(initialInputs).length > 0) {
      setInputValues((prev) => ({ ...initialInputs, ...prev }));
    }
  }, [initialInputs]);

  // Handler de téléchargement enrichi avec les valeurs du simulateur
  const handleDownload = useCallback(() => {
    if (!onDownloadExcel) return;
    if (!schema) {
      onDownloadExcel();
      return;
    }

    const customParams: Record<string, string | number> = {};
    schema.parameters.forEach((p, idx) => {
      const cleanRef = p.ref.replace(/\$/g, "").toUpperCase();
      const rawVal = paramValues[idx] ?? p.value;
      const num = Number(String(rawVal).replace(/\s/g, "").replace(/,/g, "."));
      customParams[cleanRef] = isNaN(num) ? String(rawVal) : num;
    });

    const customRows: Record<string, string | number>[] = [];
    for (let r = 0; r < sampleRows; r++) {
      const rowObj: Record<string, string | number> = {};
      schema.columns.forEach((col, cIdx) => {
        const key = `${r}-${cIdx}`;
        rowObj[col.header] = inputValues[key] ?? "";
      });
      customRows.push(rowObj);
    }

    onDownloadExcel({
      paramValues: customParams,
      rowValues: customRows,
      sampleRows,
      theme: selectedTheme,
    });
  }, [onDownloadExcel, schema, sampleRows, paramValues, inputValues, selectedTheme]);

  // ── CAS A : Modification in-place sur fichier importé ──
  if (modifSchema) {
    const targetSheetName = modifSchema.target_sheet;
    const activeSheet =
      fileContext?.sheets?.find((s) => s.name === targetSheetName) ||
      fileContext?.sheets?.[0];

    const originalHeaders = activeSheet?.headers || [];
    const originalRows = activeSheet?.rows || [];
    const displayRowsCount = Math.min(originalRows.length, 10);

    return (
      <div className="mt-3 my-3 border border-emerald-500/30 rounded-2xl bg-card overflow-hidden shadow-sm not-prose">
        <div className="flex items-center justify-between px-4 py-3 bg-emerald-50/70 dark:bg-emerald-950/30 border-b border-emerald-200 dark:border-emerald-800/40">
          <div className="flex items-center gap-2 min-w-0">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="font-medium text-sm text-foreground truncate">
              {fileContext?.fileName || "Fichier importé"}
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 font-semibold shrink-0 flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              {modifSchema.new_columns.length} colonne(s) ajoutée(s)
            </span>
            {activeSheet && (
              <span className="text-[11px] text-muted-foreground hidden sm:inline">
                · Feuille : {activeSheet.name} ({activeSheet.totalRows} lignes réelles)
              </span>
            )}
          </div>
          {onDownloadModifiedFile && (
            <Button
              size="sm"
              onClick={onDownloadModifiedFile}
              className="h-8 gap-1.5 text-xs rounded-xl shrink-0 cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
            >
              <Download className="h-3.5 w-3.5" />
              Exporter fichier complété (.xlsx)
            </Button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-900 text-white">
              <tr>
                <th className="p-2.5 w-14 text-center border-r border-slate-700">Ligne</th>
                {originalHeaders.map((h, i) => (
                  <th key={i} className="p-2.5 border-r border-slate-700 font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
                {modifSchema.new_columns.map((nc, idx) => (
                  <th
                    key={`new-${idx}`}
                    className="p-2.5 border-r border-emerald-700 bg-emerald-900 text-emerald-100 font-semibold whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1">
                      <span>{nc.header}</span>
                      <span className="text-[9px] px-1 py-0.2 bg-emerald-800 rounded text-emerald-200">
                        + IA
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRowsCount > 0 ? (
                originalRows.slice(0, displayRowsCount).map((row, rIdx) => {
                  const actualRowNumber = (activeSheet?.dataStartRowIndex || 2) + rIdx;
                  return (
                    <tr key={rIdx} className="border-b border-border/40 hover:bg-muted/10">
                      <td className="p-2 text-center text-muted-foreground bg-muted/20 border-r border-border/40 font-mono">
                        {actualRowNumber}
                      </td>
                      {originalHeaders.map((_, cIdx) => (
                        <td
                          key={cIdx}
                          className="p-2 border-r border-border/40 font-mono text-muted-foreground"
                        >
                          {String(row[cIdx] ?? "")}
                        </td>
                      ))}
                      {modifSchema.new_columns.map((nc, ncIdx) => {
                        const formulaPreview = (nc.formula || "")
                          .replace(/\{row\}/g, String(actualRowNumber));
                        return (
                          <td
                            key={`new-cell-${ncIdx}`}
                            className="p-2 border-r border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/60 dark:bg-emerald-950/20 font-mono font-medium text-emerald-700 dark:text-emerald-300"
                            title={formulaPreview}
                          >
                            <span>{formulaPreview}</span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={originalHeaders.length + modifSchema.new_columns.length + 1}
                    className="p-4 text-center text-muted-foreground font-mono"
                  >
                    {modifSchema.new_columns.length} colonne(s) ajoutée(s) :{" "}
                    {modifSchema.new_columns.map((c) => c.header).join(", ")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-2.5 bg-muted/30 border-t border-border/40 flex justify-between items-center text-[11px] text-muted-foreground">
          <span>
            Aperçu des premières lignes · Toutes les {activeSheet?.totalRows || 0} lignes de votre
            fichier recevront la formule à l&apos;exportation.
          </span>
          {onDownloadExcel && (
            <button
              type="button"
              onClick={handleDownload}
              className="text-primary hover:underline font-medium cursor-pointer"
            >
              Télécharger comme maquette isolée
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── CAS B : Maquette / Simulation interactive standard ──
  if (!schema) return null;

  return (
    <div className="mt-3 my-3 border border-border/80 rounded-2xl bg-card overflow-hidden shadow-sm not-prose">
      <div className="flex items-center justify-between px-4 py-3 bg-muted/60 border-b border-border/60">
        <div className="flex items-center gap-2 min-w-0">
          <FileSpreadsheet className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="font-medium text-sm text-foreground truncate">{schema.title}</span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 font-semibold shrink-0">
            Simulation Interactive
          </span>
        </div>
        {onDownloadExcel && (
          <div className="flex items-center gap-2">
            <select
              value={selectedTheme}
              onChange={(e) => setSelectedTheme(e.target.value)}
              className="h-8 px-2 text-xs rounded-xl bg-background border border-border text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
              title="Style et thème de l'export Excel"
            >
              <option value="corporate">🎨 Bleu Corporate</option>
              <option value="emerald">🎨 Émeraude Finance</option>
              <option value="indigo">🎨 Royal Indigo</option>
              <option value="minimal">🎨 Minimal N&B</option>
            </select>
            <Button
              size="sm"
              onClick={handleDownload}
              className="h-8 gap-1.5 text-xs rounded-xl shrink-0 cursor-pointer shadow-sm"
            >
              <Download className="h-3.5 w-3.5" />
              Exporter .xlsx
            </Button>
          </div>
        )}
      </div>

      {schema.parameters.length > 0 && (
        <div className="p-3 bg-muted/20 border-b border-border/40 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {schema.parameters.map((param, pIdx) => (
            <div
              key={pIdx}
              className="flex items-center justify-between p-2 rounded-xl bg-background border border-border/50 text-xs gap-2"
            >
              <span className="text-muted-foreground font-medium truncate mr-2" title={param.name}>
                {param.name} ({param.ref})
              </span>
              <input
                type={
                  param.type === "number" ||
                  param.type === "currency" ||
                  param.type === "percentage" ||
                  param.type === "integer"
                    ? "number"
                    : "text"
                }
                value={paramValues[pIdx] ?? ""}
                onChange={(e) => setParamValues((prev) => ({ ...prev, [pIdx]: e.target.value }))}
                className="w-24 px-2 py-1 bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-800 rounded-lg text-right font-mono font-medium focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left border-collapse">
          <thead className="bg-slate-900 text-white">
            <tr>
              <th className="p-2.5 w-16 text-center border-r border-slate-700">Ligne</th>
              {schema.columns.map((col, cIdx) => (
                <th key={cIdx} className="p-2.5 border-r border-slate-700 font-medium whitespace-nowrap">
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: sampleRows }).map((_, rIdx) => {
              const rowNumber = (schema.data_start_row || 10) + rIdx;

              // Construction du dictionnaire de cellules pour cette ligne
              const cellsMap: Record<string, any> = {};

              // 1. Paramètres globaux ($C$5, C5...)
              schema.parameters.forEach((param, pIdx) => {
                const cleanRef = param.ref.replace(/\$/g, "").toUpperCase();
                const rawVal = paramValues[pIdx] ?? param.value;
                cellsMap[cleanRef] = rawVal;
              });

              // 2. Colonnes inputs de la ligne
              schema.columns.forEach((_, cI) => {
                const colLetter = getColumnLetterFromIndex(cI);
                const key = `${rIdx}-${cI}`;
                const val = inputValues[key] ?? "";
                cellsMap[`${colLetter}${rowNumber}`] = val;
              });

              return (
                <tr key={rIdx} className="border-b border-border/40 hover:bg-muted/10">
                  <td className="p-2 text-center text-muted-foreground bg-muted/20 border-r border-border/40 font-mono">
                    {rIdx + 1}
                  </td>
                  {schema.columns.map((col, cIdx) => {
                    const isCalculated = Boolean(col.formula || col.formula_en);
                    const key = `${rIdx}-${cIdx}`;

                    if (isCalculated) {
                      const formulaToEval = col.formula_en || col.formula || "";
                      const evalResult = evaluateFormula(formulaToEval, {
                        row: rowNumber,
                        cells: cellsMap,
                      });

                      // Stocker aussi le résultat calculé dans le map pour les colonnes calculées suivantes sur la même ligne
                      const colLetter = getColumnLetterFromIndex(cIdx);
                      cellsMap[`${colLetter}${rowNumber}`] = evalResult;

                      const isExcelOnly = evalResult === "#CALC_EXCEL";
                      const isError = typeof evalResult === "string" && evalResult.startsWith("#") && !isExcelOnly;

                      return (
                        <td
                          key={cIdx}
                          className="p-2 border-r border-border/40 font-mono bg-emerald-50/50 dark:bg-emerald-950/20"
                        >
                          <div className="flex flex-col">
                            {isExcelOnly ? (
                              <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 font-medium w-fit">
                                Calculé sous Excel
                              </span>
                            ) : (
                              <span
                                className={`font-semibold ${
                                  isError
                                    ? "text-rose-600 dark:text-rose-400"
                                    : "text-emerald-700 dark:text-emerald-300"
                                }`}
                              >
                                {formatDisplayValue(evalResult, col.type)}
                              </span>
                            )}
                            <span className="text-[9px] text-muted-foreground/70 font-mono truncate" title={col.formula || ""}>
                              {col.formula || "Calculé"}
                            </span>
                          </div>
                        </td>
                      );
                    }

                    return (
                      <td
                        key={cIdx}
                        className="p-2 border-r border-border/40 font-mono bg-amber-50/40 dark:bg-amber-950/10"
                      >
                        <input
                          type="text"
                          value={inputValues[key] ?? ""}
                          onChange={(e) =>
                            setInputValues((prev) => ({ ...prev, [key]: e.target.value }))
                          }
                          placeholder="Saisir..."
                          className="w-full bg-transparent border-0 focus:ring-0 focus:outline-none p-0 text-foreground font-mono"
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="p-2 bg-muted/30 border-t border-border/40 flex justify-between items-center text-[11px] text-muted-foreground">
        <span>
          {schema.columns.length} colonnes ({schema.columns.filter((c) => c.formula).length} calculées) · Calculs en direct
        </span>
        <button
          type="button"
          onClick={() => setSampleRows((r) => Math.min(r + 3, 30))}
          className="flex items-center gap-1 text-primary hover:underline font-medium cursor-pointer"
        >
          <Plus className="h-3 w-3" />
          Ajouter des lignes de simulation
        </button>
      </div>
    </div>
  );
}
