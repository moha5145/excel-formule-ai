# Plan d'implémentation : Amélioration Majeure des Tableaux Simples et Complexes (Génération, Simulation & Export)

> **Date :** 17 Octobre 2026  
> **Statut :** Prêt pour exécution  
> **Branche recommandée :** `feat/interactive-tables-and-export-sync`

---

## 1. Contexte & Diagnostic du Problème

### Le Constat Utilisateur
Après la réussite de l'export fidèle des fichiers importés (in-place), l'attention se porte sur la génération et l'exportation des tableaux créés de toutes pièces par l'IA (cas simple et cas complexe) :
1. **Simulateur inerte en mode complexe** :
   - Dans le composant `ComplexTablePreview`, les cellules des colonnes calculées affichent textuellement la chaîne brute de la formule (ex: `=C{row}*D{row}`) ou la mention statique `"Calculé"`.
   - Si l'utilisateur saisit ou modifie une valeur dans un champ d'entrée ou un paramètre global, **aucun calcul ne se produit à l'écran**.
   - À l'ouverture, les champs de saisie du simulateur sont tous vides `{}` au lieu d'afficher les valeurs d'exemple réalistes fournies par l'IA dans sa réponse.
2. **Déconnexion totale entre le Simulateur et l'Export Excel** :
   - Lorsque l'utilisateur prend le temps de tester des valeurs dans le simulateur, d'ajuster des paramètres ou d'ajouter des lignes de simulation via *« Ajouter des lignes de simulation »*, le clic sur *« Exporter .xlsx »* **ignore complètement ses modifications** et exporte les données initiales du message brut.
3. **Cas Simple (`simple_table`) démuni d'interactivité** :
   - Le cas simple n'affiche qu'un tableau Markdown textuel figé sans aucun simulateur interactif.
   - Son export Excel dans `excelExport.ts` repose sur un parseur Markdown par regex (`extractTables`) fragile, une réplication de formule basée sur une hypothèse rigide de ligne `C10`, et une structure de classeur lourde (bandeau énorme dans "Formule & Guide" + "Exemple Pratique" aux largeurs figées).
4. **Largeurs de colonnes rigides & troncatures sous Excel** :
   - `complexExcelBuilder` et `excelExport` imposent une largeur fixe (`width: 18`), ce qui provoque des coupures de texte sur les libellés longs ou des `###` sur les montants élevés.

### Les Objectifs
1. **Évaluation en direct (Live Evaluation) dans le navigateur** : implémenter un évaluateur de formules Excel léger et sécurisé en TypeScript pour recalculer instantanément les résultats dans le simulateur dès que l'utilisateur modifie une cellule ou un paramètre.
2. **Pré-remplissage automatique des exemples** : alimenter immédiatement le simulateur avec les données d'exemple générées par l'IA dans le tableau Markdown.
3. **Synchronisation Simulateur ➔ Export Excel** : transmettre les valeurs saisies, les paramètres modifiés et le nombre réel de lignes du simulateur au moteur d'export `ExcelJS`.
4. **Unification du Cas Simple** : synthétiser à la volée un schéma virtuel pour les réponses simples afin de leur offrir le même simulateur interactif moderne et un export Excel propre, sans formule cassée.
5. **Auto-ajustement des colonnes et styles modernes** : calculer dynamiquement la largeur des colonnes dans Excel pour un rendu professionnel sans troncature.

---

## 2. Cartographie des Fichiers

