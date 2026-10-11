# Plan d'implémentation : Préservation et Enrichissement des Fichiers Excel Importés à l'Export

> **Date :** 11 Octobre 2026  
> **Statut :** Prêt pour exécution  
> **Branche recommandée :** `feat/preserve-imported-excel-on-export`

---

## 1. Contexte & Diagnostic du Problème

### Le Constat Utilisateur
Lorsqu'un utilisateur importe un fichier Excel (`.xlsx`, `.xls`) ou CSV dans l'application et demande des modifications (ex: *"Ajoute une colonne Total TTC"*, *"Calcule la commission sur chaque ligne"*, *"Applique une remise conditionnelle"*), le fichier Excel exporté ne respecte absolument pas le fichier original :
1. **Perte totale des données et de la structure** : L'export recrée un classeur entièrement vierge de démonstration (`Tableau Interactif` ou `Exemple Pratique`), avec seulement 3 lignes factices commençant en cellule `C10`, écrasant les centaines de lignes réelles, les autres onglets, les styles et les en-têtes originaux.
2. **Destruction du buffer binaire à l'import** : Le composant `parseFile` ne conserve pas l'ArrayBuffer source, et `page.tsx` supprime immédiatement `fileContext` dès l'envoi du message (`setFileContext(null)`).
3. **Injonction contradictoire dans le prompt de l'IA** : Le prompt système force l'IA à utiliser une convention artificielle (données en C10, B="Ligne", sample_rows=3), empêchant l'IA de travailler sur les véritables colonnes (A, B, C...) et lignes du fichier de l'utilisateur.

### L'Objectif
Permettre un **flux d'enrichissement in-place fidèle** :
- **Préserver à 100% le fichier d'origine** : toutes ses lignes réelles (10, 500, 5000 lignes), tous ses onglets, ses styles et ses formules préexistantes.
- **Injecter les modifications demandées** : ajouter la ou les nouvelles colonnes calculées directement dans la feuille ciblée du classeur original, avec les formules Excel réelles étendues sur **toutes** les lignes de données.
- **Offrir le choix d'export dans l'interface** :
  1. Option principale : *« Télécharger le fichier complété (.xlsx) »* (nommé `[nom_fichier]_modifie.xlsx`).
  2. Option secondaire : *« Télécharger comme maquette isolée »* (le modèle de simulation de démonstration actuel).
- **Aperçu interactif fidèle** : afficher dans `ComplexTablePreview` les vraies colonnes et vraies valeurs du fichier importé avec la colonne calculée en surbrillance.

---

## 2. Cartographie des Fichiers

| Fichier | Action | Responsabilité |
| :--- | :--- | :--- |
| `src/lib/fileParser.ts` | **Modifier** | Conserver le buffer brut (`rawBuffer`) dans `FileParseResult` et associer les lettres de colonnes réelles (A, B, C...). |
| `src/lib/fileParser.test.ts` | **Modifier** | Tests unitaires pour la conservation du `rawBuffer` et l'indexation des colonnes. |
| `src/lib/excelExport/workbookModifier.ts` | **Créer** | Moteur de modification in-place ExcelJS : chargement du classeur original, ajout/modification de colonnes avec formules sur toutes les lignes réelles, préservation des feuilles et styles. |
| `src/lib/excelExport/workbookModifier.test.ts` | **Créer** | Tests unitaires complets TDD sur la manipulation de fichiers réels en mémoire. |
| `src/lib/excelExport/schemaParser.ts` | **Modifier** | Support du schéma de modification de fichier (`FileModificationSchema`) et extraction depuis la réponse de l'IA. |
| `src/lib/excelExport/schemaParser.test.ts` | **Modifier** | Tests de parsing et validation pour le schéma de modification. |
| `src/app/api/gemini/route.ts` | **Modifier** | Instructions système spécifiques quand un fichier est importé : référencement des colonnes réelles (A, B, C...) et génération du schéma de modification. |
| `src/components/FormulaAssistant.tsx` | **Modifier** | Extension de `FileContext` avec `rawBuffer` et persistance du fichier durant les échanges. |
| `src/app/page.tsx` | **Modifier** | Conservation du fichier dans les messages de la conversation, intégration du bouton de téléchargement du fichier modifié. |
| `src/components/ComplexTablePreview.tsx` | **Modifier** | Affichage de l'échantillon des données réelles du fichier importé avec la colonne modifiée/ajoutée. |

