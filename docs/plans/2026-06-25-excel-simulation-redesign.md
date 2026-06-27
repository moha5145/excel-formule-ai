# Plan d'implémentation : Refonte Zone Simulation Interactive

**Spécification** : `docs/specs/2026-06-25-excel-simulation-redesign.md`
**Date** : 2026-06-25

---

## Carte des fichiers

| Fichier | Responsabilité | Action |
|---|---|---|
| `src/lib/excelExport.ts` | Génération du fichier Excel, extraction des données IA, construction des formules | **Modifier** — Refonte de la section "Exemple Pratique" (lignes 474-705) |
| `src/app/api/gemini/route.ts` | Prompt système pour Gemini AI | **Modifier** — Renforcer le format du tableau d'exemple (ligne 76) |

Aucun nouveau fichier créé.

---

## Tâche 1 : Ajouter le type `SimParam` et la fonction `detectParamType`

**Fichier** : `src/lib/excelExport.ts`

- [ ] **Étape 1 : Ajouter l'interface `SimParam`** après la ligne 243 (après `ExtractedTable`)

```typescript
interface SimParam {
  name: string;        // ex: "Montant du Prêt (€)"
  value: number;       // ex: 250000
  type: 'percentage' | 'currency' | 'integer' | 'number';
  unit: string;        // ex: "€", "%", "ans"
  cellRef: string;     // ex: "B2" (référence originale du tableau IA)
  needsDivideBy100: boolean; // true si taux > 1 stocké comme 3.5
}
```

- [ ] **Étape 2 : Ajouter la fonction `detectParamType`** après `isNumericValue` (ligne 214)

```typescript
function detectParamType(name: string, value: number): SimParam['type'] {
  const lower = name.toLowerCase();
  if (/%|taux|tx|taux|inter[êe]t|interest|rendement/.test(lower)) return 'percentage';
  if (/montant|€|euro|salaire|prime|[pret]ret|emprunt|loyer|ca|chiffre/.test(lower)) return 'currency';
  if (/dur[ée]e|ann[ée]e|mois|jour|nb|nombre|p[ée]riode|term|fois/.test(lower)) return 'integer';
  return 'number';
}
```

- [ ] **Étape 3 : Vérification**

Exécuter : `npx tsc --noEmit`
Attendu : Aucune erreur

---

## Tâche 2 : Ajouter la fonction `extractSimulationParams`

**Fichier** : `src/lib/excelExport.ts`

- [ ] **Étape 1 : Ajouter la fonction** après `detectParamType`

```typescript
function extractSimulationParams(
  table: ExtractedTable
): { params: SimParam[]; formulaRaw: string } {
  const params: SimParam[] = [];
  let formulaRaw = "";

  for (const row of table.rows) {
    const cellRef = row[0]?.trim() || "";
    const description = row[1]?.trim() || "";
    const valueStr = row[2]?.trim() || "";

    // Si la colonne "Valeur" contient une formule → c'est la ligne de sortie
    if (valueStr.startsWith("=")) {
      formulaRaw = valueStr;
      continue;
    }

    // Parser la valeur numérique
    const cleaned = valueStr.replace(/\s/g, "").replace(",", ".");
    const numVal = Number(cleaned);
    if (isNaN(numVal) || valueStr === "") continue;

    const paramType = detectParamType(description, numVal);
    const lower = description.toLowerCase();

    // Extraire l'unité depuis la description
    let unit = "";
    if (/%|pourcent/i.test(description)) unit = "%";
    else if (/€|euro/i.test(description)) unit = "€";
    else if (/an|ans|année/i.test(description)) unit = "ans";
    else if (/mois/i.test(description)) unit = "mois";
    else if (/jour/i.test(description)) unit = "jours";

    // Détection taux : si > 1 et type percentage → needsDivideBy100
    const needsDivideBy100 = paramType === "percentage" && numVal > 1;

    params.push({
      name: description,
      value: numVal,
      type: paramType,
      unit,
      cellRef,
      needsDivideBy100,
    });
  }

  return { params, formulaRaw };
}
```

- [ ] **Étape 2 : Vérification**

Exécuter : `npx tsc --noEmit`
Attendu : Aucune erreur

---

## Tâche 3 : Ajouter la fonction `rewriteFormulaForSimulation`

**Fichier** : `src/lib/excelExport.ts`

- [ ] **Étape 1 : Ajouter la fonction** après `extractSimulationParams`

