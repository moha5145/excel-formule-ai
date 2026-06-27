# Design : Tableau de simulation multi-colonnes

**Date** : 2026-06-28  
**Statut** : Approuvé

## Contexte

Le tableau de simulation actuel est limité à 3 colonnes fixes (Paramètre | Valeur | Description), avec toutes les données dans une seule colonne Excel (C). Les formules comme `MAX.SI.ENS(D10:D14;C10:C14;"Marketing")` qui référencent plusieurs colonnes ne fonctionnent pas car toutes les plages atterrissent dans la même colonne.

## Objectif

Permettre à l'IA de générer des tableaux de simulation avec **N colonnes de données** (4, 5, 6 ou plus). L'IA génère directement le tableau au format Zone 2, sans format intermédiaire.

## Design proposé

### 1. Format du tableau markdown généré par l'IA

L'IA génère le tableau **directement au format Zone 2** :

```markdown
| Ligne   | Services   | Salaires | Critère   |
|---------|------------|----------|-----------|
| Ligne 1 | Finance    | 45000    | Marketing |
| Ligne 2 | Marketing  | 52000    |           |
| Ligne 3 | RH         | 48000    |           |
|         |            |          | =MAX.SI.ENS(D10:D12;C10:C12;E10) |
```

- **Première colonne** : Labels de lignes (Ligne 1, Ligne 2, ...)
- **Colonnes suivantes** : Données avec en-têtes explicites (Services, Salaires, Critère)
- **Dernière ligne** (optionnelle) : Formule avec `=` dans la dernière colonne
- **Pas de colonne "Cell"** : les refs cellule (C10, D10) ne sont plus nécessaires dans le markdown

### 2. Mapping des colonnes

Le code détecte automatiquement les colonnes Excel :

| Position dans le tableau | Colonne Excel |
|--------------------------|---------------|
| 1ère colonne de données  | C             |
| 2ème colonne de données  | D             |
| 3ème colonne de données  | E             |
| Nème colonne de données  | C + N - 1     |

**Exemple** : 3 colonnes de données (Services, Salaires, Critère) → colonnes C, D, E.

### 3. Extraction des paramètres

**Interface `SimParam` étendue** :

```typescript
interface SimParam {
  name: string;           // Nom du paramètre (ex: "Finance")
  value: number;          // Valeur numérique (0 si texte)
  rawValue: string;       // Valeur brute ("Finance", "45000", "Marketing")
  type: 'percentage' | 'currency' | 'integer' | 'number' | 'text' | 'date';
  unit: string;           // Unité ("%", "€", "ans", ...)
  cellRef: string;        // Ref Zone 2 (ex: "C10", "D10", "E10")
  colLetter: string;      // Colonne Excel (ex: "C", "D", "E")
  colName: string;        // Nom de la colonne (ex: "Services", "Salaires")
  rowIndex: number;       // Index de ligne (0-based, relatif au début des données)
  needsDivideBy100: boolean;
}
```

**Interface `SimColumn` nouvelle** :

```typescript
interface SimColumn {
  letter: string;         // "C", "D", "E"
  header: string;         // "Services", "Salaires", "Critère"
  params: SimParam[];
}
```

**Logique d'extraction** :

```typescript
function extractSimulationParams(table: ExtractedTable): {
  params: SimParam[];
  columns: SimColumn[];
  formulaRaw: string;
} {
  // 1. Les headers = première ligne du tableau (sauf "Ligne")
  const headers = table.rows[0].filter(h => h !== "Ligne");
  
  // 2. Chaque ligne de données = un ensemble de valeurs multi-colonnes
  for (let rowIdx = 1; rowIdx < table.rows.length; rowIdx++) {
    const row = table.rows[rowIdx];
    const label = row[0]; // "Ligne 1", "Ligne 2", ...
    
    for (let colIdx = 0; colIdx < headers.length; colIdx++) {
      const value = row[colIdx + 1]; // +1 pour skipper la colonne "Ligne"
      const colLetter = String.fromCharCode(67 + colIdx); // C=67, D=68, E=69
      const cellRef = `${colLetter}${dataStartRow + rowIdx - 1}`;
      
      // Créer un SimParam pour chaque valeur non vide
      if (value && !value.startsWith("=")) {
        params.push({ name: value, cellRef, colLetter, colName: headers[colIdx], ... });
      }
    }
  }
  
  // 3. Détecter la formule (dernière ligne, dernière colonne)
  const lastRow = table.rows[table.rows.length - 1];
  const formulaCell = lastRow[lastRow.length - 1];
  if (formulaCell.startsWith("=")) {
    formulaRaw = formulaCell;
  }
}
```

