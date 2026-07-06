"use client";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { ApiKeyModal } from "@/components/ApiKeyModal";
import { 
  FormulaInputBar, 
  FormulaResultArea
} from "@/components/FormulaAssistant";
import { AppSidebar } from "@/components/AppSidebar";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { downloadFormulaAsExcel } from "@/lib/excelExport";
import type { ExportFormat } from "@/lib/excelExport";

interface HistoryItem {
  id: string;
  prompt: string;
  response: string;
}

export default function Home() {
  const [apiKey, setApiKey] = useLocalStorage<string | null>("gemini_api_key", null);
  const [modelChoice, setModelChoice] = useLocalStorage<"flash" | "pro">("excel_compta_model", "flash");
  const [exportFormat, setExportFormat] = useLocalStorage<ExportFormat>("excel_export_format", "libreoffice-fr");
  const [dailyFreeRemaining, setDailyFreeRemaining] = useState<number | null>(5);
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Lifted Assistant States
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [response, setResponse] = useState("");
  const [copied, setCopied] = useState(false);
  const [previousPrompt, setPreviousPrompt] = useState("");
  const [history, setHistory] = useLocalStorage<HistoryItem[]>("excel_compta_history", []);
  const [actionCount, setActionCount] = useLocalStorage<number>("excel_compta_action_count", 0);

  const checkCoffeeToast = useCallback((currentCount: number) => {
    if (currentCount === 3 || currentCount === 8 || (currentCount > 8 && (currentCount - 8) % 8 === 0)) {
      setTimeout(() => {
        toast("☕ Soutenir le projet ?", {
          description: "Si Excel-Compta AI vous fait gagner du temps, offrez-moi un café pour soutenir le site !",
          action: {
            label: "Offrir un café",
            onClick: () => window.open(process.env.NEXT_PUBLIC_SUPPORT_URL || "https://buymeacoffee.com/", "_blank"),
          },
          duration: 10000,
        });
      }, 1000);
    }
  }, []);

  const handleActionComplete = useCallback(() => {
    setActionCount((prev) => {
      const next = typeof prev === "number" ? prev + 1 : 1;
      checkCoffeeToast(next);
      return next;
    });
  }, [setActionCount, checkCoffeeToast]);

  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Fetch real daily free remaining on mount (not just default 5)
  useEffect(() => {
    if (apiKey) return; // no need to check for users with own key
    fetch("/api/quota")
      .then((res) => res.json())
      .then((data) => {
        if (data && typeof data.remaining === "number") {
          setDailyFreeRemaining(data.remaining);
        }
      })
      .catch(() => {});
  }, [apiKey]);

  // Restore item from history
  const handleRestoreItem = useCallback((item: HistoryItem) => {
    setPrompt(item.prompt);
    setResponse(item.response);
  }, []);

  // Migrate legacy history items that lack an id
  useEffect(() => {
    if (history.length > 0) {
      const needsMigration = history.some((item) => !item.id);
      if (needsMigration) {
        setHistory((prev) => prev.map((item) => ({
          ...item,
          id: item.id || crypto.randomUUID(),
        })));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.length]);

  // Copy result
  const handleCopy = useCallback(() => {
    if (!response) return;
    const formulaMatch = response.match(/```(?:excel)?\n?([\s\S]*?)\n?```/);
    const textToCopy = formulaMatch ? formulaMatch[1].trim() : response;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Formule copiée dans le presse-papier !");
    handleActionComplete();
  }, [response, handleActionComplete]);

  // Download result
  const handleDownload = useCallback(() => {
    if (!response) return;
    const blob = new Blob([response], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `formule-excel-compta-ai-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Fichier de formule téléchargé !");
    handleActionComplete();
  }, [response, handleActionComplete]);

  // Download Excel example
  const handleDownloadExcel = useCallback(async () => {
    if (!response) return;
    try {
      await downloadFormulaAsExcel(response, prompt, exportFormat);
      toast.success("Fichier Excel téléchargé !");
      handleActionComplete();
    } catch (err: unknown) {
      console.error(err);
      toast.error("Erreur lors de la génération du fichier Excel.");
    }
  }, [response, prompt, handleActionComplete]);

  // Enhance prompt
  const handleEnhance = useCallback(async () => {
    if (!prompt.trim() || enhancing || loading) return;
    setPreviousPrompt(prompt);
    setEnhancing(true);
    try {
      const res = await fetch("/api/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, ...(apiKey ? { apiKey } : {}) }),
      });

      const freeRemainingHeader = res.headers.get("X-Free-Remaining");
      if (freeRemainingHeader !== null) {
        setDailyFreeRemaining(Number(freeRemainingHeader));
      }

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429) {
          setDailyFreeRemaining(0);
          if (!apiKey) {
            setIsKeyModalOpen(true);
            return;
          }
        }
        throw new Error(data.error);
      }
      setPrompt(data.result);
      toast.success("Demande améliorée avec succès !");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de l'amélioration.");
    } finally {
      setEnhancing(false);
    }
  }, [prompt, apiKey, enhancing, loading]);

  // Generate formula
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || loading) return;

    if (!apiKey && dailyFreeRemaining !== null && dailyFreeRemaining <= 0) {
      setIsKeyModalOpen(true);
      return;
    }

    setLoading(true);
    setResponse("");
    try {
      const res = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, modelChoice, format: exportFormat, ...(apiKey ? { apiKey } : {}) }),
      });

      const freeRemainingHeader = res.headers.get("X-Free-Remaining");
      if (freeRemainingHeader !== null) {
        setDailyFreeRemaining(Number(freeRemainingHeader));
      }

      if (!res.ok) {
        const contentType = res.headers.get("content-type");
        let errorMsg: string;
        if (contentType && contentType.includes("application/json")) {
          const data = await res.json();
          errorMsg = data.error;
        } else {
          errorMsg = "Erreur serveur lors de la génération.";
        }

        if (res.status === 429) {
          setDailyFreeRemaining(0);
          if (!apiKey) {
            setIsKeyModalOpen(true);
            return;
          }
        }

        throw new Error(errorMsg);
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
        return [{ id: crypto.randomUUID(), prompt, response: streamResponse }, ...filtered].slice(0, 10);
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }, [prompt, apiKey, modelChoice, dailyFreeRemaining, loading, setHistory]);

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
  }, [handleGenerate, handleEnhance]);

  // Auto scroll logic when streaming response
  useEffect(() => {
    if (loading && scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [response, loading]);

  return (
    <div className="h-[100dvh] w-screen flex flex-row relative overflow-hidden bg-slate-950">
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
      <div className="hidden md:block h-full">
        <AppSidebar
          apiKey={apiKey}
          onOpenKeyModal={() => setIsKeyModalOpen(true)}
          onLogout={() => setApiKey(null)}
          onRestoreHistory={handleRestoreItem}
          history={history}
          setHistory={setHistory}
        />
      </div>

      {/* ── Main content ──────────────────────── */}
      <main className="flex-1 flex flex-col h-[100dvh] relative z-10 overflow-hidden">
        {/* Sticky top bar */}
        <header className="border-b border-border/40 bg-background/60 backdrop-blur-2xl flex-shrink-0 z-50">
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
                    history={history}
                    setHistory={setHistory}
                    isMobileDrawer={true}
                  />
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </header>

        {/* Scrollable body */}
        <div ref={scrollAreaRef} className="flex-1 overflow-y-auto results-scroll flex flex-col bg-transparent">
          <div className={`flex-1 flex flex-col px-6 py-6 md:py-10 max-w-4xl w-full mx-auto ${!response && !loading ? "justify-center" : "justify-start"}`}>
            {!response && !loading ? (
              <div className="w-full flex flex-col items-center">
                {/* Hero text */}
                <div className="text-center mb-6 animate-in fade-in slide-in-from-bottom-6 duration-700">
                  <h2 className="text-3xl md:text-5xl font-display text-white mb-3 tracking-tight leading-tight">
                    Générez des formules complexes{" "}
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-yellow-500 font-sans font-extrabold font-display">
                      en un instant.
                    </span>
                  </h2>
                  <p className="text-sm md:text-base text-slate-400 max-w-xl mx-auto leading-relaxed">
                    Décrivez votre besoin en langage naturel. Notre IA rédige la formule exacte pour Excel et Google Sheets.
                  </p>
                </div>

                {/* Examples moved to FormulaInputBar */}
              </div>
            ) : (
              <FormulaResultArea
                response={response}
                loading={loading}
                copied={copied}
                onCopy={handleCopy}
                onDownload={handleDownload}
                onDownloadExcel={handleDownloadExcel}
              />
            )}
          </div>
        </div>

        {/* Fixed bottom input bar */}
        <FormulaInputBar
          prompt={prompt}
          onPromptChange={setPrompt}
          loading={loading}
          enhancing={enhancing}
          onGenerate={handleGenerate}
          onEnhance={handleEnhance}
          modelChoice={modelChoice}
          onModelChange={setModelChoice}
          dailyFreeRemaining={dailyFreeRemaining}
          onRequestKeyModal={() => setIsKeyModalOpen(true)}
          previousPrompt={previousPrompt}
          onUndoEnhance={() => { setPrompt(previousPrompt); setPreviousPrompt(""); }}
          apiKey={apiKey || ""}
          onSelectExample={(example) => {
            setPrompt(example.label);
            setResponse("");
          }}
          format={exportFormat}
          onFormatChange={setExportFormat}
        />
      </main>
    </div>
  );
}