---

## 3. Découpage des Tâches (Bite-Sized & TDD)

### Phase 1 : Préservation du Buffer Binaire et Métadonnées de Fichier

#### Tâche 1.1 : Tests unitaires pour la conservation du `rawBuffer` dans `fileParser`

**Fichiers :**
- Modifier : `src/lib/fileParser.test.ts`
- Modifier : `src/lib/fileParser.ts`

- [ ] **Étape 1 : Écrire le test unitaire vérifiant la présence de `rawBuffer` et des lettres de colonnes dans `ParsedSheet`**

Dans `src/lib/fileParser.test.ts` :
```typescript
it("devrait conserver rawBuffer et assigner les lettres de colonnes réelles", async () => {
  const csvContent = "Produit,Prix,Quantite\nPomme,1.5,10\nBanane,2.0,5";
  const file = new File([csvContent], "fruits.csv", { type: "text/csv" });

  const result = await parseFile(file);

  expect(result.rawBuffer).toBeDefined();
  expect(result.rawBuffer.byteLength).toBeGreaterThan(0);
  expect(result.fileType).toBe("csv");
  expect(result.sheets[0].colLetters).toEqual(["A", "B", "C"]);
  expect(result.sheets[0].dataStartRowIndex).toBe(2); // Ligne 1 = en-têtes, Ligne 2 = début données (1-based)
});
```

- [ ] **Étape 2 : Exécuter le test pour vérifier l'échec initial**
```bash
npx vitest run src/lib/fileParser.test.ts
```
*Attendu : Échec TypeScript/Vitest car `rawBuffer`, `fileType`, `colLetters`, `dataStartRowIndex` n'existent pas encore dans l'interface.*

- [ ] **Étape 3 : Implémenter l'enrichissement dans `src/lib/fileParser.ts`**

Mettre à jour les interfaces :
```typescript
export interface ParsedSheet {
  name: string;
  headers: string[];
  rows: (string | number | null)[][];
  totalRows: number;
  totalCols: number;
  colLetters: string[];
  dataStartRowIndex: number; // 1-based (ex: 2 si la ligne 1 est l'en-tête)
  stats?: ColumnStat[];
}

export interface FileParseResult {
  fileName: string;
  fileSize: number;
  fileType: "xlsx" | "xls" | "csv";
  rawBuffer: ArrayBuffer;
  sheets: ParsedSheet[];
  textRepresentation: string;
  columnStats?: Record<string, ColumnStat[]>;
}
```

Dans `sheetToParsedSheet` :
```typescript
function getColumnLetter(colIndexZeroBased: number): string {
  let temp = colIndexZeroBased;
  let letter = "";
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

// Dans sheetToParsedSheet :
const colLetters = headers.map((_, i) => getColumnLetter(i));
return {
  name,
  headers,
  rows,
  totalRows: data.length > 0 ? data.length - 1 : 0,
  totalCols: headers.length,
  colLetters,
  dataStartRowIndex: 2,
  stats,
};
```

Dans `parseFile` :
```typescript
const isCsv = file.name.endsWith(".csv");
const fileType: "xlsx" | "xls" | "csv" = isCsv
  ? "csv"
  : file.name.endsWith(".xls")
  ? "xls"
  : "xlsx";

// Renvoyer rawBuffer: buffer et fileType dans les deux branches de retour
```

- [ ] **Étape 4 : Exécuter le test pour vérifier le succès**
```bash
npx vitest run src/lib/fileParser.test.ts
```
*Attendu : PASS.*

- [ ] **Étape 5 : Commit**
```bash
git add src/lib/fileParser.ts src/lib/fileParser.test.ts
git commit -m "feat(parser): conservation du rawBuffer et indexation des lettres de colonnes A-Z"
```

---

### Phase 2 : Le Moteur de Modification In-Place (`workbookModifier.ts`)

#### Tâche 2.1 : Tests unitaires TDD pour la modification de classeurs réels

**Fichiers :**
- Créer : `src/lib/excelExport/workbookModifier.test.ts`
- Créer : `src/lib/excelExport/workbookModifier.ts`

- [ ] **Étape 1 : Écrire les tests unitaires pour `modifyExistingWorkbook`**

Créer `src/lib/excelExport/workbookModifier.test.ts` :
```typescript
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
    ws2.addRow(["Taux", 0.2]);

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
```