| Fichier | Action | Responsabilité |
| :--- | :--- | :--- |
| `src/lib/formulaEvaluator.ts` | **Créer** | Moteur d'évaluation de formules de tableur en TypeScript pur (sans `eval`), supportant les 4 opérations, les parenthèses, les références `C{row}`, `$C$5`, et les fonctions clés (`IF`, `SUM`, `AVERAGE`, `MIN`, `MAX`, `ROUND`, `ABS`, `PRODUCT`). |
| `src/lib/formulaEvaluator.test.ts` | **Créer** | Tests unitaires exhaustifs pour le moteur d'évaluation de formules. |
| `src/lib/excelExport/simpleTableBridge.ts` | **Créer** | Pont intelligent transformant une réponse simple (Markdown + formule) en un `TableSchema` normalisé et exploitable par le simulateur et l'export. |
| `src/lib/excelExport/simpleTableBridge.test.ts` | **Créer** | Tests unitaires pour la conversion simple ➔ schéma virtuel. |
| `src/components/ComplexTablePreview.tsx` | **Modifier** | Pré-remplissage des inputs d'exemples, recalcul en direct des colonnes calculées lors de la saisie, et transmission de l'état complet à `onDownloadExcel`. |
| `src/lib/excelExport/complexExcelBuilder.ts` | **Modifier** | Prise en charge des données utilisateur personnalisées (`customData` : lignes, paramètres, compte de lignes) et calcul dynamique des largeurs de colonnes. |
| `src/lib/excelExport/complexExcelBuilder.test.ts` | **Modifier** | Tests de génération avec données personnalisées et auto-ajustement des colonnes. |
| `src/lib/excelExport.ts` | **Modifier** | Raccordement du paramètre `customData` dans `downloadFormulaAsExcel` et fiabilisation de l'export simple. |
| `src/app/page.tsx` | **Modifier** | Activation du simulateur interactif pour les cas simples via le pont `simpleTableBridge`, et passage des données personnalisées à l'export. |
| `src/components/FormulaAssistant.tsx` | **Modifier** | Synchronisation du bouton "Excel" du bas avec l'état simulé si disponible. |

---

## 3. Découpage des Tâches (Bite-Sized & TDD)

### Phase 1 : Moteur d'Évaluation de Formules en Direct (`formulaEvaluator`)

#### Tâche 1.1 : Tests unitaires pour l'évaluateur d'expressions arithmétiques et fonctions simples

**Fichiers :**
- Créer : `src/lib/formulaEvaluator.test.ts`
- Créer : `src/lib/formulaEvaluator.ts`

- [ ] **Étape 1 : Écrire le test unitaire pour les calculs arithmétiques et références relatives/absolues**

Dans `src/lib/formulaEvaluator.test.ts` :
```typescript
import { describe, it, expect } from "vitest";
import { evaluateFormula, resolveCellReference } from "./formulaEvaluator";

describe("formulaEvaluator", () => {
  it("devrait évaluer les opérations arithmétiques de base (+, -, *, /)", () => {
    expect(evaluateFormula("10 + 5", {})).toBe(15);
    expect(evaluateFormula("20 - 8", {})).toBe(12);
    expect(evaluateFormula("6 * 7", {})).toBe(42);
    expect(evaluateFormula("50 / 4", {})).toBe(12.5);
    expect(evaluateFormula("2 + 3 * 4", {})).toBe(14); // priorité opératoire
    expect(evaluateFormula("(2 + 3) * 4", {})).toBe(20);
  });

  it("devrait résoudre les références de cellules avec le contexte de ligne et de paramètres", () => {
    const context = {
      row: 10,
      cells: {
        C10: 250,
        D10: 4,
        C5: 0.20,
      },
    };

    expect(evaluateFormula("C{row} * D{row}", context)).toBe(1000);
    expect(evaluateFormula("C10 * $C$5", context)).toBe(50);
    expect(evaluateFormula("C{row} * (1 + $C$5)", context)).toBe(300);
  });

  it("devrait supporter les pourcentages (ex: 20% -> 0.2)", () => {
    expect(evaluateFormula("100 * 20%", {})).toBe(20);
  });

  it("devrait supporter la fonction IF / SI", () => {
    const context = {
      row: 1,
      cells: { C1: 1500, D1: 2000 },
    };
    expect(evaluateFormula("IF(C1 > 1000, 100, 50)", context)).toBe(100);
    expect(evaluateFormula("IF(C1 > 2000, 100, 50)", context)).toBe(50);
    expect(evaluateFormula("SI(C1 <= 1500; 10; 20)", context)).toBe(10);
  });

  it("devrait supporter SUM, AVERAGE, MIN, MAX, ROUND", () => {
    const context = {
      row: 1,
      cells: { C1: 10, D1: 20, E1: 30 },
    };
    expect(evaluateFormula("SUM(C1, D1, E1)", context)).toBe(60);
    expect(evaluateFormula("AVERAGE(C1, D1, E1)", context)).toBe(20);
    expect(evaluateFormula("MAX(C1, D1, E1)", context)).toBe(30);
    expect(evaluateFormula("MIN(C1, D1, E1)", context)).toBe(10);
    expect(evaluateFormula("ROUND(12.3456, 2)", context)).toBe(12.35);
  });

  it("devrait retourner une chaîne vide ou fallback propre en cas d'erreur de syntaxe ou division par zéro", () => {
    expect(evaluateFormula("10 / 0", {})).toBe("#DIV/0!");
    expect(evaluateFormula("INVALID_FUNC(1, 2)", {})).toBe("#VALEUR!");
  });
});
```

