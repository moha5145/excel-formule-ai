"use client";

import { useMemo } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ParsedSheet, ColumnStat } from "@/lib/fileParser";
import {
  FileSpreadsheet,
  ShieldCheck,
  Eye,
  EyeOff,
  Hash,
  Calendar,
  Type,
  HelpCircle,
  Layers,
  CheckCircle2,
} from "lucide-react";

interface FilePreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  fileSize?: number;
  sheets: ParsedSheet[];
  columnStats?: Record<string, ColumnStat[]>;
  activeSheetName: string;
  onSelectActiveSheet: (sheetName: string) => void;
  excludedColumns: string[];
  onToggleColumnExclusion: (columnName: string) => void;
  onResetExclusions: () => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return "0 Ko";
  const k = 1024;
  const sizes = ["Octets", "Ko", "Mo", "Go"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function TypeBadge({ type }: { type?: ColumnStat["type"] }) {
  switch (type) {
    case "number":
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100/80 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
          <Hash size={10} /> Nombre
        </span>
      );
    case "date":
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100/80 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
          <Calendar size={10} /> Date
        </span>
      );
    case "text":
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100/80 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
          <Type size={10} /> Texte
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
          <HelpCircle size={10} /> Auto
        </span>
      );
  }
}

export function FilePreviewModal({
  open,
  onOpenChange,
  fileName,
  fileSize,
  sheets,
  columnStats,
  activeSheetName,
  onSelectActiveSheet,
  excludedColumns,
  onToggleColumnExclusion,
  onResetExclusions,
}: FilePreviewModalProps) {
  const currentSheet = useMemo(() => {
    return sheets.find((s) => s.name === activeSheetName) || sheets[0] || {
      name: "Feuille",
      headers: [],
      rows: [],
      totalRows: 0,
      totalCols: 0,
    };
  }, [sheets, activeSheetName]);

  const currentStats = useMemo(() => {
    return columnStats?.[currentSheet.name] || currentSheet.stats || [];
  }, [columnStats, currentSheet]);

  const excludedSet = useMemo(() => {
    return new Set(excludedColumns.map((c) => c.toLowerCase().trim()));
  }, [excludedColumns]);

  const totalExcludedInSheet = currentSheet.headers.filter((h) =>
    excludedSet.has(h.toLowerCase().trim())
  ).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-[calc(100%-2rem)] sm:max-w-4xl max-h-[90vh] flex flex-col p-4 sm:p-6 bg-card border border-border/80 shadow-2xl rounded-2xl overflow-hidden">
        <DialogTitle className="sr-only">Aperçu du fichier {fileName}</DialogTitle>

        {/* Modal Header */}
        <div className="flex flex-col gap-2 pb-3 border-b border-border/60">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-base text-foreground truncate">
                  {fileName}
                </h3>
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <span>{formatBytes(fileSize)}</span>
                  <span>•</span>
                  <span>{sheets.length} feuille{sheets.length > 1 ? "s" : ""}</span>
                  <span>•</span>
                  <span>{currentSheet.totalRows} lignes au total</span>
                </p>
              </div>
            </div>

            {totalExcludedInSheet > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onResetExclusions}
                className="h-8 text-xs text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
              >
                Réinitialiser les masquages
              </Button>
            )}
          </div>

          {/* Sélecteur d'onglets pour classeurs multi-feuilles */}
          {sheets.length > 1 && (
            <div className="flex items-center gap-1.5 pt-2 overflow-x-auto">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mr-1 shrink-0 font-medium">
                <Layers size={13} />
                <span>Feuille active :</span>
              </div>
              {sheets.map((sheet) => {
                const isActive = sheet.name === currentSheet.name;
                return (
                  <button
                    key={sheet.name}
                    type="button"
                    onClick={() => onSelectActiveSheet(sheet.name)}
                    className={`px-3 py-1.5 text-xs rounded-xl font-medium transition-all shrink-0 cursor-pointer ${
                      isActive
                        ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                        : "bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/40"
                    }`}
                  >
                    {sheet.name} ({sheet.totalRows} lignes)
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Bannière de confidentialité */}
        <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200">
          <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong className="font-semibold">Contrôle de confidentialité :</strong> Cliquez sur{" "}
            <span className="inline-flex items-center gap-0.5 font-medium underline">
              <EyeOff size={11} /> Masquer
            </span>{" "}
            sur les colonnes de votre choix pour remplacer leurs valeurs par{" "}
            <code className="bg-amber-500/20 px-1 py-0.5 rounded text-[11px] font-mono">[CONFIDENTIEL]</code> dans le
            prompt envoyé à Gemini.
          </p>
        </div>

        {/* Grille de prévisualisation tabulaire */}
        <div className="flex-1 overflow-auto border border-border/60 rounded-xl my-1 bg-background shadow-inner">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-muted/90 backdrop-blur sticky top-0 z-10 border-b border-border">
              <tr>
                <th className="p-2.5 w-12 text-center text-muted-foreground border-r border-border/50 font-mono">
                  #
                </th>
                {currentSheet.headers.map((h, colIdx) => {
                  const isExcluded = excludedSet.has(h.toLowerCase().trim());
                  const stat = currentStats[colIdx];
                  return (
                    <th
                      key={`${h}-${colIdx}`}
                      className={`p-2.5 border-r border-border/50 font-medium transition-colors ${
                        isExcluded ? "bg-amber-500/10 dark:bg-amber-950/20" : ""
                      }`}
                    >
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`font-semibold truncate max-w-[150px] ${
                              isExcluded
                                ? "line-through text-amber-700 dark:text-amber-400 opacity-75"
                                : "text-foreground"
                            }`}
                            title={h}
                          >
                            {h || `Colonne ${colIdx + 1}`}
                          </span>
                          <button
                            type="button"
                            onClick={() => onToggleColumnExclusion(h)}
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                              isExcluded
                                ? "bg-amber-200/80 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200"
                                : "bg-muted text-muted-foreground hover:text-foreground"
                            }`}
                            title={isExcluded ? "Rétablir la colonne" : "Masquer les données de cette colonne"}
                          >
                            {isExcluded ? (
                              <>
                                <EyeOff size={11} /> Masqué
                              </>
                            ) : (
                              <>
                                <Eye size={11} /> Visible
                              </>
                            )}
                          </button>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <TypeBadge type={stat?.type} />
                          {stat && stat.nullCount > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              {stat.nullCount} vide{stat.nullCount > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {currentSheet.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={Math.max(1, currentSheet.headers.length + 1)}
                    className="p-8 text-center text-muted-foreground text-xs"
                  >
                    Aucune ligne de données détectée dans cette feuille.
                  </td>
                </tr>
              ) : (
                currentSheet.rows.slice(0, 15).map((row, rIdx) => (
                  <tr
                    key={rIdx}
                    className="border-b border-border/40 hover:bg-muted/30 transition-colors"
                  >
                    <td className="p-2 text-center text-muted-foreground/70 font-mono text-[11px] border-r border-border/40 bg-muted/20">
                      {rIdx + 1}
                    </td>
                    {currentSheet.headers.map((h, cIdx) => {
                      const isExcluded = excludedSet.has(h.toLowerCase().trim());
                      const cellVal = row[cIdx];
                      return (
                        <td
                          key={cIdx}
                          className={`p-2 border-r border-border/40 font-mono text-[11px] max-w-[200px] truncate ${
                            isExcluded
                              ? "bg-amber-500/5 text-amber-700 dark:text-amber-400 italic"
                              : "text-foreground/90"
                          }`}
                        >
                          {isExcluded ? (
                            <span className="opacity-70">[CONFIDENTIEL]</span>
                          ) : cellVal === null || cellVal === undefined || cellVal === "" ? (
                            <span className="text-muted-foreground/40 italic">vide</span>
                          ) : (
                            String(cellVal)
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Modal Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-border/60">
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <CheckCircle2 size={14} className="text-emerald-500" />
            <span>
              {currentSheet.headers.length - totalExcludedInSheet}/{currentSheet.headers.length} colonnes
              visibles pour l&apos;IA
            </span>
            {totalExcludedInSheet > 0 && (
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                ({totalExcludedInSheet} masquée{totalExcludedInSheet > 1 ? "s" : ""})
              </span>
            )}
          </div>

          <Button
            onClick={() => onOpenChange(false)}
            size="sm"
            className="w-full sm:w-auto rounded-xl px-5 cursor-pointer"
          >
            Valider la sélection
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
