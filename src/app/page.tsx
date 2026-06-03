"use client";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { ApiKeyModal } from "@/components/ApiKeyModal";
import { FormulaAssistant } from "@/components/FormulaAssistant";
import { AppSidebar } from "@/components/AppSidebar";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

interface HistoryItem {
  prompt: string;
  response: string;
}

export default function Home() {
  const [apiKey, setApiKey] = useLocalStorage<string | null>("gemini_api_key", null);
  const [demoUsesLeft, setDemoUsesLeft] = useLocalStorage<number>("excel_compta_demo_uses", 2);
  const [modelChoice, setModelChoice] = useLocalStorage<"flash" | "pro">("excel_compta_model", "flash");
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Ref to pass restore callback from sidebar → FormulaAssistant
  const restoreCallbackRef = useRef<((item: HistoryItem) => void) | null>(null);

  const handleRestoreItem = useCallback((item: HistoryItem) => {
    restoreCallbackRef.current?.(item);
  }, []);

  const registerRestoreCallback = useCallback(
    (setter: (item: HistoryItem) => void) => {
      restoreCallbackRef.current = setter;
    },
    []
  );

  return (
    <div className="min-h-screen flex flex-row relative overflow-hidden">
      {/* Ambient background blobs */}
      <div className="hidden md:block fixed top-[-15%] left-[15%] w-[45%] h-[50%] bg-primary/8 rounded-full blur-[160px] pointer-events-none z-0 will-change-transform" />
      <div className="hidden md:block fixed bottom-[-10%] right-[-5%] w-[35%] h-[40%] bg-blue-900/15 rounded-full blur-[130px] pointer-events-none z-0 will-change-transform" />

      {/* ── Modal Clé API ─────────────────────── */}
      <ApiKeyModal 
        open={isKeyModalOpen} 
        onOpenChange={setIsKeyModalOpen} 
        onKeySaved={(key) => {
          setApiKey(key);
          setIsKeyModalOpen(false);
          toast.success("Clé API sauvegardée !");
        }} 
      />

      {/* ── Sidebar (Desktop) ─────────────────── */}
      <div className="hidden md:block">
        <AppSidebar
          apiKey={apiKey}
          onOpenKeyModal={() => setIsKeyModalOpen(true)}
          onLogout={() => setApiKey(null)}
          onRestoreHistory={handleRestoreItem}
        />
      </div>

      {/* ── Main content ──────────────────────── */}
      <main className="flex-1 flex flex-col min-h-screen relative z-10 overflow-y-auto">
        {/* Sticky top bar */}
        <header className="border-b border-border/40 bg-background/60 backdrop-blur-2xl sticky top-0 z-50">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-yellow-700 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-primary/20 flex-shrink-0">
                ∑
              </div>
              <h1 className="text-xl font-display text-white tracking-tight">
                Excel-Compta <span className="text-primary font-sans font-medium">AI</span>
              </h1>
            </div>
            
            {/* Hamburger menu for mobile */}
            <div className="md:hidden">
              <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                <SheetTrigger className="inline-flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors h-9 w-9 cursor-pointer">
                  <Menu size={20} />
                </SheetTrigger>
                <SheetContent side="left" className="p-0 bg-slate-900 border-r border-slate-800 w-72">
                  <AppSidebar
                    apiKey={apiKey}
                    onOpenKeyModal={() => {
                      setIsKeyModalOpen(true);
                      setIsMobileMenuOpen(false);
                    }}
                    onLogout={() => setApiKey(null)}
                    onRestoreHistory={(item) => {
                      handleRestoreItem(item);
                      setIsMobileMenuOpen(false);
                    }}
                    isMobileDrawer={true}
                  />
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </header>

        {/* Hero + FormulaAssistant */}
        <div className="flex-1 flex flex-col px-6 py-12 md:py-20 max-w-4xl w-full mx-auto">
          {/* Hero text */}
          <div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-6 duration-700">
            <h2 className="text-4xl md:text-5xl font-display text-white mb-4 tracking-tight leading-tight">
              Générez des formules complexes{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-yellow-500 font-sans font-extrabold">
                en un instant.
              </span>
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
              Décrivez votre besoin en langage naturel. Notre IA rédige la formule exacte pour Excel et Google Sheets.
            </p>
          </div>

          <FormulaAssistant
            apiKey={apiKey || ""}
            freeUsesLeft={apiKey ? null : demoUsesLeft}
            modelChoice={modelChoice}
            onModelChange={setModelChoice}
            onRequestKeyModal={() => setIsKeyModalOpen(true)}
            onRestoreItem={registerRestoreCallback}
            onGenerateSuccess={() => {
              if (!apiKey) {
                const newCount = Math.max(0, demoUsesLeft - 1);
                setDemoUsesLeft(newCount);
              }
            }}
          />
        </div>
      </main>
    </div>
  );
}
