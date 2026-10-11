import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { modifyExistingWorkbook, type WorkbookModificationConfig } from "./workbookModifier";

describe("workbookModifier", () => {
  it("devrait ajouter une colonne calculée sur toutes les lignes d'un fichier XLSX existant", async () => {
    // 1. Créer un classeur source en mémoire simulant le fichier importé de l'utilisateur
    const srcWorkbook = new ExcelJS.Workbook();
    const ws = srcWorkbook.addWorksheet("Ventes");
    ws.addRow(["Produit", "Prix Unitaire", "Quantite"]); // Ligne 1 (en-têtes)
    ws.addRow(["Ordinateur", 1000, 2]);                  // Ligne 2
    ws.addRow(["Souris", 25, 4]);                        // Ligne 3
    ws.addRow(["Clavier", 75, 3]);                       // Ligne 4

    const rawBuffer = (await srcWorkbook.xlsx.writeBuffer()) as ArrayBuffer;

    const config: WorkbookModificationConfig = {
      rawBuffer,
      fileName: "ventes.xlsx",
      sheetName: "Ventes",
      newColumns: [
        {
          header: "Total HT",
          formula: "=B{row}*C{row}",
          formula_en: "=B{row}*C{row}",
          type: "currency",
        },
      ],
      format: "excel-fr",
    };

    const { modifiedWorkbook, warnings } = await modifyExistingWorkbook(config);

    expect(warnings).toHaveLength(0);
    const targetWs = modifiedWorkbook.getWorksheet("Ventes");
    expect(targetWs).toBeDefined();

    // Vérifier que la nouvelle colonne D a été ajoutée avec son en-tête
    expect(targetWs!.getCell("D1").value).toBe("Total HT");

    // Vérifier que les formules sont correctement assignées pour CHAQUE ligne réelle
    expect(targetWs!.getCell("D2").value).toEqual({ formula: "B2*C2" });
    expect(targetWs!.getCell("D3").value).toEqual({ formula: "B3*C3" });
    expect(targetWs!.getCell("D4").value).toEqual({ formula: "B4*C4" });

    // Vérifier que les données d'origine sont intactes
    expect(targetWs!.getCell("A2").value).toBe("Ordinateur");
    expect(targetWs!.getCell("B2").value).toBe(1000);
    expect(targetWs!.getCell("C2").value).toBe(2);
    expect(targetWs!.getCell("D2").numFmt).toBe("#,##0.00 \"€\"");
  });

  it("devrait préserver les autres onglets et les formules existantes du classeur", async () => {
    const srcWorkbook = new ExcelJS.Workbook();
    const ws1 = srcWorkbook.addWorksheet("Données");
    ws1.addRow(["Code", "Valeur"]);
    ws1.addRow(["A100", 50]);

    const ws2 = srcWorkbook.addWorksheet("Paramètres");
    ws2.addRow(["Paramètre", "Valeur"]); // Ligne 1
    ws2.addRow(["Taux", 0.2]);           // Ligne 2 (B2 = 0.2)

    const rawBuffer = (await srcWorkbook.xlsx.writeBuffer()) as ArrayBuffer;

    const config: WorkbookModificationConfig = {
      rawBuffer,
      fileName: "classeur_multi.xlsx",
      sheetName: "Données",
      newColumns: [
        {
          header: "Valeur TTC",
          formula: "=B{row}*(1+Paramètres!$B$2)",
          formula_en: "=B{row}*(1+Paramètres!$B$2)",
          type: "currency",
        },
      ],
      format: "excel-fr",
    };

    const { modifiedWorkbook } = await modifyExistingWorkbook(config);

    expect(modifiedWorkbook.worksheets).toHaveLength(2);
    expect(modifiedWorkbook.getWorksheet("Paramètres")!.getCell("B2").value).toBe(0.2);
    expect(modifiedWorkbook.getWorksheet("Données")!.getCell("C2").value).toEqual({
      formula: "B2*(1+Paramètres!$B$2)",
    });
  });

  it("devrait convertir un CSV importé en classeur XLSX enrichi avec la colonne ajoutée", async () => {
    const csvContent = "Nom,Salaire\nAlice,3000\nBob,2500";
    const rawBuffer = new TextEncoder().encode(csvContent).buffer;

    const config: WorkbookModificationConfig = {
      rawBuffer,
      fileName: "employes.csv",
      newColumns: [
        {
          header: "Prime 10%",
          formula: "=B{row}*0.1",
          formula_en: "=B{row}*0.1",
          type: "currency",
        },
      ],
      format: "excel-fr",
    };

    const { modifiedWorkbook } = await modifyExistingWorkbook(config);
    const ws = modifiedWorkbook.worksheets[0];
    expect(ws).toBeDefined();
    expect(ws.getCell("C1").value).toBe("Prime 10%");
    expect(ws.getCell("C2").value).toEqual({ formula: "B2*0.1" });
    expect(ws.getCell("C3").value).toEqual({ formula: "B3*0.1" });
  });
});
