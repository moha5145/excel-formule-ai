# Correction de l'erreur Err:508 dans LibreOffice Calc

**Date** : 2026-06-26
**Statut** : Approuvé

## Problème

La cellule résultat (formule active) de la zone de simulation interactive affiche `Err:508` à l'ouverture du fichier .xlsx dans LibreOffice Calc. Si l'utilisateur supprime puis retape un caractère dans la formule (sans rien changer), le résultat s'affiche correctement.

`Err:508` est le code LibreOffice Calc pour « Missing parenthesis or unexpected token ».

## Diagnostic

### Cause racine (trouvée après analyse du XML généré)

Le XML du fichier .xlsx contient `<f>=VPM(...)</f>` avec le caractère `=` **dans** l'élément `<f>`.

La spécification OOXML (ECMA-376) stipule que le contenu de l'élément `<f>` ne doit **pas** inclure le préfixe `=` — il est implicite. ExcelJS écrit la formule telle quelle, sans retirer le `=`.

**LibreOffice Calc** est strict sur ce point : il interprète `=VPM(...)` comme une expression où `=` est un opérateur invalide → erreur `Err:508` (« Missing parenthesis or unexpected token »).

**Pourquoi la réédition manuelle corrige :** quand l'utilisateur édite la cellule, LibreOffice sauvegarde la formule sans le `=` dans le XML → correct.

**Pourquoi `fullCalcOnLoad` ne suffit pas :** le problème n'est pas un cache manquant — la formule est littéralement mal écrite dans le XML. Même en forçant le recalcul, l'expression `=VPM(...)` reste syntaxiquement invalide.

### Confirmation

Génération d'un fichier test avec `{ formula: '=VPM(...)' }` :
```xml
<f>=VPM(A2/100/12;A3*12;A1)</f>  ← Err:508
```

Même fichier avec `{ formula: 'VPM(...)' }` (sans `=`) :
```xml
<f>VPM(A2/100/12;A3*12;A1)</f>   ← Correct
```

## Solution

Deux changements dans `src/lib/excelExport.ts` :

### Changement 1 — Forcer le recalcul complet à l'ouverture (sécurité)

```typescript
workbook.calcProperties.fullCalcOnLoad = true;
```

Écrit `<calcPr fullCalcOnLoad="1"/>` dans le workbook.

### Changement 2 — Retirer le `=` de la formule + cache par défaut

```typescript
resCell.value = { formula: formulaFR.replace(/^=/, ""), result: 0 };
```

- `.replace(/^=/, "")` : retire le `=` pour que le XML contienne `<f>VPM(...)</f>` (conforme OOXML)
- `result: 0` : fournit un cache valide (filet de sécurité)

## Fichier modifié

| Fichier | Modifications |
|---|---|
| `src/lib/excelExport.ts` | Ligne ~454 : `workbook.calcProperties.fullCalcOnLoad = true` |
| `src/lib/excelExport.ts` | Ligne ~793 : `formulaFR.replace(/^=/, "")` + `result: 0` |
