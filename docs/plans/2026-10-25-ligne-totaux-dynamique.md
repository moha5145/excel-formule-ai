# Plan d'implémentation : Ligne de totaux verticaux dynamique

> **Date :** 25 Octobre 2026
> **Statut :** Implémenté — 84 tests passants, lint/tsc OK sur les fichiers modifiés (validation manuelle Excel à faire)
> **Branche recommandée :** `feat/total-row-dynamique`

---

## 1. Contexte & Diagnostic

### Le constat utilisateur

Sur un tableau de type **Commande / Facture / Devis** (lignes répétées avec Quantité, Prix Unitaire, Total HT, Total TTC), l'IA omet la ligne de totaux en bas alors qu'elle est indispensable. Les calculs horizontaux sont corrects, les calculs verticaux sont oubliés.

### Ce qui existe déjà

| Élément | Emplacement | État |
| :--- | :--- | :--- |
| Champ `total_row` | `src/lib/excelExport/schemaParser.ts:65` | Supporté |
| Champ `total_row_label` | `src/lib/excelExport/schemaParser.ts:66` | Supporté, défaut figé `"TOTAUX"` |
| Écriture de la ligne TOTAUX | `src/lib/excelExport/complexExcelBuilder.ts:601-665` | Fonctionnel |
| Affichage `<tfoot>` | `src/components/ComplexTablePreview.tsx:613-636` | Fonctionnel |

### Les causes réelles du problème

1. **Le prompt réserve `total_row` aux tableaux croisés (pivot).**
   `src/app/api/gemini/route.ts:425-506` ne déclenche les totaux que pour les vues lignes × colonnes. Une facture ou une commande n'est jamais reconnue comme éligible.
2. **Le prompt interdit explicitement le total pour une seule colonne numérique.**
   `src/app/api/gemini/route.ts:506` : « Tableau avec une seule colonne numérique → NON ». Cela contredit le besoin d'une facture.
3. **Quand la ligne existe, elle additionne toutes les colonnes numériques.**
   `complexExcelBuilder.ts:624-645` somme indistinctement `Quantité`, `Prix Unitaire`, `Taux TVA`, `Total HT`, `Total TTC`. Un prix unitaire ou un taux ne doit pas être sommé.
4. **Le schéma ne permet pas de qualifier une colonne comme sommable ou non.**
   `schemaParser.ts:30-37` ne contient aucune notion de politique de total par colonne.
5. **L'aperçu et l'export dupliquent la logique.**
   `ComplexTablePreview.tsx:292-302` et `complexExcelBuilder.ts:624-645` calculent chacun de leur côté → risque de divergence.
6. **Le libellé est figé.**
   `total_row_label` retombe toujours sur `"TOTAUX"`, même quand le tableau appelle « TOTAL GÉNÉRAL », « CUMUL », « TOTAL VENTES », « TOTAL EFFECTIFS », etc.

---

## 2. Objectifs

1. **Générer systématiquement une ligne de totaux** pour toute liste de lignes répétées contenant des montants (commande, facture, devis, budget, ventes, stock, échéancier, trésorerie, effectifs…).
2. **Ne sommer que les colonnes pertinentes** : jamais un prix unitaire, un taux, une remise, une moyenne ou un identifiant.
3. **Libellé dynamique** : le nom de la ligne de total est déduit du contexte du tableau, avec possibilité d'override explicite par le schéma. `"TOTAUX"` n'est plus qu'un fallback.
4. **Cohérence stricte** entre l'aperçu interactif, l'export `.xlsx` et le guide.
5. **Rétrocompatibilité** : les schémas existants sans `total` ni `total_row` continuent de fonctionner.

---

## 3. Décisions de conception

### 3.1 Politique de total par colonne

Nouveau type ajouté à `TableColumn` :

```ts
type ColumnTotal = "sum" | "none" | "auto";
```

- `sum` : la colonne est toujours sommée.
- `none` : la colonne n'est jamais sommée (priorité absolue, même si numérique).
- `auto` (ou absent) : décision par heuristique.

### 3.2 Heuristiques `auto` (ordre de priorité)

