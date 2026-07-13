import type { Metadata } from "next";
import { DM_Sans, Calistoga } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Analytics } from "@vercel/analytics/react";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-sans" });
const calistoga = Calistoga({ weight: "400", subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = {
  metadataBase: new URL("https://excel-formule-ai.vercel.app"),
  title: "Excel-Formule AI — Formules Excel & Google Sheets en secondes",
  description: "Générez des formules Excel et Google Sheets complexes en langage naturel. Gratuit, privé, alimenté par Gemini AI. Idéal pour tous les utilisateurs de tableurs.",
  keywords: ["formules Excel", "Google Sheets", "IA", "tableur", "calculs", "Gemini", "assistant de formule"],
  authors: [{ name: "Excel-Formule AI" }],
  openGraph: {
    title: "Excel-Formule AI — Formules Excel & Sheets générées par IA",
    description: "Décrivez votre besoin en langage naturel. Notre IA génère la formule exacte pour Excel et Google Sheets en secondes.",
    siteName: "Excel-Formule AI",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    locale: "fr_FR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Excel-Formule AI",
    description: "Formules Excel & Google Sheets générées par IA en langage naturel. Gratuit et privé.",
    images: ["/og-image.png"],
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
        <Analytics />
      </body>
    </html>
  );
}