- [ ] **Étape 2 : Exécuter le test pour vérifier l'échec initial**
```bash
npx vitest run src/lib/formulaEvaluator.test.ts
```
*Attendu : Échec car `src/lib/formulaEvaluator.ts` n'existe pas encore.*

- [ ] **Étape 3 : Implémenter le moteur d'évaluation dans `src/lib/formulaEvaluator.ts`**

Créer `src/lib/formulaEvaluator.ts` :
```typescript
export interface EvaluationContext {
  row?: number;
  cells?: Record<string, number | string | boolean | null | undefined>;
}

// Token types pour l'analyseur lexical
type TokenType = "NUMBER" | "STRING" | "IDENT" | "OP" | "COMMA" | "LPAREN" | "RPAREN";

interface Token {
  type: TokenType;
  value: string;
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = expr.trim().replace(/^=/, "");

  while (i < s.length) {
    const ch = s[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(s[i + 1] || ""))) {
      let numStr = "";
      while (i < s.length && (/[0-9.]/.test(s[i]) || s[i] === " ")) {
        if (s[i] !== " ") numStr += s[i];
        i++;
      }
      if (i < s.length && s[i] === "%") {
        tokens.push({ type: "NUMBER", value: String(parseFloat(numStr) / 100) });
        i++;
      } else {
        tokens.push({ type: "NUMBER", value: numStr });
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      let str = "";
      while (i < s.length && s[i] !== quote) {
        str += s[i];
        i++;
      }
      i++;
      tokens.push({ type: "STRING", value: str });
      continue;
    }

    if (/[a-zA-Z_$]/.test(ch) || ch === "{") {
      let ident = "";
      while (i < s.length && /[a-zA-Z0-9_${}]/.test(s[i])) {
        ident += s[i];
        i++;
      }
      tokens.push({ type: "IDENT", value: ident });
      continue;
    }

    if (ch === "(") {
      tokens.push({ type: "LPAREN", value: "(" });
      i++;
      continue;
    }

    if (ch === ")") {
      tokens.push({ type: "RPAREN", value: ")" });
      i++;
      continue;
    }

    if (ch === "," || ch === ";") {
      tokens.push({ type: "COMMA", value: "," });
      i++;
      continue;
    }

    if (["<=", ">=", "<>", "!=", "==", "<", ">", "+", "-", "*", "/", "^"].some((op) => s.startsWith(op, i))) {
      const matched = ["<=", ">=", "<>", "!=", "==", "<", ">", "+", "-", "*", "/", "^"].find((op) => s.startsWith(op, i))!;
      tokens.push({ type: "OP", value: matched });
      i += matched.length;
      continue;
    }

    if (ch === "=") {
      tokens.push({ type: "OP", value: "==" });
      i++;
      continue;
    }

    i++;
  }

  return tokens;
}

// Analyseur syntaxique par descente récursive
class Parser {
  private tokens: Token[];
  private pos = 0;
  private context: EvaluationContext;

  constructor(tokens: Token[], context: EvaluationContext) {
    this.tokens = tokens;
    this.context = context;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    return this.tokens[this.pos++];
  }

  public parse(): any {
    if (this.tokens.length === 0) return 0;
    const res = this.parseExpression();
    return res;
  }

  private parseExpression(): any {
    return this.parseComparison();
  }

  private parseComparison(): any {
    let left = this.parseAdditive();

    while (this.peek() && ["<", ">", "<=", ">=", "==", "!=", "<>"].includes(this.peek()!.value)) {
      const op = this.consume().value;
      const right = this.parseAdditive();

      if (op === "<") left = left < right;
      else if (op === ">") left = left > right;
      else if (op === "<=") left = left <= right;
      else if (op === ">=") left = left >= right;
      else if (op === "==" || op === "=") left = left == right;
      else if (op === "!=" || op === "<>") left = left != right;
    }

    return left;
  }

  private parseAdditive(): any {
    let left = this.parseMultiplicative();

    while (this.peek() && (this.peek()!.value === "+" || this.peek()!.value === "-")) {
      const op = this.consume().value;
      const right = this.parseMultiplicative();
      if (op === "+") {
        left = typeof left === "string" || typeof right === "string" ? String(left) + String(right) : Number(left) + Number(right);
      } else {
        left = Number(left) - Number(right);
      }
    }

    return left;
  }

  private parseMultiplicative(): any {
    let left = this.parseUnary();

    while (this.peek() && (this.peek()!.value === "*" || this.peek()!.value === "/")) {
      const op = this.consume().value;
      const right = this.parseUnary();
      if (op === "*") {
        left = Number(left) * Number(right);
      } else {
        if (Number(right) === 0) throw new Error("#DIV/0!");
        left = Number(left) / Number(right);
      }
    }

    return left;
  }

  private parseUnary(): any {
    if (this.peek() && (this.peek()!.value === "+" || this.peek()!.value === "-")) {
      const op = this.consume().value;
      const val = this.parseUnary();
      return op === "-" ? -Number(val) : Number(val);
    }
    return this.parsePrimary();
  }

  private parsePrimary(): any {
    const token = this.peek();
    if (!token) return 0;

    if (token.type === "NUMBER") {
      this.consume();
      return parseFloat(token.value);
    }

    if (token.type === "STRING") {
      this.consume();
      return token.value;
    }

    if (token.type === "LPAREN") {
      this.consume();
      const val = this.parseExpression();
      if (this.peek() && this.peek()!.type === "RPAREN") {
        this.consume();
      }
      return val;
    }

    if (token.type === "IDENT") {
      this.consume();
      const name = token.value;

      // Est-ce un appel de fonction ?
      if (this.peek() && this.peek()!.type === "LPAREN") {
        this.consume();
        const args: any[] = [];
        if (this.peek() && this.peek()!.type !== "RPAREN") {
          args.push(this.parseExpression());
          while (this.peek() && this.peek()!.type === "COMMA") {
            this.consume();
            args.push(this.parseExpression());
          }
        }
        if (this.peek() && this.peek()!.type === "RPAREN") {
          this.consume();
        }
        return this.evaluateFunction(name.toUpperCase(), args);
      }

      // Sinon c'est une référence de cellule ou variable
      return this.resolveIdentifier(name);
    }

    this.consume();
    return 0;
  }

  private evaluateFunction(name: string, args: any[]): any {
    switch (name) {
      case "IF":
      case "SI": {
        const cond = Boolean(args[0]);
        return cond ? args[1] : (args[2] ?? 0);
      }
      case "SUM":
      case "SOMME": {
        return args.reduce((acc, curr) => acc + (Number(curr) || 0), 0);
      }
      case "AVERAGE":
      case "MOYENNE": {
        if (args.length === 0) return 0;
        const sum = args.reduce((acc, curr) => acc + (Number(curr) || 0), 0);
        return sum / args.length;
      }
      case "MAX": {
        const nums = args.map(Number).filter((n) => !isNaN(n));
        return nums.length > 0 ? Math.max(...nums) : 0;
      }
      case "MIN": {
        const nums = args.map(Number).filter((n) => !isNaN(n));
        return nums.length > 0 ? Math.min(...nums) : 0;
      }
      case "ROUND":
      case "ARRONDI": {
        const val = Number(args[0]) || 0;
        const decimals = Number(args[1]) || 0;
        const factor = Math.pow(10, decimals);
        return Math.round(val * factor) / factor;
      }
      case "ABS": {
        return Math.abs(Number(args[0]) || 0);
      }
      case "PRODUCT":
      case "PRODUIT": {
        return args.reduce((acc, curr) => acc * (Number(curr) || 0), 1);
      }
      default:
        throw new Error("#VALEUR!");
    }
  }

  private resolveIdentifier(name: string): any {
    const row = this.context.row || 1;
    // Remplacer {row} si présent
    const resolvedRef = name.replace(/\{row\}/g, String(row)).replace(/\$/g, "").toUpperCase();

    if (this.context.cells && resolvedRef in this.context.cells) {
      const val = this.context.cells[resolvedRef];
      if (typeof val === "number") return val;
      if (typeof val === "boolean") return val;
      if (val === null || val === undefined) return 0;
      const num = Number(String(val).replace(/\s/g, "").replace(/,/g, "."));
      return isNaN(num) ? val : num;
    }

    return 0;
  }
}

export function evaluateFormula(formula: string, context: EvaluationContext = {}): number | string | boolean {
  if (!formula || typeof formula !== "string") return 0;
  const clean = formula.trim().replace(/^=/, "");
  if (!clean) return 0;

  try {
    const tokens = tokenize(clean);
    const parser = new Parser(tokens, context);
    const res = parser.parse();
    if (typeof res === "number") {
      if (!isFinite(res)) return "#DIV/0!";
      // Arrondir les résidus flottants JS (ex: 0.1 + 0.2 = 0.30000000000000004)
      return Math.round(res * 100000000) / 100000000;
    }
    return res;
  } catch (err: unknown) {
    const msg = (err as Error).message;
    if (msg.startsWith("#")) return msg;
    return "#VALEUR!";
  }
}
```