1. `total: "none"` ou `total: "sum"` explicite → gagne toujours.
2. Type `percentage` → **jamais** sommé.
3. En-tête correspondant à un motif exclu → **non sommé** :
   `prix unitaire`, `coût unitaire`, `taux`, `remise`, `moyenne`, `médiane`, `indice`, `année`, `mois`, `durée`, `âge`, `numéro`, `n°`, `réf`, `id`.
4. En-tête correspondant à un motif inclus → **somme** :
   `total`, `sous-total`, `montant`, `quantité`, `qty`, `nombre`, `budget`, `vente`, `ca`, `chiffre d'affaires`, `salaire`, `prime`, `stock`, `heures`, `jours`, `valeur`, `charge`, `frais`, `impôt`, `tva` (uniquement si calculée, pas le taux).
5. Sinon : sommé uniquement si la colonne est **calculée**, numérique, et que le tableau est une liste de lignes (au moins une colonne input numérique).
6. Dans tous les autres cas → non sommé.

### 3.3 Affichage de la ligne de totaux

`resolveTotals(schema)` retourne :

```ts
{
  showTotalRow: boolean;
  label: string;
  summable: boolean[]; // aligné sur schema.columns
}
```

- `showTotalRow` :
  - `total_row: true` explicite → `true` (si au moins une colonne sommable).
  - `total_row: false` explicite → `false`.
  - `total_row: "auto"` (défaut) → `true` si au moins une colonne sommable ET `sample_rows >= 2`.
- Si aucune colonne n'est sommable, la ligne n'est pas écrite (évite un `TOTAUX` vide).

### 3.4 Libellé dynamique

`resolveTotalLabel(schema)` avec ordre de priorité :

1. `total_row_label` explicitement fourni par le schéma → utilisé tel quel.
2. Sinon, déduction depuis le titre + les en-têtes :

| Contexte détecté | Libellé proposé |
| :--- | :--- |
| facture, commande, devis | `TOTAL` |
| budget, prévisionnel | `TOTAL GÉNÉRAL` |
| ventes, chiffre d'affaires | `TOTAL VENTES` |
| stock, inventaire | `TOTAL STOCK` |
| trésorerie, flux | `TOTAL TRÉSORERIE` |
| échéancier, amortissement | `CUMUL` |
| effectifs, salaires | `TOTAL EFFECTIFS` |
| dépenses, charges | `TOTAL CHARGES` |
| défaut | `TOTAUX` |

3. Le prompt demande à l'IA de proposer un libellé court et pertinent (2 mots max), et le code reprend ce libellé s'il est fourni.

**Important :** `total_row_label` ne doit plus avoir de valeur par défaut Zod `"TOTAUX"`, sinon le code ne peut pas distinguer « absent » de « fourni ». Le fallback est déplacé dans `resolveTotalLabel`.

---

## 4. Cartographie des fichiers

| Fichier | Action | Responsabilité |
| :--- | :--- | :--- |
| `src/lib/excelExport/totalPolicy.ts` | **Créer** | `shouldSumColumn`, `resolveTotals`, `resolveTotalLabel` — source de vérité unique. |
| `src/lib/excelExport/totalPolicy.test.ts` | **Créer** | Tests heuristiques, overrides, libellés dynamiques. |
| `src/lib/excelExport/schemaParser.ts` | **Modifier** | `ColumnTotal`, champ `total` sur `TableColumn`, `total_row: boolean \| "auto"`, validation via la politique. |
| `src/lib/excelExport/schemaParser.test.ts` | **Modifier** | Acceptation/rejet de `total`, `total_row: "auto"`, label optionnel. |
| `src/lib/excelExport/complexExcelBuilder.ts` | **Modifier** | Utiliser `resolveTotals` / `resolveTotalLabel` ; ne sommer que les colonnes retenues. |
| `src/lib/excelExport/complexExcelBuilder.test.ts` | **Modifier** | Scénario facture complet + colonnes exclues. |
| `src/components/ComplexTablePreview.tsx` | **Modifier** | Utiliser la même politique pour `columnTotals`, `grandTotal`, `<tfoot>` et le libellé. |
| `src/lib/excelExport/simpleTableBridge.ts` | **Modifier** | Injecter `total: "sum"` sur la colonne résultat monétaire et activer `total_row`. |
| `src/lib/excelExport/simpleTableBridge.test.ts` | **Modifier** | Vérifier le schéma généré. |
| `src/app/api/gemini/route.ts` | **Modifier** | Section totaux généralisée + exemple commande + libellé dynamique + self-check. |

