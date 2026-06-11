"use client";
import { isValidElement, useRef, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Copy, Check, Sparkles, Wand2, Undo2, Zap, Brain, Key, Download } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Skeleton } from "@/components/ui/skeleton";

interface ExampleItem {
  label: string;
  keywords: string;
}

export const FORMULA_EXAMPLES = [
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
];

const BLOCK_MARKDOWN_TAGS = new Set(["pre", "ul", "ol", "table", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6"]);

function normalizeMarkdownBlocks(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const output: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const isFence = /^\s*```/.test(line);

    if (isFence) {
      const previousLine = output[output.length - 1];
      if (previousLine !== undefined && previousLine.trim() !== "") {
        output.push("");
      }

      output.push(line);

      const nextLine = lines[i + 1];
      if (nextLine !== undefined && nextLine.trim() !== "" && !/^\s*```/.test(nextLine)) {
        output.push("");
      }
    } else {
      output.push(line);
    }
  }

  return output.join("\n");
}

function hasBlockMarkdownChild(children?: ReactNode) {
  const childArray = Array.isArray(children) ? children : children ? [children] : [];
  return childArray.some((child) => isValidElement(child) && typeof child.type === "string" && BLOCK_MARKDOWN_TAGS.has(child.type));
}

interface FormulaInputBarProps {
  prompt: string;
  onPromptChange: (val: string) => void;
  loading: boolean;
  enhancing: boolean;
  onGenerate: () => void;
  onEnhance: () => void;
  modelChoice: "flash" | "pro";
  onModelChange?: (model: "flash" | "pro") => void;
  freeUsesLeft?: number | null;
  onRequestKeyModal?: () => void;
  previousPrompt: string;
  onUndoEnhance: () => void;
  apiKey: string;
  onSelectExample?: (example: { label: string; keywords: string }) => void;
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
  freeUsesLeft,
  onRequestKeyModal,
  previousPrompt,
  onUndoEnhance,
  apiKey,
  onSelectExample,
}: FormulaInputBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [selectedExampleIndex, setSelectedExampleIndex] = useState(0);
  const [exampleMenuOpen, setExampleMenuOpen] = useState(false);
  const isLimitReached = !apiKey && freeUsesLeft !== null && freeUsesLeft !== undefined && freeUsesLeft <= 0;

  // Auto-resize textarea logic
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [prompt]);

  return (
    <div className="w-full bg-slate-950/90 backdrop-blur-2xl border-t border-slate-800/80 py-4 px-6 flex-shrink-0 z-30">
      <div className="max-w-4xl mx-auto flex flex-col gap-2">
        {/* Banner removed: modal will handle it instead */}

        {/* Input area bubble */}
        <div className="relative flex flex-col bg-slate-900/60 border border-slate-700/40 rounded-2xl p-2.5 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
          <textarea
            id="prompt-input"
            ref={textareaRef}
            placeholder="Ex: Si la cellule A1 est supérieure à 1000, appliquer une remise de 10% (A1*0.1), sinon 0."
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value.slice(0, 3000))}
            className="w-full bg-transparent border-0 text-white text-base py-1 px-3 focus:outline-none focus:ring-0 resize-none min-h-[44px] max-h-[160px] placeholder:text-slate-500 overflow-y-auto textarea-autosize"
            rows={1}
            aria-label="Description de la formule à générer"
          />

          <div className="flex flex-wrap items-center justify-between mt-2 pt-2 border-t border-slate-800/60 px-1 gap-2">
            {/* Left actions: Model choice, Enhance */}
            <div className="flex items-center gap-2">
              {apiKey && onModelChange && (
                <div className="flex items-center gap-1 bg-slate-950/80 border border-slate-800 p-0.5 rounded-lg text-xs">
                  <button
                    type="button"
                    onClick={() => onModelChange("flash")}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary ${modelChoice === "flash" ? "bg-primary text-white font-medium shadow-sm" : "text-slate-400 hover:text-white"}`}
                    title="Modèle rapide (Gemini 3.5 Flash)"
                  >
                    <Zap size={11} /> Flash
                  </button>
                  <button
                    type="button"
                    onClick={() => onModelChange("pro")}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary ${modelChoice === "pro" ? "bg-gradient-to-r from-yellow-600 to-yellow-500 text-white font-medium shadow-sm" : "text-slate-400 hover:text-white"}`}
                    title="Modèle expert pour requêtes complexes (Gemini 3.5 Pro)"
                  >
                    <Brain size={11} /> Pro
                  </button>
                </div>
              )}
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
                  className="text-slate-400 hover:text-white text-[11px] h-8 px-2 hover:bg-slate-800/50 rounded-lg flex items-center gap-1 cursor-pointer"
                  aria-label="Annuler l'amélioration du prompt"
                >
                  <Undo2 className="w-3 h-3" /> Annuler
                </Button>
              )}
            </div>

            {/* Right actions: Char count & Send button */}
            <div className="flex items-center gap-3">
              {/* SELECT EXEMPLES */}
              {onSelectExample && (
                <div className="relative w-8 sm:w-48">
                  <select
                    className="hidden sm:block w-full h-8 bg-transparent text-[11px] text-slate-400 hover:text-white border border-slate-800/60 rounded-lg px-2 pr-6 appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/50 transition-colors truncate"
                    value={selectedExampleIndex}
                    onChange={(e) => {
                      const idx = Number(e.target.value);
                      if (idx > 0) {
                         onSelectExample(FORMULA_EXAMPLES[idx]);
                         setSelectedExampleIndex(0);
                      }
                    }}
                  >
                    <option value={0} disabled className="bg-slate-900">Exemples</option>
                    {FORMULA_EXAMPLES.slice(1).map((ex, i) => (
                      <option key={i} value={i + 1} className="bg-slate-900 text-slate-200 truncate">{ex.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setExampleMenuOpen((open) => !open)}
                    className="sm:hidden w-8 h-8 rounded-lg border border-slate-800/60 bg-slate-900/30 text-slate-400 hover:text-white hover:bg-slate-800/60 flex items-center justify-center cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/50"
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
                    <div className="absolute bottom-full right-0 z-50 mb-2 w-64 max-h-72 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-1 shadow-2xl">
                      {FORMULA_EXAMPLES.slice(1).map((ex, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            onSelectExample(ex);
                            setSelectedExampleIndex(0);
                            setExampleMenuOpen(false);
                          }}
                          className="w-full rounded-lg px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
                        >
                          {ex.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {isLimitReached && (
                <button 
                  onClick={onRequestKeyModal} 
                  className="text-[10px] text-red-400 bg-red-950/30 px-2 py-1 rounded-md border border-red-900/50 hover:bg-red-900/50 transition-colors animate-pulse cursor-pointer flex items-center gap-1 sm:px-2 sm:py-1 sm:gap-1 sm:w-auto w-8 h-8 justify-center p-0 sm:p-1"
                >
                  <Key className="h-3.5 w-3.5 sm:hidden" />
                  <span className="hidden sm:inline">Essais épuisés</span>
                </button>
              )}
              <span className={`text-[10px] ${prompt.length >= 2700 ? "text-red-400 font-semibold animate-pulse" : "text-slate-500"}`}>
                {prompt.length}/3000
              </span>

              <Button
                onClick={onGenerate}
                disabled={loading || !prompt.trim()}
                size="icon"
                className="h-8 w-8 bg-primary hover:bg-yellow-600 text-white rounded-lg shadow-md cursor-pointer transition-all disabled:opacity-50 shrink-0"
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

        {/* Shortcuts info */}
        <p className="text-center text-[10px] text-slate-500 mt-1 select-none">
          Raccourcis : <kbd className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 text-slate-400 font-mono">Ctrl+Entrée</kbd> pour générer · <kbd className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 text-slate-400 font-mono">Ctrl+Maj+E</kbd> pour améliorer
        </p>
      </div>
    </div>
  );
}

interface FormulaResultAreaProps {
  response: string;
  loading: boolean;
  isDemoResponse: boolean;
  copied: boolean;
  onCopy: () => void;
  onDownload: () => void;
}

export function FormulaResultArea({
  response,
  loading,
  isDemoResponse,
  copied,
  onCopy,
  onDownload,
}: FormulaResultAreaProps) {
  const resultRef = useRef<HTMLDivElement>(null);

  // Auto scroll to results when loaded or updated
  useEffect(() => {
    if (response && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [response]);

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-6 p-4 md:p-6 animate-in fade-in duration-500">
      {/* Skeleton Loading State */}
      {loading && !response && (
        <div className="bg-slate-900/60 backdrop-blur-xl rounded-3xl border border-slate-800/80 p-8 shadow-xl flex flex-col gap-4 animate-in fade-in duration-300">
          <div className="flex items-center gap-2 mb-1">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-sm text-slate-400 font-medium">Rédaction de la formule...</span>
          </div>
          <Skeleton className="h-4 w-3/4 bg-slate-800" />
          <Skeleton className="h-4 w-full bg-slate-800" />
          <Skeleton className="h-24 w-full bg-slate-800/50 rounded-xl" />
          <Skeleton className="h-4 w-1/2 bg-slate-800" />
        </div>
      )}

      {/* Résultat Gemini */}
      {response && (
        <div 
          ref={resultRef} 
          className="bg-slate-900/80 backdrop-blur-xl rounded-3xl border border-primary/20 p-6 md:p-8 shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-500"
        >
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent opacity-70" />

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <h3 className="text-primary font-semibold text-lg md:text-xl flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Résultat &amp; Explication
              {isDemoResponse && (
                <span className="text-xs font-normal bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded-full ml-2">
                  Aperçu démo
                </span>
              )}
            </h3>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                onClick={onCopy}
                className="flex-1 sm:flex-initial border-slate-700 bg-slate-800/50 hover:bg-slate-700 active:scale-95 text-white rounded-xl transition-all h-9 px-3 text-xs cursor-pointer focus-visible:outline-none"
              >
                {copied ? (
                  <><Check size={14} className="text-green-500 mr-1.5" /> Copié</>
                ) : (
                  <><Copy size={14} className="mr-1.5" /> Copier la formule</>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={onDownload}
                className="flex-1 sm:flex-initial border-slate-700 bg-slate-800/50 hover:bg-slate-700 active:scale-95 text-white rounded-xl transition-all h-9 px-3 text-xs cursor-pointer focus-visible:outline-none"
                title="Télécharger la réponse (.txt)"
              >
                <Download size={14} className="mr-1.5" /> Télécharger
              </Button>
            </div>
          </div>

          <div className="prose prose-invert prose-p:text-slate-350 prose-a:text-primary hover:prose-a:text-yellow-400 prose-strong:text-white prose-li:text-slate-300 max-w-none text-sm md:text-base leading-relaxed">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p({ children }: { children?: ReactNode }) {
                  if (hasBlockMarkdownChild(children)) {
                    return <>{children}</>;
                  }
                  return <p>{children}</p>;
                },
                code({ inline, className, children }: { inline?: boolean; className?: string; children?: ReactNode }) {
                  return !inline ? (
                    <pre className="p-4 md:p-5 my-5 overflow-x-auto bg-slate-950/85 border border-slate-800/80 rounded-2xl text-yellow-300 font-mono text-sm md:text-base shadow-inner">
                      <code className={className}>{children}</code>
                    </pre>
                  ) : (
                    <code className="bg-slate-800 text-yellow-250 px-1.5 py-0.5 rounded-md text-xs font-mono" {...{} }>
                      {children}
                    </code>
                  );
                },
              }}
            >
              {normalizeMarkdownBlocks(response)}
            </ReactMarkdown>
          </div>

          {!isDemoResponse && (
            <div className="mt-6 flex items-start gap-3 p-4 bg-slate-800/40 rounded-2xl border border-slate-700/50">
              <span className="text-yellow-500 text-base flex-shrink-0">⚠️</span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                <span className="text-slate-300 font-medium">Vérifiez avant d'utiliser en production.</span>{" "}
                Les formules générées par IA peuvent contenir des erreurs. Testez toujours sur un jeu de données réel avant de l'intégrer à vos fichiers comptables officiels.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
