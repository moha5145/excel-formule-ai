import { describe, it, expect } from "vitest";
import { detectCsvDelimiter, buildColumnStats, buildTextRepresentation } from "./fileParser";

describe("detectCsvDelimiter", () => {
  it("devrait détecter le point-virgule pour les fichiers CSV francophones", () => {
    const csvContent = "Nom;Prix;Quantite\nPomme;1,50;10\nBanane;2,00;5";
    expect(detectCsvDelimiter(csvContent)).toBe(";");
  });

  it("devrait détecter la virgule pour les fichiers CSV standards anglophones", () => {
    const csvContent = "Name,Price,Quantity\nApple,1.50,10\nBanana,2.00,5";
    expect(detectCsvDelimiter(csvContent)).toBe(",");
  });

  it("devrait détecter la tabulation pour les fichiers TSV", () => {
    const tsvContent = "Name\tPrice\tQuantity\nApple\t1.50\t10";
    expect(detectCsvDelimiter(tsvContent)).toBe("\t");
  });

  it("devrait utiliser la virgule par défaut si aucun séparateur évident n'est trouvé", () => {
    const emptyContent = "UneSeuleColonneSansSeparateur";
    expect(detectCsvDelimiter(emptyContent)).toBe(",");
  });
});

describe("buildColumnStats", () => {
  it("devrait calculer les types et taux de remplissage par colonne", () => {
    const headers = ["Produit", "Prix", "Stock"];
    const rows = [
      ["Pomme", 1.5, 10],
      ["Banane", 2.0, null],
      ["Orange", 3.0, 15],
    ];
    const stats = buildColumnStats(headers, rows);
    expect(stats).toHaveLength(3);
    expect(stats[0].name).toBe("Produit");
    expect(stats[0].type).toBe("text");
    expect(stats[0].filledCount).toBe(3);
    expect(stats[0].nullCount).toBe(0);

    expect(stats[1].name).toBe("Prix");
    expect(stats[1].type).toBe("number");

    expect(stats[2].name).toBe("Stock");
    expect(stats[2].nullCount).toBe(1);
    expect(stats[2].filledCount).toBe(2);
  });

  it("devrait identifier les colonnes de dates", () => {
    const headers = ["Date", "Montant"];
    const rows = [
      ["2024-01-15", 100],
      ["2024-02-20", 200],
    ];
    const stats = buildColumnStats(headers, rows);
    expect(stats[0].type).toBe("date");
    expect(stats[1].type).toBe("number");
  });
});

describe("buildTextRepresentation avec colonnes confidentielles", () => {
  it("devrait masquer les valeurs des colonnes confidentielles par [CONFIDENTIEL]", () => {
    const sheet = {
      name: "Feuille1",
      headers: ["Nom", "Salaire", "Service"],
      rows: [
        ["Alice", 3500, "Marketing"],
        ["Bob", 4200, "Tech"],
      ],
      totalRows: 2,
      totalCols: 3,
    };
    const text = buildTextRepresentation(sheet, {}, ["Salaire", "Nom"]);
    expect(text).toContain("| Nom | Salaire | Service |");
    expect(text).toContain("| [CONFIDENTIEL] | [CONFIDENTIEL] | Marketing |");
    expect(text).toContain("| [CONFIDENTIEL] | [CONFIDENTIEL] | Tech |");
    expect(text).not.toContain("3500");
    expect(text).not.toContain("Alice");
  });
});

describe("parseFile avec rawBuffer et indexation", () => {
  it("devrait conserver rawBuffer et assigner les lettres de colonnes réelles", async () => {
    const { parseFile } = await import("./fileParser");
    const csvContent = "Produit,Prix,Quantite\nPomme,1.5,10\nBanane,2.0,5";
    const file = new File([csvContent], "fruits.csv", { type: "text/csv" });

    const result = await parseFile(file);

    expect(result.rawBuffer).toBeDefined();
    expect(result.rawBuffer.byteLength).toBeGreaterThan(0);
    expect(result.fileType).toBe("csv");
    expect(result.sheets[0].colLetters).toEqual(["A", "B", "C"]);
    expect(result.sheets[0].dataStartRowIndex).toBe(2);
  });
});

