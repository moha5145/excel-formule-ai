"use client";
import { useRef, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Copy, Check, Wand2, Undo2, Zap, Brain, Key, Download, FileSpreadsheet, FileType, RefreshCw, Code2, Table, Plus, X, Upload } from "lucide-react";
import type { ExportFormat } from "@/lib/excelExport";

export type GenerationMode = "formula_only" | "simple_table" | "complex_table";

interface FileContext {
  fileName: string;
  textRepresentation: string;
}

export const FORMULA_EXAMPLES: { label: string; keywords: string }[] = [
  { label: "Sélectionnez un exemple rapide...", keywords: "" },
  { label: "Mensualité d'un prêt de 250 000€ sur 20 ans à 3.5%", keywords: "mensualité" },
  { label: "Retrouver un prix depuis une liste produit", keywords: "prix" },
  { label: "Prime selon CA et marge avec SI imbriqués", keywords: "prime" },
  { label: "Calculer la TVA à 20% d'un montant HT", keywords: "tva" },
  { label: "Compter les factures impayées de plus de 1000€", keywords: "nb.si" },
  { label: "Somme des ventes de la région Nord depuis le 01/01/2024", keywords: "somme.si" },
  { label: "Extraire l'année fiscale d'une date en cellule B2", keywords: "date" },
  { label: "Convertir des minutes en heures et minutes (ex: 135 -> 2h15)", keywords: "texte" },
  { label: "Trouver le salaire maximum des employés du service Marketing", keywords: "maximum" },
  { label: "Créer une liste déroulante dynamique pour restreindre la saisie", keywords: "validation" },
  { label: "Amortissement linéaire d'une immobilisation sur 5 ans", keywords: "amortissement" },
  { label: "Extraire le mois et l'année d'une date de facture", keywords: "mois" },
  { label: "Chercher le taux de commission selon un palier de CA", keywords: "commission" },
  { label: "Calculer le salaire net (déduire 22% de charges du brut)", keywords: "salaire net" },
  { label: "Compter le nombre de jours ouvrés entre deux dates", keywords: "jours ouvrés" },
  { label: "Calculer un taux de marge commerciale en pourcentage", keywords: "marge" },
  { label: "Déterminer le seuil de rentabilité (point mort en jours)", keywords: "point mort" },
  { label: "Calcul du coût total d'un crédit avec assurance", keywords: "crédit" },
  { label: "Calculer la VNC après 3 ans d'amortissement", keywords: "vnc" },
  { label: "Répartir un budget annuel au prorata des jours du mois", keywords: "prorata" },
];

interface FormulaInputBarProps {
  prompt: string;
  onPromptChange: (val: string) => void;
  loading: boolean;
  enhancing: boolean;
  onGenerate: () => void;
  onEnhance: () => void;
  modelChoice?: "flash" | "pro";
  onModelChange?: (model: "flash" | "pro") => void;
  dailyFreeRemaining?: number | null;
  onRequestKeyModal?: () => void;
  previousPrompt: string;
  onUndoEnhance: () => void;
  apiKey: string;
  onSelectExample?: (example: { label: string; keywords: string }) => void;
  format: ExportFormat;
  onFormatChange: (format: ExportFormat) => void;
  generationMode: GenerationMode;
  onGenerationModeChange: (mode: GenerationMode) => void;
  fileContext: FileContext | null;
  onFileSelect: (file: FileContext | null) => void;
}