- [ ] **Étape 2 : Exécuter le test pour vérifier l'échec**
```bash
npx vitest run src/lib/excelExport/workbookModifier.test.ts
```
*Attendu : Échec car `src/lib/excelExport/workbookModifier.ts` n'existe pas encore.*

- [ ] **Étape 3 : Implémenter `src/lib/excelExport/workbookModifier.ts`**

Créer `src/lib/excelExport/workbookModifier.ts` :
```typescript
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { type ExportFormat, resolveFormulaTemplate } from "./postProcessFormula";
import { detectCsvDelimiter } from "../fileParser";
import { patchWorkbookForceCalc } from "../excelExport";

export interface NewColumnDefinition {
  header: string;
  formula: string;
  formula_en?: string;
  type?: "currency" | "percentage" | "integer" | "number" | "text" | "date";
  description?: string;
}

export interface WorkbookModificationConfig {
  rawBuffer: ArrayBuffer;
  fileName: string;
  sheetName?: string;
  newColumns: NewColumnDefinition[];
  format?: ExportFormat;
}

export interface ModificationResult {
  modifiedWorkbook: ExcelJS.Workbook;
  warnings: string[];
}

const BRAND_HEADER_BG = "FF166534"; // Vert émeraude distinctif pour marquer l'ajout IA élégamment
const BRAND_HEADER_FG = "FFFFFFFF";
const BORDER_COLOR = "FFCBD5E1";

function setCellFormatByType(cell: ExcelJS.Cell, type?: string): void {
  switch (type) {
    case "currency":
      cell.numFmt = "#,##0.00 \"€\"";
      break;
    case "percentage":
      cell.numFmt = "0.00%";
      break;
    case "integer":
      cell.numFmt = "#,##0";
      break;
    case "date":
      cell.numFmt = "dd/mm/yyyy";
      break;
    default:
      cell.numFmt = "General";
  }
}

function getColumnLetter(colNumberOneBased: number): string {
  let temp = colNumberOneBased - 1;
  let letter = "";
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

export async function loadWorkbookFromBuffer(
  rawBuffer: ArrayBuffer,
  fileName: string
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const lowerName = fileName.toLowerCase();

  if (lowerName.endsWith(".csv")) {
    const text = new TextDecoder("utf-8").decode(rawBuffer);
    const delimiter = detectCsvDelimiter(text);
    const sheetData = XLSX.read(text, {
      type: "string",
      raw: false,
      FS: delimiter,
    });
    const firstSheetName = sheetData.SheetNames[0] || "CSV";
    const sheet = sheetData.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });

    const ws = workbook.addWorksheet(fileName.replace(/\.csv$/i, "").slice(0, 31) || "Données");
    for (let r = 0; r < rows.length; r++) {
      const row = ws.getRow(r + 1);
      const rowData = rows[r];
      for (let c = 0; c < rowData.length; c++) {
        row.getCell(c + 1).value = rowData[c] as ExcelJS.CellValue;
      }
      row.commit();
    }
    return workbook;
  }

  // Pour XLSX et XLS
  try {
    await workbook.xlsx.load(rawBuffer);
    return workbook;
  } catch {
    // Si ExcelJS échoue sur un XLS binaire ancien, passer par SheetJS pour reconstituer
    const sheetJsWb = XLSX.read(rawBuffer, { type: "array" });
    for (const sName of sheetJsWb.SheetNames) {
      const sheet = sheetJsWb.Sheets[sName];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
      const ws = workbook.addWorksheet(sName);
      for (let r = 0; r < rows.length; r++) {
        const row = ws.getRow(r + 1);
        const rowData = rows[r];
        for (let c = 0; c < rowData.length; c++) {
          row.getCell(c + 1).value = rowData[c] as ExcelJS.CellValue;
        }
        row.commit();
      }
    }
    return workbook;
  }
}

export async function modifyExistingWorkbook(
  config: WorkbookModificationConfig
): Promise<ModificationResult> {
  const warnings: string[] = [];
  const format = config.format || "excel-fr";
  const workbook = await loadWorkbookFromBuffer(config.rawBuffer, config.fileName);

  workbook.calcProperties.fullCalcOnLoad = true;

  // Sélectionner la feuille cible
  let targetSheet: ExcelJS.Worksheet | undefined;
  if (config.sheetName) {
    targetSheet = workbook.getWorksheet(config.sheetName);
  }
  if (!targetSheet) {
    targetSheet = workbook.worksheets[0];
  }

  if (!targetSheet) {
    throw new Error("Aucune feuille trouvée dans le classeur.");
  }

  // Déterminer la ligne d'en-tête et les dimensions réelles
  let headerRowIndex = 1;
  while (headerRowIndex <= 20 && targetSheet.getRow(headerRowIndex).actualCellCount === 0) {
    headerRowIndex++;
  }
  if (headerRowIndex > 20) headerRowIndex = 1;

  const headerRow = targetSheet.getRow(headerRowIndex);
  let maxColIndex = 0;
  headerRow.eachCell({ includeEmpty: false }, (_cell, colNumber) => {
    if (colNumber > maxColIndex) maxColIndex = colNumber;
  });
  if (maxColIndex === 0) {
    maxColIndex = targetSheet.columnCount || 1;
  }

  // Déterminer la dernière ligne de données
  let lastDataRowIndex = targetSheet.actualRowCount;
  if (lastDataRowIndex <= headerRowIndex) {
    lastDataRowIndex = headerRowIndex + 1;
  }

  // Appliquer l'ajout des nouvelles colonnes
  let currentColIndex = maxColIndex + 1;

  for (const newCol of config.newColumns) {
    // 1. En-tête
    const headerCell = targetSheet.getCell(headerRowIndex, currentColIndex);
    headerCell.value = newCol.header;
    headerCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: BRAND_HEADER_FG } };
    headerCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_HEADER_BG } };
    headerCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    headerCell.border = {
      top: { style: "thin", color: { argb: BORDER_COLOR } },
      bottom: { style: "medium", color: { argb: BRAND_HEADER_BG } },
      left: { style: "thin", color: { argb: BORDER_COLOR } },
      right: { style: "thin", color: { argb: BORDER_COLOR } },
    };

    // Ajuster largeur de colonne
    const colWidth = Math.max(14, newCol.header.length + 4);
    targetSheet.getColumn(currentColIndex).width = colWidth;

    // 2. Formule sur toutes les lignes de données réelles
    const formulaTemplate = newCol.formula_en || newCol.formula;
    const isAlreadyEnglish = Boolean(newCol.formula_en);

    for (let r = headerRowIndex + 1; r <= lastDataRowIndex; r++) {
      const dataCell = targetSheet.getCell(r, currentColIndex);

      try {
        const resolved = resolveFormulaTemplate(formulaTemplate, r, format, isAlreadyEnglish);
        dataCell.value = { formula: resolved.replace(/^=/, "") };
      } catch (err: unknown) {
        warnings.push(`Ligne ${r}, colonne ${newCol.header} : ${(err as Error).message}`);
        dataCell.value = "";
      }

      setCellFormatByType(dataCell, newCol.type);
      dataCell.border = {
        top: { style: "thin", color: { argb: BORDER_COLOR } },
        bottom: { style: "thin", color: { argb: BORDER_COLOR } },
        left: { style: "thin", color: { argb: BORDER_COLOR } },
        right: { style: "thin", color: { argb: BORDER_COLOR } },
      };
      dataCell.alignment = { vertical: "middle" };
    }

    currentColIndex++;
  }

  return { modifiedWorkbook: workbook, warnings };
}

export async function downloadModifiedWorkbookAsExcel(
  config: WorkbookModificationConfig
): Promise<{ warnings: string[]; blob: Blob }> {
  const { modifiedWorkbook, warnings } = await modifyExistingWorkbook(config);
  const blob = await patchWorkbookForceCalc(modifiedWorkbook);
  return { warnings, blob };
}
```

