# Plan d'implémentation : Choix du format de formule

## Carte des fichiers

| Fichier | Rôle | Changement |
|---|---|---|
| `src/app/page.tsx` | Composant parent | Ajouter `format` state, localStorage, passer aux enfants et à l'API |
| `src/components/FormulaAssistant.tsx` | Barre d'entrée | Ajouter `<select>` format dans `FormulaInputBar` |
| `src/app/api/gemini/route.ts` | API Gemini | Accepter `format`, injecter dans le prompt système |
| `src/lib/excelExport.ts` | Export .xlsx | Refactor complet : remplacer FR→EN par logique conditionnelle |
| `src/lib/excelExport/postProcessFormula.ts` | Post-traitement LO | Nouveau fichier : XLOOKUP→INDEX+MATCH |

## Tâches

### Tâche 1 : Type ExportFormat + nouvelle dépendance

**Fichier :** `src/lib/excelExport.ts`

- [ ] **Étape 1 : Définir le type `ExportFormat` en haut du fichier**

### Tâche 2 : Post-processeur XLOOKUP→INDEX+MATCH

**Fichiers :**
- Créer : `src/lib/excelExport/postProcessFormula.ts`

- [ ] **Étape 1 : Créer le module**

```typescript
export type ExportFormat = "excel-en" | "excel-fr" | "libreoffice-en" | "libreoffice-fr";

export function postProcessFormula(formula: string, format: ExportFormat): string {
  if (format === "libreoffice-en") {
    return convertXlookupToIndexMatch(formula, "en");
  }
  if (format === "libreoffice-fr") {
    return convertXlookupToIndexMatch(formula, "fr");
  }
  return formula;
}

function convertXlookupToIndexMatch(formula: string, locale: "en" | "fr"): string {
  const lookupFn = locale === "en" ? "XLOOKUP" : "RECHERCHEX";
  const indexFn = locale === "en" ? "INDEX" : "INDEX";
  const matchFn = locale === "en" ? "MATCH" : "EQUIV";
  const ifErrorFn = locale === "en" ? "IFERROR" : "SIERREUR";
  const sep = locale === "en" ? "," : ";";

  // Pattern: XLOOKUP(lookup, array, return_array, [not_found], [match_mode], [search_mode])
  const pattern = new RegExp(`${lookupFn}\\(([^()]+)\\(?\\)?\\)`, "gi");
  
  // Note: for simplicity, handle basic cases only
  // Full parsing of nested parens is complex — this handles 3 and 4 param cases
  
  return formula.replace(pattern, (match, argsStr) => {
    const args = splitArgsRespectingQuotes(argsStr, sep);
    if (args.length >= 3) {
      const lookupArg = args[0].trim();
      const arrayArg = args[1].trim();
      const returnArg = args[2].trim();
      
      const inner = `${indexFn}(${returnArg}${sep} ${matchFn}(${lookupArg}${sep} ${arrayArg}${sep} 0))`;
      
      if (args.length >= 4 && args[3].trim() !== "") {
        const notFoundArg = args[3].trim();
        return `${ifErrorFn}(${inner}${sep} ${notFoundArg})`;
      }
      return inner;
    }
    // Can't convert — return as-is
    return match;
  });
}

function splitArgsRespectingQuotes(s: string, sep: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let inString = false;
  let current = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') { inString = !inString; current += c; continue; }
    if (inString) { current += c; continue; }
    if (c === '(') { depth++; current += c; continue; }
    if (c === ')') { depth--; current += c; continue; }
    if (depth === 0 && c === sep[0] && (sep.length === 1 || i + 1 < s.length && s[i + 1] === sep[1])) {
      args.push(current);
      current = "";
      if (sep.length > 1) i++; // skip second char of multi-char sep
      continue;
    }
    current += c;
  }
  if (current.trim()) args.push(current);
  return args;
}
```

### Tâche 3 : Ajouter le sélecteur de format dans l'UI

**Fichiers :**
- Modifier : `src/app/page.tsx`
- Modifier : `src/components/FormulaAssistant.tsx`

- [ ] **Étape 1 : Ajouter `format` state dans `page.tsx`**
  - Importer `ExportFormat` depuis `excelExport.ts`
  - Ajouter `const [format, setFormat] = useLocalStorage<ExportFormat>("excel_export_format", "libreoffice-fr");`
  - Passer `format` et `setFormat` à `FormulaInputBar`

- [ ] **Étape 2 : Ajouter `format` comme prop de `FormulaInputBar`**
  - Ajouter `format` et `onFormatChange` aux props de `FormulaInputBar`

- [ ] **Étape 3 : Ajouter le `<select>` dans le rendu de `FormulaInputBar`**
  - Placer le sélecteur à gauche des boutons modèle

### Tâche 4 : Transmettre le format à l'API

**Fichier :** `src/app/api/gemini/route.ts`

- [ ] **Étape 1 : Ajouter `format` au schéma Zod**

- [ ] **Étape 2 : Injecter les instructions de format dans le `systemInstruction`**

```typescript
const formatInstructions: Record<string, string> = {
  "excel-en": "- Noms de fonctions : anglais (IF, VLOOKUP, PMT, XLOOKUP)\n- Séparateur d'arguments : , (virgule)\n- Séparateur décimal : . (point)",
  "excel-fr": "- Noms de fonctions : français (SI, RECHERCHEV, VPM, RECHERCHEX)\n- Séparateur d'arguments : ; (point-virgule)\n- Séparateur décimal : , (virgule)",
  "libreoffice-en": "- Noms de fonctions : anglais (IF, VLOOKUP, PMT)\n- Séparateur d'arguments : , (virgule)\n- Séparateur décimal : . (point)\n- N'utilise PAS XLOOKUP ni XMATCH : utilise INDEX+MATCH à la place",
  "libreoffice-fr": "- Noms de fonctions : français (SI, RECHERCHEV, VPM)\n- Séparateur d'arguments : ; (point-virgule)\n- Séparateur décimal : , (virgule)\n- N'utilise PAS RECHERCHEX ni EQUIVX : utilise INDEX+EQUIV à la place",
};
```

- [ ] **Étape 3 : Passer `format` au client dans `page.tsx`**

### Tâche 5 : Refactor excelExport.ts

**Fichier :** `src/lib/excelExport.ts`

- [ ] **Étape 1 : Supprimer les fonctions et données obsolètes**
  - `FRENCH_TO_ENGLISH_FUNCTIONS`
  - `translateFrenchFormulaToEnglish()`
  - Les appels à `translateFrenchFormulaToEnglish()`

- [ ] **Étape 2 : Ajouter `format` paramètre à `downloadFormulaAsExcel`**

- [ ] **Étape 3 : Simplifier `rewriteFormulaForSimulation` pour ne retourner qu'une formule**

- [ ] **Étape 4 : Appeler `postProcessFormula` pour LibreOffice**

- [ ] **Étape 5 : Adapter le template d'affichage (une seule version de formule)**

- [ ] **Étape 6 : Mettre à jour `handleDownloadExcel` dans `page.tsx`**

## Vérification finale

1. `npm run build` passe sans erreur
2. Le sélecteur de format apparaît dans l'UI
3. Le choix est persisté après rafraîchissement
4. Téléchargement Excel fonctionne pour chaque format
5. Pas de `Err:508` ni `#NOM?` dans aucun format