Cette fonction réécrit la formule pour :
1. Remplacer les références originales (B2, B3...) par les cellules de la Zone 2 (D12, D13...)
2. Insérer `/100` après les références de taux si nécessaire
3. Traduire en syntaxe anglaise

```typescript
function rewriteFormulaForSimulation(
  formula: string,
  params: SimParam[],
  dataStartRow: number
): { en: string; fr: string } {
  const valueCol = "D"; // Colonne des valeurs dans la Zone 2

  // Construire la map : cellRef origine → cellule Zone 2
  const cellMap: Record<string, string> = {};
  for (let i = 0; i < params.length; i++) {
    const targetCell = `${valueCol}${dataStartRow + i}`;
    cellMap[params[i].cellRef] = targetCell;
  }

  // Réécrire les références
  let rewritten = formula;
  for (const [origRef, targetRef] of Object.entries(cellMap)) {
    const regex = new RegExp(`\\b${origRef.replace(/\$/g, "\\$")}(?!\\w)`, "g");
    rewritten = rewritten.replace(regex, targetRef);
  }

  // Insérer /100 pour les taux > 1
  for (let i = 0; i < params.length; i++) {
    if (params[i].needsDivideBy100) {
      const targetCell = `${valueCol}${dataStartRow + i}`;
      // Remplacer "D13" par "D13/100" (mais pas "D13/100" déjà présent)
      const rateRegex = new RegExp(`(${targetCell})(?!/100)`, "g");
      rewritten = rewritten.replace(rateRegex, `$1/100`);
    }
  }

  // Version EN : traduire fonctions + séparateurs
  const en = translateFrenchFormulaToEnglish(rewritten);

  // Version FR : garder noms FR, remplacer , par ;
  let fr = rewritten;
  // S'assurer que les séparateurs sont des ; pour l'affichage FR
  fr = fr.replace(/,/g, ";");

  return { en, fr };
}
```

- [ ] **Étape 2 : Vérification**

Exécuter : `npx tsc --noEmit`
Attendu : Aucune erreur

---

## Tâche 4 : Refonte de la section "Exemple Pratique" dans `downloadFormulaAsExcel`

**Fichier** : `src/lib/excelExport.ts`

- [ ] **Étape 1 : Remplacer les lignes 542-689** (section "Tableaux d'exemples" et "Ligne Résultat") par le code suivant :

