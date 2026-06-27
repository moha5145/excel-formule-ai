# Plan d'implémentation : Tableau de simulation multi-colonnes

**Date** : 2026-06-28
**Spécification** : `docs/specs/2026-06-28-adaptive-simulation-columns-design.md`

## Architecture des fichiers

| Fichier | Responsabilité |
|---------|---------------|
| `src/lib/excelExport.ts` | Extraction params, réécriture formule, génération Zone 2 |
| `src/app/api/gemini/route.ts` | Prompt IA (nouveau format tableau) |

---

## Tâche 1 : Mettre à jour le prompt IA

**Fichiers :**
- Modifier : `src/app/api/gemini/route.ts`

- [ ] **Étape 1 : Remplacer les instructions du tableau dans le prompt**

Remplacer les lignes 89-101 (instructions du tableau markdown) par :

```typescript
3. INCLURE OBLIGATOIREMENT un tableau Markdown d'exemple au format Zone 2 :
   | Ligne   | Colonne1  | Colonne2 | Colonne3  |
   Règles :
   - Première colonne = "Ligne" avec labels ("Ligne 1", "Ligne 2", ...)
   - Colonnes suivantes = données avec en-têtes descriptifs (ex: "Services", "Salaires", "Critère")
   - Chaque ligne = un ensemble de valeurs (une par colonne de données)
   - Cellules vides = pas de valeur pour cette colonne sur cette ligne
   - Les refs cellule dans la formule utilisent les lettres C, D, E... correspondant aux colonnes :
     * 1ère colonne de données = C
     * 2ème colonne de données = D
     * 3ème colonne de données = E
   - Les données commencent à la ligne 10 (C10, D10, E10...)
   - La DERNIÈRE ligne contient la formule dans la dernière colonne (ex: =MAX.SI.ENS(D10:D12;C10:C12;E10))
   - Les valeurs texte dans la formule sont entre guillemets (ex: "Marketing")
   - Les taux sont en pourcentage (3.5) PAS en décimal (0.035)
   - INCLUR TOUTES les plages utilisées dans la formule
```

- [ ] **Étape 2 : Vérifier que le prompt est cohérent**

Vérifier que les instructions de format (lignes 65-70) sont toujours correctes. Pas de changement nécessaire ici.

- [ ] **Étape 3 : Commit**

```bash
git add src/app/api/gemini/route.ts
git commit -m "feat: update AI prompt for multi-column simulation table format"
```

---

## Tâche 2 : Réécrire `extractSimulationParams()` pour multi-colonnes

**Fichiers :**
- Modifier : `src/lib/excelExport.ts`

- [ ] **Étape 1 : Ajouter les nouvelles interfaces**

Ajouter après l'interface `SimParam` (ligne 232) :

```typescript
interface SimColumn {
  letter: string;         // "C", "D", "E"
  header: string;         // "Services", "Salaires", "Critère"
  params: SimParam[];
}
```

Étendre `SimParam` avec les champs :

```typescript
interface SimParam {
  name: string;
  value: number;
  rawValue: string;
  type: 'percentage' | 'currency' | 'integer' | 'number' | 'text' | 'date';
  unit: string;
  cellRef: string;
  colLetter: string;      // AJOUTER
  colName: string;        // AJOUTER
  rowIndex: number;       // AJOUTER
  needsDivideBy100: boolean;
}
```

- [ ] **Étape 2 : Réécrire `extractSimulationParams()`**

Remplacer la fonction entière (lignes 34-136) par :

