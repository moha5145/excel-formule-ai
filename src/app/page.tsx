"use client";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import { ApiKeyModal } from "@/components/ApiKeyModal";
import { FormulaInputBar } from "@/components/FormulaAssistant";
import { AppSidebar } from "@/components/AppSidebar";
import { Menu, Copy } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import type { ExportFormat } from "@/lib/excelExport";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

interface Message {
  role: "user" | "model";
  content: string;
}

interface HistoryItem {
  id: string;
  prompt: string;
  response: string;
  messages?: Message[];
}

export default function Home() {
  const [apiKey, setApiKey] = useLocalStorage<string | null>("gemini_api_key", null);
  const [modelChoice, setModelChoice] = useLocalStorage<"flash" | "pro">("excel_compta_model", "flash");
  const [exportFormat, setExportFormat] = useLocalStorage<ExportFormat>("excel_export_format", "libreoffice-fr");
  const [dailyFreeRemaining, setDailyFreeRemaining] = useState<number | null>(3);
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Lifted Assistant States
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [previousPrompt, setPreviousPrompt] = useState("");
  const [history, setHistory] = useLocalStorage<HistoryItem[]>("excel_compta_history", []);

  const checkCoffeeToast = useCallback((currentCount: number) => {
    if (currentCount === 3 || currentCount === 8 || (currentCount > 8 && (currentCount - 8) % 8 === 0)) {
      setTimeout(() => {
        toast("☕ Soutenir le projet ?", {
          description: "Si Excel-Formule AI vous fait gagner du temps, offrez-moi un café pour soutenir le site !",
          action: {
            label: "Offrir un café",
            onClick: () => window.open(process.env.NEXT_PUBLIC_SUPPORT_URL || "https://buymeacoffee.com/", "_blank"),
          },
          duration: 10000,
        });
      }, 1000);
    }
  }, []);

  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Fetch real daily free remaining on mount (not just default 3)
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
    setPrompt("");
    if (item.messages && item.messages.length > 0) {
      setMessages(item.messages);
    } else {
      const restored = [
        { role: "user" as const, content: item.prompt },
        { role: "model" as const, content: item.response }
      ];
      setMessages(restored);
    }
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

    // Add user message to conversation immediately
    const newUserMessage = { role: "user" as const, content: prompt };
    setMessages((prev) => [...prev, newUserMessage]);

    // Clear input after sending
    setPrompt("");

    // Build messages to send (current messages + new user message)
    const messagesToSend = [...messages, newUserMessage];

    try {

      const res = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: messagesToSend, modelChoice, format: exportFormat, ...(apiKey ? { apiKey } : {}) }),
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
      }

      // Add model response to conversation history
      setMessages((prev) => {
        const updated = [...prev, { role: "model" as const, content: streamResponse }];
        setHistory((historyPrev) => {
          const filtered = historyPrev.filter((item) => item.prompt !== prompt);
          return [{ id: crypto.randomUUID(), prompt, response: streamResponse, messages: updated }, ...filtered].slice(0, 10);
        });
        return updated;
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }, [prompt, apiKey, modelChoice, dailyFreeRemaining, loading, setHistory, messages]);

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
  }, [loading]);

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
          dailyFreeRemaining={dailyFreeRemaining}
        />
      </div>

      {/* ── Main content ──────────────────────── */}
      <main className="flex-1 flex flex-col h-[100dvh] relative z-10 overflow-hidden">
        {/* Sticky top bar */}
        <header className="border-b border-border/40 bg-background/60 backdrop-blur-2xl flex-shrink-0 z-50">
          <div className="flex items-center justify-between px-3 py-2.5 sm:px-6 sm:py-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-yellow-700 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-primary/20 flex-shrink-0">
                ∑
              </div>
              <h1 className="text-base sm:text-xl font-display text-white tracking-tight">
                Excel-Formule <span className="text-primary font-sans font-medium">AI</span>
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
                    dailyFreeRemaining={dailyFreeRemaining}
                  />
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </header>

        {/* Scrollable body */}
        <div ref={scrollAreaRef} className="flex-1 overflow-y-auto results-scroll flex flex-col bg-transparent">
          <div className={`flex-1 flex flex-col px-3 py-4 sm:px-6 sm:py-6 md:py-10 w-full mx-auto ${messages.length === 0 && !loading ? "max-w-4xl justify-center" : "justify-start"}`}>
            {!loading && messages.length === 0 ? (
              <div className="w-full flex flex-col items-center">
                {/* Hero text */}
                <div className="text-center mb-6 animate-in fade-in slide-in-from-bottom-6 duration-700">
                  <h2 className="text-2xl sm:text-3xl md:text-5xl font-display text-white mb-2 sm:mb-3 tracking-tight leading-tight">
                    Générez des formules complexes{" "}
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-yellow-500 font-sans font-extrabold font-display">
                      en un instant.
                    </span>
                  </h2>
                  <p className="text-xs sm:text-sm md:text-base text-slate-400 max-w-xl mx-auto leading-relaxed">
                    Décrivez votre besoin en langage naturel. Notre IA rédige la formule exacte pour Excel et Google Sheets.
                  </p>
                </div>

                {/* Examples moved to FormulaInputBar */}
              </div>
            ) : (
              <div className="w-full max-w-4xl mx-auto flex flex-col gap-4">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                    <div className={`max-w-[85%] px-4 py-3 rounded-2xl ${
                      msg.role === "user"
                        ? "bg-primary/20 border border-primary/30 text-white text-sm"
                        : "bg-slate-800/80 border border-slate-700/50 text-slate-300 text-sm prose prose-invert prose-p:text-slate-300 prose-a:text-primary hover:prose-a:text-yellow-400 prose-strong:text-white prose-li:text-slate-300 max-w-none"
                    }`}>
                      {msg.role === "model" ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                          pre({ children, className }: { children?: ReactNode; className?: string }) {
                            return (
                              <pre className={`relative p-3 my-2 overflow-x-auto bg-slate-900/85 border border-slate-800/80 rounded-xl text-yellow-300 font-mono text-xs shadow-inner ${className || ""}`}>
                                <button
                                  onClick={() => navigator.clipboard.writeText(String(children))}
                                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-slate-800/80 border border-slate-700/50 text-slate-400 hover:text-yellow-300 hover:bg-slate-700/80 transition-all"
                                  aria-label="Copier la formule"
                                >
                                  <Copy size={12} />
                                </button>
                                {children}
                              </pre>
                            );
                          },
                          code({ inline, className, children }: { inline?: boolean; className?: string; children?: ReactNode }) {
                            if (inline) {
                              return <code className={`bg-slate-700 text-yellow-200 px-1.5 py-0.5 rounded-md text-xs font-mono ${className || ""}`}>{children}</code>;
                            }
                            return <code className={className}>{children}</code>;
                          },
                        }}>
                          {normalizeMarkdownBlocks(msg.content)}
                        </ReactMarkdown>
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-slate-800/80 border border-slate-700/50 text-slate-300 text-sm prose prose-invert max-w-none px-4 py-3 rounded-2xl animate-pulse">
                      Rédaction de la formule...
                    </div>
                  </div>
                )}
              </div>
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
          }}
          format={exportFormat}
          onFormatChange={setExportFormat}
        />
      </main>
    </div>
  );
}
