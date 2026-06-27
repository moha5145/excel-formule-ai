# Plan : Tableau de simulation adaptable à toute formule

## Problème
Le tableau de simulation ne gère que les valeurs **numériques**. Les formules avec critères texte (SUMIFS + "Marketing", SOMME.SI.ENS + "Nord"), dates, ou références hors paramètres échouent car `extractSimulationParams()` saute les valeurs non-numériques (`isNaN → continue`), les cellules ne sont pas réécrites, et la formule pointe vers des cellules vides.

## Objectif
Le tableau doit s'adapter à TOUT type de formule :
- Formules numériques simples (VPM, TVA, SI) → comportement actuel
- Formules avec critères texte (SOMME.SI.ENS, NB.SI.ENS) → les critères texte apparaissent comme paramètres modifiables
- Formules avec dates → les dates apparaissent comme paramètres modifiables
- Formules avec plages de référence → toutes les références cellulaires sont réécrites

## Fichiers à modifier

| Fichier | Responsabilité |
|---------|---------------|
| `src/app/api/gemini/route.ts` | Prompt IA — autoriser les valeurs texte/date dans le tableau |
| `src/lib/excelExport.ts` | `SimParam`, `extractSimulationParams()`, `rewriteFormulaForSimulation()`, Zone 2 display |
| `src/lib/excelExport/postProcessFormula.ts` | Aucun changement |

---

## Tâche 1 : Étendre l'interface `SimParam`

**Fichier :** `src/lib/excelExport.ts` (lignes 189-196)

### Étape 1 : Modifier `SimParam` pour supporter texte/date

```typescript
interface SimParam {
  name: string;
  value: number;            // Valeur numérique (pour calculs)
  rawValue: string;         // Valeur brute telle quelle (texte, date, nombre)
  type: 'percentage' | 'currency' | 'integer' | 'number' | 'text' | 'date';
  unit: string;
  cellRef: string;
  needsDivideBy100: boolean;
}
```

- `rawValue` : la chaîne originale de la colonne "Valeur" (ex: `"Marketing"`, `"01/01/2024"`, `"250000"`)
- `type` : ajouter `'text'` et `'date'`
- `value` : pour les types texte/date, on met `0` (non utilisé pour le calcul)

### Étape 2 : Vérifier que TypeScript compile

```bash
npx tsc --noEmit
```

Attendu : erreur à `extractSimulationParams()` et Zone 2 display (champs manquants) — c'est normal, on les fixe aux tâches suivantes.

---

## Tâche 2 : Modifier `extractSimulationParams()` pour gérer texte/date

**Fichier :** `src/lib/excelExport.ts` (lignes 34-108)

### Étape 1 : Remplacer le bloc de nettoyage valeur (lignes 52-60)

Avant :
```typescript
const cleaned = valueStr
  .replace(/\s/g, "")
  .replace(/%/g, "")
  .replace(/€|euro/gi, "")
  .replace(",", ".");
const numVal = Number(cleaned);
if (isNaN(numVal) || valueStr === "") continue;
```

Après :
```typescript
if (!valueStr) continue;

// Détection du type de valeur
const trimmedVal = valueStr.trim();
const hasPercent = /%/.test(valueStr) || /%/.test(resultStr);

// Test si c'est un nombre (avec ou sans %, symboles)
const cleaned = trimmedVal
  .replace(/\s/g, "")
  .replace(/%/g, "")
  .replace(/€|euro/gi, "")
  .replace(",", ".");
const numVal = Number(cleaned);

// Détection date : format JJ/MM/AAAA ou AAAA-MM-JJ ou texte contenant mois
const isDate = /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(trimmedVal) ||
               /\d{4}-\d{2}-\d{2}/.test(trimmedVal) ||
               /(janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc)/i.test(trimmedVal);

// Détection texte pur : pas un nombre, pas une date, pas vide
const isText = isNaN(numVal) && !isDate && !hasPercent && trimmedVal !== "";

if (isText) {
  // Valeur texte : garder telle quelle
  params.push({
    name: description,
    value: 0,
    rawValue: trimmedVal,
    type: 'text',
    unit: "",
    cellRef,
    needsDivideBy100: false,
  });
  continue;
}

if (isDate) {
  // Valeur date : garder la chaîne telle quelle
  params.push({
    name: description,
    value: 0,
    rawValue: trimmedVal,
    type: 'date',
    unit: "",
    cellRef,
    needsDivideBy100: false,
  });
  continue;
}

if (isNaN(numVal)) continue;
```