```typescript
function extractSimulationParams(
  table: ExtractedTable
): { params: SimParam[]; columns: SimColumn[]; formulaRaw: string } {
  const params: SimParam[] = [];
  const columns: SimColumn[] = [];
  let formulaRaw = "";

  // Headers = première ligne, en excluant "Ligne"
  const headers = table.rows[0].slice(1); // Skip "Ligne" column

  // Initialiser les colonnes
  for (let c = 0; c < headers.length; c++) {
    const colLetter = String.fromCharCode(67 + c); // C=67, D=68, E=69
    columns.push({ letter: colLetter, header: headers[c], params: [] });
  }

  // Extraire les données (rows 1 à N-1, exclure la dernière ligne si formule)
  const lastRow = table.rows[table.rows.length - 1];
  const hasFormulaRow = lastRow.some(cell => cell.startsWith("="));
  const dataEndRow = hasFormulaRow ? table.rows.length - 1 : table.rows.length;

  const dataStartRow = 10; // Hardcoded comme avant

  for (let rowIdx = 1; rowIdx < dataEndRow; rowIdx++) {
    const row = table.rows[rowIdx];

    for (let colIdx = 0; colIdx < headers.length; colIdx++) {
      const value = row[colIdx + 1]?.trim() || ""; // +1 pour skipper "Ligne"
      if (!value) continue;

      const col = columns[colIdx];
      const cellRef = `${col.letter}${dataStartRow + rowIdx - 1}`;

      // Détecter si c'est un texte, un nombre, une date, etc.
      const isDate = /\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(value) ||
                     /\d{4}-\d{2}-\d{2}/.test(value);
      const cleaned = value.replace(/\s/g, "").replace(/%/g, "").replace(/€|euro/gi, "").replace(",", ".");
      const numVal = Number(cleaned);
      const hasPercent = /%/.test(value);
      const isText = isNaN(numVal) && !isDate && !hasPercent;

      let paramType: SimParam['type'];
      let rawValue: string;
      let paramValue: number;
      let unit = "";
      let needsDivideBy100 = false;

      if (isText) {
        paramType = 'text';
        rawValue = value;
        paramValue = 0;
      } else if (isDate) {
        paramType = 'date';
        rawValue = value;
        paramValue = 0;
      } else if (hasPercent || (numVal > 0 && numVal < 1 && /\d/.test(value))) {
        paramType = 'percentage';
        rawValue = value;
        paramValue = numVal > 0 && numVal < 1 ? numVal * 100 : numVal;
        needsDivideBy100 = true;
        unit = "%";
      } else if (/€|euro|salaire|montant/i.test(value)) {
        paramType = 'currency';
        rawValue = value;
        paramValue = numVal;
        unit = "€";
      } else {
        paramType = 'number';
        rawValue = value;
        paramValue = numVal;
      }

      const param: SimParam = {
        name: value,
        value: paramValue,
        rawValue,
        type: paramType,
        unit,
        cellRef,
        colLetter: col.letter,
        colName: col.header,
        rowIndex: rowIdx - 1,
        needsDivideBy100,
      };

      params.push(param);
      col.params.push(param);
    }
  }

  // Détecter la formule
  if (hasFormulaRow) {
    const formulaCell = lastRow.find(cell => cell.startsWith("="));
    if (formulaCell) formulaRaw = formulaCell;
  }

  return { params, columns, formulaRaw };
}
```

- [ ] **Étape 3 : Vérifier que TypeScript compile**

```bash
npx tsc --noEmit
```

Attendu : aucune erreur

- [ ] **Étape 4 : Commit**

```bash
git add src/lib/excelExport.ts
git commit -m "feat: rewrite extractSimulationParams for multi-column format"
```

---

## Tâche 3 : Simplifier `rewriteFormulaForSimulation()`

**Fichiers :**
- Modifier : `src/lib/excelExport.ts`

La formule de l'IA référence déjà les cellules Zone 2 (C10, D10, E10). La réécriture doit juste :
1. Remplacer les références textuelles isolées par des littéraux entre guillemets
2. Ajouter `/100` pour les taux

- [ ] **Étape 1 : Réécrire `rewriteFormulaForSimulation()`**

Remplacer la fonction (lignes 138-201) par :

```typescript
function rewriteFormulaForSimulation(
  formula: string,
  params: SimParam[],
  dataStartRow: number
): string {
  let rewritten = formula;

  // Pour chaque paramètre texte isolé (pas dans une plage), remplacer par "valeur"
  for (const param of params) {
    if (param.type !== 'text') continue;

    const cellRef = param.cellRef;
    const escaped = cellRef.replace(/\$/g, "\\$");

    // Vérifier si la référence est dans une plage (ex: C10:C12)
    const isInRange = new RegExp(`:\\s*${escaped}|${escaped}\\s*:`, "i").test(rewritten);
    if (isInRange) continue; // Garder comme référence dans la plage

    // Référence isolée → remplacer par "valeur"
    const regex = new RegExp(`\\b${escaped}(?!\\w)`, "g");
    rewritten = rewritten.replace(regex, `"${param.rawValue}"`);
  }

  // Ajouter /100 pour les taux
  for (const param of params) {
    if (!param.needsDivideBy100) continue;

    const cellRef = param.cellRef;
    const escaped = cellRef.replace(/\$/g, "\\$");

    // Vérifier si déjà /100
    const hasDivide = new RegExp(`${escaped}/100`).test(formula);
    if (hasDivide) continue;

    // Vérifier si en contexte de comparaison
    const hasComparison = new RegExp(`${escaped}\\s*[<>=]`).test(formula);
    if (hasComparison) continue;

    // Ajouter /100
    const rateRegex = new RegExp(`(${escaped})(?!\\w|/100)`, "g");
    rewritten = rewritten.replace(rateRegex, "$1/100");
  }

  return rewritten;
}
```

- [ ] **Étape 2 : Vérifier que TypeScript compile**

```bash
npx tsc --noEmit
```

Attendu : aucune erreur

- [ ] **Étape 3 : Commit**