```typescript
    // ── SIMULATION INTERACTIVE (remplace l'ancien tableau d'exemples)
    if (tables.length > 0) {
      const firstTable = tables[0];
      const { params, formulaRaw: extractedFormula } = extractSimulationParams(firstTable);
      const formulaToUse = extractedFormula || formulaRaw;

      if (params.length > 0 && formulaToUse) {
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
        const simHeaders = ["Paramètre", "Valeur", "Description"];
        for (let h = 0; h < simHeaders.length; h++) {
          const cell = simHeaderRow.getCell(h + 2); // B, C, D
          cell.value = simHeaders[h];
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

        // ── Lignes de paramètres (cellules d'entrée)
        const dataStartRow = nextRow;
        const GOLD_BORDER = "FFD97706";
        const LIGHT_YELLOW = "FFFEF3C7";

        for (let i = 0; i < params.length; i++) {
          const p = params[i];
          const row = sheet2.getRow(nextRow);
          row.height = 22;

          // Colonne B : Nom du paramètre
          const nameCell = row.getCell(2);
          nameCell.value = p.name;
          nameCell.font = { name: "Segoe UI", size: 10, color: { argb: "FF475569" } };
          nameCell.alignment = { vertical: "middle" };

          // Colonne C : Valeur (cellule modifiable, fond jaune)
          const valCell = row.getCell(3);
          valCell.value = p.value;
          valCell.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: SLATE_900 } };
          valCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_YELLOW } };
          valCell.alignment = { horizontal: "right", vertical: "middle" };
          valCell.border = {
            top: { style: "thin", color: { argb: GOLD_BORDER } },
            bottom: { style: "thin", color: { argb: GOLD_BORDER } },
            left: { style: "thin", color: { argb: GOLD_BORDER } },
            right: { style: "thin", color: { argb: GOLD_BORDER } },
          };

          // Format selon le type
          if (p.type === "percentage") {
            valCell.numFmt = "0.0";
          } else if (p.type === "currency") {
            valCell.numFmt = "#,##0.00";
          } else if (p.type === "integer") {
            valCell.numFmt = "0";
          } else {
            valCell.numFmt = "#,##0.##";
          }

          // Colonne D : Description/Unité
          const descCell = row.getCell(4);
          descCell.value = p.unit || "";
          descCell.font = { name: "Segoe UI", size: 9, italic: true, color: { argb: "FF64748B" } };
          descCell.alignment = { vertical: "middle" };

          nextRow++;
        }

        // ── Ligne séparatrice
        const sepRow = sheet2.getRow(nextRow);
        sepRow.height = 4;
        for (let c = 2; c <= 4; c++) {
          const cell = sepRow.getCell(c);
          cell.border = {
            bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          };
        }
        nextRow++;

        // ── Ligne Résultat (formule active)
        const resultRowSim = sheet2.getRow(nextRow);
        resultRowSim.height = 26;

        // Label résultat
        const resLabel = resultRowSim.getCell(2);
        resLabel.value = "→ Résultat";
        resLabel.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF166534" } };
        resLabel.alignment = { vertical: "middle" };

        // Formule réécrite (cellule verte active)
        const { en: formulaEN, fr: formulaFR } = rewriteFormulaForSimulation(
          formulaToUse, params, dataStartRow
        );

        const resCell = resultRowSim.getCell(3);
        resCell.value = { formula: formulaEN, result: 0 };
        resCell.font = { name: "Consolas", size: 12, bold: true, color: { argb: "FF166534" } };
        resCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } };
        resCell.numFmt = "#,##0.00";
        resCell.alignment = { horizontal: "right", vertical: "middle" };
        resCell.border = {
          top: { style: "medium", color: { argb: "FF16A34A" } },
          bottom: { style: "medium", color: { argb: "FF16A34A" } },
          left: { style: "medium", color: { argb: "FF16A34A" } },
          right: { style: "medium", color: { argb: "FF16A34A" } },
        };

        // Unité résultat
        const resUnit = resultRowSim.getCell(4);
        const lastParam = params[params.length - 1];
        resUnit.value = lastParam?.unit ? `/${lastParam.unit}` : "";
        resUnit.font = { name: "Segoe UI", size: 9, italic: true, color: { argb: "FF166534" } };
        resUnit.alignment = { vertical: "middle" };

        nextRow += 2;

        // ── Mettre à jour les formules de la Zone 1 avec les références Zone 2
        // (écraser formulaRaw et formulaEnglish pour la Zone 1)
        // On stocke les formules réécrites pour les utiliser dans la Zone 1 plus bas
        var zone1FormulaFR = formulaFR;
        var zone1FormulaEN = formulaEN;
      }
    }
```

- [ ] **Étape 2 : Modifier la Zone 1 (lignes 524-532) pour utiliser les formules réécrites**

Remplacer :
```typescript
  if (formulaRaw) {
    writeSection(nextRow, "Version FR :", formulaRaw, AMBER, LIGHT_BG);
    nextRow++;
  }

  if (formulaEnglish && formulaEnglish !== formulaRaw) {
    writeSection(nextRow, "Version EN :", formulaEnglish, "FF16803C", "FFF0FDF4");
    nextRow++;
  }
```

Par :
```typescript
  // Utiliser les formules réécrites (Zone 2) si disponibles, sinon les originales
  const displayFormulaFR = (typeof zone1FormulaFR !== "undefined" && zone1FormulaFR) ? zone1FormulaFR : formulaRaw;
  const displayFormulaEN = (typeof zone1FormulaEN !== "undefined" && zone1FormulaEN) ? zone1FormulaEN : formulaEnglish;

  if (displayFormulaFR) {
    writeSection(nextRow, "Version FR :", displayFormulaFR, AMBER, LIGHT_BG);
    nextRow++;
  }

  if (displayFormulaEN && displayFormulaEN !== displayFormulaFR) {
    writeSection(nextRow, "Version EN :", displayFormulaEN, "FF16803C", "FFF0FDF4");
    nextRow++;
  }
```

- [ ] **Étape 3 : Ajouter la Zone 3 (instructions) après la Zone 2**

Après `nextRow += 2;` de la section simulation, ajouter :
```typescript
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
```

- [ ] **Étape 4 : Vérification**

Exécuter : `npx tsc --noEmit`
Attendu : Aucune erreur

---

## Tâche 5 : Nettoyage — Supprimer les anciennes fonctions inutiles

