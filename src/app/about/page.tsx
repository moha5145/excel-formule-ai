import Link from "next/link";
import { ArrowLeft, ShieldCheck, HelpCircle, HardDrive, RefreshCw } from "lucide-react";

export const metadata = {
  title: "À propos — Excel-Formule AI",
  description: "Foire aux questions, sécurité des données et confidentialité sur Excel-Formule AI.",
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden flex flex-col">
      {/* Ambient blobs */}
      <div className="hidden md:block fixed top-[-10%] right-[10%] w-[30%] h-[40%] bg-primary/5 rounded-full blur-[140px] pointer-events-none z-0 will-change-transform" />
      <div className="hidden md:block fixed bottom-[-10%] left-[10%] w-[30%] h-[40%] bg-blue-900/10 rounded-full blur-[140px] pointer-events-none z-0 will-change-transform" />

      {/* Header */}
      <header className="border-b border-border/40 bg-background/60 backdrop-blur-2xl sticky top-0 z-50">
        <div className="flex items-center justify-between px-6 py-4 max-w-4xl mx-auto w-full">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-yellow-700 flex items-center justify-center text-white font-bold text-sm shadow-md">
              ∑
            </div>
            <h1 className="text-lg font-display text-white tracking-tight">
              Excel-Formule <span className="text-primary font-sans font-medium">AI</span>
            </h1>
          </div>
          <Link
            href="/"
            className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition-all bg-slate-800/40 hover:bg-slate-800 border border-slate-700/50 rounded-xl px-4 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Retourner à l'assistant de formules"
          >
            <ArrowLeft size={14} /> Retour
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-12 relative z-10">
        {/* Title */}
        <div className="mb-12">
          <h2 className="text-3xl md:text-4xl font-display text-white mb-3">
            À propos &amp; Confidentialité
          </h2>
          <p className="text-slate-400 text-sm md:text-base leading-relaxed max-w-2xl">
            Découvrez comment Excel-Formule AI simplifie vos calculs sur tableur tout en protégeant vos données.
          </p>
        </div>

        {/* Security Pillars */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          <div className="bg-card/40 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 flex flex-col gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <ShieldCheck size={20} />
            </div>
            <h3 className="text-white font-semibold text-base">Clé API locale</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Votre clé API Gemini est stockée uniquement en local dans votre navigateur (LocalStorage). Elle n&apos;est jamais sauvegardée sur nos serveurs.
            </p>
          </div>

          <div className="bg-card/40 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 flex flex-col gap-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <HardDrive size={20} />
            </div>
            <h3 className="text-white font-semibold text-base">Stateless</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              L&apos;application est entièrement sans état. Aucune base de données ne conserve vos requêtes financières ou vos formules en dehors de votre historique local.
            </p>
          </div>

          <div className="bg-card/40 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 flex flex-col gap-4">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-400">
              <RefreshCw size={20} />
            </div>
            <h3 className="text-white font-semibold text-base">Contrôle total</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Vous pouvez à tout moment retirer votre clé API ou vider l&apos;historique de vos requêtes récentes en un clic depuis le panneau de contrôle de gauche.
            </p>
          </div>
        </div>

        {/* FAQ Section */}
        <section className="bg-card/20 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-8 mb-12">
          <h3 className="text-white font-display text-2xl mb-8 flex items-center gap-2">
            <HelpCircle className="text-primary" size={22} />
            Foire Aux Questions
          </h3>

          <div className="space-y-6">
            <div className="border-b border-slate-800/60 pb-6">
              <h4 className="text-white font-medium text-base mb-2">Comment fonctionne le mode Démo gratuit ?</h4>
              <p className="text-slate-400 text-sm leading-relaxed">
                Le mode Démo gratuit utilise une base de données locale intelligente pour reconnaître les requêtes les plus courantes (TVA, SOMME.SI, RECHERCHEX, etc.) sans nécessiter de clé API. Il permet de tester l&apos;ergonomie de l&apos;application immédiatement.
              </p>
            </div>

            <div className="border-b border-slate-800/60 pb-6">
              <h4 className="text-white font-medium text-base mb-2">Où puis-je obtenir une clé API Gemini gratuite ?</h4>
              <p className="text-slate-400 text-sm leading-relaxed">
                Vous pouvez obtenir votre clé gratuite en vous connectant sur <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" className="text-primary hover:underline">Google AI Studio</a>. La clé est gratuite dans la limite des quotas standards de Google.
              </p>
            </div>

            <div className="border-b border-slate-800/60 pb-6">
              <h4 className="text-white font-medium text-base mb-2">Mes données sont-elles partagées ?</h4>
              <p className="text-slate-400 text-sm leading-relaxed">
                Non. Les requêtes saisies pour générer des formules transitent de manière sécurisée et chiffrée vers l&apos;API officielle de Google Gemini. L&apos;application elle-même ne collecte aucune donnée personnelle.
              </p>
            </div>

            <div>
              <h4 className="text-white font-medium text-base mb-2">Quelle est la différence entre les modèles Flash et Pro ?</h4>
              <p className="text-slate-400 text-sm leading-relaxed">
                <strong>Gemini Flash</strong> est optimisé pour être extrêmement rapide sur les formules simples. <strong>Gemini Pro</strong> dispose d&apos;un raisonnement mathématique et logique supérieur, parfait pour les calculs imbriqués complexes, le débogage de macros VBA ou de scripts complexes.
              </p>
            </div>
          </div>
        </section>

        {/* GDPR statement */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 p-6 rounded-2xl bg-slate-900/40 border border-slate-800 text-xs text-slate-500">
          <span>
            © {new Date().getFullYear()} Excel-Formule AI. Conforme au RGPD. Hébergement sécurisé en Europe.
          </span>
          <div className="flex gap-4">
            <a href="https://aistudio.google.com/support" target="_blank" rel="noreferrer" className="hover:text-slate-300 transition-colors">Support Google AI Studio</a>
            <Link href="/" className="hover:text-slate-300 transition-colors">Retour à l&apos;assistant</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