### Étape 2 : Modifier le `params.push()` existant pour ajouter `rawValue`

Dans le push existant (lignes 97-105), ajouter `rawValue: valueStr` :

```typescript
params.push({
  name: description,
  value: displayValue,
  rawValue: valueStr,
  type: (paramType === "percentage" || hasPercent) ? "percentage" : paramType,
  unit,
  cellRef,
  needsDivideBy100,
});
```

### Étape 3 : Vérifier TypeScript

```bash
npx tsc --noEmit
```

Attendu : erreur à Zone 2 display (propriété `rawValue` manquante) — on fixe à la tâche suivante.

---

## Tâche 3 : Modifier Zone 2 pour afficher texte/date

**Fichier :** `src/lib/excelExport.ts` (lignes 516-561)

### Étape 1 : Modifier l'écriture des cellules valeurs (lignes 530-547)

Remplacer le bloc de format par :
```typescript
// Colonne C : Valeur (cellule modifiable, fond jaune)
const valCell = row.getCell(3);
valCell.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: SLATE_900 } };
valCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_YELLOW } };
valCell.alignment = { horizontal: "right", vertical: "middle" };
valCell.border = {
  top: { style: "thin", color: { argb: GOLD_BORDER } },
  bottom: { style: "thin", color: { argb: GOLD_BORDER } },
  left: { style: "thin", color: { argb: GOLD_BORDER } },
  right: { style: "thin", color: { argb: GOLD_BORDER } },
};

if (p.type === "text") {
  // Valeur texte : afficher le texte brut
  valCell.value = p.rawValue;
  valCell.alignment = { horizontal: "left", vertical: "middle" };
} else if (p.type === "date") {
  // Valeur date : afficher la date brute
  valCell.value = p.rawValue;
  valCell.alignment = { horizontal: "center", vertical: "middle" };
} else if (p.type === "percentage") {
  valCell.value = p.value;
  valCell.numFmt = '0.0"%"';
} else if (p.type === "currency") {
  valCell.value = p.value;
  valCell.numFmt = "#,##0.00";
} else if (p.type === "integer") {
  valCell.value = p.value;
  valCell.numFmt = "0";
} else {
  valCell.value = p.value;
  valCell.numFmt = "#,##0.##";
}
```

### Étape 2 : Vérifier TypeScript

```bash
npx tsc --noEmit
```

Attendu : pas d'erreurs.

---

## Tâche 4 : Modifier `rewriteFormulaForSimulation()` pour gérer texte/date

**Fichier :** `src/lib/excelExport.ts` (lignes 111-158)

Le problème actuel : la fonction ne réécrit que les cellules qui ont des `params`. Si la formule référence des cellules qui ne sont pas dans le tableau, elles ne sont pas réécrites.

### Étape 1 : Réécrire les références texte avec guillemets

Dans la boucle de réécriture (lignes 125-130), ajouter la gestion des valeurs texte :

```typescript
// Réécrire les références
let rewritten = formula;
for (let i = 0; i < params.length; i++) {
  const p = params[i];
  const origRef = p.cellRef;
  const targetRef = `${valueCol}${dataStartRow + i}`;
  const escaped = origRef.replace(/\$/g, "\\$");
  const regex = new RegExp(`\\b${escaped}(?!\\w)`, "g");

  if (p.type === "text") {
    // Texte : remplacer la référence par la valeur textuelle entre guillemets
    // Si la référence est dans un contexte de critère (après ; ou dans une fonction SOMME.SI.ENS etc.)
    // on remplace B2 par "valeur"
    rewritten = rewritten.replace(regex, `"${p.rawValue}"`);
  } else if (p.type === "date") {
    // Date : garder la référence (la date est en tant que chaîne dans la cellule)
    // Les dates en Excel sont des nombres, on garde la référence cellule
    rewritten = rewritten.replace(regex, targetRef);
  } else {
    // Numérique : comportement actuel
    rewritten = rewritten.replace(regex, targetRef);
  }
}
```

### Étape 2 : Ne PAS appliquer /100 aux texte/date