- [ ] **Étape 4 : Exécuter le test pour vérifier le succès**
```bash
npx vitest run src/lib/formulaEvaluator.test.ts
```
*Attendu : PASS.*

- [ ] **Étape 5 : Commit**
```bash
git add src/lib/formulaEvaluator.ts src/lib/formulaEvaluator.test.ts
git commit -m "feat(evaluator): moteur d'évaluation de formules pour simulateur interactif"
```

---

### Phase 2 : Pré-remplissage & Calcul en Direct dans `ComplexTablePreview`

#### Tâche 2.1 : Intégrer `formulaEvaluator` et initialiser les données d'exemple

**Fichiers :**
- Modifier : `src/components/ComplexTablePreview.tsx`

- [ ] **Étape 1 : Analyser les besoins de `ComplexTablePreview`**
  1. Pré-remplir `inputValues` avec les données d'exemple du Markdown si la table existe.
  2. Créer une fonction de calcul qui construit le dictionnaire `cells` (paramètres `$C$5` et inputs `C10`, `D10`...) et résout chaque colonne calculée via `evaluateFormula`.
  3. Mettre à jour l'état en direct dès que l'utilisateur tape une valeur dans un champ d'entrée.

- [ ] **Étape 2 : Mettre à jour `ComplexTablePreview.tsx`**

