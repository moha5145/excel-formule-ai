# Correction des bugs de calcul des formules Excel

**Date** : 2026-06-25
**Statut** : Approuvé — implémenté

## Problème

L'export Excel génère des formules qui ne calculent pas correctement. Le résultat affiché est **0,00** au lieu de la valeur attendue (ex: 1 449,91 € pour un prêt VPM). Les bugs affectent **tous les types de formules** (SOMME.SI, RECHERCHEV, SI, VPM, etc.), pas seulement les prêts.

## Bugs identifiés

### Bug 1 (CRITIQUE) — La formule active est toujours en anglais

**Fichier** : `src/lib/excelExport.ts` ligne 770

La formule active dans la cellule verte (résultat) utilise toujours la version anglaise (`PMT`, `SUMIF`, `VLOOKUP`, etc.). Dans un Excel français, ces fonctions ne sont pas reconnues → erreur `#NOM?` → résultat = 0.

**Fix** : Utiliser `formulaFR` au lieu de `formulaEN`.

### Bug 2 — Format pourcentage de la cellule

**Fichier** : `src/lib/excelExport.ts` ligne 725

Le format de la cellule pourcentage est `"0.0"` au lieu de `"0.0%"`. L'utilisateur veut un format pourcentage natif.

**Fix** : `numFmt = "0.0%"`

### Bug 3 — Logique `/100` dépend du format généré par l'IA

**Fichier** : `src/lib/excelExport.ts` lignes 237-248

Le code détermine `needsDivideBy100` en fonction de la valeur brute de l'IA. Si l'IA met 3.5 (selon le prompt) au lieu de 0.035, le `/100` n'est pas ajouté → formule fausse.

**Fix** : Toujours `needsDivideBy100 = true` pour les pourcentages.

### Bug 4 (CRITIQUE) — La formule FR est corrompue par remplacement aveugle des virgules

**Fichier** : `src/lib/excelExport.ts` ligne 299

`fr.replace(/,/g, ";")` remplace toutes les virgules y compris celles dans les chaînes de caractères (ex: critère `">1,5"`). Contrairement à `translateFrenchFormulaToEnglish` qui track `inString`, la génération FR n'a aucune protection.

**Fix** : Utiliser un tracking `inString` pour ne remplacer que les virgules hors chaînes.

### Bug 5 — Le prompt IA génère des formats inconsistants

**Fichier** : `src/app/api/gemini/route.ts` ligne 81

Le prompt donne comme exemple 3.5 pour le taux mais l'IA génère parfois 0.035.

**Fix** : Préciser dans le prompt que les pourcentages doivent être en format nombre (3.5, pas 0.035).

### Bug 6 (MINEUR) — Regex `/100` sans protection word boundary

**Fichier** : `src/lib/excelExport.ts` ligne 289

La regex `(C13)(?!/100)` n'a pas de protection word boundary. Si C12 et C123 existent, le préfixe C12 est matché dans C123.

**Fix** : Ajouter `(?!\w|/100)`.

### Bug 7 (CRITIQUE) — La formule est stockée comme chaîne, pas comme formule Excel

**Fichier** : `src/lib/excelExport.ts` ligne 778

`resCell.value = formulaFR` stocke la formule comme une chaîne de caractères (type 3). ExcelJS écrit du XML de type `<v>=FORMULE</v>` au lieu de `<f>FORMULE</f>`. LibreOffice ne recalcule pas → résultat = 0,00.

**Fix** : `resCell.value = { formula: formulaFR }` (objet formule, type 6).

### Bug 8 — Logique `/100` insuffisante pour les formules sans division

**Fichier** : `src/lib/excelExport.ts` lignes 288-295

Le `/100` n'est inséré que quand `numVal > 0 && numVal < 1` (ex: 0.035). Si l'IA génère 3.5 (format entier), aucun `/100` n'est ajouté → formule VPM fausse : `=-VPM(C12/12;...)` au lieu de `=-VPM(C12/100/12;...)`.

**Fix** : Toujours `needsDivideBy100 = true` pour les pourcentages + détection intelligente dans `rewriteFormulaForSimulation` :
1. Vérifier si la formule originale a déjà `/{cellRef}/100` → skip (cas TVA)
2. Vérifier si la cellule est en contexte de comparaison (`>=`, `<=`, `=`, `<`, `>`) → skip (cas SI)
3. Sinon → ajouter `/100` (cas VPM)

## Fichiers modifiés

| Fichier | Modifications |
|---|---|
| `src/lib/excelExport.ts` | Bugs 1, 2, 3, 4, 6, 7, 8 |
| `src/app/api/gemini/route.ts` | Bug 5 |
