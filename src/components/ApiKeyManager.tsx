"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Key } from "lucide-react";

export function ApiKeyManager({ onKeySaved }: { onKeySaved: (key: string) => void }) {
  const [keyInput, setKeyInput] = useState("");

  const handleSave = () => {
    if (keyInput.trim()) {
      onKeySaved(keyInput.trim());
    }
  };

  return (
    <div className="flex flex-col gap-4 p-8 bg-card/50 backdrop-blur-md rounded-2xl border border-border shadow-xl max-w-md mx-auto mt-20 transition-all hover:shadow-primary/5 hover:border-primary/20">
      <div className="flex items-center gap-3 text-primary">
        <Key size={28} />
        <h2 className="text-2xl font-semibold text-foreground">Clé API requise</h2>
      </div>
      <p className="text-sm text-slate-300 leading-relaxed">
        Pour utiliser Excel-Compta AI gratuitement, veuillez renseigner votre propre clé API Google Gemini. 
        Elle sera sauvegardée uniquement sur votre navigateur (100% privé).
      </p>
      <div className="mt-2 space-y-3">
        <Input 
          type="password" 
          placeholder="AIzaSy..." 
          value={keyInput} 
          onChange={(e) => setKeyInput(e.target.value)} 
          className="bg-slate-900/50 border-slate-700/50 focus:border-primary/50 text-white h-11"
        />
        <Button onClick={handleSave} className="bg-primary hover:bg-yellow-600 text-white w-full h-11 font-medium transition-all shadow-md hover:shadow-primary/20">
          Sauvegarder et Commencer
        </Button>
      </div>
    </div>
  );
}
