"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import * as Sentry from "@sentry/nextjs";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
  unstable_retry?: () => void;
}

export default function Error({ error, reset, unstable_retry }: ErrorProps) {
  useEffect(() => {
    console.error("Application Error Boundary caught an error:", error);
    Sentry.captureException(error);
  }, [error]);

  const handleRetry = () => {
    if (unstable_retry) {
      unstable_retry();
    } else {
      reset();
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden flex flex-col items-center justify-center p-6">
      {/* Ambient blobs for Navy & Gold OLED premium aesthetic */}
      <div className="hidden md:block fixed top-[-10%] left-[10%] w-[35%] h-[40%] bg-primary/5 rounded-full blur-[140px] pointer-events-none z-0 will-change-transform" />
      <div className="hidden md:block fixed bottom-[-10%] right-[10%] w-[35%] h-[40%] bg-blue-900/10 rounded-full blur-[140px] pointer-events-none z-0 will-change-transform" />

      <div className="relative z-10 text-center max-w-md w-full bg-card/40 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl flex flex-col items-center gap-6 animate-in fade-in zoom-in-95 duration-300">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive animate-pulse">
          <AlertTriangle size={32} />
        </div>

        <div className="space-y-2">
          <h2 className="text-4xl font-display text-white">Erreur</h2>
          <h3 className="text-lg font-semibold text-slate-200">Une anomalie est survenue</h3>
          <p className="text-slate-400 text-sm leading-relaxed">
            Une erreur inattendue a perturbé l&apos;exécution de l&apos;application. Nos équipes ont été notifiées.
          </p>

          {/* Affichage sécurisé de l'erreur */}
          <div className="mt-4 bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 text-left max-h-36 overflow-y-auto w-full">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
              Détails techniques :
            </p>
            <code className="text-xs text-red-400 font-mono break-all whitespace-pre-wrap">
              {error.message || "Erreur système inconnue"}
            </code>
            {error.digest && (
              <p className="text-[10px] text-slate-600 font-mono mt-1 select-all">
                ID : {error.digest}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full">
          <button
            onClick={handleRetry}
            className="flex-1 flex items-center justify-center gap-2 text-sm font-medium text-white bg-primary hover:bg-yellow-600 border border-transparent rounded-xl py-3.5 transition-all shadow-lg shadow-primary/20 hover:shadow-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 cursor-pointer"
            aria-label="Réessayer de charger l'application"
          >
            <RotateCcw size={16} /> Réessayer
          </button>

          <Link
            href="/"
            className="flex-1 flex items-center justify-center gap-2 text-sm font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 rounded-xl py-3.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            aria-label="Retourner à l'accueil"
          >
            <Home size={16} /> Accueil
          </Link>
        </div>
      </div>
    </div>
  );
}
