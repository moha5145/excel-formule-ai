"use client";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Copy, Check, Sparkles, Wand2, Key } from "lucide-react";
import { toast } from "sonner";
import { findDemoResponse } from "@/lib/demoResponses";
import { ApiKeyManager } from "@/components/ApiKeyManager";

export function FormulaAssistant({ 
  apiKey, 
  freeUsesLeft, 
  onGenerateSuccess,
  showKeyPrompt,
  onDismissKeyPrompt,
  onSaveApiKey,
  showApiKeyForm,
}: { 
  apiKey: string; 
  freeUsesLeft?: number | null;
  onGenerateSuccess?: () => void;
  showKeyPrompt?: boolean;
  onDismissKeyPrompt?: () => void;
  onSaveApiKey?: (key: string) => void;
  showApiKeyForm?: boolean;
}) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [response, setResponse] = useState("");
  const [copied, setCopied] = useState(false);
  const [isDemoResponse, setIsDemoResponse] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const handleEnhance = async () => {
    if (!prompt.trim()) return;
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

  useEffect(() => {
    if (response && resultRef.current) {
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [response]);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    // Bloquer si le quota est épuisé et pas de clé personnelle
    if (!apiKey && freeUsesLeft !== null && freeUsesLeft !== undefined && freeUsesLeft <= 0) {
      toast.error("Vos essais gratuits sont épuisés. Entrez votre clé API pour continuer.");
      return;
    }

    setLoading(true);
    setResponse("");
    setIsDemoResponse(false);
    try {
      const res = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, apiKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResponse(data.result);
      if (onGenerateSuccess) onGenerateSuccess();
    } catch (err: any) {
      // Si l'API échoue (pas de clé serveur configurée), on utilise la démo pré-calculée
      if (!apiKey) {
        const demoResult = findDemoResponse(prompt);
        setResponse(demoResult || "Veuillez entrer votre clé API pour utiliser l'assistant sur cette requête.");
        if (onGenerateSuccess) onGenerateSuccess();
      } else {
        toast.error(err.message || "Une erreur est survenue.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    // Extrait la formule entre les backticks (si présente) pour ne copier que la formule
    const formulaMatch = response.match(/```(?:excel)?\n?(.*?)\n?```/s);
    const textToCopy = formulaMatch ? formulaMatch[1].trim() : response;
    
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Formule copiée dans le presse-papier !");
  };

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-card/60 backdrop-blur-xl rounded-3xl border border-border/50 p-8 shadow-[0_8px_30px_rgb(0,0,0,0.12)] transition-all focus-within:border-primary/30 focus-within:shadow-primary/10">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-3 gap-3 sm:gap-0">
          <label className="text-base font-medium text-slate-300 flex items-center gap-2">
            <Sparkles size={18} className="text-primary" />
            Que souhaitez-vous calculer ou extraire ?
            {freeUsesLeft !== undefined && freeUsesLeft !== null && (
              <span className="ml-2 text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full border border-primary/30">
                {freeUsesLeft} essai(s) gratuit(s)
              </span>
            )}
          </label>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleEnhance} 
            disabled={enhancing || loading || !prompt.trim()}
            className="h-8 text-xs text-primary hover:text-yellow-400 hover:bg-primary/10 rounded-lg px-3 -ml-2 sm:ml-0"
          >
            {enhancing ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Wand2 className="mr-2 h-3 w-3" />}
            Améliorer ma demande
          </Button>
        </div>
        <Textarea 
          placeholder="Ex: Si la cellule A1 est supérieure à 1000, appliquer une remise de 10% (A1*0.1), sinon 0."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="min-h-[140px] bg-slate-900/40 border-slate-700/50 text-white text-lg rounded-2xl mb-4 p-4 resize-none focus-visible:ring-primary/30 placeholder:text-slate-500"
        />
        
        <div className="flex flex-wrap gap-2 mb-6">
          <span className="text-sm text-slate-400 py-1 mr-1">Exemples :</span>
          {[
            { label: "Mensualité d'un prêt de 250 000€ sur 20 ans à 3.5%", keywords: "mensualité prêt" },
            { label: "Retrouver un prix depuis une liste produit", keywords: "prix produit recherche" },
            { label: "Prime selon CA et marge avec SI imbriqués", keywords: "prime si condition marge" },
          ].map((example, i) => (
            <button
              key={i}
              onClick={() => {
                const demoResult = findDemoResponse(example.keywords);
                setPrompt(example.label);
                if (demoResult) {
                  setResponse(demoResult);
                  setIsDemoResponse(true);
                }
              }}
              className="text-xs bg-slate-800/80 hover:bg-primary/20 hover:border-primary/40 hover:text-primary text-slate-300 border border-slate-700 rounded-full px-3 py-1.5 transition-all text-left"
              title={example.label}
            >
              {example.label}
            </button>
          ))}
        </div>

        <Button 
          onClick={handleGenerate} 
          disabled={loading || !prompt.trim() || (!apiKey && freeUsesLeft !== null && freeUsesLeft !== undefined && freeUsesLeft <= 0)} 
          className="w-full bg-primary hover:bg-yellow-600 text-white rounded-2xl h-14 text-lg font-medium transition-all shadow-lg shadow-primary/20 hover:shadow-primary/40 disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed"
        >
          {loading ? (
            <><Loader2 className="mr-3 h-5 w-5 animate-spin" /> Génération en cours...</>
          ) : (
            "Générer la Formule Magique"
          )}
        </Button>
      </div>

      {/* Bannière d'invitation à la clé — entre le formulaire et le résultat */}
      {showKeyPrompt && (
        <div className="w-full animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="bg-primary/5 border border-primary/30 rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-5">
            <div className="flex-shrink-0 w-12 h-12 bg-primary/15 rounded-xl flex items-center justify-center">
              <Key size={22} className="text-primary" />
            </div>
            <div className="flex-1 text-center sm:text-left">
              <p className="font-semibold text-white mb-1">Vos 2 essais gratuits sont épuisés !</p>
              <p className="text-sm text-slate-400">Entrez votre clé API Gemini gratuite pour continuer à générer des formules illimitées.</p>
            </div>
            <Button 
              onClick={onDismissKeyPrompt}
              className="bg-primary hover:bg-yellow-600 text-white rounded-xl px-5 flex-shrink-0"
            >
              Entrer ma clé
            </Button>
          </div>
        </div>
      )}

      {/* Formulaire de clé API */}
      {showApiKeyForm && onSaveApiKey && (
        <div className="w-full max-w-md mx-auto animate-in fade-in zoom-in-95 duration-300">
          <ApiKeyManager onKeySaved={onSaveApiKey} />
        </div>
      )}

      {response && (
        <div ref={resultRef} className="bg-slate-900/80 backdrop-blur-xl rounded-3xl border border-primary/20 p-8 shadow-2xl relative overflow-hidden group animate-in fade-in zoom-in-95 duration-500 mt-2 scroll-mt-24">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent opacity-70"></div>
          
          <div className="flex justify-between items-start mb-6">
            <h3 className="text-primary font-semibold text-xl flex items-center gap-2">
              Résultat & Explication
              {isDemoResponse && (
                <span className="text-xs font-normal bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded-full ml-2">
                  Aperçu démo
                </span>
              )}
            </h3>
            <Button 
              variant="outline" 
              onClick={handleCopy} 
              className="border-slate-700 bg-slate-800/50 hover:bg-slate-700 text-white rounded-xl transition-colors h-10 px-4"
            >
              {copied ? (
                <><Check size={16} className="text-green-500 mr-2" /> Copié</>
              ) : (
                <><Copy size={16} className="mr-2" /> Copier la formule</>
              )}
            </Button>
          </div>
          
          <div className="prose prose-invert prose-p:text-slate-300 prose-pre:bg-slate-950/80 prose-pre:border prose-pre:border-slate-800 prose-pre:rounded-2xl max-w-none">
            {/* Very simple markdown rendering for the response */}
            {response.split('```').map((block, index) => {
              if (index % 2 === 1) {
                // Code block
                const lines = block.split('\n');
                const lang = lines[0];
                const code = lines.slice(1).join('\n');
                return (
                  <pre key={index} className="p-5 my-6 overflow-x-auto text-yellow-300 font-mono text-base shadow-inner">
                    <code>{code}</code>
                  </pre>
                );
              }
              // Text block
              return <div key={index} className="whitespace-pre-wrap leading-relaxed">{block}</div>;
            })}
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
