"use client";

import { useMemo, useState } from "react";
import { type TableSchema, validateSchema } from "@/lib/excelExport/schemaParser";
import { FileSpreadsheet, Plus, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ComplexTablePreviewProps {
  rawSchema: unknown;
  onDownloadExcel: () => void;
}

export function ComplexTablePreview({ rawSchema, onDownloadExcel }: ComplexTablePreviewProps) {
  const schema = useMemo<TableSchema | null>(() => {
    try {
      return validateSchema(rawSchema);
    } catch {
      return null;
    }
  }, [rawSchema]);

  const [sampleRows, setSampleRows] = useState<number>(() => schema?.sample_rows || 3);
  const [paramValues, setParamValues] = useState<Record<number, string>>(() =>
    Object.fromEntries((schema?.parameters || []).map((p, i) => [i, String(p.value ?? "")]))
  );
  const [inputValues, setInputValues] = useState<Record<string, string>>({});

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
        <Button size="sm" onClick={onDownloadExcel} className="h-8 gap-1.5 text-xs rounded-xl shrink-0 cursor-pointer">
          <Download className="h-3.5 w-3.5" />
          Exporter .xlsx
        </Button>
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
                type={param.type === "number" || param.type === "currency" || param.type === "percentage" || param.type === "integer" ? "number" : "text"}
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
                          onChange={(e) => setInputValues((prev) => ({ ...prev, [key]: e.target.value }))}
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