---

## 5. Découpage des tâches (TDD)

### Phase 1 — Politique de total partagée

#### Tâche 1.1 : Tests `totalPolicy.test.ts`

Cas à couvrir :

- Facture : `Quantité` (integer input) → `sum`, `Prix Unitaire` (currency input) → `none`, `Total HT` (currency calculé) → `sum`, `Total TTC` (currency calculé) → `sum`, `Taux TVA` (percentage) → `none`.
- Amortissement : `VNC` et `Annuité` → `none` par défaut (pas de motif inclus).
- Override `total: "none"` sur une colonne nommée `Total` → non sommée.
- Override `total: "sum"` sur une colonne au nom ambigu → sommée.
- `total_row: false` → `showTotalRow === false` même avec des colonnes sommables.
- `total_row: "auto"` + aucune colonne sommable → `showTotalRow === false`.
- `sample_rows === 1` → `showTotalRow === false` en mode auto.
- Libellés : facture → `TOTAL`, budget → `TOTAL GÉNÉRAL`, échéancier → `CUMUL`, défaut → `TOTAUX`, override explicite prioritaire.

#### Tâche 1.2 : Implémentation `totalPolicy.ts`

Exports :

```ts
export type ColumnTotal = "sum" | "none" | "auto";

export function shouldSumColumn(col: TableColumn, schema: TableSchema): boolean;
export function resolveTotals(schema: TableSchema): {
  showTotalRow: boolean;
  label: string;
  summable: boolean[];
};
export function resolveTotalLabel(schema: TableSchema): string;
```

Contraintes : fonctions pures, aucune dépendance UI, normalisation des en-têtes (accents, casse, espaces) via une petite fonction locale.

---

### Phase 2 — Extension du schéma

#### Tâche 2.1 : `schemaParser.ts`

- Ajouter `total?: ColumnTotal` dans `TableColumn`.
- Ajouter `total: z.enum(["sum", "none", "auto"]).optional().default("auto")` dans `TableColumnSchema`.
- Passer `total_row` en `z.union([z.boolean(), z.literal("auto")]).optional().default("auto")`.
- Retirer le `.default("TOTAUX")` de `total_row_label` ; le rendre simplement optionnel.
- Remplacer la validation `NUMERIC_COLUMN_TYPES` (l. 224-233) par un appel à `resolveTotals` :
  - `total_row === true` et aucune colonne sommable → erreur de validation explicite.
  - `total_row === "auto"` et aucune colonne sommable → pas d'erreur, la ligne sera simplement omise.
- Mettre à jour les exports de types.

#### Tâche 2.2 : Tests `schemaParser.test.ts`

- `total` absent → `"auto"` après validation.
- `total: "sum"` / `"none"` acceptés.
- `total: "invalid"` rejeté.
- `total_row: "auto"` accepté.
- `total_row: true` + uniquement des colonnes `text`/`date` → erreur.
- `total_row_label` absent → `undefined` (et non `"TOTAUX"`).
- Les tests existants (l. 76-78, 130-151) sont ajustés en conséquence.

---

### Phase 3 — Export Excel

#### Tâche 3.1 : `complexExcelBuilder.ts`

- Remplacer la boucle `isNumeric` (l. 624-645) par :

```ts
const totals = resolveTotals(schema);
...
if (totals.summable[c]) { /* SUM(...) */ } else { /* cellule vide */ }
```

- Remplacer `const hasTotalRow = schema.total_row === true` par `totals.showTotalRow`.
- Remplacer `const totalRowLabel = schema.total_row_label || "TOTAUX"` par `totals.label`.
- Conserver :
  - le total de `row_total_column` (l. 648-664) ;
  - le décalage de la ligne de conseil (l. 668) ;
  - l'`autoFilter` qui s'arrête à `lastDataExpRow` (l. 684-688).
- Si `showTotalRow` est vrai mais que `summable` est vide → ne pas écrire la ligne (sécurité).

#### Tâche 3.2 : Tests `complexExcelBuilder.test.ts`

