import type { Metadata } from "next";
import { DM_Sans, Calistoga } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-sans" });
const calistoga = Calistoga({ weight: "400", subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "Excel-Compta AI — Formules Excel & Google Sheets en secondes",
  description: "Générez des formules Excel et Google Sheets complexes en langage naturel. Gratuit, privé, alimenté par Gemini AI. Idéal pour les comptables et financiers.",
  keywords: ["formules Excel", "Google Sheets", "IA", "comptabilité", "finance", "Gemini", "assistant comptable"],
  authors: [{ name: "Excel-Compta AI" }],
  openGraph: {
    title: "Excel-Compta AI — Formules Excel & Sheets générées par IA",
    description: "Décrivez votre besoin comptable en langage naturel. Notre IA génère la formule exacte pour Excel et Google Sheets en secondes.",
    siteName: "Excel-Compta AI",
    locale: "fr_FR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Excel-Compta AI",
    description: "Formules Excel & Google Sheets générées par IA en langage naturel. Gratuit et privé.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`dark ${dmSans.variable} ${calistoga.variable}`} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased font-sans" suppressHydrationWarning>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
