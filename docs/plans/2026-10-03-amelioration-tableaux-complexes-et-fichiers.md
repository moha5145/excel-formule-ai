# Plan d'implémentation : Amélioration des Tableaux Complexes et des Fichiers Importés

> **Date :** 03 Octobre 2026  
> **Statut :** Prêt pour exécution  
> **Branche recommandée :** `feat/enhanced-complex-tables-and-file-parser`

---

## 1. Contexte & Objectifs

L'application **Excel-Formule AI** permet aujourd'hui d'importer des fichiers (.xlsx, .csv) et de générer des classeurs Excel multi-formules grâce au schéma invisible `<!-- TABLE_SCHEMA -->` interprété par `complexExcelBuilder.ts`.

Ce plan détaille les améliorations architecturales et fonctionnelles pour :
1. **Fiabiliser et enrichir l'import de fichiers** :
   - Détection automatique des délimiteurs CSV (`,`, `;`, `\t`) et gestion des encodages fréquents.
   - Préservation des dates réelles (au lieu des numéros sériels Excel comme `45210`).
   - Profiling statistique par colonne (types, valeurs nulles, min/max).
   - Modal de prévisualisation interactif avec masquage/exclusion de colonnes sensibles avant transmission à l'IA.
2. **Perfectionner les classeurs complexes générés** :
   - Listes déroulantes natives Excel (`dataValidation`) automatiques sur les colonnes liées à des `ReferenceTable`.
   - Sécurisation du schéma Zod et du prompt système contre les décalages de colonnes.
3. **Apporter une prévisualisation interactive dans le navigateur** :
   - Composant de simulation web interactif dans le chat permettant de modifier les cellules d'entrées (jaunes) et d'observer le tableau sans quitter le navigateur.

---

## 2. Cartographie des Fichiers

| Fichier | Action | Responsabilité |
| :--- | :--- | :--- |
| `src/lib/fileParser.ts` | **Modifier** | Détection délimiteur CSV, conversion des dates, calcul des statistiques de colonnes. |
| `src/lib/fileParser.test.ts` | **Créer** | Tests unitaires pour le parser de fichiers (CSV `;`, dates, typage, stats). |
| `src/components/FilePreviewModal.tsx` | **Créer** | Dialogue de prévisualisation des feuilles, en-têtes, stats et sélection de colonnes à exclure. |
| `src/components/FormulaAssistant.tsx` | **Modifier** | Bouton d'ouverture de l'aperçu du fichier importé + chip enrichi. |
| `src/lib/excelExport/schemaParser.ts` | **Modifier** | Support optionnel de `validation` (`list`) sur les colonnes. |
| `src/lib/excelExport/schemaParser.test.ts` | **Modifier** | Tests de validation Zod pour le schéma enrichi. |
| `src/lib/excelExport/complexExcelBuilder.ts` | **Modifier** | Injection ExcelJS de `dataValidation` (listes déroulantes) pour les tables de référence. |
| `src/lib/excelExport/complexExcelBuilder.test.ts` | **Modifier** | Tests unitaires vérifiant l'application de `dataValidation` dans le classeur. |
| `src/components/ComplexTablePreview.tsx` | **Créer** | Vue tabulaire interactive in-browser avec simulation en direct. |
| `src/app/page.tsx` | **Modifier** | Intégration de `ComplexTablePreview` et gestion des colonnes filtrées. |

---

## 3. Découpage des Tâches (Bite-Sized & TDD)

### Phase 1 : Parser de fichiers robuste & profiling de données

#### Tâche 1.1 : Tests unitaires pour le parser de fichiers (`fileParser.test.ts`)

**Fichiers :**
- Créer : `src/lib/fileParser.test.ts`

- [ ] **Étape 1 : Écrire les tests unitaires couvrant la détection de délimiteur CSV et les statistiques**