export function FormulaInputBar({
  prompt,
  onPromptChange,
  loading,
  enhancing,
  onGenerate,
  onEnhance,
  modelChoice,
  onModelChange,
  dailyFreeRemaining,
  onRequestKeyModal,
  previousPrompt,
  onUndoEnhance,
  apiKey,
  onSelectExample,
  format,
  onFormatChange,
  generationMode,
  onGenerationModeChange,
  fileContext,
  onFileSelect,
}: FormulaInputBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedExampleIndex, setSelectedExampleIndex] = useState(0);
  const [selectedExampleLabel, setSelectedExampleLabel] = useState<string | null>(null);
  const [exampleMenuOpen, setExampleMenuOpen] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);

  const handleFile = useCallback(async (f: File) => {
    setFileError(null);
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!ext || !['xlsx', 'xls', 'csv'].includes(ext)) {
      setFileError('Format accepté : .xlsx, .xls, .csv');
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setFileError('Fichier trop volumineux (max 10 Mo)');
      return;
    }
    setFileLoading(true);
    try {
      const { parseFile } = await import('@/lib/fileParser');
      const result = await parseFile(f);
      onFileSelect({
        fileName: f.name,
        textRepresentation: result.textRepresentation,
      });
    } catch {
      setFileError('Erreur lors de la lecture du fichier');
      onFileSelect(null);
    } finally {
      setFileLoading(false);
    }
  }, [onFileSelect]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (loading) return;
      const f = e.target.files?.[0];
      if (f) handleFile(f);
      // Reset l'input pour permettre de re-sélectionner le même fichier
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [handleFile, loading]
  );

  const handleRemoveFile = useCallback(() => {
    onFileSelect(null);
    setFileError(null);
  }, [onFileSelect]);

  // Auto-resize textarea logic
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [prompt]);

  return (
    <div className="w-full bg-background/90 backdrop-blur-2xl border-t border-border/80 py-3 px-3 sm:py-4 sm:px-6 flex-shrink-0 z-30">
      <div className="max-w-4xl mx-auto flex flex-col gap-2">
        {/* Mode Selector — 2 boutons. L'IA décide seule si le tableau est simple ou complexe
            (voir MODE_OVERRIDE dans route.ts : simple_table→complex_table auto eligibilité). */}
        <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl border border-border/40 text-xs self-start mb-0.5 max-w-full overflow-x-auto">
          <button
            type="button"
            onClick={() => onGenerationModeChange("formula_only")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all text-xs font-medium cursor-pointer whitespace-nowrap ${
              generationMode === "formula_only"
                ? "bg-background text-foreground shadow-xs border border-border/60"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Générer uniquement la formule avec explication (rapide, sans tableau)"
          >
            <Code2 size={13} className={generationMode === "formula_only" ? "text-primary" : ""} />
            <span>Formule seule</span>
          </button>

          <button
            type="button"
            onClick={() => onGenerationModeChange("simple_table")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all text-xs font-medium cursor-pointer whitespace-nowrap ${
              generationMode !== "formula_only"
                ? "bg-background text-foreground shadow-xs border border-border/60"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Formule + tableau d'exemple. L'IA choisit automatiquement un tableau simple ou une simulation complexe selon votre demande."
          >
            <Table size={13} className={generationMode !== "formula_only" ? "text-primary" : ""} />
            <span>Formule + tableau</span>
          </button>
        </div>

        {/* Input area bubble */}
        <div className="relative flex flex-col bg-card border border-border/40 rounded-2xl p-2 sm:p-2.5 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
          {/* Fichier importé : chip au-dessus du textarea */}
          {fileContext && (
            <div className="flex items-center gap-2 mb-1.5 px-1 rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800/50 dark:bg-emerald-950/20 py-1">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="flex-1 truncate text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                {fileContext.fileName}
              </span>
              <button
                type="button"
                onClick={handleRemoveFile}
                className="rounded p-0.5 text-emerald-500 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors shrink-0"
                title="Retirer le fichier"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {fileError && (
            <div className="flex items-center gap-1.5 px-3 py-0.5 mb-1 text-[11px] text-destructive">
              <X className="h-3 w-3 shrink-0" />
              {fileError}
            </div>
          )}
          <textarea
            id="prompt-input"
            ref={textareaRef}
            placeholder="Ex: Si la cellule A1 est supérieure à 1000, appliquer une remise de 10% (A1*0.1), sinon 0."
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value.slice(0, 3000))}
            className="w-full bg-transparent border-0 text-foreground text-sm sm:text-base py-1 px-2 sm:px-3 focus:outline-none focus:ring-0 resize-none min-h-[40px] sm:min-h-[44px] max-h-[120px] sm:max-h-[160px] placeholder:text-muted-foreground overflow-y-auto textarea-autosize"
            rows={1}
            aria-label="Description de la formule à générer"
          />

          <div className="flex flex-wrap items-center justify-between mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-border/60 px-0.5 sm:px-1 gap-1.5 sm:gap-2">
            {/* Left actions: Upload, Model choice, Format, Enhance */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Bouton d'upload fichier Excel intégré */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading || fileLoading}
                className={`h-8 w-9 sm:w-auto sm:px-2 rounded-lg border border-border/60 text-[11px] font-medium flex items-center justify-center gap-1 transition-all shrink-0 ${
                  fileContext
                    ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50 text-emerald-600 dark:text-emerald-400"
                    : `text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-muted/30 ${(loading || fileLoading) ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`
                }`}
                title={fileContext ? "Fichier chargé — cliquer pour changer" : "Joindre un fichier Excel (.xlsx, .csv)"}
                disabled={loading || fileLoading}
              >
                {fileLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                {fileContext && (
                  <span className="hidden sm:inline text-xs truncate max-w-[80px]">{fileContext.fileName}</span>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleFileChange}
                disabled={loading || fileLoading}
              />
              <div className="flex items-center gap-1 bg-muted/80 border border-border p-0.5 rounded-lg text-xs">
                <select
                  value={format}
                  onChange={(e) => onFormatChange(e.target.value as ExportFormat)}
                  className="bg-transparent text-foreground text-xs py-1 px-1.5 focus:outline-none cursor-pointer rounded"
                  title="Format de formule et séparateurs"
                >
                  <option value="excel-en" className="bg-background">Excel EN</option>
                  <option value="excel-fr" className="bg-background">Excel FR</option>
                  <option value="libreoffice-en" className="bg-background">LibreOffice EN</option>
                  <option value="libreoffice-fr" className="bg-background">LibreOffice FR</option>
                  <option value="sheets-en" className="bg-background">Sheets EN</option>
                  <option value="sheets-fr" className="bg-background">Sheets FR</option>
                </select>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onEnhance}
                disabled={enhancing || loading || !prompt.trim()}
                className="h-8 text-[11px] text-primary hover:text-yellow-400 hover:bg-primary/10 rounded-lg px-2 flex items-center gap-1 cursor-pointer focus-visible:outline-none sm:px-2 px-0 sm:w-auto w-8 justify-center"
                aria-label="Améliorer la demande en langage naturel"
              >
                {enhancing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                <span className="hidden sm:inline">Améliorer</span>
              </Button>

              {previousPrompt && previousPrompt !== prompt && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onUndoEnhance}
                  className="text-muted-foreground hover:text-foreground text-[11px] h-8 px-2 hover:bg-muted rounded-lg flex items-center gap-1 cursor-pointer"
                  aria-label="Annuler l'amélioration du prompt"
                >
                  <Undo2 className="w-3 h-3" /> Annuler
                </Button>
              )}
            </div>

            {/* Right actions: Char count & Send button */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* SELECT EXEMPLES */}
              {onSelectExample && (
                <div className="relative w-8 sm:w-48">
                  <select
                    className="hidden sm:block w-full h-8 bg-transparent text-[11px] text-muted-foreground hover:text-foreground border border-border/60 rounded-lg px-2 pr-6 appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/50 transition-colors truncate"
                    value={selectedExampleIndex}
                    onChange={(e) => {
                      const idx = Number(e.target.value);
                      if (idx > 0) {
                        const example = FORMULA_EXAMPLES[idx];
                        onSelectExample(example);
                        setSelectedExampleLabel(example.label);
                        setSelectedExampleIndex(0);
                      }
                    }}
                  >
                    <option value={0} disabled className="bg-background">
                      {selectedExampleLabel || "Exemples"}
                    </option>
                    {FORMULA_EXAMPLES.slice(1).map((ex, i) => (
                      <option key={i} value={i + 1} className="bg-background text-foreground truncate">{ex.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setExampleMenuOpen((open) => !open)}
                    className="sm:hidden w-8 h-8 rounded-lg border border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60 flex items-center justify-center cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/50"
                    aria-label="Sélectionner un exemple rapide"
                    aria-expanded={exampleMenuOpen}
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 6h16" />
                      <path d="M4 12h16" />
                      <path d="M4 18h10" />
                    </svg>
                  </button>
                  {exampleMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40 bg-black/50"
                        onClick={() => setExampleMenuOpen(false)}
                        aria-hidden="true"
                      />
                      <div className="fixed inset-x-0 bottom-20 z-50 mx-4 max-h-72 overflow-y-auto rounded-xl border border-border bg-background p-1 shadow-2xl">
                        {FORMULA_EXAMPLES.slice(1).map((ex, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => {
                              onSelectExample(ex);
                              setSelectedExampleLabel(ex.label);
                              setSelectedExampleIndex(0);
                              setExampleMenuOpen(false);
                            }}
                            className="w-full rounded-lg px-3 py-2 text-left text-xs text-foreground hover:bg-muted hover:text-foreground"
                          >
                            {ex.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
              <span className={`text-[10px] hidden sm:inline ${prompt.length >= 2700 ? "text-red-400 font-semibold animate-pulse" : "text-muted-foreground"}`}>
                {prompt.length}/3000
              </span>

              {/* Submit button */}
              <Button
                onClick={onGenerate}
                disabled={loading || !prompt.trim()}
                className="bg-primary hover:bg-primary/90 text-white rounded-xl h-8 sm:h-9 px-3 sm:px-4 text-xs sm:text-sm font-medium shadow-md hover:shadow-lg transition-all active:scale-95 cursor-pointer focus-visible:outline-none flex items-center justify-center gap-1.5"
                aria-label="Générer la formule Excel"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4 fill-white" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Shortcuts info - hidden on mobile */}
        <p className="hidden sm:block text-center text-[10px] text-muted-foreground mt-1 select-none">
          Raccourcis : <kbd className="bg-muted px-1.5 py-0.5 rounded border border-border text-muted-foreground font-mono">Ctrl+Entrée</kbd> pour générer · <kbd className="bg-muted px-1.5 py-0.5 rounded border border-border text-muted-foreground font-mono">Ctrl+Maj+E</kbd> pour améliorer
        </p>
      </div>
    </div>
  );
}

interface FormulaResultAreaProps {
  response: string;
  loading: boolean;
  copied: boolean;
  onCopy: () => void;
  onDownload: () => void;
  onDownloadExcel: () => void;
  onRegenerate: (promptOverride?: string) => void;
  generationMode?: GenerationMode;
}

export function FormulaResultArea({
  response,
  loading,
  copied,
  onCopy,
  onDownload,
  onDownloadExcel,
  onRegenerate,
  generationMode = "formula_only",
}: FormulaResultAreaProps) {
  const resultRef = useRef<HTMLDivElement>(null);

  // Auto scroll to results when loaded or updated
  useEffect(() => {
    if (response && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [response]);

  return (
    <div ref={resultRef} className="w-full flex flex-col gap-3 animate-in fade-in duration-300">
      <div className="flex items-start gap-2 sm:gap-3 p-3 bg-muted/40 rounded-xl border border-border/50">
        <span className="text-yellow-500 text-sm flex-shrink-0">⚠️</span>
        <p className="text-[10px] sm:text-[11px] text-muted-foreground leading-relaxed">
          <span className="text-foreground font-medium">Vérifiez avant d'utiliser en production.</span>{" "}
          Les formules générées par IA peuvent contenir des erreurs. Testez toujours sur un jeu de données réel avant de l'intégrer à vos fichiers officiels.
        </p>
      </div>

      {response.includes("<!-- TABLE_SCHEMA:") && (
        <div className="flex items-start gap-2 sm:gap-3 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-xl border border-blue-200 dark:border-blue-900/50">
          <span className="text-blue-500 text-sm flex-shrink-0">🔍</span>
          <p className="text-[10px] sm:text-[11px] text-muted-foreground leading-relaxed">
            <span className="text-foreground font-medium">Tableau complexe généré — une colonne manque ?</span>{" "}
            Cliquez sur{" "}
            <span className="text-foreground font-medium">Régénérer</span>
            {" "}— l'IA peut parfois omettre une ou deux colonnes (ici, l'IA a elle-même jugé la demande trop riche pour un tableau simple et est passée en mode complexe). Une nouvelle génération donne généralement toutes les colonnes attendues.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:flex sm:flex-nowrap gap-2 w-full">
        <Button
          variant="outline"
          onClick={() => onRegenerate()}
          disabled={loading}
          className="min-w-0 border-primary/30 bg-primary/5 hover:bg-primary/15 hover:border-primary/50 active:scale-95 text-primary rounded-xl transition-all h-9 px-2 sm:px-3 text-[11px] sm:text-xs cursor-pointer focus-visible:outline-none sm:flex-1"
          title="Régénérer avec le même prompt"
        >
          <RefreshCw size={14} className={`mr-1 sm:mr-1.5 flex-shrink-0 ${loading ? "animate-spin" : ""}`} /> Régénérer
        </Button>
        <Button
          variant="outline"
          onClick={onCopy}
          className={`min-w-0 border-border rounded-xl transition-all h-9 px-2 sm:px-3 text-[11px] sm:text-xs cursor-pointer focus-visible:outline-none sm:flex-1 ${
            generationMode === "formula_only"
              ? "bg-primary text-primary-foreground hover:bg-primary/90 border-primary font-medium"
              : "bg-btn-outline-bg hover:bg-btn-outline-hover text-foreground"
          }`}
        >
          {copied ? (
            <><Check size={14} className={generationMode === "formula_only" ? "text-white mr-1 sm:mr-1.5 flex-shrink-0" : "text-green-500 mr-1 sm:mr-1.5 flex-shrink-0"} /> Copié</>
          ) : (
            <><Copy size={14} className="mr-1 sm:mr-1.5 flex-shrink-0" /> Copier la formule</>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={onDownload}
          className="min-w-0 border-border bg-btn-outline-bg hover:bg-btn-outline-hover active:scale-95 text-foreground rounded-xl transition-all h-9 px-2 sm:px-3 text-[11px] sm:text-xs cursor-pointer focus-visible:outline-none sm:flex-1"
          title="Télécharger la réponse (.txt)"
        >
          <Download size={14} className="mr-1 sm:mr-1.5 flex-shrink-0" /> Explication
        </Button>
        {generationMode !== "formula_only" && (
          <Button
            variant="outline"
            onClick={onDownloadExcel}
            className="min-w-0 border-green-300 dark:border-green-900/50 bg-green-50 dark:bg-emerald-950/20 hover:bg-green-100 dark:hover:bg-emerald-900/30 hover:border-green-400 dark:hover:border-emerald-700 active:scale-95 text-green-700 dark:text-emerald-400 rounded-xl transition-all h-9 px-2 sm:px-3 text-[11px] sm:text-xs cursor-pointer focus-visible:outline-none sm:flex-1"
            title="Télécharger l'exemple Excel (.xlsx)"
          >
            <FileSpreadsheet size={14} className="mr-1 sm:mr-1.5 text-green-600 dark:text-emerald-500 flex-shrink-0" /> Excel
          </Button>
        )}
      </div>
    </div>
  );
}
