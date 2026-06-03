import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";

export const metadata = {
  title: "Page introuvable — Excel-Compta AI",
};

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden flex flex-col items-center justify-center p-6">
      {/* Ambient blobs */}
      <div className="hidden md:block fixed top-[-10%] left-[10%] w-[35%] h-[40%] bg-primary/5 rounded-full blur-[140px] pointer-events-none z-0 will-change-transform" />
      <div className="hidden md:block fixed bottom-[-10%] right-[10%] w-[35%] h-[40%] bg-blue-900/10 rounded-full blur-[140px] pointer-events-none z-0 will-change-transform" />

      <div className="relative z-10 text-center max-w-md w-full bg-card/40 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl flex flex-col items-center gap-6">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 animate-pulse">
          <AlertTriangle size={32} />
        </div>

        <div className="space-y-2">
          <h2 className="text-4xl font-display text-white">404</h2>
          <h3 className="text-lg font-semibold text-slate-200">Formule introuvable</h3>
          <p className="text-slate-400 text-sm leading-relaxed">
            La cellule ou l'adresse que vous tentez de joindre n'existe pas ou a été déplacée dans un autre classeur.
          </p>
        </div>

        <Link
          href="/"
          className="w-full flex items-center justify-center gap-2 text-sm font-medium text-white bg-primary hover:bg-yellow-600 border border-transparent rounded-xl py-3.5 transition-all shadow-lg shadow-primary/20 hover:shadow-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          aria-label="Retourner à l'accueil"
        >
          <ArrowLeft size={16} /> Retour à l'assistant
        </Link>
      </div>
    </div>
  );
}
