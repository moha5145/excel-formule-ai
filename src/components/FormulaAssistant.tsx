"use client";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Copy, Check, Sparkles, Wand2, Undo2, Zap, Brain, Key, Download } from "lucide-react";
import { toast } from "sonner";
import { findDemoResponse } from "@/lib/demoResponses";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { Skeleton } from "@/components/ui/skeleton";

interface HistoryItem {
  prompt: string;
  response: string;
}

export function FormulaAssistant({
  apiKey,
  freeUsesLeft,
  onGenerateSuccess,
  modelChoice,
  onModelChange,
  onRequestKeyModal,
  onRestoreItem,
}: {
  apiKey: string;
  freeUsesLeft?: number | null;
  onGenerateSuccess?: () => void;
  modelChoice: "flash" | "pro";
  onModelChange?: (model: "flash" | "pro") => void;
  onRequestKeyModal?: () => void;
  onRestoreItem?: (setter: (item: HistoryItem) => void) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [response, setResponse] = useState("");
  const [copied, setCopied] = useState(false);
  const [isDemoResponse, setIsDemoResponse] = useState(false);
  const [previousPrompt, setPreviousPrompt] = useState("");
  const [, setHistory] = useLocalStorage<HistoryItem[]>("excel_compta_history", []);
  const resultRef = useRef<HTMLDivElement>(null);

  // Callback for sidebar to restore a history item into this component
  useEffect(() => {
    if (onRestoreItem) {
      onRestoreItem((item: HistoryItem) => {
        setPrompt(item.prompt);
        setResponse(item.response);
        setIsDemoResponse(false);
      });
    }
  }, [onRestoreItem]);

  const handleEnhance = async () => {
    if (!prompt.trim() || enhancing || loading) return;
    setPreviousPrompt(prompt);
    setIsDemoResponse(false);
    setEnhancing(true);
    try {
      const res = await fetch("/api/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, apiKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPrompt(data.result);
      if (onGenerateSuccess) onGenerateSuccess();
      toast.success("Demande améliorée avec succès !");
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de l'amélioration.");
    } finally {
      setEnhancing(false);
    }
  };

  const hasScrolledRef = useRef(false);

  useEffect(() => {
    if (loading) {
      hasScrolledRef.current = false;
    }
  }, [loading]);

  useEffect(() => {
    if (response && resultRef.current && !hasScrolledRef.current) {
      hasScrolledRef.current = true;
      resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [response]);

  const handleGenerate = async () => {
    if (!prompt.trim() || loading) return;
    if (!apiKey && freeUsesLeft !== null && freeUsesLeft !== undefined && freeUsesLeft <= 0) {
      if (onRequestKeyModal) onRequestKeyModal();
      return;
    }
    setLoading(true);
    setResponse("");
    setIsDemoResponse(false);
    try {
      const res = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, apiKey, modelChoice }),
      });
      
      if (!res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await res.json();
          throw new Error(data.error);
        } else {
          throw new Error("Erreur serveur lors de la génération.");
        }
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Le flux de réponse est indisponible.");

      const decoder = new TextDecoder();
      let streamResponse = "";
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        streamResponse += chunk;
        setResponse(streamResponse);
      }

      setHistory((prev) => {
        const filtered = prev.filter((item) => item.prompt !== prompt);
        return [{ prompt, response: streamResponse }, ...filtered].slice(0, 10);
      });
      if (onGenerateSuccess) onGenerateSuccess();
    } catch (err: any) {
      if (!apiKey) {
        const demoResult = findDemoResponse(prompt);
        if (demoResult) {
          setResponse(demoResult);
          setIsDemoResponse(true);
          setHistory((prev) => {
            const filtered = prev.filter((item) => item.prompt !== prompt);
            return [{ prompt, response: demoResult }, ...filtered].slice(0, 10);
          });
        } else {
          setResponse("Veuillez entrer votre clé API (panneau gauche) pour utiliser l'assistant sur cette requête.");
        }
        if (onGenerateSuccess) onGenerateSuccess();
      } else {
        toast.error(err.message || "Une erreur est survenue.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    const formulaMatch = response.match(/```(?:excel)?\n?([\s\S]*?)\n?```/);
    const textToCopy = formulaMatch ? formulaMatch[1].trim() : response;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Formule copiée dans le presse-papier !");
  };

  const handleDownload = () => {
    if (!response) return;
    const blob = new Blob([response], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `formule-excel-compta-ai-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Fichier de formule téléchargé !");
  };

  // Keyboard Shortcuts (Ctrl+Enter / Cmd+Enter to generate, Ctrl+Shift+E / Cmd+Shift+E to enhance)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleGenerate();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "E" || e.key === "e")) {
        e.preventDefault();
        handleEnhance();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [prompt, apiKey, modelChoice, freeUsesLeft, loading, enhancing]);

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-card/60 backdrop-blur-xl rounded-3xl border border-border/50 p-8 shadow-[0_8px_30px_rgb(0,0,0,0.12)] transition-all focus-within:border-primary/30 focus-within:shadow-primary/10">
        {/* Label + Améliorer */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-3 gap-3 sm:gap-0">
          <label htmlFor="prompt-input" className="text-base font-medium text-slate-300 flex items-center gap-2">
            <Sparkles size={18} className="text-primary" />
            Que souhaitez-vous calculer ou extraire ?
            {freeUsesLeft !== undefined && freeUsesLeft !== null && (
              <span className="ml-2 text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full border border-primary/30">
                {freeUsesLeft} essai(s) gratuit(s)
              </span>
            )}
          </label>
          <div className="flex items-center gap-2">
            {apiKey && onModelChange && (
              <div className="flex items-center gap-1 bg-slate-900/60 border border-slate-700/50 p-0.5 rounded-lg text-xs mr-1 animate-in fade-in duration-300">
                <button
                  type="button"
                  onClick={() => onModelChange("flash")}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary ${modelChoice === "flash" ? "bg-primary text-white font-medium shadow-sm" : "text-slate-400 hover:text-white"}`}
                  title="Modèle rapide (Gemini 3.5 Flash)"
                >
                  <Zap size={12} /> Flash
                </button>
                <button
                  type="button"
                  onClick={() => onModelChange("pro")}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary ${modelChoice === "pro" ? "bg-gradient-to-r from-yellow-600 to-yellow-500 text-white font-medium shadow-sm" : "text-slate-400 hover:text-white"}`}
                  title="Modèle expert pour requêtes complexes (Gemini 3.5 Pro)"
                >
                  <Brain size={12} /> Pro
                </button>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleEnhance}
              disabled={enhancing || loading || !prompt.trim()}
              className="h-8 text-xs text-primary hover:text-yellow-400 hover:bg-primary/10 rounded-lg px-3 -ml-2 sm:ml-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              aria-label="Améliorer la demande en langage naturel"
            >
              {enhancing ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Wand2 className="mr-2 h-3 w-3" />}
              Améliorer ma demande
            </Button>
          </div>
        </div>

        <Textarea
          id="prompt-input"
          placeholder="Ex: Si la cellule A1 est supérieure à 1000, appliquer une remise de 10% (A1*0.1), sinon 0."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value.slice(0, 3000))}
          className="min-h-[140px] bg-slate-900/40 border-slate-700/50 text-white text-lg rounded-2xl p-4 resize-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary/50 placeholder:text-slate-500"
          aria-label="Description de la formule à générer"
        />

        {/* Info & Caractère compteur */}
        <div className="flex justify-between items-center mt-2 mb-4 px-1 text-slate-500 text-[10px]">
          <span>
            Raccourcis : <kbd className="bg-slate-800 px-1 py-0.5 rounded text-slate-400">Ctrl+Entrée</kbd> pour générer · <kbd className="bg-slate-800 px-1 py-0.5 rounded text-slate-400">Ctrl+Maj+E</kbd> pour améliorer
          </span>
          <span className={`text-xs ${prompt.length >= 2700 ? "text-red-400 font-semibold animate-pulse" : "text-slate-600"}`}>
            {prompt.length}/3000
          </span>
        </div>

        {/* Bouton Undo */}
        {previousPrompt && previousPrompt !== prompt && (
          <div className="flex justify-end mb-4 animate-in fade-in slide-in-from-top-1 duration-200">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setPrompt(previousPrompt); setPreviousPrompt(""); }}
              className="text-slate-400 hover:text-white text-xs h-7 px-2 hover:bg-slate-800/50 rounded-lg flex items-center gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Annuler l'amélioration du prompt"
            >
              <Undo2 className="w-3.5 h-3.5" /> Annuler l'amélioration
            </Button>
          </div>
        )}

        {/* Exemples rapides */}
        <div className="flex flex-wrap gap-2 mb-6">
          <span className="text-sm text-slate-400 py-1 mr-1">Exemples :</span>
          {[
            { label: "Mensualité d'un prêt de 250 000€ sur 20 ans à 3.5%", keywords: "mensualité prêt" },
            { label: "Retrouver un prix depuis une liste produit", keywords: "prix produit recherche" },
            { label: "Prime selon CA et marge avec SI imbriqués", keywords: "prime si condition marge" },
            { label: "Calculer la TVA à 20% d'un montant HT", keywords: "tva taxe" },
            { label: "Compter les factures impayées de plus de 1000€", keywords: "nb.si compter" },
            { label: "Somme des ventes de la région Nord depuis le 01/01/2024", keywords: "somme.si sommer" },
          ].map((example, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                const demoResult = findDemoResponse(example.keywords);
                setPrompt(example.label);
                if (demoResult) {
                  setResponse(demoResult);
                  setIsDemoResponse(true);
                }
              }}
              className="text-xs bg-slate-800/80 hover:bg-primary/20 hover:border-primary/40 hover:text-primary text-slate-300 border border-slate-700 rounded-full px-3 py-1.5 transition-all text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              title={example.label}
              aria-label={`Remplir avec l'exemple : ${example.label}`}
            >
              {example.label}
            </button>
          ))}
        </div>

        {/* Banner if no uses left */}
        {!apiKey && freeUsesLeft !== undefined && freeUsesLeft !== null && freeUsesLeft <= 0 && (
          <div className="mb-6 p-4 rounded-xl border border-primary/30 bg-primary/10 flex items-start gap-4 animate-in fade-in zoom-in-95 duration-300">
            <div className="p-2 rounded-lg bg-primary/20 text-primary">
              <Key size={20} />
            </div>
            <div className="flex-1">
              <h4 className="text-white font-medium mb-1">Vos essais gratuits sont épuisés !</h4>
              <p className="text-sm text-slate-400 leading-relaxed mb-3">
                Pour continuer à utiliser Excel-Compta AI de manière illimitée, veuillez ajouter votre clé API Gemini (100% gratuite et privée).
              </p>
              <div className="text-xs text-slate-300 bg-slate-900/50 p-3 rounded-lg border border-slate-700 flex items-center justify-between">
                <span>Cliquez sur le bouton pour configurer votre clé.</span>
                <Button size="sm" onClick={onRequestKeyModal} className="h-8 px-4 text-xs bg-primary hover:bg-yellow-600 text-white cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Ajouter ma clé</Button>
              </div>
            </div>
          </div>
        )}

        <Button
          onClick={handleGenerate}
          disabled={loading || !prompt.trim() || (!apiKey && freeUsesLeft !== null && freeUsesLeft !== undefined && freeUsesLeft <= 0)}
          className="w-full bg-primary hover:bg-yellow-600 text-white rounded-2xl h-14 text-lg font-medium transition-all shadow-lg shadow-primary/20 hover:shadow-primary/40 disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          aria-label="Générer la formule Excel"
        >
          {loading ? (
            <><Loader2 className="mr-3 h-5 w-5 animate-spin" /> Génération en cours...</>
          ) : (
            "Générer la Formule Magique"
          )}
        </Button>
      </div>

      {/* Skeleton Loading State */}
      {loading && !response && (
        <div className="bg-slate-900/60 backdrop-blur-xl rounded-3xl border border-slate-800/80 p-8 shadow-xl flex flex-col gap-4 animate-in fade-in duration-300 mt-2">
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
        <div ref={resultRef} className="bg-slate-900/80 backdrop-blur-xl rounded-3xl border border-primary/20 p-8 shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-500 mt-2 scroll-mt-24">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent opacity-70" />

          <div className="flex justify-between items-start mb-6">
            <h3 className="text-primary font-semibold text-xl flex items-center gap-2">
              Résultat &amp; Explication
              {isDemoResponse && (
                <span className="text-xs font-normal bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded-full ml-2">
                  Aperçu démo
                </span>
              )}
            </h3>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleCopy}
                className="border-slate-700 bg-slate-800/50 hover:bg-slate-700 active:scale-95 text-white rounded-xl transition-all h-10 px-4 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                aria-label="Copier la formule générée"
              >
                {copied ? (
                  <><Check size={16} className="text-green-500 mr-2" /> Copié</>
                ) : (
                  <><Copy size={16} className="mr-2" /> Copier la formule</>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={handleDownload}
                className="border-slate-700 bg-slate-800/50 hover:bg-slate-700 active:scale-95 text-white rounded-xl transition-all h-10 px-4 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                title="Télécharger la réponse (.txt)"
                aria-label="Télécharger le fichier de réponse"
              >
                <Download size={16} className="mr-2" /> Télécharger
              </Button>
            </div>
          </div>

          <div className="prose prose-invert prose-p:text-slate-300 prose-a:text-primary hover:prose-a:text-yellow-400 prose-strong:text-white prose-li:text-slate-300 max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ node, inline, className, children, ...props }: any) {
                  return !inline ? (
                    <pre className="p-5 my-6 overflow-x-auto bg-slate-950/80 border border-slate-800 rounded-2xl text-yellow-300 font-mono text-base shadow-inner">
                      <code className={className} {...props}>{children}</code>
                    </pre>
                  ) : (
                    <code className="bg-slate-800 text-yellow-200 px-1.5 py-0.5 rounded-md text-sm font-mono" {...props}>
                      {children}
                    </code>
                  );
                },
              }}
            >
              {response}
            </ReactMarkdown>
          </div>

          {!isDemoResponse && (
            <div className="mt-6 flex items-start gap-3 p-4 bg-slate-800/40 rounded-2xl border border-slate-700/50">
              <span className="text-yellow-500 text-lg flex-shrink-0">⚠️</span>
              <p className="text-xs text-slate-400 leading-relaxed">
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