### 4. Réécriture de la formule

**Principe** : La formule de l'IA référence déjà les cellules Zone 2 (C10, D10, E10). La réécriture doit :
1. Détecter les références textuelles → remplacer par des littéraux entre guillemets
2. Détecter les taux → ajouter `/100`
3. Convertir en US-invariant pour l'OOXML

**Exemple** :
```
Input IA:  =MAX.SI.ENS(D10:D12;C10:C12;E10)
Après réécriture: =MAXIFS(D10:D12,C10:C12,"Marketing")
OOXML:     MAXIFS(D10:D12,C10:C12,"Marketing")
```

### 5. Layout Zone 2

```
Row 8:  🧪 Simulez votre formule — Modifiez les valeurs en jaune
Row 9:  | Ligne     | Services   | Salaires | Critère   |     ← Headers
Row 10: | Ligne 1   | Finance    | 45000    | Marketing |     ← Données
Row 11: | Ligne 2   | Marketing  | 52000    |           |
Row 12: | Ligne 3   | RH         | 48000    |           |
Row 13: |           |            |          |           |     ← Séparateur
Row 14: | → Résultat| [formule]  |          |           |     ← Formule verte
```

**Styles** :
- Headers (row 9) : fond `#334155`, texte blanc, gras
- Valeurs (rows 10-12) : fond jaune `#FEF3C7`, bordure dorée
- Formule verte (row 14) : fond `#F0FDF4`, bordure verte, `numFmt = "#,##0.00"`

### 6. Mise à jour du prompt IA

Le prompt système doit inclure les instructions suivantes :

```
## Format du tableau de simulation

Génère un tableau markdown au format suivant :
- Première colonne : labels ("Ligne 1", "Ligne 2", ...)
- Colonnes suivantes : données avec en-têtes explicites
- Dernière ligne (optionnelle) : formule avec "=" dans la dernière colonne

Exemple :
| Ligne   | Services   | Salaires | Critère   |
|---------|------------|----------|-----------|
| Ligne 1 | Finance    | 45000    | Marketing |
| Ligne 2 | Marketing  | 52000    |           |
|         |            |          | =MAX.SI.ENS(D10:D12;C10:C12;E10) |

Règles :
- Les refs cellule dans la formule doivent correspondre aux colonnes du tableau
- Les colonnes commencent à C (1ère colonne de données = C, 2ème = D, etc.)
- Les données commencent à la ligne 10
- Les valeurs textes entre guillemets dans la formule
```

## Impact sur le code

| Fichier | Changement |
|---------|------------|
| `src/lib/excelExport.ts` | `extractSimulationParams()` : support multi-colonnes, `SimParam` étendu, `SimColumn` |
| `src/lib/excelExport.ts` | `rewriteFormulaForSimulation()` : mapping multi-colonnes |
| `src/lib/excelExport.ts` | Zone 2 : layout dynamique avec N colonnes |
| `src/app/api/gemini/route.ts` | Prompt : instructions format multi-colonnes |
| `src/lib/excelExport/postProcessFormula.ts` | Pas de changement |

## Tests

1. **2 colonnes** : `MAX.SI.ENS(D10:D12;C10:C12;E10)` avec Services + Salaires + Critère
2. **5 colonnes** : Formule avec 5 plages
3. **Valeurs textes** : Textes entre guillemets dans la formule
4. **Taux** : Pourcentages avec `/100`
5. **Formules complexes** : `SOMME.SI.ENS`, `NB.SI.ENS`, `DECALER`, etc.
