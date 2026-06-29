"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Key, HelpCircle, History, Trash2, ChevronLeft, ChevronRight, Coffee, LogOut, X } from "lucide-react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { toast } from "sonner";

interface HistoryItem {
  id: string;
  prompt: string;
  response: string;
}

interface AppSidebarProps {
  apiKey: string | null;
  onOpenKeyModal: () => void;
  onLogout: () => void;
  onRestoreHistory: (item: HistoryItem) => void;
  history?: HistoryItem[];
  setHistory?: (history: HistoryItem[] | ((prev: HistoryItem[]) => HistoryItem[])) => void;
}

export function AppSidebar({
  apiKey,
  onOpenKeyModal,
  onLogout,
  onRestoreHistory,
  isMobileDrawer = false,
  history: propsHistory,
  setHistory: propsSetHistory,
}: AppSidebarProps & { isMobileDrawer?: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const id = setTimeout(() => setMounted(true), 0); return () => clearTimeout(id); }, []);
  const [collapsed, setCollapsed] = useState(false);
  const isCollapsed = isMobileDrawer ? false : collapsed;

  // Use state from props if passed, otherwise use local hook state
  const [localHistory, setLocalHistory] = useLocalStorage<HistoryItem[]>("excel_compta_history", []);
  const history = !mounted ? [] : (propsHistory !== undefined ? propsHistory : localHistory);
  const setHistory = propsSetHistory !== undefined ? propsSetHistory : setLocalHistory;

  const handleClearHistory = () => {
    setHistory([]);
    toast.success("Historique effacé.");
  };

  const handleDeleteItem = (id: string) => {
    const item = history.find((item) => item.id === id);
    if (!item) return;

    setHistory((prev) => prev.filter((item) => item.id !== id));

    toast("Requête supprimée.", {
      action: {
        label: "Annuler",
        onClick: () => {
          setHistory((prev) => {
            const exists = prev.some((i) => i.id === id);
            if (exists) return prev;
            return [item, ...prev];
          });
        },
      },
      duration: 5000,
    });
  };

  return (
    <aside
          className={isMobileDrawer
        ? "relative w-full h-full flex flex-col bg-transparent"
        : `relative flex-shrink-0 flex flex-col transition-all duration-300 ease-in-out
          ${isCollapsed ? "w-14" : "w-72"}
          bg-slate-900/60 backdrop-blur-xl border-r border-slate-800/60 min-h-full overflow-visible`}
    >
      {/* Toggle collapse button */}
      {!isMobileDrawer && (
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute right-2 bottom-3 z-20 w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-all shadow-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          title={isCollapsed ? "Ouvrir le panneau" : "Réduire le panneau"}
          aria-label={isCollapsed ? "Ouvrir la barre latérale" : "Réduire la barre latérale"}
        >
          {isCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      )}

      <div className={`flex flex-col gap-6 p-4 overflow-hidden ${isCollapsed ? "items-center" : ""}`}>

        {/* ── Section : Clé API ───────────────────── */}
        <div>
          {!isCollapsed && (
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-2">
              Clé API Gemini
            </p>
          )}

          {apiKey && mounted ? (
            <div className={`flex ${isCollapsed ? "flex-col gap-2" : "gap-2"} items-center`}>
              <div className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-green-950/30 border border-green-800/40 text-green-400 text-xs ${isCollapsed ? "justify-center" : ""}`}>
                <Key size={12} />
                {!isCollapsed && <span className="truncate">Clé active</span>}
              </div>
              <button
                onClick={onLogout}
                title="Retirer la clé API"
                className="p-2 rounded-xl border border-slate-800 bg-slate-900/50 text-slate-500 hover:text-red-400 hover:border-red-800/50 hover:bg-red-950/20 transition-all cursor-pointer flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Retirer la clé API Gemini de l'application"
              >
                <LogOut size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => onOpenKeyModal()}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 hover:border-primary/50 transition-all text-xs font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${isCollapsed ? "justify-center" : ""}`}
              title="Entrer ma clé API Gemini"
              aria-label="Saisir votre clé API Gemini personnelle"
            >
              <Key size={12} />
              {!isCollapsed && "Entrer ma clé API"}
            </button>
          )}
        </div>

        {/* ── Section : Historique ────────────────── */}
        <div className="flex-1 min-h-0">
          {!isCollapsed && (
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
                Historique récent
              </p>
              {history.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  title="Effacer l'historique"
                  className="text-slate-600 hover:text-red-400 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded p-0.5"
                  aria-label="Effacer tout l'historique"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          )}

          {isCollapsed ? (
            <button
              onClick={() => setCollapsed(false)}
              title={`${history.length} requête(s) dans l'historique`}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-800/50 border border-slate-700/50 text-slate-400 hover:text-white transition-all relative cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={`Ouvrir la barre latérale pour voir l'historique de ${history.length} requêtes`}
            >
              <History size={14} />
              {history.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full text-[9px] text-white flex items-center justify-center font-bold">
                  {history.length}
                </span>
              )}
            </button>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-slate-600">
              <History size={20} />
              <p className="text-xs text-center leading-relaxed">
                Vos requêtes récentes<br />apparaîtront ici.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[420px] pr-0.5">
              {history.map((item) => (
                <div key={item.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onRestoreHistory(item)}
                    className="text-left w-full px-3 py-2.5 rounded-xl bg-slate-800/40 hover:bg-primary/10 border border-slate-800 hover:border-primary/30 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                    title={item.prompt}
                    aria-label={`Restaurer la requête historique : ${item.prompt}`}
                  >
                    <p className="text-xs text-slate-300 group-hover:text-primary truncate transition-colors font-medium leading-tight pr-4">
                      {item.prompt}
                    </p>
                    <p className="text-[10px] text-slate-600 mt-0.5 truncate pr-4">
                      {item.response.replace(/[#*`]/g, "").substring(0, 50)}…
                    </p>
                  </button>
                  <button
                    onClick={() => handleDeleteItem(item.id)}
                    className="absolute top-1.5 right-1.5 opacity-60 md:opacity-0 md:group-hover:opacity-100 transition-opacity p-0.5 rounded text-slate-400 hover:text-red-400 hover:bg-red-950/30 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    title="Supprimer cette requête"
                    aria-label={`Supprimer la requête : ${item.prompt}`}
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Section : Support ───────────────────── */}
        <div className="mt-auto pt-4 border-t border-slate-800/60 flex flex-col gap-2">
          {isCollapsed ? (
            <a
              href={process.env.NEXT_PUBLIC_SUPPORT_URL || "https://buymeacoffee.com/"}
              target="_blank"
              rel="noreferrer"
              title="Soutenir le projet"
              className="flex items-center justify-center w-10 h-10 rounded-xl text-yellow-400 bg-yellow-950/30 border border-yellow-700/40 hover:bg-yellow-950/50 hover:border-yellow-600/60 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Faire un don de soutien Buy Me A Coffee"
            >
              <Coffee size={14} className="animate-pulse" />
            </a>
          ) : (
            <div className="bg-gradient-to-br from-yellow-950/20 to-slate-900 border border-yellow-800/20 p-3.5 rounded-2xl flex flex-col gap-2 shadow-[0_0_20px_-6px_rgba(250,204,21,0.1)] relative overflow-hidden group">
              <div className="absolute -right-6 -bottom-6 w-16 h-16 bg-yellow-500/10 rounded-full blur-xl group-hover:bg-yellow-500/20 transition-all duration-300" />
              
              <div className="flex items-center gap-2 text-yellow-400 font-semibold text-xs tracking-tight">
                <Coffee size={14} className="group-hover:rotate-12 transition-transform duration-300" />
                <span>Soutenir le projet</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-normal">
                Excel-Compta AI est gratuit et sans serveurs. Offrez-moi un café pour soutenir le projet !
              </p>
              <a
                href={process.env.NEXT_PUBLIC_SUPPORT_URL || "https://buymeacoffee.com/"}
                target="_blank"
                rel="noreferrer"
                className="w-full text-center py-2 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-white text-xs font-semibold shadow-sm hover:shadow-md transition-all cursor-pointer hover:scale-[1.02]"
              >
                ☕ Offrir un café
              </a>
            </div>
          )}
          <Link
            href="/about"
            title="À propos & FAQ"
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-slate-500 hover:text-slate-300 hover:bg-slate-800/30 border border-transparent hover:border-slate-800/30 transition-all text-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${isCollapsed ? "justify-center" : ""}`}
            aria-label="En savoir plus à propos de l'application et de la confidentialité"
          >
            <HelpCircle size={13} />
            {!isCollapsed && "À propos & FAQ"}
          </Link>
        </div>
      </div>
    </aside>
  );
}
