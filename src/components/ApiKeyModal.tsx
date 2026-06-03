"use client";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Key, ExternalLink, HelpCircle, ShieldCheck } from "lucide-react";

export function ApiKeyModal({ open, onOpenChange, onKeySaved }: { open: boolean, onOpenChange: (open: boolean) => void, onKeySaved: (key: string) => void }) {
  const [keyInput, setKeyInput] = useState("");

  // Clear input when opened
  useEffect(() => {
    if (open) setKeyInput("");
  }, [open]);

  const handleSave = () => {
    if (keyInput.trim()) {
      onKeySaved(keyInput.trim());
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-8 bg-slate-900 border border-slate-800 shadow-2xl rounded-2xl">
        <DialogTitle className="sr-only">Configuration de la clé API</DialogTitle>
        <div className="flex items-center gap-3 text-primary mb-2">
          <Key size={28} />
          <h2 className="text-2xl font-semibold text-foreground">Clé API requise</h2>
        </div>
        <p className="text-sm text-slate-300 leading-relaxed mb-4">
          Pour utiliser Excel-Compta AI gratuitement, veuillez renseigner votre propre clé API Google Gemini. 
          Elle sera sauvegardée uniquement sur votre navigateur (100% privé).
        </p>
        
        <div className="space-y-3">
          <Input 
            type="password" 
            placeholder="AIzaSy..." 
            value={keyInput} 
            onChange={(e) => setKeyInput(e.target.value)} 
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            className="bg-slate-950/50 border-slate-700/50 focus:border-primary/50 text-white h-11 rounded-xl"
          />
          <Button 
            onClick={handleSave} 
            disabled={!keyInput.trim()}
            className="bg-primary hover:bg-yellow-600 text-white w-full h-11 font-medium transition-all shadow-md hover:shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Sauvegarder et Commencer
          </Button>
          <p className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-1">
            <ShieldCheck size={11} className="text-green-500 flex-shrink-0" />
            Stockée uniquement dans votre navigateur — jamais envoyée à nos serveurs.
          </p>
        </div>

        <div className="mt-4 border-t border-slate-800/80 pt-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 tracking-wider uppercase">
            <HelpCircle size={14} className="text-primary" />
            Comment obtenir une clé gratuite ?
          </div>
          <ol className="text-xs text-slate-400 space-y-2 list-decimal list-inside pl-1">
            <li>
              Cliquez sur{" "}
              <a 
                href="https://aistudio.google.com/app/apikey" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:text-yellow-400 underline inline-flex items-center gap-1 font-medium"
              >
                Google AI Studio <ExternalLink size={10} className="inline" />
              </a>
            </li>
            <li>Connectez-vous avec votre compte Google gratuit.</li>
            <li>Cliquez sur le bouton bleu <span className="text-slate-300 font-medium">"Create API Key"</span>.</li>
            <li>Copiez la clé générée et collez-la ci-dessus.</li>
          </ol>
          <p className="text-[10px] text-slate-500 leading-normal italic mt-1">
            Note : Google AI Studio propose un accès gratuit généreux largement suffisant pour un usage quotidien d'Excel-Compta AI.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
