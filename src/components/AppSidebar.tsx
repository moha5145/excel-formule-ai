"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Key, HelpCircle, History, Trash2, ChevronLeft, ChevronRight, Coffee, LogOut, X, AlertTriangle, Crown, Gift, MessageSquarePlus } from "lucide-react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { toast } from "sonner";
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";

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
  onNewConversation?: () => void;
  hasMessages?: boolean;
  history?: HistoryItem[];
  setHistory?: (history: HistoryItem[] | ((prev: HistoryItem[]) => HistoryItem[])) => void;
  dailyFreeRemaining?: number | null;
}

export function AppSidebar({
  apiKey,
  onOpenKeyModal,
  onLogout,
  onRestoreHistory,
  onNewConversation,
  hasMessages = false,
  isMobileDrawer = false,
  history: propsHistory,
  setHistory: propsSetHistory,
  dailyFreeRemaining,
}: AppSidebarProps & { isMobileDrawer?: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const id = setTimeout(() => setMounted(true), 0); return () => clearTimeout(id); }, []);
  const [collapsed, setCollapsed] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const isCollapsed = isMobileDrawer ? false : collapsed;

  // Use state from props if passed, otherwise use local hook state
  const [localHistory, setLocalHistory] = useLocalStorage<HistoryItem[]>("excel_compta_history", []);
  const history = !mounted ? [] : (propsHistory !== undefined ? propsHistory : localHistory);
  const setHistory = propsSetHistory !== undefined ? propsSetHistory : setLocalHistory;

  const handleClearHistory = () => {
    const previousHistory = history;
    setHistory([]);
    setClearConfirmOpen(false);
    toast("Historique effacé.", {
      action: {
        label: "Annuler",
        onClick: () => {
          setHistory(previousHistory);
        },
      },
      duration: 5000,
    });
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
          bg-background/60 backdrop-blur-xl border-r border-border/60 min-h-full overflow-visible`}
    >
      {/* Toggle collapse button */}
      {!isMobileDrawer && (
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute right-1.5 bottom-2.5 z-20 w-5 h-5 rounded-full bg-muted border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all shadow-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          title={isCollapsed ? "Ouvrir le panneau" : "Réduire le panneau"}
          aria-label={isCollapsed ? "Ouvrir la barre latérale" : "Réduire la barre latérale"}
        >
          {isCollapsed ? <ChevronRight size={10} /> : <ChevronLeft size={10} />}
        </button>
      )}
      
      <div className={`flex flex-col gap-5 p-3.5 overflow-hidden ${isCollapsed ? "items-center" : ""}`}>
        {/* Theme Toggle - bottom next to collapse button */}
        {!isMobileDrawer ? (
          <div className={`absolute flex justify-center w-auto ${isCollapsed ? "left-1/2 -translate-x-1/2 bottom-14" : "left-3.5 right-7 bottom-2.5"}`}>
            <ThemeToggle vertical={isCollapsed} />
          </div>
        ) : (
          <div className="flex justify-center mt-auto pt-3 border-t border-border/40">
            <ThemeToggle />
          </div>
        )}

        {/* ── Section : Clé API ───────────────────── */}
        <div>
          {apiKey && mounted ? (
            <div className={`flex ${isCollapsed ? "flex-col gap-2" : "gap-2"} items-center`}>
              <div className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400 dark:bg-green-950/30 dark:border-green-800/40 text-xs ${isCollapsed ? "justify-center" : ""}`}>
                <Key size={12} />
                {!isCollapsed && <span className="truncate">Clé active</span>}
              </div>
              <button
                onClick={onLogout}
                title="Retirer la clé API"
                className="p-2 rounded-xl border border-border bg-muted/50 text-muted-foreground hover:text-red-400 hover:border-red-500/50 hover:bg-red-500/10 transition-all cursor-pointer flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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

        {/* ── Section : Nouvelle conversation ───── */}
        {hasMessages && onNewConversation && (
          <button
            onClick={onNewConversation}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-border hover:border-primary/40 bg-muted/30 hover:bg-primary/5 text-muted-foreground hover:text-foreground transition-all text-xs font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${isCollapsed ? "justify-center" : ""}`}
            title="Nouvelle conversation"
            aria-label="Démarrer une nouvelle conversation"
          >
            <MessageSquarePlus size={12} />
            {!isCollapsed && "Nouvelle conversation"}
          </button>
        )}

        {/* ── Section : Historique ────────────────── */}
        <div className="flex-1 min-h-0">
          {!isCollapsed && (
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-semibold">
                Historique
              </p>
              {history.length > 0 && (
                <button
                  onClick={() => setClearConfirmOpen(true)}
                  title="Effacer l'historique"
                  className="text-muted-foreground/50 hover:text-destructive transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded p-0.5"
                  aria-label="Effacer tout l'historique"
                >
                  <Trash2 size={10} />
                </button>
              )}
            </div>
          )}

          {isCollapsed ? (
            <button
              onClick={() => setCollapsed(false)}
              title={`${history.length} requête(s) dans l'historique`}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-muted/50 border border-border/50 text-muted-foreground hover:text-foreground transition-all relative cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={`Ouvrir la barre latérale pour voir l'historique de ${history.length} requêtes`}
            >
              <History size={13} />
              {history.length > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-primary rounded-full text-[8px] text-white flex items-center justify-center font-bold">
                  {history.length}
                </span>
              )}
            </button>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-5 text-muted-foreground/50">
              <History size={18} />
              <p className="text-[10px] text-center leading-relaxed">
                Aucune requête récente.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1 overflow-y-auto max-h-[380px] pr-0.5">
              {history.map((item) => (
                <div key={item.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onRestoreHistory(item)}
                    className="text-left w-full px-2.5 py-2 rounded-xl bg-muted/30 hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    title={item.prompt}
                    aria-label={`Restaurer la requête historique : ${item.prompt}`}
                  >
                    <p className="text-[11px] text-muted-foreground group-hover:text-primary truncate transition-colors font-medium leading-tight pr-3">
                      {item.prompt}
                    </p>
                    <p className="text-[9px] text-muted-foreground/50 mt-0.5 truncate pr-3">
                      {item.response.replace(/[#*`]/g, "").substring(0, 45)}…
                    </p>
                  </button>
                  <button
                    onClick={() => handleDeleteItem(item.id)}
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    title="Supprimer cette requête"
                    aria-label={`Supprimer la requête : ${item.prompt}`}
                  >
                    <X size={9} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Section : Plan gratuit ────────────── */}
        {!apiKey && dailyFreeRemaining !== null && dailyFreeRemaining !== undefined && (
          <div className="pt-3 border-t border-border/40">
            {isCollapsed ? (
              <button
                onClick={onOpenKeyModal}
                title="Plan gratuit"
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-green-500/10 dark:bg-green-950/30 border border-green-500/30 dark:border-green-800/40 text-green-600 dark:text-green-400 hover:bg-green-500/20 dark:hover:bg-green-950/50 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Voir le plan gratuit"
              >
                <Gift size={13} />
              </button>
            ) : (
              <div className="bg-gradient-to-br from-green-50 to-card dark:from-green-950/20 dark:to-slate-900 border border-green-200 dark:border-green-800/20 p-3 rounded-xl flex flex-col gap-2 relative overflow-hidden group">
                <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400 font-semibold text-[11px] tracking-tight">
                  <Gift size={12} />
                  <span>Plan gratuit</span>
                </div>
                <div className="w-full bg-green-progress-bg rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full transition-all duration-500"
                    style={{ width: `${((3 - dailyFreeRemaining) / 3) * 100}%` }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">
                    <span className="text-green-600 dark:text-green-400 font-semibold">{dailyFreeRemaining}</span>/3 messages
                  </span>
                  <button
                    onClick={onOpenKeyModal}
                    className="text-[10px] text-primary hover:text-yellow-600 dark:hover:text-yellow-300 font-medium transition-colors cursor-pointer"
                  >
                    Débloquer plus →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Section : Support ───────────────────── */}
        <div className="mt-auto pt-3 border-t border-border/40 flex flex-col gap-2">
          {isCollapsed ? (
            <a
              href={process.env.NEXT_PUBLIC_SUPPORT_URL || "https://buymeacoffee.com/"}
              target="_blank"
              rel="noreferrer"
              title="Soutenir le projet"
              className="flex items-center justify-center w-9 h-9 rounded-xl text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 dark:bg-yellow-950/30 border border-yellow-300 dark:border-yellow-700/40 hover:bg-yellow-500/20 dark:hover:bg-yellow-950/50 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Faire un don de soutien Buy Me A Coffee"
            >
              <Coffee size={13} />
            </a>
          ) : (
            <div className="bg-gradient-to-br from-yellow-50 to-card dark:from-yellow-950/20 dark:to-muted border border-yellow-200 dark:border-yellow-800/20 p-3 rounded-xl flex flex-col gap-2 relative overflow-hidden group">
              <div className="flex items-center gap-1.5 text-yellow-600 dark:text-yellow-400 font-semibold text-[11px] tracking-tight">
                <Coffee size={12} />
                <span>Soutenir le projet</span>
              </div>
              <a
                href={process.env.NEXT_PUBLIC_SUPPORT_URL || "https://buymeacoffee.com/"}
                target="_blank"
                rel="noreferrer"
                className="w-full text-center py-1.5 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-white text-[10px] font-semibold shadow-sm hover:shadow-md transition-all cursor-pointer hover:scale-[1.02]"
              >
                ☕ Offrir un café
              </a>
            </div>
          )}
          <Link
            href="/about"
            title="À propos & FAQ"
            className={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-muted-foreground/60 hover:text-foreground hover:bg-muted/30 transition-all text-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${isCollapsed ? "justify-center" : ""}`}
            aria-label="En savoir plus à propos de l'application et de la confidentialité"
          >
            <HelpCircle size={12} />
            {!isCollapsed && "À propos & FAQ"}
          </Link>
        </div>
      </div>
      {/* ── Modal de confirmation ────────────────── */}
      <Dialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <DialogPortal>
          <DialogOverlay />
          <DialogContent showCloseButton={false}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-400">
                <AlertTriangle size={18} />
                Effacer tout l'historique ?
              </DialogTitle>
              <DialogDescription>
                Cette action supprime l&apos;intégralité de vos requêtes sauvegardées.
                Vous pourrez annuler cette action pendant 5 secondes après confirmation.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setClearConfirmOpen(false)}>Annuler</Button>
              <Button
                variant="destructive"
                onClick={handleClearHistory}
                className="bg-red-600 hover:bg-red-500 text-white"
              >
                <Trash2 size={14} className="mr-1.5" />
                Tout effacer
              </Button>
            </DialogFooter>
          </DialogContent>
        </DialogPortal>
      </Dialog>
    </aside>
  );
}