Dans `src/components/ComplexTablePreview.tsx` :
- Importer `evaluateFormula` depuis `@/lib/formulaEvaluator`.
- Importer `extractTables` depuis `@/lib/excelExport`.
- Ajouter l'extraction des données Markdown pour pré-remplir les inputs au chargement.
- Ajouter la fonction de calcul réactif pour chaque ligne :
```typescript
// Construction du dictionnaire de cellules pour la ligne r
const rowNumber = (schema.data_start_row || 10) + rIdx;
const cellMap: Record<string, any> = {};

// 1. Paramètres globaux ($C$5, C5...)
schema.parameters.forEach((param, pIdx) => {
  const cleanRef = param.ref.replace(/\$/g, "").toUpperCase();
  const rawVal = paramValues[pIdx] ?? param.value;
  cellMap[cleanRef] = rawVal;
});

// 2. Colonnes inputs de la ligne
schema.columns.forEach((col, cIdx) => {
  const colLetter = String.fromCharCode(67 + cIdx); // C, D, E...
  const key = `${rIdx}-${cIdx}`;
  const val = inputValues[key] ?? "";
  cellMap[`${colLetter}${rowNumber}`] = val;
});

// 3. Calcul pour les colonnes formula
const evaluatedResult = evaluateFormula(col.formula || col.formula_en || "", {
  row: rowNumber,
  cells: cellMap,
});
```
- Mettre à jour `onDownloadExcel` pour passer l'état actuel :
```typescript
interface CustomExportData {
  paramValues: Record<string, string | number>;
  rowValues: Record<string, string | number>[];
  sampleRows: number;
}

// Dans le bouton de téléchargement :
onDownloadExcel({
  paramValues: Object.fromEntries(
    schema.parameters.map((p, i) => [p.ref, paramValues[i] ?? p.value])
  ),
  rowValues: Array.from({ length: sampleRows }).map((_, rIdx) => {
    const rowObj: Record<string, string | number> = {};
    schema.columns.forEach((col, cIdx) => {
      const key = `${rIdx}-${cIdx}`;
      rowObj[col.header] = inputValues[key] ?? "";
    });
    return rowObj;
  }),
  sampleRows,
});
```