**Fichier** : `src/lib/excelExport.ts`

- [ ] **Étape 1 : Supprimer `columnLetterToNumber`** (plus utilisée)

Supprimer la fonction `columnLetterToNumber` (anciennement lignes 192-198, peut-être déjà supprimée).

- [ ] **Étape 2 : Vérifier que `shiftColumns` n'existe plus** (remplacée par `rewriteCellReferences`)

Si elle existe encore, la supprimer.

- [ ] **Étape 3 : Vérification**

Exécuter : `npx tsc --noEmit && npm run lint`
Attendu : Aucune erreur dans `excelExport.ts`

---

## Tâche 6 : Modifier le prompt Gemini

**Fichier** : `src/app/api/gemini/route.ts`

- [ ] **Étape 1 : Remplacer la ligne 76** dans le `systemInstruction`

Avant :
```
3. INCLURE OBLIGATOIREMENT un tableau Markdown d'exemple avec des données fictives montrant les valeurs attendues dans les cellules pour que la formule fonctionne.
```

Après :
```
3. INCLURE OBLIGATOIREMENT un tableau Markdown d'exemple avec exactement ces 4 colonnes :
   | Cellule | Description | Valeur | Résultat attendu |
   Règles :
   - "Cellule" = référence cellule (A1, B2, C3...)
   - "Description" = nom du paramètre (ex: "Montant du Prêt", "Taux Annuel", "Durée")
   - "Valeur" = valeur NUMÉRIQUE pure (ex: 250000, 3.5, 20). PAS de texte mixte comme "3.5% ou 0.035"
   - "Résultat attendu" = valeur formatée pour affichage (ex: 250 000 €, 3,50%, 20 ans)
   - La DERNIÈRE ligne contient la formule dans la colonne "Valeur" (ex: =VPM(B3/12;B4*12;B2))
   - Les autres colonnes de la ligne formule sont vides
```

- [ ] **Étape 2 : Vérification**

Exécuter : `npx tsc --noEmit && npm run lint`
Attendu : Aucune erreur

---

## Tâche 7 : Vérification finale end-to-end

- [ ] **Étape 1 : Build complet**

Exécuter : `npm run build`
Attendu : BUILD successful, aucune erreur

- [ ] **Étape 2 : Test manuel**

1. Lancer `npm run dev`
2. Aller sur http://localhost:3000
3. Sélectionner l'exemple "Mensualité d'un prêt de 250 000€ sur 20 ans a 3.5%"
4. Cliquer sur "Exemple (.xlsx)"
5. Ouvrir le fichier téléchargé dans Excel
6. Vérifier dans l'onglet "Exemple Pratique" :
   - Zone 1 : Les deux versions FR/EN avec les références D12, D13, D14
   - Zone 2 : Cellules jaunes avec valeurs modifiables
   - Zone 2 : Cellule verte avec formule qui se recalcule
   - Zone 3 : Instructions visibles
7. Modifier la valeur "Taux Annuel" de 3.5 à 5 → vérifier que le résultat se recalcule
8. Vérifier que la formule est correcte dans la barre de formule

- [ ] **Étape 3 : Commit**

```bash
git add src/lib/excelExport.ts src/app/api/gemini/route.ts docs/specs/ docs/plans/
git commit -refactor: refonte zone simulation interactive Excel

- Remplace le tableau d'exemples par une zone de simulation interactive
- Cellules d'entrée jaunes avec formatage adapte (€, %, entier)
- Formule verte qui se recalcule automatiquement
- Extraction des parametres depuis la reponse IA
- Detection du type (pourcentage, monetaire, entier)
- Réécriture des références cellulaires + ajustement taux/100
- Prompt Gemini renforce pour tableau structuré
- Suppression de la ligne SOMME inutile"
```

---

## Résumé des dépendances

```
Tâche 1 (SimParam + detectParamType)
  ↓
Tâche 2 (extractSimulationParams) — utilise SimParam, detectParamType
  ↓
Tâche 3 (rewriteFormulaForSimulation) — utilise SimParam, translateFrenchFormulaToEnglish
  ↓
Tâche 4 (Refonte downloadFormulaAsExcel) — utilise Tâche 1, 2, 3
  ↓
Tâches 5, 6, 7 (nettoyage, prompt, vérification) — indépendantes
```

**Ordre recommandé** : 1 → 2 → 3 → 4 → 5 → 6 → 7