- [ ] **Étape 4 : Exécuter les tests pour vérifier le succès**
```bash
npx vitest run src/lib/excelExport/workbookModifier.test.ts
```
*Attendu : PASS (les 3 tests passent).*

- [ ] **Étape 5 : Commit**
```bash
git add src/lib/excelExport/workbookModifier.ts src/lib/excelExport/workbookModifier.test.ts
git commit -m "feat(excel): moteur de modification in-place de classeur existant avec application des formules sur toutes les lignes"
```

---

### Phase 3 : Extraction du Schéma de Modification et Intégration IA

#### Tâche 3.1 : Support du Schéma `FILE_MODIFICATION` dans `schemaParser.ts`

**Fichiers :**
- Modifier : `src/lib/excelExport/schemaParser.ts`
- Modifier : `src/lib/excelExport/schemaParser.test.ts`

- [ ] **Étape 1 : Écrire le test unitaire pour l'extraction de `FileModificationSchema`**

Dans `src/lib/excelExport/schemaParser.test.ts` :
```typescript
import { extractFileModificationSchema, validateFileModificationSchema } from "./schemaParser";

describe("FileModificationSchema", () => {
  it("devrait extraire et valider un schéma de modification de fichier", () => {
    const response = `
    J'ai calculé la TVA pour votre tableau.
    <!-- FILE_MODIFICATION: {
      "target_sheet": "Feuille1",
      "new_columns": [
        { "header": "TVA 20%", "type": "currency", "formula": "=C{row}*0.2", "formula_en": "=C{row}*0.2" }
      ]
    } -->
    `;

    const raw = extractFileModificationSchema(response);
    expect(raw).not.toBeNull();
    const validated = validateFileModificationSchema(raw);
    expect(validated.target_sheet).toBe("Feuille1");
    expect(validated.new_columns).toHaveLength(1);
    expect(validated.new_columns[0].header).toBe("TVA 20%");
  });
});
```

