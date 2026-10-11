"use client";

import { useMemo, useState } from "react";
import {
  type TableSchema,
  validateSchema,
  type FileModification,
  validateFileModificationSchema,
} from "@/lib/excelExport/schemaParser";
import { type FileContext } from "@/components/FormulaAssistant";
import { FileSpreadsheet, Plus, Download, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ComplexTablePreviewProps {
  rawSchema?: unknown;
  fileModification?: unknown;
  fileContext?: FileContext | null;
  onDownloadExcel?: () => void;
  onDownloadModifiedFile?: () => void;
}

export function ComplexTablePreview({
  rawSchema,
  fileModification,
  fileContext,
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
  const [paramValues, setParamValues] = useState<Record<number, string>>(() =>
    Object.fromEntries((schema?.parameters || []).map((p, i) => [i, String(p.value ?? "")]))
  );
  const [inputValues, setInputValues] = useState<Record<string, string>>({});

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
              onClick={onDownloadExcel}
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
          <Button
            size="sm"
            onClick={onDownloadExcel}
            className="h-8 gap-1.5 text-xs rounded-xl shrink-0 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            Exporter .xlsx
          </Button>
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
                {param.name}
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
            {Array.from({ length: sampleRows }).map((_, rIdx) => (
              <tr key={rIdx} className="border-b border-border/40 hover:bg-muted/10">
                <td className="p-2 text-center text-muted-foreground bg-muted/20 border-r border-border/40 font-mono">
                  {rIdx + 1}
                </td>
                {schema.columns.map((col, cIdx) => {
                  const isCalculated = Boolean(col.formula || col.formula_en);
                  const key = `${rIdx}-${cIdx}`;
                  return (
                    <td
                      key={cIdx}
                      className={`p-2 border-r border-border/40 font-mono ${
                        isCalculated
                          ? "bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 font-semibold"
                          : "bg-amber-50/40 dark:bg-amber-950/10"
                      }`}
                    >
                      {isCalculated ? (
                        <span className="opacity-80" title={col.formula || ""}>
                          {col.formula || "Calculé"}
                        </span>
                      ) : (
                        <input
                          type="text"
                          value={inputValues[key] ?? ""}
                          onChange={(e) =>
                            setInputValues((prev) => ({ ...prev, [key]: e.target.value }))
                          }
                          placeholder="Saisir..."
                          className="w-full bg-transparent border-0 focus:ring-0 focus:outline-none p-0 text-foreground"
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-2 bg-muted/30 border-t border-border/40 flex justify-between items-center text-[11px] text-muted-foreground">
        <span>
          {schema.columns.length} colonnes ({schema.columns.filter((c) => c.formula).length} calculées)
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
