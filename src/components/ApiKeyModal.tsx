"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Key, ExternalLink, ShieldCheck, Sparkles, AlertCircle } from "lucide-react";

export function ApiKeyModal({ open, onOpenChange, onKeySaved }: { open: boolean, onOpenChange: (open: boolean) => void, onKeySaved: (key: string) => void }) {
  const [keyInput, setKeyInput] = useState("");

  const handleSave = () => {
    if (keyInput.trim()) {
      onKeySaved(keyInput.trim());
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (next) setKeyInput(""); onOpenChange(next); }}>
      <DialogContent className="sm:max-w-lg p-6 md:p-8 bg-slate-900/95 border border-slate-800/80 shadow-2xl rounded-2xl backdrop-blur-xl">
        <DialogTitle className="sr-only">Configuration de la clé API</DialogTitle>

        {/* Header decoration */}
        <div className="relative mb-6 text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-yellow-600 flex items-center justify-center text-white shadow-lg shadow-primary/20 mb-4 animate-pulse">
            <Key size={26} />
          </div>
          <h2 className="text-2xl font-bold font-display text-white tracking-tight">Configuration de la Clé API</h2>
          <p className="text-sm text-slate-400 mt-2 max-w-sm mx-auto leading-relaxed">
            Pour continuer à utiliser l'assistant gratuitement et en toute sécurité, connectez votre propre clé Google Gemini.
          </p>
        </div>

        {/* Form area */}
        <div className="space-y-4 bg-slate-950/40 border border-slate-800/60 p-5 rounded-2xl mb-6">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400 tracking-wider uppercase flex items-center gap-1.5">
              Votre clé API Gemini
            </label>
            <Input
              type="password"
              placeholder="AIzaSy..."
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              className="bg-slate-900 border-slate-800 focus:border-primary/50 text-white h-12 rounded-xl focus:ring-1 focus:ring-primary/30"
            />
          </div>

          <Button
            onClick={handleSave}
            disabled={!keyInput.trim()}
            className="bg-primary hover:bg-yellow-600 text-white w-full h-12 font-medium rounded-xl transition-all shadow-lg hover:shadow-primary/25 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            Sauvegarder et débloquer
          </Button>

          <div className="flex items-start gap-2.5 bg-green-950/20 border border-green-800/20 p-3 rounded-xl">
            <ShieldCheck size={16} className="text-green-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-400 leading-normal">
              <strong className="text-green-400 font-medium">100% Privé & Sécurisé :</strong> Votre clé est stockée uniquement dans votre navigateur (LocalStorage) pour signer vos requêtes en direct. Elle ne transite jamais par nos serveurs.
            </p>
          </div>
        </div>

        {/* Tutorial area */}
        <div className="border-t border-slate-800/80 pt-6">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-300 tracking-wider uppercase mb-4">
            <Sparkles size={14} className="text-primary" />
            Comment obtenir une clé gratuite ?
          </div>

          <div className="space-y-3">
            {/* Step 1 */}
            <div className="flex gap-3 items-start">
              <div className="w-5 h-5 rounded-full bg-slate-800 text-[10px] text-slate-400 flex items-center justify-center font-bold flex-shrink-0 mt-0.5">
                01
              </div>
              <div className="text-xs text-slate-400">
                Rendez-vous sur{" "}
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-yellow-400 underline inline-flex items-center gap-1 font-semibold transition-colors"
                >
                  Google AI Studio <ExternalLink size={10} className="inline" />
                </a>{" "}
                et connectez-vous avec votre compte Google standard.
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-3 items-start">
              <div className="w-5 h-5 rounded-full bg-slate-800 text-[10px] text-slate-400 flex items-center justify-center font-bold flex-shrink-0 mt-0.5">
                02
              </div>
              <div className="text-xs text-slate-400">
                Cliquez sur le bouton bleu <strong className="text-slate-200 font-semibold">&ldquo;Create API Key&rdquo;</strong> (Créer une clé API).
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-3 items-start">
              <div className="w-5 h-5 rounded-full bg-slate-800 text-[10px] text-slate-400 flex items-center justify-center font-bold flex-shrink-0 mt-0.5">
                03
              </div>
              <div className="text-xs text-slate-400">
                Copiez le code généré, revenez ici et collez-le dans le champ ci-dessus.
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 bg-slate-950/20 p-2.5 rounded-xl border border-slate-800/40 text-[10px] text-slate-500 leading-relaxed">
            <AlertCircle size={12} className="text-slate-400 flex-shrink-0 mt-0.5" />
            <span>
              Google offre un quota gratuit généreux (jusqu'à 15 requêtes/minute), ce qui est largement suffisant pour une utilisation quotidienne classique d'Excel-Formule AI.
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
