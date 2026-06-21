export default function Loading() {
  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden flex flex-col items-center justify-center p-6">
      <div className="hidden md:block fixed top-[-10%] left-[10%] w-[35%] h-[40%] bg-primary/5 rounded-full blur-[140px] pointer-events-none z-0 will-change-transform" />
      <div className="hidden md:block fixed bottom-[-10%] right-[10%] w-[35%] h-[40%] bg-blue-900/10 rounded-full blur-[140px] pointer-events-none z-0 will-change-transform" />

      <div className="relative z-10 flex flex-col items-center gap-4">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-yellow-700 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-primary/20">
          ∑
        </div>
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    </div>
  );
}