Scénario « Commande » (`data_start_row: 10`, 4 lignes) :

- `B14` (ou `B14` selon `sample_rows`) contient `TOTAL`.
- `SUM(D10:D13)` sur `Quantité`.
- `SUM(G10:G13)` sur `Total HT`.
- `SUM(H10:H13)` sur `Total TTC`.
- `F` (Prix Unitaire) vide dans la ligne de total.
- `B` de la ligne de total reçoit le libellé dynamique.
- Le test existant « pivot léger » continue de passer.

---

### Phase 4 — Aperçu interactif

#### Tâche 4.1 : `ComplexTablePreview.tsx`

- Appeler `resolveTotals(schema)` dans le `useMemo` de calcul.
- `columnTotals` : ne cumuler que les colonnes `summable[c]`.
- `grandTotal` : ne cumuler que les colonnes sommable + `row_total_column`.
- Afficher le `<tfoot>` si `showTotalRow` (et non plus `schema.total_row`).
- Afficher `totals.label` au lieu de `schema.total_row_label || "TOTAUX"`.
- Les colonnes non sommables affichent `—` (déjà géré l. 624-626).
- Aucun changement visuel pour les schémas sans total.

#### Tâche 4.2 : Vérification manuelle

- Simuler une commande, modifier la quantité/le prix : les totaux se recalculent en direct.
- Vérifier que le libellé correspond au type de tableau.

---

### Phase 5 — Prompt Gemini

#### Tâche 5.1 : Généraliser la section `route.ts:425-506`

Remplacer « TABLEAUX CROISÉS (PIVOT) — CALCULS HORIZONTAL + VERTICAL » par une section plus large :

- **Toute liste de lignes répétées avec des montants doit avoir `total_row`.**
- Champs :
  - `"total_row": true | false | "auto"` (défaut `"auto"`).
  - `"total_row_label": "..."` → proposé dynamiquement, 2 mots max.
  - `"total": "sum" | "none"` sur chaque colonne numérique.
- Règles explicites :
  - `Quantité`, `Total HT`, `Total TTC`, `Montant`, `Budget`, `Salaire`, `Prime`, `Stock`, `Ventes` → `"sum"`.
  - `Prix Unitaire`, `Taux`, `Remise`, `Pourcentage`, `Moyenne`, `Année`, `N°` → `"none"`.
- Supprimer la règle « une seule colonne numérique → NON ».
- Conserver `row_total_column` pour les tableaux croisés.

#### Tâche 5.2 : Ajouter l'exemple « Commande »

Exemple complet à insérer dans le prompt, calqué sur le cas signalé :

```json
{
  "type": "complex_table",
  "title": "Commande avec liste déroulante dynamique",
  "parameters": [
    { "name": "Taux TVA applicable", "ref": "C5", "value": 0.20, "type": "percentage", "unit": "%" }
  ],
  "columns": [
    { "header": "Catégorie", "type": "text", "formula": null, "formula_en": null, "total": "none" },
    { "header": "Produit", "type": "text", "formula": null, "formula_en": null, "total": "none" },
    { "header": "Quantité", "type": "integer", "formula": null, "formula_en": null, "total": "sum" },
    { "header": "Prix Unitaire", "type": "currency", "formula": null, "formula_en": null, "total": "none" },
    { "header": "Total HT", "type": "currency", "formula": "=E{row}*F{row}", "formula_en": "=E{row}*F{row}", "total": "sum" },
    { "header": "Total TTC", "type": "currency", "formula": "=G{row}*(1+$C$5)", "formula_en": "=G{row}*(1+$C$5)", "total": "sum" }
  ],
  "data_start_row": 10,
  "sample_rows": 4,
  "total_row": true,
  "total_row_label": "TOTAL"
}
```

#### Tâche 5.3 : Self-check dans `SHARED_RESPONSE_RULES`

Ajouter une étape E à la checklist de relecture :

- Si le tableau contient au moins une colonne de montants de ligne (Total HT, Total TTC, Montant…), `total_row` doit être `true`.
- Chaque colonne numérique doit avoir un `total` explicite (`sum` ou `none`).
- Le libellé doit être cohérent avec le tableau (pas de `TOTAUX` générique si le titre indique « Ventes » ou « Budget »).
- Le tableau Markdown de démonstration ne doit **pas** inclure de ligne de total (elle serait interprétée comme une ligne de données). Le total est porté par le schéma, donc visible dans l'aperçu et l'export.