```bash
git add src/lib/excelExport.ts
git commit -m "feat: simplify rewriteFormulaForSimulation for multi-column"
```

---

## Tâche 4 : Adapter Zone 2 pour colonnes dynamiques

**Fichiers :**
- Modifier : `src/lib/excelExport.ts`

- [ ] **Étape 1 : Mettre à jour l'appel à `extractSimulationParams`**

Dans `downloadFormulaAsExcel`, remplacer :

```typescript
const { params, formulaRaw: extracted } = extractSimulationParams(tables[0]);
```

Par :

```typescript
const { params, columns, formulaRaw: extracted } = extractSimulationParams(tables[0]);
```

Et propager `columns` dans le scope.

- [ ] **Étape 2 : Réécrire le rendu Zone 2 (lignes 530-696)**

Remplacer la section "SIMULATION INTERACTIVE" par :

```typescript
if (params.length > 0 && simFormulaRaw) {
  // ── Titre section simulation
  sheet2.mergeCells(`B${nextRow}:H${nextRow}`);
  const simTitle = sheet2.getCell(`B${nextRow}`);
  simTitle.value = "🧪  Simulez votre formule — Modifiez les valeurs en jaune";
  simTitle.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: SLATE_900 } };
  sheet2.getRow(nextRow).height = 22;
  nextRow++;

  // ── Headers du tableau de simulation
  const simHeaderRow = sheet2.getRow(nextRow);
  simHeaderRow.height = 24;

  // Colonne B : "Ligne"
  const labelHeader = simHeaderRow.getCell(2);
  labelHeader.value = "Ligne";
  labelHeader.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: WHITE } };
  labelHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
  labelHeader.alignment = { horizontal: "center", vertical: "middle" };
  labelHeader.border = {
    top: { style: "thin", color: { argb: "FF475569" } },
    bottom: { style: "medium", color: { argb: "FF1E293B" } },
    left: { style: "thin", color: { argb: "FF475569" } },
    right: { style: "thin", color: { argb: "FF475569" } },
  };

  // Colonnes de données : headers depuis `columns`
  for (let c = 0; c < columns.length; c++) {
    const cell = simHeaderRow.getCell(3 + c); // C=3, D=4, E=5...
    cell.value = columns[c].header;
    cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin", color: { argb: "FF475569" } },
      bottom: { style: "medium", color: { argb: "FF1E293B" } },
      left: { style: "thin", color: { argb: "FF475569" } },
      right: { style: "thin", color: { argb: "FF475569" } },
    };
  }
  nextRow++;

  // ── Lignes de données
  const GOLD_BORDER = "FFD97706";
  const LIGHT_YELLOW = "FFFEF3C7";

  // Déterminer le nombre de lignes de données
  const numRows = Math.max(...columns.map(c => c.params.length));

  for (let r = 0; r < numRows; r++) {
    const row = sheet2.getRow(nextRow);
    row.height = 22;

    // Colonne B : label "Ligne N"
    const labelCell = row.getCell(2);
    labelCell.value = `Ligne ${r + 1}`;
    labelCell.font = { name: "Segoe UI", size: 10, color: { argb: "FF475569" } };
    labelCell.alignment = { vertical: "middle" };

    // Colonnes de données
    for (let c = 0; c < columns.length; c++) {
      const col = columns[c];
      const param = col.params[r];
      const cell = row.getCell(3 + c);

      cell.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: SLATE_900 } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_YELLOW } };
      cell.alignment = { horizontal: "right", vertical: "middle" };
      cell.border = {
        top: { style: "thin", color: { argb: GOLD_BORDER } },
        bottom: { style: "thin", color: { argb: GOLD_BORDER } },
        left: { style: "thin", color: { argb: GOLD_BORDER } },
        right: { style: "thin", color: { argb: GOLD_BORDER } },
      };

      if (param) {
        if (param.type === "text") {
          cell.value = param.rawValue;
          cell.alignment = { horizontal: "left", vertical: "middle" };
        } else if (param.type === "date") {
          cell.value = param.rawValue;
          cell.alignment = { horizontal: "center", vertical: "middle" };
        } else if (param.type === "percentage") {
          cell.value = param.value;
          cell.numFmt = '0.0"%"';
        } else if (param.type === "currency") {
          cell.value = param.value;
          cell.numFmt = "#,##0.00";
        } else if (param.type === "integer") {
          cell.value = param.value;
          cell.numFmt = "0";
        } else {
          cell.value = param.value;
          cell.numFmt = "#,##0.##";
        }
      }
    }
    nextRow++;
  }

  // ── Ligne séparatrice
  const sepRow1 = sheet2.getRow(nextRow);
  sepRow1.height = 4;
  for (let c = 2; c <= 2 + columns.length; c++) {
    const cell = sepRow1.getCell(c);
    cell.border = { bottom: { style: "thin", color: { argb: "FFE2E8F0" } } };
  }
  nextRow++;

  // ── Ligne Résultat (formule active)
  const resultRowSim = sheet2.getRow(nextRow);
  resultRowSim.height = 26;

  const resLabel = resultRowSim.getCell(2);
  resLabel.value = "→ Résultat";
  resLabel.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF166534" } };
  resLabel.alignment = { vertical: "middle" };

  // Formule réécrite (cellule verte active)
  let activeFormula = rewriteFormulaForSimulation(simFormulaRaw, params, simDataStartRow);
  activeFormula = convertToUsInvariant(activeFormula, format);
  activeFormula = postProcessFormula(activeFormula, "libreoffice-en");

  const resCell = resultRowSim.getCell(3);
  resCell.value = { formula: activeFormula.replace(/^=/, "") };
  resCell.font = { name: "Consolas", size: 12, bold: true, color: { argb: "FF166534" } };
  resCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } };
  const isTextFormula = /&\s*["']|["']\s*&|TEXTE\s*\(|TEXT\s*\(/i.test(activeFormula);
  resCell.numFmt = isTextFormula ? "@" : "#,##0.00";
  resCell.alignment = { horizontal: "right", vertical: "middle" };
  resCell.border = {
    top: { style: "medium", color: { argb: "FF16A34A" } },
    bottom: { style: "medium", color: { argb: "FF16A34A" } },
    left: { style: "medium", color: { argb: "FF16A34A" } },
    right: { style: "medium", color: { argb: "FF16A34A" } },
  };

  nextRow += 2;

  // ── Zone 3 : Instructions
  sheet2.mergeCells(`B${nextRow}:H${nextRow}`);
  const instrCellSim = sheet2.getCell(`B${nextRow}`);
  instrCellSim.value = "💡  Modifiez les valeurs jaunes pour tester d'autres scénarios. La formule verte se recalcule automatiquement.";
  instrCellSim.font = { name: "Segoe UI", size: 9, italic: true, color: { argb: SLATE_500 } };
  sheet2.getRow(nextRow).height = 18;
  nextRow++;

  sheet2.mergeCells(`B${nextRow}:H${nextRow}`);
  const instrCellSim2 = sheet2.getCell(`B${nextRow}`);
  instrCellSim2.value = "📋  Copiez la formule ci-dessus (Zone 1) pour l'utiliser dans votre classeur.";
  instrCellSim2.font = { name: "Segoe UI", size: 9, italic: true, color: { argb: SLATE_500 } };
  sheet2.getRow(nextRow).height = 18;
  nextRow += 2;
}
```

