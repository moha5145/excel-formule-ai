import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Excel-Compta AI",
  description: "Générateur et explicateur de formules Excel pour les professionnels de la finance.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`dark ${dmSans.variable}`} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased font-sans" suppressHydrationWarning>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