```typescript
import { describe, it, expect } from "vitest";
import { detectCsvDelimiter, buildColumnStats } from "./fileParser";

describe("detectCsvDelimiter", () => {
  it("devrait détecter le point-virgule pour les CSV francophones", () => {
    const csvContent = "Nom;Prix;Quantite\nPomme;1,50;10\nBanane;2,00;5";
    expect(detectCsvDelimiter(csvContent)).toBe(";");
  });

  it("devrait détecter la virgule pour les CSV standards", () => {
    const csvContent = "Name,Price,Quantity\nApple,1.50,10\nBanana,2.00,5";
    expect(detectCsvDelimiter(csvContent)).toBe(",");
  });

  it("devrait détecter la tabulation pour les fichiers TSV", () => {
    const csvContent = "Name\tPrice\tQuantity\nApple\t1.50\t10";
    expect(detectCsvDelimiter(csvContent)).toBe("\t");
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
    expect(stats[0].type).toBe("text");
    expect(stats[1].type).toBe("number");
    expect(stats[2].nullCount).toBe(1);
    expect(stats[2].filledCount).toBe(2);
  });
});
```

- [ ] **Étape 2 : Exécuter le test pour vérifier l'échec initial**
```bash
npx vitest run src/lib/fileParser.test.ts
```
*Attendu : Échec car `detectCsvDelimiter` et `buildColumnStats` ne sont pas encore exportés.*

- [ ] **Étape 3 : Implémenter la détection de séparateur et les statistiques dans `src/lib/fileParser.ts`**

Ajouter dans `src/lib/fileParser.ts` :
```typescript
export interface ColumnStat {
  name: string;
  type: "number" | "date" | "text" | "empty";
  nullCount: number;
  filledCount: number;
  sampleValues: (string | number)[];
}

export function detectCsvDelimiter(text: string): string {
  const firstLine = text.split(/\r\n|\n/)[0] || "";
  const counts = {
    ";": (firstLine.match(/;/g) || []).length,
    ",": (firstLine.match(/,/g) || []).length,
    "\t": (firstLine.match(/\t/g) || []).length,
    "|": (firstLine.match(/\|/g) || []).length,
  };

  let bestDelimiter = ",";
  let maxCount = 0;
  for (const [delim, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      bestDelimiter = delim;
    }
  }
  return bestDelimiter;
}

export function buildColumnStats(
  headers: string[],
  rows: (string | number | null)[][]
): ColumnStat[] {
  return headers.map((header, colIdx) => {
    let nullCount = 0;
    let numberCount = 0;
    let filledCount = 0;
    const samples: (string | number)[] = [];

    for (const row of rows) {
      const val = row[colIdx];
      if (val === null || val === undefined || val === "") {
        nullCount++;
      } else {
        filledCount++;
        if (typeof val === "number" || (!isNaN(Number(val)) && String(val).trim() !== "")) {
          numberCount++;
        }
        if (samples.length < 3) {
          samples.push(val);
        }
      }
    }

    const type = filledCount === 0 ? "empty" : (numberCount / filledCount > 0.7 ? "number" : "text");

    return {
      name: header,
      type,
      nullCount,
      filledCount,
      sampleValues: samples,
    };
  });
}
```

Adapter `parseFile` pour utiliser `detectCsvDelimiter` et `cellDates: true` dans SheetJS :
```typescript
// Dans parseFile pour CSV :
const delimiter = detectCsvDelimiter(text);
const workbook = XLSX.read(text, { type: 'string', raw: false, cellDates: true, FS: delimiter });

// Dans parseFile pour XLSX :
const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
```

- [ ] **Étape 4 : Exécuter le test pour vérifier le succès**
```bash
npx vitest run src/lib/fileParser.test.ts
```
*Attendu : PASS*

- [ ] **Étape 5 : Commit**
```bash
git add src/lib/fileParser.ts src/lib/fileParser.test.ts
git commit -m "feat(parser): ajout detection delimiteur CSV et calcul statistiques colonnes"
```

---

#### Tâche 1.2 : Modal de prévisualisation et filtrage de colonnes (`FilePreviewModal.tsx`)

**Fichiers :**
- Créer : `src/components/FilePreviewModal.tsx`
- Modifier : `src/components/FormulaAssistant.tsx`
- Modifier : `src/app/page.tsx`

- [ ] **Étape 1 : Créer `src/components/FilePreviewModal.tsx`**

