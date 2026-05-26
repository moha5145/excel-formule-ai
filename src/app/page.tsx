"use client";
import { ApiKeyManager } from "@/components/ApiKeyManager";
import { FormulaAssistant } from "@/components/FormulaAssistant";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { Coffee, LogOut, Key } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  const [apiKey, setApiKey] = useLocalStorage<string | null>("gemini_api_key", null);
  const [demoUsesLeft, setDemoUsesLeft] = useLocalStorage<number>("excel_compta_demo_uses", 2);
  const [showKeyPrompt, setShowKeyPrompt] = useLocalStorage<boolean>("excel_compta_show_prompt", false);

  const handleLogout = () => {
    setApiKey(null);
  };

  return (
    <main className="min-h-screen relative overflow-hidden flex flex-col">
      {/* Background Liquid Glass Effects */}
      <div className="absolute top-[-15%] left-[-10%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900/20 rounded-full blur-[120px] pointer-events-none"></div>
      
      <header className="border-b border-border/40 bg-background/60 backdrop-blur-2xl sticky top-0 z-50 transition-all duration-300">
        <div className="max-w-6xl mx-auto flex justify-between items-center p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-yellow-700 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-primary/20">
              ∑
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Excel-Compta <span className="text-primary font-medium">AI</span></h1>
          </div>
          <div className="flex items-center gap-4">
            <a href="https://buymeacoffee.com/" target="_blank" rel="noreferrer" className="hidden sm:block">
              <Button variant="outline" className="border-slate-700/50 bg-slate-800/50 hover:bg-slate-700/80 text-slate-200 rounded-xl transition-all">
                <Coffee size={16} className="mr-2 text-yellow-500" />
                Soutenir le projet
              </Button>
            </a>
            {apiKey && (
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={handleLogout} 
                className="text-slate-400 hover:text-white hover:bg-destructive/20 hover:text-destructive rounded-xl transition-colors" 
                title="Retirer la clé API"
              >
                <LogOut size={20} />
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col max-w-6xl mx-auto w-full px-4 py-16 md:py-24 relative z-10">
        <div className="text-center mb-16 animate-in fade-in slide-in-from-bottom-6 duration-700">
          <h2 className="text-5xl md:text-6xl font-extrabold text-white mb-6 tracking-tight">
            Générez des formules complexes <br className="hidden md:block"/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-yellow-500">en un instant.</span>
          </h2>
          <p className="text-xl text-slate-400 max-w-3xl mx-auto leading-relaxed">
            Décrivez votre besoin comptable ou financier en langage naturel. Notre intelligence artificielle rédige la formule exacte pour Excel et Google Sheets.
          </p>
        </div>

        <div className="w-full flex flex-col items-center gap-6">
          <FormulaAssistant 
            apiKey={apiKey || ""} 
            freeUsesLeft={apiKey ? null : demoUsesLeft}
            showKeyPrompt={!apiKey && showKeyPrompt}
            onDismissKeyPrompt={() => setShowKeyPrompt(false)}
            onSaveApiKey={(key) => { setApiKey(key); setShowKeyPrompt(true); }}
            showApiKeyForm={showKeyPrompt === false && !apiKey && demoUsesLeft <= 0}
            onGenerateSuccess={() => {
              if (!apiKey) {
                const newCount = Math.max(0, demoUsesLeft - 1);
                setDemoUsesLeft(newCount);
                if (newCount <= 0) setShowKeyPrompt(true);
              }
            }}
          />
        </div>
      </div>
    </main>
  );
}