- [ ] **Étape 3 : Vérifier que TypeScript compile**

```bash
npx tsc --noEmit
```

Attendu : aucune erreur

- [ ] **Étape 4 : Commit**

```bash
git add src/lib/excelExport.ts
git commit -m "feat: dynamic multi-column Zone 2 layout"
```

---

## Tâche 5 : Mettre à jour Zone 1 display

**Fichiers :**
- Modifier : `src/lib/excelExport.ts`

La Zone 1 affiche la formule pour copier-coller. Elle doit fonctionner avec le nouveau format.

- [ ] **Étape 1 : Vérifier que Zone 1 fonctionne**

Zone 1 (lignes 486-520) utilise `displayFormula = zone1Formula || formulaRaw`. Le `zone1Formula` est calculé par `rewriteFormulaForSimulation` + `postProcessFormula`. Pas de changement nécessaire ici car la logique est la même.

Vérifier que l'affichage fonctionne en relançant le serveur et en testant.

- [ ] **Étape 2 : Vérifier que TypeScript compile**

```bash
npx tsc --noEmit
```

Attendu : aucune erreur

---

## Tâche 6 : Test final end-to-end

- [ ] **Étape 1 : Lancer le serveur de dev**

```bash
npm run dev
```

- [ ] **Étape 2 : Tester avec une formule multi-colonnes**

Demander à l'IA : "Donne-moi une formule MAX.SI.ENS pour trouver le salaire maximum des employés du service Marketing"

Attendu : L'IA génère un tableau avec au moins 2 colonnes (Services, Salaires) et une formule `=MAX.SI.ENS(D10:D12;C10:C12;"Marketing")`

- [ ] **Étape 3 : Vérifier le fichier Excel généré**

- Zone 2 affiche un tableau avec 2+ colonnes
- La formule verte est évaluée correctement
- La Zone 1 affiche la formule pour copier-coller

- [ ] **Étape 4 : Tester dans LibreOffice**

Ouvrir le fichier dans LibreOffice Calc et vérifier que :
- La formule verte est évaluée (pas de `#NOM ?`)
- Les valeurs sont correctes
- La Zone 1 est affichée comme texte (pas de `#VALEUR !`)
