"use client";
import { useState } from "react";
import { Key, ExternalLink, HelpCircle, History, Trash2, ChevronLeft, ChevronRight, Coffee, LogOut, Zap, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { toast } from "sonner";

interface HistoryItem {
  prompt: string;
  response: string;
}

interface AppSidebarProps {
  apiKey: string | null;
  onOpenKeyModal: () => void;
  onLogout: () => void;
  onRestoreHistory: (item: HistoryItem) => void;
}

export function AppSidebar({
  apiKey,
  onOpenKeyModal,
  onLogout,
  onRestoreHistory,
}: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [history, setHistory] = useLocalStorage<HistoryItem[]>("excel_compta_history", []);


  const handleClearHistory = () => {
    setHistory([]);
    toast.success("Historique effacé.");
  };

  return (
    <aside
      className={`relative flex-shrink-0 flex flex-col transition-all duration-300 ease-in-out
        ${collapsed ? "w-14" : "w-72"}
        bg-slate-900/60 backdrop-blur-xl border-r border-slate-800/60 min-h-full`}
    >
      {/* Toggle collapse button */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-6 z-20 w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-all shadow-md cursor-pointer"
        title={collapsed ? "Ouvrir le panneau" : "Réduire le panneau"}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      <div className={`flex flex-col gap-6 p-4 overflow-hidden ${collapsed ? "items-center" : ""}`}>

        {/* ── Section : Clé API ───────────────────── */}
        <div>
          {!collapsed && (
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-2">
              Clé API Gemini
            </p>
          )}

          {apiKey ? (
            <div className={`flex ${collapsed ? "flex-col gap-2" : "gap-2"} items-center`}>
              <div className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-green-950/30 border border-green-800/40 text-green-400 text-xs ${collapsed ? "justify-center" : ""}`}>
                <Key size={12} />
                {!collapsed && <span className="truncate">Clé active</span>}
              </div>
              <button
                onClick={onLogout}
                title="Retirer la clé API"
                className="p-2 rounded-xl border border-slate-800 bg-slate-900/50 text-slate-500 hover:text-red-400 hover:border-red-800/50 hover:bg-red-950/20 transition-all cursor-pointer flex-shrink-0"
              >
                <LogOut size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => onOpenKeyModal()}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 hover:border-primary/50 transition-all text-xs font-medium cursor-pointer ${collapsed ? "justify-center" : ""}`}
              title="Entrer ma clé API Gemini"
            >
              <Key size={12} />
              {!collapsed && "Entrer ma clé API"}
            </button>
          )}
        </div>

        {/* ── Section : Historique ────────────────── */}
        <div className="flex-1 min-h-0">
          {!collapsed && (
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
                Historique récent
              </p>
              {history.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  title="Effacer l'historique"
                  className="text-slate-600 hover:text-red-400 transition-colors cursor-pointer"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          )}

          {collapsed ? (
            <button
              onClick={() => setCollapsed(false)}
              title={`${history.length} requête(s) dans l'historique`}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-800/50 border border-slate-700/50 text-slate-400 hover:text-white transition-all relative cursor-pointer"
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
            <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[340px] pr-0.5">
              {history.map((item, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onRestoreHistory(item)}
                  className="text-left w-full px-3 py-2.5 rounded-xl bg-slate-800/40 hover:bg-primary/10 border border-slate-800 hover:border-primary/30 transition-all group cursor-pointer"
                  title={item.prompt}
                >
                  <p className="text-xs text-slate-300 group-hover:text-primary truncate transition-colors font-medium leading-tight">
                    {item.prompt}
                  </p>
                  <p className="text-[10px] text-slate-600 mt-0.5 truncate">
                    {item.response.replace(/[#*`]/g, "").substring(0, 50)}…
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Section : Support ───────────────────── */}
        <div className="mt-auto pt-3 border-t border-slate-800/60">
          <a
            href="https://buymeacoffee.com/"
            target="_blank"
            rel="noreferrer"
            title="Soutenir le projet"
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-slate-500 hover:text-yellow-400 hover:bg-yellow-950/20 border border-transparent hover:border-yellow-900/30 transition-all text-xs cursor-pointer ${collapsed ? "justify-center" : ""}`}
          >
            <Coffee size={13} />
            {!collapsed && "Soutenir le projet"}
          </a>
        </div>
      </div>
    </aside>
  );
}