Le composant doit :
- Afficher les onglets du classeur (permettre à l'utilisateur de choisir la feuille à analyser si multi-feuilles).
- Présenter un tableau échantillon des 10 premières lignes.
- Afficher les colonnes avec leurs types détectés (`ColumnStat`).
- Permettre de décocher les colonnes confidentielles (ex: noms d'employés, salaires réels) pour les exclure du prompt envoyé à l'IA.

```tsx
'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ParsedSheet, ColumnStat } from '@/lib/fileParser'
import { Eye, Shield, Check, FileSpreadsheet } from 'lucide-react'

interface FilePreviewModalProps {
  isOpen: boolean
  onClose: () => void
  fileName: string
  sheets: ParsedSheet[]
  columnStats: Record<string, ColumnStat[]>
  excludedColumns: string[]
  onToggleColumnExclusion: (columnName: string) => void
  onSelectActiveSheet: (sheetName: string) => void
  activeSheetName: string
}

export function FilePreviewModal({
  isOpen,
  onClose,
  fileName,
  sheets,
  columnStats,
  excludedColumns,
  onToggleColumnExclusion,
  onSelectActiveSheet,
  activeSheetName,
}: FilePreviewModalProps) {
  const currentSheet = sheets.find((s) => s.name === activeSheetName) || sheets[0]
  const currentStats = columnStats[currentSheet?.name || ''] || []

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-4 sm:p-6 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            <span>Aperçu du fichier : {fileName}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Sélecteur d'onglets si le fichier contient plusieurs feuilles */}
        {sheets.length > 1 && (
          <div className="flex gap-1.5 border-b border-border/60 pb-2 overflow-x-auto">
            {sheets.map((sheet) => (
              <button
                key={sheet.name}
                type="button"
                onClick={() => onSelectActiveSheet(sheet.name)}
                className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                  sheet.name === currentSheet.name
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                }`}
              >
                {sheet.name} ({sheet.totalRows} lignes)
              </button>
            ))}
          </div>
        )}

        {/* Info confidentialité */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 text-xs text-muted-foreground border border-border/40">
          <Shield className="h-4 w-4 text-primary shrink-0" />
          <span>Décochez les colonnes contenant des données sensibles que vous ne souhaitez pas envoyer au modèle d&apos;IA.</span>
        </div>

        {/* Table de prévisualisation */}
        <div className="flex-1 overflow-auto border border-border/60 rounded-xl my-2">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-muted sticky top-0 z-10">
              <tr>
                {currentSheet.headers.map((h) => {
                  const isExcluded = excludedColumns.includes(h)
                  return (
                    <th key={h} className="p-2.5 border-b border-border font-medium text-foreground">
                      <div className="flex items-center justify-between gap-1">
                        <span className={isExcluded ? 'line-through opacity-50' : ''}>{h}</span>
                        <input
                          type="checkbox"
                          checked={!isExcluded}
                          onChange={() => onToggleColumnExclusion(h)}
                          className="rounded border-border text-primary cursor-pointer"
                          title={isExcluded ? "Inclure cette colonne" : "Exclure cette colonne"}
                        />
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {currentSheet.rows.slice(0, 10).map((row, rIdx) => (
                <tr key={rIdx} className="border-b border-border/40 hover:bg-muted/20">
                  {currentSheet.headers.map((h, cIdx) => {
                    const isExcluded = excludedColumns.includes(h)
                    return (
                      <td key={cIdx} className={`p-2 font-mono ${isExcluded ? 'opacity-30 bg-muted/30' : ''}`}>
                        {isExcluded ? '***' : String(row[cIdx] ?? '')}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between w-full pt-2">
          <span className="text-xs text-muted-foreground">
            {currentSheet.totalRows} lignes · {currentSheet.headers.length - excludedColumns.length}/{currentSheet.headers.length} colonnes actives
          </span>
          <Button onClick={onClose} size="sm" className="rounded-xl">
            Valider la sélection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Étape 2 : Intégrer l'icône de prévisualisation dans `FormulaAssistant.tsx`**

Dans le chip de fichier chargé dans `src/components/FormulaAssistant.tsx` :
Ajouter un bouton `<button type="button" onClick={() => onOpenPreview()} title="Prévisualiser les données"><Eye className="h-3.5 w-3.5" /></button>` à côté de la croix de suppression.

- [ ] **Étape 3 : Adapter l'injection de contexte dans `src/app/page.tsx`**

Filtrer les colonnes déclarées dans `excludedColumns` pour ne pas les inclure dans `fileContext.textRepresentation` avant envoi à `/api/gemini`.

- [ ] **Étape 4 : Vérifier la compilation et lancer les tests**
```bash
npm run test
npm run build
```
*Attendu : Build réussi sans erreur TypeScript.*

- [ ] **Étape 5 : Commit**
```bash
git add src/components/FilePreviewModal.tsx src/components/FormulaAssistant.tsx src/app/page.tsx
git commit -m "feat(ui): modal de previsualisation de fichier et filtrage de confidentialite"
```

---

### Phase 2 : Listes Déroulantes Natives Excel & Validation Avancée

#### Tâche 2.1 : Enrichissement du Schéma Zod (`schemaParser.ts`)

**Fichiers :**
- Modifier : `src/lib/excelExport/schemaParser.ts`
- Modifier : `src/lib/excelExport/schemaParser.test.ts`

- [ ] **Étape 1 : Écrire le test d'extension de schéma pour `data_validation`**

Dans `src/lib/excelExport/schemaParser.test.ts` :
```typescript
it("devrait accepter un champ validation de type list sur une colonne", () => {
  const schema = {
    type: "complex_table",
    title: "Tableau Commandes",
    parameters: [{ name: "TVA", ref: "C5", value: 0.2, type: "percentage" }],
    columns: [
      {
        header: "Produit",
        type: "text",
        formula: null,
        formula_en: null,
        validation: { type: "list", ref_table: "RefProduits", ref_column: "Produit" }
      },
      { header: "Total", type: "currency", formula: "=10", formula_en: "=10" }
    ],
    reference_tables: [
      {
        name: "Produits",
        sheet_name: "RefProduits",
        start_ref: "RefProduits!A1",
        headers: ["Produit", "Prix"],
        rows: [["PC", 1000]]
      }
    ]
  };

  const parsed = validateSchema(schema);
  expect(parsed.columns[0].validation?.type).toBe("list");
  expect(parsed.columns[0].validation?.ref_table).toBe("RefProduits");
});
```

- [ ] **Étape 2 : Exécuter le test pour vérifier l'échec**
```bash
npx vitest run src/lib/excelExport/schemaParser.test.ts
```
*Attendu : Échec car `validation` n'est pas encore défini dans `TableColumnSchema`.*

- [ ] **Étape 3 : Ajouter `ColumnValidationSchema` dans `schemaParser.ts`**

```typescript
export interface ColumnValidation {
  type: "list";
  ref_table?: string;
  ref_column?: string;
  formula_range?: string; // ex: "RefProduits!$B$2:$B$10"
}

const ColumnValidationSchema = z.object({
  type: z.literal("list"),
  ref_table: z.string().optional(),
  ref_column: z.string().optional(),
  formula_range: z.string().optional(),
});

// Ajouter dans TableColumnSchema :
validation: ColumnValidationSchema.optional(),
```

- [ ] **Étape 4 : Exécuter les tests pour vérifier la validation**
```bash
npx vitest run src/lib/excelExport/schemaParser.test.ts
```
*Attendu : PASS.*

- [ ] **Étape 5 : Commit**
```bash
git add src/lib/excelExport/schemaParser.ts src/lib/excelExport/schemaParser.test.ts
git commit -m "feat(schema): support du champ validation pour listes deroulantes natives"
```

---

#### Tâche 2.2 : Application de `dataValidation` dans ExcelJS (`complexExcelBuilder.ts`)

**Fichiers :**
- Modifier : `src/lib/excelExport/complexExcelBuilder.ts`
- Modifier : `src/lib/excelExport/complexExcelBuilder.test.ts`

- [ ] **Étape 1 : Écrire le test unitaire pour la dataValidation**

Dans `src/lib/excelExport/complexExcelBuilder.test.ts` :
```typescript
it("devrait appliquer une dataValidation de type liste sur les cellules de colonne concernées", () => {
  const schema: TableSchema = {
    type: "complex_table",
    title: "Test Validation",
    parameters: [{ name: "Taux", ref: "C5", value: 1, type: "number" }],
    columns: [
      {
        header: "Produit",
        type: "text",
        formula: null,
        formula_en: null,
        validation: { type: "list", formula_range: "RefProduits!$A$2:$A$5" }
      },
      { header: "Prix", type: "number", formula: "=10", formula_en: "=10" }
    ],
    data_start_row: 10,
    sample_rows: 3
  };

  const wb = new ExcelJS.Workbook();
  const { workbook } = buildComplexWorkbook(wb, schema, "", "prompt", "excel-fr");
  const ws = workbook.getWorksheet("Tableau Interactif")!;
  const cell = ws.getCell("C11");
  expect(cell.dataValidation?.type).toBe("list");
  expect(cell.dataValidation?.formulae).toEqual(["RefProduits!$A$2:$A$5"]);
});
```

- [ ] **Étape 2 : Exécuter le test pour vérifier l'échec**
```bash
npx vitest run src/lib/excelExport/complexExcelBuilder.test.ts
```
*Attendu : Échec car `cell.dataValidation` n'est pas encore renseigné.*

- [ ] **Étape 3 : Implémenter l'assignation de `dataValidation` dans `complexExcelBuilder.ts`**

Dans la boucle d'écriture des lignes de données dans `complexExcelBuilder.ts` :
```typescript
// Si la colonne possède une règle de validation (ou auto-détectée via reference_tables)
if (col.validation?.type === "list") {
  let range = col.validation.formula_range;
  if (!range && col.validation.ref_table && schema.reference_tables) {
    const refTable = schema.reference_tables.find(t => t.sheet_name === col.validation?.ref_table);
    if (refTable) {
      const colIdx = col.validation.ref_column
        ? refTable.headers.findIndex(h => h.toLowerCase() === col.validation?.ref_column?.toLowerCase())
        : 0;
      const targetColLetter = String.fromCharCode(65 + Math.max(0, colIdx));
      const startDataRow = 2; // après en-tête A1
      const endDataRow = startDataRow + refTable.rows.length - 1;
      range = `${refTable.sheet_name}!$${targetColLetter}$${startDataRow}:$${targetColLetter}$${endDataRow}`;
    }
  }

  if (range) {
    cell.dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [range],
      showErrorMessage: true,
      errorTitle: "Valeur invalide",
      error: "Veuillez choisir un élément dans la liste déroulante.",
    };
  }
}
```

- [ ] **Étape 4 : Exécuter le test pour vérifier le succès**
```bash
npx vitest run src/lib/excelExport/complexExcelBuilder.test.ts
```
*Attendu : PASS.*

- [ ] **Étape 5 : Commit**
```bash
git add src/lib/excelExport/complexExcelBuilder.ts src/lib/excelExport/complexExcelBuilder.test.ts
git commit -m "feat(excel): integration des listes deroulantes natives dataValidation"
```

---

### Phase 3 : Simulateur Web In-Browser & Synergie

#### Tâche 3.1 : Créer le composant de simulation web (`ComplexTablePreview.tsx`)

**Fichiers :**
- Créer : `src/components/ComplexTablePreview.tsx`
- Modifier : `src/app/page.tsx`

- [ ] **Étape 1 : Implémenter le composant `ComplexTablePreview.tsx`**

Le composant doit :
- Parser le `TABLE_SCHEMA` issu de la réponse du modèle.
- Afficher les paramètres globaux (avec inputs modifiables).
- Afficher la table interactive où les colonnes d'entrées (jaunes) sont éditables directement dans le navigateur.
- Permettre d'ajouter une ligne d'exemple dynamiquement.
- Fournir un bouton direct pour télécharger le `.xlsx` mis à jour.

```tsx
'use client'

import { useState } from 'react'
import { TableSchema, validateSchema } from '@/lib/excelExport/schemaParser'
import { FileSpreadsheet, Plus, Download, Sliders } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ComplexTablePreviewProps {
  rawSchema: unknown
  onDownloadExcel: () => void
}

export function ComplexTablePreview({ rawSchema, onDownloadExcel }: ComplexTablePreviewProps) {
  let schema: TableSchema | null = null
  try {
    schema = validateSchema(rawSchema)
  } catch {
    return null
  }

  const [parameters, setParameters] = useState(schema.parameters)
  const [sampleRows, setSampleRows] = useState(schema.sample_rows || 3)

  return (
    <div className="my-3 border border-border/80 rounded-2xl bg-card overflow-hidden shadow-sm">
      {/* En-tête du tableau interactif */}
      <div className="flex items-center justify-between px-4 py-3 bg-muted/60 border-b border-border/60">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
          <span className="font-medium text-sm text-foreground">{schema.title}</span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 font-semibold">
            Simulation Interactive
          </span>
        </div>
        <Button size="sm" onClick={onDownloadExcel} className="h-8 gap-1.5 text-xs rounded-xl">
          <Download className="h-3.5 w-3.5" />
          Exporter .xlsx
        </Button>
      </div>

      {/* Paramètres globaux modifiables */}
      {parameters.length > 0 && (
        <div className="p-3 bg-muted/20 border-b border-border/40 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {parameters.map((param, pIdx) => (
            <div key={pIdx} className="flex items-center justify-between p-2 rounded-xl bg-background border border-border/50 text-xs">
              <span className="text-muted-foreground font-medium truncate mr-2">{param.name}</span>
              <input
                type={param.type === 'number' || param.type === 'currency' ? 'number' : 'text'}
                defaultValue={param.value ?? ''}
                className="w-24 px-2 py-1 bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-800 rounded-lg text-right font-mono font-medium focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          ))}
        </div>
      )}

      {/* Grille du tableau */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left border-collapse">
          <thead className="bg-slate-900 text-white">
            <tr>
              <th className="p-2.5 w-16 text-center border-r border-slate-700">Ligne</th>
              {schema.columns.map((col, cIdx) => (
                <th key={cIdx} className="p-2.5 border-r border-slate-700 font-medium">
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: sampleRows }).map((_, rIdx) => (
              <tr key={rIdx} className="border-b border-border/40 hover:bg-muted/10">
                <td className="p-2 text-center text-muted-foreground bg-muted/20 border-r border-border/40 font-mono">
                  {rIdx + 1}
                </td>
                {schema.columns.map((col, cIdx) => {
                  const isCalculated = Boolean(col.formula || col.formula_en)
                  return (
                    <td
                      key={cIdx}
                      className={`p-2 border-r border-border/40 font-mono ${
                        isCalculated
                          ? 'bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 font-semibold'
                          : 'bg-amber-50/40 dark:bg-amber-950/10'
                      }`}
                    >
                      {isCalculated ? (
                        <span title={col.formula || ''}>{col.formula || 'Calculé'}</span>
                      ) : (
                        <input
                          type="text"
                          placeholder="Saisir..."
                          className="w-full bg-transparent border-0 focus:ring-0 p-0 text-foreground"
                        />
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bouton d'ajout de lignes */}
      <div className="p-2 bg-muted/30 border-t border-border/40 flex justify-between items-center text-[11px] text-muted-foreground">
        <span>{schema.columns.length} colonnes ({schema.columns.filter(c => c.formula).length} calculées)</span>
        <button
          type="button"
          onClick={() => setSampleRows((r) => Math.min(r + 3, 30))}
          className="flex items-center gap-1 text-primary hover:underline font-medium cursor-pointer"
        >
          <Plus className="h-3 w-3" />
          Ajouter des lignes de simulation
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Étape 2 : Intégrer `ComplexTablePreview` dans `src/app/page.tsx`**

Dans le rendu des messages de `page.tsx`, lorsque `schemaJsonRaw` est présent, afficher `<ComplexTablePreview rawSchema={JSON.parse(schemaJsonRaw)} onDownloadExcel={...} />` juste au-dessus de `JsonSchemaCollapsible`.

- [ ] **Étape 3 : Vérifier le build et la régression des tests**
```bash
npm run test
npm run build
```
*Attendu : Tous les tests passent (66+ tests) et le build Next.js se termine avec succès.*

- [ ] **Étape 4 : Commit**
```bash
git add src/components/ComplexTablePreview.tsx src/app/page.tsx
git commit -m "feat(ui): composant simulateur web in-browser pour tableaux complexes"
```

---

## 4. Protocole de Validation & Tests E2E

1. **Test CSV francophone** : Déposer un fichier CSV séparé par des `;` avec des dates `15/01/2024`. Vérifier dans le modal de prévisualisation que les colonnes sont correctement séparées et les dates non corrompues.
2. **Test Masquage de colonne** : Décocher une colonne dans le modal et vérifier que l'IA ne fait référence qu'aux colonnes conservées.
3. **Test Validation Liste Déroulante** : Demander *"Crée un tableau de facturation avec une table de référence des produits (Nom, Prix HT)"*. Télécharger le `.xlsx` et ouvrir dans Excel/LibreOffice : la colonne Produit doit afficher une liste déroulante native.
4. **Test Simulateur Web** : Constater la présence du bloc interactif dans l'interface et la possibilité d'ajouter des lignes de simulation sans quitter l'app.