- [ ] **Étape 3 : Tester les composants avec Vitest**
```bash
npx vitest run
```
*Attendu : Tous les tests passent.*

- [ ] **Étape 4 : Commit**
```bash
git add src/components/ComplexTablePreview.tsx
git commit -m "feat(preview): calcul en direct des formules et pré-remplissage des exemples"
```

---

### Phase 3 : Passerelle & Simulateur pour le Cas Simple (`simpleTableBridge`)

#### Tâche 3.1 : Création du convertisseur automatique Simple ➔ TableSchema

**Fichiers :**
- Créer : `src/lib/excelExport/simpleTableBridge.ts`
- Créer : `src/lib/excelExport/simpleTableBridge.test.ts`

- [ ] **Étape 1 : Écrire le test unitaire pour `convertSimpleTableToSchema`**

Dans `src/lib/excelExport/simpleTableBridge.test.ts` :
```typescript
import { describe, it, expect } from "vitest";
import { convertSimpleTableToSchema } from "./simpleTableBridge";

describe("simpleTableBridge", () => {
  it("devrait convertir un tableau Markdown simple et une formule en TableSchema complet", () => {
    const response = `
Voici votre formule de calcul de TVA :
\`\`\`excel
=C10 * 0.20
\`\`\`

| Ligne | Montant HT | TVA (20%) |
| :--- | :--- | :--- |
| Ligne 1 | 100 | 20 |
| Ligne 2 | 250 | 50 |

<!-- FORMULA_EN: =C10 * 0.20 -->
`;

    const schema = convertSimpleTableToSchema(response, "Calcul de TVA");

    expect(schema).not.toBeNull();
    expect(schema?.type).toBe("complex_table");
    expect(schema?.columns.length).toBe(2);
    expect(schema?.columns[0].header).toBe("Montant HT");
    expect(schema?.columns[0].formula).toBeNull();
    expect(schema?.columns[1].header).toBe("TVA (20%)");
    expect(schema?.columns[1].formula).toContain("C{row}");
    expect(schema?.sample_rows).toBe(2);
  });

  it("devrait extraire les paramètres globaux <!-- PARAM C5 = 0.20 --> s'ils existent", () => {
    const response = `
\`\`\`excel
=C10 * $C$5
\`\`\`
<!-- PARAM C5 = 0.20 -->
| Ligne | Prix | Total |
| :--- | :--- | :--- |
| Ligne 1 | 100 | 20 |
`;
    const schema = convertSimpleTableToSchema(response, "Total avec taux");
    expect(schema?.parameters.length).toBe(1);
    expect(schema?.parameters[0].ref).toBe("C5");
    expect(schema?.parameters[0].value).toBe(0.2);
  });
});
```

- [ ] **Étape 2 : Exécuter le test pour vérifier l'échec**
```bash
npx vitest run src/lib/excelExport/simpleTableBridge.test.ts
```

- [ ] **Étape 3 : Implémenter `convertSimpleTableToSchema` dans `src/lib/excelExport/simpleTableBridge.ts`**

Créer `src/lib/excelExport/simpleTableBridge.ts` :
```typescript
import { type TableSchema, type TableColumn, type TableParameter } from "./schemaParser";
import { extractTables, extractFormula, extractEnglishFormula } from "../excelExport";