---

### Phase 6 — Pont tableau simple

#### Tâche 6.1 : `simpleTableBridge.ts`

- Sur la colonne résultat (dernière colonne) : `total: "sum"` si son type est `currency` ou `number`.
- Si une colonne de montant est détectée dans les inputs (en-tête `montant`, `total`, `prix`…) : `total: "sum"` sur les colonnes pertinentes, `none` sur les autres.
- Activer `total_row: "auto"` sur le schéma généré.
- Ne pas activer le total si le tableau n'a qu'une ligne d'exemple.

---

## 6. Comportement attendu sur le cas signalé

Tableau « Commande avec liste déroulante dynamique » :

| Ligne | Catégorie | Produit | Quantité | Prix Unitaire | Total HT | Total TTC |
| :--- | :--- | :--- | ---: | ---: | ---: | ---: |
| Ligne 1 | Électronique | Ordinateur | 2 | 1 200,00 € | 2 400,00 € | 2 880,00 € |
| Ligne 2 | Mobilier | Chaise | 4 | 150,00 € | 600,00 € | 720,00 € |
| Ligne 3 | Électronique | Téléphone | 1 | 800,00 € | 800,00 € | 960,00 € |
| Ligne 4 | Mobilier | Armoire | 1 | 500,00 € | 500,00 € | 600,00 € |
| **TOTAL** | | | **8** | — | **4 300,00 €** | **5 160,00 €** |

- `Prix Unitaire` n'est pas sommé.
- `Taux TVA` (paramètre global) n'est pas sommé.
- Le libellé `TOTAL` est déduit du contexte « Commande ».
- L'aperçu et le fichier `.xlsx` affichent exactement les mêmes valeurs.

---

## 7. Risques & mitigations

| Risque | Mitigation |
| :--- | :--- |
| Le LLM oublie encore `total_row` | Politique `auto` côté code, indépendante du modèle |
| Somme d'un prix unitaire ou d'un taux | `total: "none"` + motifs d'exclusion + `percentage` jamais sommé |
| Ligne TOTAUX vide | `showTotalRow` exige au moins une colonne sommable |
| Divergence aperçu / Excel | `resolveTotals` unique appelé par les deux |
| Régression sur les schémas existants | `auto` n'active le total que si une colonne est réellement sommable |
| Libellé incohérent | Déduction par mots-clés + override possible |
| Ligne de total dans le Markdown prise pour une donnée | Interdiction explicite dans le prompt |

---

## 8. Validation

Commandes à exécuter après implémentation :

```bash
npm test
npm run lint
npx tsc --noEmit
```

Vérifications manuelles :

1. Reproduire le prompt de la capture (commande avec liste déroulante) → ligne TOTAL présente.
2. Exporter en `.xlsx` → ouvrir dans Excel/LibreOffice → totaux corrects, pas de `#VALEUR!`.
3. Vérifier un tableau d'amortissement → aucune ligne de total parasite.
4. Vérifier un budget par service/mois → total horizontal + vertical + libellé `TOTAL GÉNÉRAL`.
5. Vérifier un tableau sans montant → aucune ligne de total.

---

## 9. Definition of Done

- [x] `totalPolicy.ts` créé avec tests complets.
- [x] `schemaParser.ts` accepte `total` et `total_row: "auto"`.
- [x] `complexExcelBuilder.ts` ne somme que les colonnes retenues.
- [x] `ComplexTablePreview.tsx` affiche les mêmes totaux que l'export.
- [x] Libellé dynamique opérationnel (défaut `TOTAUX`, override respecté).
- [x] Prompt généralisé + exemple commande + self-check.
- [x] `simpleTableBridge.ts` active le total quand pertinent.
- [x] Tous les tests passent, lint et TypeScript OK sur les fichiers modifiés.
- [ ] Cas de la capture validé manuellement.

---

## 10. Correctif post-implémentation