- [ ] **Étape 2 : Exécuter le test pour vérifier l'échec initial**
```bash
npx vitest run src/lib/excelExport/schemaParser.test.ts
```
*Attendu : Échec car les fonctions ne sont pas encore exportées.*

- [ ] **Étape 3 : Implémenter le parsing Zod dans `src/lib/excelExport/schemaParser.ts`**

Ajouter dans `schemaParser.ts` :
```typescript
export const NewColumnSchema = z.object({
  header: z.string().min(1, "En-tête de colonne requis"),
  type: z.enum(["text", "currency", "percentage", "integer", "number", "date"]).default("number"),
  formula: z.string().min(1, "Formule requise"),
  formula_en: z.string().optional(),
  description: z.string().optional(),
});

export const FileModificationSchema = z.object({
  target_sheet: z.string().optional(),
  new_columns: z.array(NewColumnSchema).min(1, "Au moins une nouvelle colonne requise"),
});

export type FileModification = z.infer<typeof FileModificationSchema>;

export function extractFileModificationSchema(response: string): unknown | null {
  const match = response.match(/<!--\s*FILE_MODIFICATION:\s*(\{[\s\S]*?\})\s*-->/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export function validateFileModificationSchema(raw: unknown): FileModification {
  const result = FileModificationSchema.safeParse(raw);
  if (!result.success) {
    throw new SchemaValidationError(result.error.issues);
  }
  return result.data;
}
```

- [ ] **Étape 4 : Exécuter le test pour vérifier le succès**
```bash
npx vitest run src/lib/excelExport/schemaParser.test.ts
```
*Attendu : PASS.*

- [ ] **Étape 5 : Commit**
```bash
git add src/lib/excelExport/schemaParser.ts src/lib/excelExport/schemaParser.test.ts
git commit -m "feat(schema): parsing et validation du schema FILE_MODIFICATION"
```

---

#### Tâche 3.2 : Mise à jour du Prompt Système dans `src/app/api/gemini/route.ts`

**Fichiers :**
- Modifier : `src/app/api/gemini/route.ts`

- [ ] **Étape 1 : Mettre à jour la section `SPREADSHEET FILE CONTEXT` dans `route.ts`**

Dans `src/app/api/gemini/route.ts`, enrichir les consignes lorsque des données de fichier importé sont présentes :
```typescript
SPREADSHEET FILE CONTEXT (FICHIER IMPORTÉ) :
Si l'utilisateur a importé un fichier (.xlsx, .xls, .csv) :
1. ANALYSE ET RESPECT DU FICHIER ORIGINAL :
   - Les données du fichier commencent à la COLONNE A et à la LIGNE 1 (ou ligne d'en-tête réelle).
   - Utilise les VRAIES LETTRES DE COLONNES (A, B, C, D...) du fichier fourni pour toutes tes formules.
   - NE DÉCALE PAS les données en colonne C ou ligne 10.
2. ENRICHISSEMENT DU FICHIER (AJOUT / MODIFICATION DE COLONNES) :
   - Si l'utilisateur demande d'ajouter un calcul, une colonne ou une formule sur son fichier, produis OBLIGATOIREMENT à la fin de ta réponse le schéma invisible suivant :
     <!-- FILE_MODIFICATION: {
       "target_sheet": "NomDeLaFeuille",
       "new_columns": [
         {
           "header": "Nom de la colonne à ajouter",
           "type": "currency",
           "formula": "=C{row}*D{row}",
           "formula_en": "=C{row}*D{row}",
           "description": "Calcul du total"
         }
       ]
     } -->
   - Le placeholder {row} sera automatiquement étendu à TOUTES les lignes réelles du fichier lors de l'export.
   - Explique clairement dans ta réponse : « J'ai configuré la formule pour être appliquée sur toute votre colonne dans votre fichier d'origine ».
```