export function convertSimpleTableToSchema(response: string, promptTitle: string): TableSchema | null {
  const tables = extractTables(response);
  if (tables.length === 0) return null;

  const table = tables[0];
  // La première colonne est "Ligne", on la retire
  const headers = table.headers.slice(1);
  if (headers.length < 2) return null;

  const formulaFr = extractFormula(response);
  const formulaEn = extractEnglishFormula(response) || formulaFr;
  if (!formulaFr) return null;

  // Extraire les paramètres éventuels <!-- PARAM C5 = 100 -->
  const parameters: TableParameter[] = [];
  const paramRegex = /<!--\s*PARAM\s+(\$?[A-Z]+\$?\d+)\s*=\s*([\d.,]+)\s*-->/g;
  let pm;
  while ((pm = paramRegex.exec(response)) !== null) {
    const ref = pm[1].replace(/\$/g, "");
    const val = parseFloat(pm[2].replace(/,/g, "."));
    if (!isNaN(val)) {
      parameters.push({
        name: `Paramètre ${ref}`,
        ref,
        value: val,
        type: "number",
      });
    }
  }

  // Transformer la formule pour utiliser {row} au lieu de la ligne fixe (10)
  const rowPlaceholderFormulaFr = formulaFr.replace(/(\b[A-Z]{1,3})10\b/g, "$1{row}");
  const rowPlaceholderFormulaEn = formulaEn.replace(/(\b[A-Z]{1,3})10\b/g, "$1{row}");

  // Déduire les colonnes : la dernière colonne est le résultat, les autres sont inputs
  const columns: TableColumn[] = headers.map((header, idx) => {
    const isResult = idx === headers.length - 1;
    let type: TableColumn["type"] = "number";
    const lower = header.toLowerCase();
    if (/%|taux|tva/i.test(lower)) type = "percentage";
    else if (/€|euro|prix|montant|total|salaire/i.test(lower)) type = "currency";
    else if (/date/i.test(lower)) type = "date";
    else if (/nom|libellé|texte|produit|client/i.test(lower)) type = "text";

    if (isResult) {
      return {
        header,
        type,
        formula: rowPlaceholderFormulaFr,
        formula_en: rowPlaceholderFormulaEn,
        description: "Résultat calculé",
      };
    }

    return {
      header,
      type,
      formula: null,
      formula_en: null,
      description: "Donnée d'entrée",
    };
  });

  return {
    type: "complex_table",
    title: promptTitle ? promptTitle.slice(0, 60) : "Tableau de calcul",
    parameters,
    columns,
    data_start_row: 10,
    sample_rows: Math.max(1, table.rows.length),
  };
}
```

- [ ] **Étape 4 : Exécuter le test pour vérifier le succès**
```bash
npx vitest run src/lib/excelExport/simpleTableBridge.test.ts
```
*Attendu : PASS.*

- [ ] **Étape 5 : Brancher dans `src/app/page.tsx` pour activer le simulateur en mode simple**

Dans `src/app/page.tsx` :
Détecter si un schéma simple existe lorsque `!schemaObj && !fileModifObj` :
```typescript
const simpleSchema = useMemo(() => {
  if (schemaObj || fileModifObj || !msg.content) return null;
  return convertSimpleTableToSchema(msg.content, msg.userPrompt || "Calcul");
}, [schemaObj, fileModifObj, msg.content, msg.userPrompt]);
```
Afficher le simulateur `ComplexTablePreview` avec `rawSchema={schemaObj || simpleSchema}` !

- [ ] **Étape 6 : Commit**
```bash
git add src/lib/excelExport/simpleTableBridge.ts src/lib/excelExport/simpleTableBridge.test.ts src/app/page.tsx
git commit -m "feat(simple-table): pont simple TableSchema et affichage du simulateur pour cas simples"
```

---

### Phase 4 : Synchronisation Simulateur ➔ Export Excel (`complexExcelBuilder`)

#### Tâche 4.1 : Supporter `customData` dans `buildComplexWorkbook` et auto-ajuster les colonnes

**Fichiers :**
- Modifier : `src/lib/excelExport/complexExcelBuilder.ts`
- Modifier : `src/lib/excelExport/complexExcelBuilder.test.ts`
- Modifier : `src/lib/excelExport.ts`

- [ ] **Étape 1 : Écrire le test unitaire pour `customData` et largeurs auto**

Dans `src/lib/excelExport/complexExcelBuilder.test.ts` :
```typescript
it("devrait injecter les valeurs saisies par l'utilisateur (customData) au lieu des données brutes", async () => {
  const schema: TableSchema = {
    type: "complex_table",
    title: "Test Custom Data",
    parameters: [{ name: "Taux", ref: "C5", value: 0.1, type: "percentage" }],
    columns: [
      { header: "Montant", type: "currency", formula: null, formula_en: null },
      { header: "Total", type: "currency", formula: "=C{row}*(1+$C$5)", formula_en: "=C{row}*(1+$C$5)" },
    ],
    data_start_row: 10,
    sample_rows: 2,
  };

  const customData = {
    paramValues: { C5: 0.25 }, // Taux modifié par l'utilisateur
    rowValues: [
      { Montant: 500 }, // Valeurs saisies dans le simulateur
      { Montant: 1200 },
      { Montant: 3000 }, // Ligne supplémentaire ajoutée
    ],
    sampleRows: 3,
  };

  const wb = new ExcelJS.Workbook();
  const { workbook } = buildComplexWorkbook(wb, schema, "", "Prompt", "libreoffice-fr", customData);

  const sheet = workbook.getWorksheet("Tableau Interactif")!;
  // Vérifier la cellule C5 mise à jour
  expect(sheet.getCell("C5").value).toBe(0.25);
  // Vérifier les 3 lignes
  expect(sheet.getCell("C10").value).toBe(500);
  expect(sheet.getCell("C11").value).toBe(1200);
  expect(sheet.getCell("C12").value).toBe(3000);
});
```

- [ ] **Étape 2 : Exécuter le test pour vérifier l'échec**
```bash
npx vitest run src/lib/excelExport/complexExcelBuilder.test.ts
```

- [ ] **Étape 3 : Mettre à jour `buildComplexWorkbook` dans `src/lib/excelExport/complexExcelBuilder.ts`**

1. Étendre la signature avec `customData?: CustomExportData`.
2. Pour les paramètres : si `customData?.paramValues?.[param.ref]` existe, l'utiliser en priorité.
3. Pour les lignes de données : utiliser `customData.sampleRows` si fourni.
4. Pour chaque cellule d'entrée : si `customData.rowValues?.[r]?.[col.header]` est défini, l'injecter directement !
5. Remplacer la boucle de largeur fixe (`width = 18`) par un calcul dynamique :
```typescript
for (let c = 0; c < numCols; c++) {
  const col = schema.columns[c];
  const colLetter = String.fromCharCode(67 + c);
  let maxLen = col.header.length;
  // Prendre en compte les valeurs des lignes
  for (let r = 0; r < sampleRowsCount; r++) {
    const val = customData?.rowValues?.[r]?.[col.header] ?? "";
    maxLen = Math.max(maxLen, String(val).length);
  }
  const computedWidth = Math.max(14, Math.min(maxLen + 4, 38));
  sheetInteractif.getColumn(3 + c).width = computedWidth;
}
```

- [ ] **Étape 4 : Mettre à jour `downloadFormulaAsExcel` dans `src/lib/excelExport.ts`**

Accepter `customData` et le transmettre à `buildComplexWorkbook`.

- [ ] **Étape 5 : Exécuter tous les tests**
```bash
npx vitest run
```
*Attendu : Tous les tests passent (100%).*

- [ ] **Étape 6 : Commit**
```bash
git add src/lib/excelExport/complexExcelBuilder.ts src/lib/excelExport/complexExcelBuilder.test.ts src/lib/excelExport.ts
git commit -m "feat(export): prise en compte des modifications du simulateur et largeurs dynamiques"
```

---

### Phase 5 : Validation Finale & Tests de Bout en Bout

- [ ] **Étape 1 : Exécuter l'ensemble des tests unitaires**
```bash
npx vitest run
```
*Attendu : 50+ tests passants sans avertissement.*

- [ ] **Étape 2 : Valider le build Next.js**
```bash
npm run build
```
*Attendu : Build réussi sans erreur TypeScript ou linting.*

- [ ] **Étape 3 : Mettre à jour la base de connaissances graphify**
```bash
graphify update .
```

---

## 4. Résumé des Gains pour l'Utilisateur

1. **Simulateur Réactif & Vivant** : Dès qu'une formule est générée (simple ou complexe), un tableau interactif permet de saisir n'importe quel chiffre et de voir le résultat recalculé immédiatement sous ses yeux.
2. **Exemples pré-remplis instantanés** : Fini les champs vides au départ ; les valeurs d'exemple de l'IA sont directement injectées dans les cellules modifiables.
3. **Fidélité Absolue à l'Exportation** : Si l'utilisateur ajuste des taux, change des montants ou ajoute 5 lignes de simulation dans l'UI, le fichier Excel téléchargé contient **exactement** ses données personnalisées et ses lignes créées.
4. **Fichiers Excel Professionnels** : Fini les largeurs de colonnes tronquées (`###`) ou les bandeaux disproportionnés.