Le bloc de gestion des pourcentages (lignes 134-152) ne doit s'appliquer qu'aux paramètres numériques. C'est déjà le cas car `needsDivideBy100` est `false` pour texte/date.

### Étape 3 : Vérifier TypeScript

```bash
npx tsc --noEmit
```

---

## Tâche 5 : Mettre à jour le prompt IA

**Fichier :** `src/app/api/gemini/route.ts` (lignes 89-97)

### Étape 1 : Modifier les règles du tableau Markdown

Remplacer les lignes 89-97 par :
```typescript
3. INCLURE OBLIGATOIREMENT un tableau Markdown d'exemple avec exactement ces 4 colonnes :
   | Cellule | Description | Valeur | Résultat attendu |
   Règles :
   - "Cellule" = référence cellule (A1, B2, C3...)
   - "Description" = nom du paramètre (ex: "Montant du Prêt", "Taux Annuel", "Durée", "Service", "Région")
   - "Valeur" = valeur du paramètre :
     * Pour les nombres : valeur numérique pure (ex: 250000, 3.5, 20). PAS de texte mixte comme "3.5%"
     * Pour les taux/percentages : utiliser le pourcentage (3.5) PAS le décimal (0.035)
     * Pour les critères texte : texte brut entre guillemets simples (ex: 'Marketing', 'Nord')
     * Pour les dates : date au format JJ/MM/AAAA (ex: 01/01/2024)
   - "Résultat attendu" = valeur formatée pour affichage (ex: 250 000 €, 3,50%, 20 ans)
   - INCLURE TOUTES les références cellulaires utilisées dans la formule, même les critères texte et dates
   - La DERNIÈRE ligne contient la formule dans la colonne "Valeur" (ex: =VPM(B3/12;B4*12;B2))
   - Les autres colonnes de la ligne formule sont vides
4. La ligne de vérification (✅).`;
```

### Étape 2 : Vérifier TypeScript

```bash
npx tsc --noEmit
```

---

## Tâche 6 : Gérer le cas "pas de paramètres" dans Zone 2

**Fichier :** `src/lib/excelExport.ts` (lignes 430-439)

Actuellement, si `simParams.length === 0`, on ne génère pas de tableau de simulation. Mais avec des formules qui n'ont que des critères texte, on pourrait avoir des params texte sans params numériques.

### Étape 1 : Vérifier que le code existant gère déjà ce cas

Le code actuel (lignes 435-438) :
```typescript
if (simParams.length > 0 && simFormulaRaw) {
  zone1Formula = rewriteFormulaForSimulation(simFormulaRaw, simParams, simDataStartRow);
  zone1Formula = postProcessFormula(zone1Formula, format);
}
```

Avec les changements de la tâche 2, les params texte sont ajoutés à `simParams`. Donc `simParams.length > 0` sera vrai même pour des formules avec-only critères texte. ✅ Pas de changement nécessaire.

---

## Tâche 7 : Test et validation

### Étape 1 : Compiler

```bash
npx tsc --noEmit
```

### Étape 2 : Lancer le serveur de dev

```bash
npm run dev
```

### Étape 3 : Tester avec ces formules

| Test | Formule attendue | Paramètres |
|------|-----------------|------------|
| VPM (numérique) | `=VPM(C10/12;C11*12;-C12)` | Montant, Taux, Durée |
| TVA (numérique) | `=C10*0.2` | Montant HT |
| Minutes (texte) | `=INT(C10/60) & "h" & TEXT(MOD(C10,60),"00")` | Nombre de minutes |
| SUMIFS (texte+num) | `=SUMIFS(C10:C14;B10:B14;"Marketing")` | Plage ventes, Critère service |
| SUMIFS 2 critères | `=SUMIFS(C10:C14;B10:B14;"Nord";D10:D14;">"&DATE(2024;1;1))` | Plage ventes, Région, Date |
| NB.SI.ENS (texte) | `=COUNTIFS(B10:B14;"Marketing";C10:C14;">100")` | Service, Seuil |

### Étape 4 : Vérifier dans LibreOffice

Ouvrir le fichier .xlsx généré dans LibreOffice Calc :
- Les valeurs texte doivent apparaître dans les cellules jaunes
- La formule verte doit se recalculer quand on modifie une valeur
- La formule ne doit pas afficher #NOM? ou Err:508
