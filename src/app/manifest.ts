import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Excel-Compta AI",
    short_name: "ExcelCompta",
    description: "Formules Excel & Google Sheets générées par IA en langage naturel",
    start_url: "/",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#f59e0b",
    icons: [
      {
        src: "/icon",
        sizes: "any",
        type: "image/png",
      },
    ],
  };
}