- [ ] **Étape 2 : Vérifier les tests existants et la syntaxe**
```bash
npm run test
```
*Attendu : Tous les tests passent.*

- [ ] **Étape 3 : Commit**
```bash
git add src/app/api/gemini/route.ts
git commit -m "feat(prompt): instructions explicites pour le schema FILE_MODIFICATION et respect des colonnes reelles"
```

---

### Phase 4 : Interface Utilisateur & Double Mode d'Exportation

#### Tâche 4.1 : Persistance du Fichier dans `FormulaAssistant` et `page.tsx`

**Fichiers :**
- Modifier : `src/components/FormulaAssistant.tsx`
- Modifier : `src/app/page.tsx`

- [ ] **Étape 1 : Étendre `FileContext` avec `rawBuffer` et `fileType` dans `FormulaAssistant.tsx`**

Dans `src/components/FormulaAssistant.tsx` :
```typescript
export interface FileContext {
  fileName: string;
  textRepresentation: string;
  fileSize?: number;
  sheets?: ParsedSheet[];
  columnStats?: Record<string, ColumnStat[]>;
  rawBuffer?: ArrayBuffer;
  fileType?: "xlsx" | "xls" | "csv";
}

// Dans handleFile :
onFileSelect({
  fileName: f.name,
  textRepresentation: result.textRepresentation,
  fileSize: f.size,
  sheets: result.sheets,
  columnStats: result.columnStats,
  rawBuffer: result.rawBuffer,
  fileType: result.fileType,
});
```

- [ ] **Étape 2 : Lier le fichier aux messages et ne pas écraser brutalement `fileContext` dans `page.tsx`**

Dans `src/app/page.tsx` :
- Étendre l'interface `Message` pour stocker `fileContext?: FileContext`.
- Lors de l'envoi, rattacher `fileContext` au message généré :
```typescript
const userMsg: Message = {
  role: "user",
  content: finalContent,
  userPrompt: userPromptText,
  fileContext: fileContext || undefined,
};
```
- Dans le bloc `finally` de `handleGenerate`, ne **PAS** effacer immédiatement `fileContext` si l'utilisateur souhaite continuer à converser sur ce fichier. Conserver le chip du fichier visible avec une option explicite de suppression par l'utilisateur (la croix rouge).

- [ ] **Étape 3 : Ajouter la fonction de téléchargement du fichier modifié dans `page.tsx`**