- **Symptôme :** une colonne `Montant TVA (20%)` était typée `percentage` par `simpleTableBridge`, donc affichée `2000,00 %` au lieu de `20,00 €` dans l'export Excel.
- **Cause :** la détection de type considérait tout en-tête contenant `%` comme un pourcentage, avant même de regarder les mots monétaires.
- **Correctif :**
  - Les mots monétaires explicites (`montant`, `total`, `prix`, `€`, `coût`, `charge`, `frais`, `valeur`, `budget`, `vente`…) priment : la colonne est `currency`.
  - `taux`, `pourcentage`, `ratio`, `coefficient` → `percentage`.
  - `TVA` seul sans `%` → `currency` ; `TVA (20%)` sans mot monétaire → `percentage`.
  - Le prompt précise désormais que `type` décrit la valeur et non le taux cité dans l'en-tête.
- **Test de non-régression :** `Montant TVA (20%) (€)` → `currency` + `total: "sum"` (85 tests passants).

---

## 11. Correctif : tableaux d'agrégation (NB.SI.ENS / COUNTIFS)

- **Symptôme :** le tableau « Compteur de factures impayées > 1000€ » n'avait pas de ligne de totaux alors qu'il contient une colonne « Montant (€) ».
- **Cause :** le modèle mettait `total_row: false` (ou la politique honorait ce false), et la colonne d'agrégation `Nombre de factures…` aurait produit un total faux (valeur répétée sur chaque ligne).
- **Correctif :**
  - `total_row: false` ne supprime plus la ligne tant qu'une colonne sommable existe : pour la désactiver, il faut `total: "none"` sur toutes les colonnes numériques.
  - Les colonnes dont la formule est une agrégation répétée (`NB.SI.ENS`, `COUNTIFS`, `MAX.SI.ENS`, `MAXIFS`, `MOYENNE.SI.ENS`, `AVERAGEIFS`…) ne sont jamais sommées.
  - Le prompt impose `total: "none"` sur ces colonnes d'agrégation.
- **Résultat attendu :** ligne de totaux avec le total des `Montant`, et cellule vide pour le nombre de factures.
- **Tests :** 87 tests passants.

---

## 12. Correctif : types hors enum rejetés par Zod

- **Symptôme :** à l'export, `SchemaValidationError` sur `columns.3.type: Invalid option: expected one of "currency"|"percentage"|"integer"|"number"|"date"|"text"`.
- **Cause :** le modèle émet parfois un synonyme (`devise`, `count`, `string`, `bool`, `monétaire`, `flag`…) ou une valeur inconnue pour `type`, ce qui invalidait tout le schéma et bloquait l'export.
- **Correctif (`schemaParser.ts`) :**
  - `normalizeColumnType(raw, header)` : mappe les synonymes connus vers l'enum, puis déduit le type depuis l'en-tête (`date`, `%`, `taux`, mots monétaires, quantités, libellés…), avec `number` en dernier recours.
  - `ColumnTypeSchema` devient un `z.preprocess` tolérant : plus aucun type inconnu ne fait échouer la validation.
  - `total` (`"SUM"`, `"somme"`, `true`…), `total_row` (`"true"`, `"auto"`…) et `total_row_label` (espaces, longueur > 40) sont également normalisés.
- **Tests :** 89 tests passants, dont deux régressions (`devise/count/flag/when` et `total: "SUM"` + `total_row: "true"`).

---

## 13. Correctif : total d'une colonne d'agrégation constante

- **Symptôme :** la colonne « Nb Factures (selon C5 & C6) » restait vide dans la ligne de totaux, alors qu'elle affiche la même valeur (3) sur chaque ligne.
- **Cause :** par sécurité, toutes les colonnes d'agrégation (`COUNTIFS`, `NB.SI.ENS`, `MAXIFS`…) étaient exclues des totaux pour éviter une somme fausse (3 × 6 lignes = 18).
- **Correctif :**
  - Nouveau mode `total: "once"` : une agrégation **constante** (formule sans `{row}`) est affichée **une seule fois** dans la ligne de totaux, jamais sommée.
  - L'export écrit une référence vers la première ligne de données (ex. `=E10`) ; la prévisualisation affiche la valeur de la première ligne.
  - Une agrégation **variable** (`{row}` dans la formule) n'est sommée que si `total: "sum"` est explicitement demandé.
  - Compatibilité : un ancien schéma avec `total: "none"` sur une agrégation constante affiche quand même la valeur une fois, tant que la ligne de totaux existe déjà grâce à une autre colonne sommable.
  - Le prompt demande désormais `total: "once"` pour ces colonnes (et non plus `"none"`).