```typescript
const handleDownloadModifiedFile = useCallback(
  async (msgFileContext: FileContext, content: string, promptText: string) => {
    if (!msgFileContext.rawBuffer) {
      toast.error("Le fichier source n'est plus en mémoire. Veuillez le réimporter.");
      return;
    }

    try {
      const { extractFileModificationSchema, validateFileModificationSchema } = await import(
        "@/lib/excelExport/schemaParser"
      );
      const { downloadModifiedWorkbookAsExcel } = await import(
        "@/lib/excelExport/workbookModifier"
      );
      const { extractFormula, extractEnglishFormula } = await import("@/lib/excelExport");

      let newColumns: { header: string; formula: string; formula_en?: string; type?: any }[] = [];

      const rawModif = extractFileModificationSchema(content);
      if (rawModif) {
        const validated = validateFileModificationSchema(rawModif);
        newColumns = validated.new_columns;
      } else {
        // Fallback intelligent si le modèle a produit une formule simple
        const formula = extractFormula(content);
        const formulaEn = extractEnglishFormula(content);
        if (formula) {
          newColumns = [
            {
              header: "Calcul IA",
              formula,
              formula_en: formulaEn || formula,
              type: "currency",
            },
          ];
        }
      }

      if (newColumns.length === 0) {
        toast.info("Aucune formule de colonne détectée à injecter dans le fichier.");
        return;
      }

      const { blob, warnings } = await downloadModifiedWorkbookAsExcel({
        rawBuffer: msgFileContext.rawBuffer,
        fileName: msgFileContext.fileName,
        sheetName: activeSheetName || msgFileContext.sheets?.[0]?.name,
        newColumns,
        format: exportFormat,
      });

      // Télécharger avec le nom original enrichi
      const baseName = msgFileContext.fileName.replace(/\.[^/.]+$/, "");
      const downloadName = `${baseName}_modifie.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (warnings.length > 0) {
        toast.warning("Fichier exporté avec des avertissements.", {
          description: warnings.slice(0, 2).join("; "),
        });
      } else {
        toast.success(`Fichier « ${downloadName} » exporté avec succès !`);
      }
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Erreur lors de l'export du fichier modifié.");
    }
  },
  [exportFormat, activeSheetName]
);
```

- [ ] **Étape 4 : Proposer le bouton prioritaire « Exporter fichier modifié » dans le message de chat**

Dans le rendu des messages de `src/app/page.tsx` :
Si le message est associé à un `msgFileContext` (ou si `fileContext` est actif) et qu'une formule/modification est présente :
Afficher un bouton mis en avant :
```tsx
<Button
  size="sm"
  onClick={() => handleDownloadModifiedFile(msg.fileContext || fileContext!, msg.content, msg.userPrompt || "")}
  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs rounded-xl shadow-sm"
>
  <FileSpreadsheet className="h-3.5 w-3.5" />
  Exporter « {msg.fileContext?.fileName || fileContext?.fileName} » modifié (.xlsx)
</Button>
```
À côté du bouton existant *"Télécharger maquette (.xlsx)"*.

- [ ] **Étape 5 : Exécuter le build pour valider la compilation**
```bash
npm run build
```
*Attendu : Build Next.js réussi.*

- [ ] **Étape 6 : Commit**
```bash
git add src/components/FormulaAssistant.tsx src/app/page.tsx
git commit -m "feat(ui): bouton d'export direct du fichier original enrichi et persistance du buffer"
```

---

#### Tâche 4.2 : Rendu Interactif dans `ComplexTablePreview` avec les Données Réelles

**Fichiers :**
- Modifier : `src/components/ComplexTablePreview.tsx`

- [ ] **Étape 1 : Supporter le passage de données réelles (`initialRows`) dans `ComplexTablePreview`**

Permettre à `ComplexTablePreview` de recevoir les lignes et en-têtes du fichier d'origine lorsque `rawSchema` est un `FILE_MODIFICATION` ou lorsqu'un `fileContext` est fourni.
Afficher les colonnes d'origine en fond neutre, et la nouvelle colonne calculée en surbrillance verte avec sa formule interactive.

- [ ] **Étape 2 : Vérifier les tests et lancer le dev server pour validation visuelle**
```bash
npm run test
```
*Attendu : Tous les tests passent.*

- [ ] **Étape 3 : Commit**
```bash
git add src/components/ComplexTablePreview.tsx
git commit -m "feat(preview): affichage des vraies donnees du fichier importe avec colonne modifiee"
```

---

## 4. Protocole de Validation & Tests E2E

1. **Test Fichier XLSX réel avec 200 lignes** :
   - Importer un classeur `commandes.xlsx` de 200 lignes avec les colonnes `Quantite` (B) et `Prix` (C).
   - Demander : *"Ajoute une colonne Total HT qui multiplie la quantité par le prix"*.
   - Cliquer sur *« Exporter commandes.xlsx modifié (.xlsx) »*.
   - Ouvrir dans Excel / LibreOffice :
     - Vérifier que les 200 lignes réelles sont présentes.
     - Vérifier que la colonne D s'appelle `Total HT` et contient `=B2*C2`, `=B3*C3`... jusqu'à `=B201*C201`.
     - Vérifier qu'aucun décalage en `C10` n'a eu lieu.
2. **Test Classeur Multi-Onglets** :
   - Importer un fichier à 2 feuilles (`Données` et `Référence`).
   - Demander une modification sur la feuille `Données`.
   - Exporter et vérifier que la feuille `Référence` est intacte.
3. **Test Fichier CSV** :
   - Importer un fichier CSV francophone avec `;`.
   - Demander l'ajout d'une colonne de calcul.
   - Exporter en `.xlsx` et vérifier que les formules fonctionnent nativement.