- **Tests :** 92 tests passants, dont l'export `E13 = E10` et le mode `once`.

---

## 14. Correctif définitif : colonnes constantes et cumuls

- **Symptôme :** « Ventes cumulées (filtre) » affichait 10 500 € sur chaque ligne mais 63 000 € dans la ligne de totaux (10 500 × 6).
- **Cause :** la détection d'agrégation ne couvrait pas `SOMME.SI.ENS`/`SUMIFS`. La colonne était donc considérée comme une colonne de montant normale et sommée.
- **Règle générale appliquée :**
  - Toute colonne **calculée sans `{row}`** (ni `ROW()`) produit la même valeur sur chaque ligne → **jamais sommée**, affichée une seule fois.
  - Toute colonne de **cumul** (en-tête `cumul`/`running`/`progressif`, ou plage `$D$10:D{row}`) → **jamais sommée**, seule la **dernière valeur** est affichée.
  - Les agrégations reconnues incluent désormais `SUMIFS`/`SOMME.SI.ENS`, `COUNTIFS`/`NB.SI.ENS`, `MAXIFS`/`MAX.SI.ENS`, `MINIFS`, `AVERAGEIFS`, `SUMPRODUCT`.
  - Une agrégation **variable** (`{row}`) n'est sommée que si `total: "sum"` est explicite, ou automatiquement dans un tableau croisé (`row_total_column`).
- **Résultat :** la ligne de totaux affiche `15 200 €` pour les montants et `10 500 €` une seule fois pour le cumul filtré (référence à la dernière ligne), plus jamais `63 000 €`.
- **Tests :** 95 tests passants.

---

## 15. Correctif définitif : années, dates et données non additives

- **Symptôme :** un tableau « Année Fiscale » affichait `TOTAUX = 10 118` (somme des années 2023/2024).
- **Cause :** le modèle mettait `total: "sum"` sur une colonne d'années ; ce choix explicite était prioritaire sur les exclusions sémantiques.
- **Correctif :**
  - Liste d'exclusions **dures** appliquée avant même `total: "sum"` : année, date, mois, jour, âge, durée, exercice, prix unitaire, taux, pourcentage, remise, n°/réf/ID.
  - Un type `percentage` n'est jamais sommé, même avec `total: "sum"`.
  - `total_row: true` sans aucune colonne sommable **n'est plus une erreur de validation** : la ligne est simplement omise, pour ne jamais bloquer l'export sur une erreur du modèle.
  - Le prompt interdit explicitement de sommer une année/date et de créer des totaux quand aucune colonne n'est additive.
- **Résultat :** le tableau des années fiscales n'a plus de ligne `TOTAUX`.
- **Tests :** 98 tests passants (dont export sans ligne de totaux pour les années).

---

## 16. Correctif : formules décalées en colonne B (#VALEUR!)

- **Symptôme :** « Extraire l'année fiscale d'une date en cellule B2 » produisait `#VALEUR!` sur toutes les lignes.
- **Causes :**
  - la colonne B est réservée à « Ligne » et n'est jamais une donnée ; une formule `MONTH(B{row})` ou `MONTH(B2)` lit donc le texte « Ligne 1 » ;
  - la colonne Date pouvait être typée `text` par le modèle, donc `YEAR()`/`MONTH()` échouaient même sur une date apparente.
- **Correctif :**
  - Tout en-tête/nom contenant `date` est forcé en type `date` (les valeurs sont alors écrites comme vraies dates Excel).
  - Réparation automatique des formules de date qui référencent B : `B{row}` et `B2` sont réécrits vers la colonne de date réelle + `{row}` (ex. `C{row}`). Les références d'autres feuilles (`Ref!B10:B15`) sont protégées.
  - Le prompt interdit désormais explicitement de référencer B/A, même si l'utilisateur parle de « cellule B2 ».
- **Tests :** 100 tests passants (dont `B2`/`B{row}` → `C{row}` et typage `Date`).
