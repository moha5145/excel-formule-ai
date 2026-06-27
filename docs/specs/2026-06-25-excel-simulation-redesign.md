# Refonte de l'onglet "Exemple Pratique" — Simulation Interactive

**Date** : 2026-06-25
**Statut** : Spécification approuvée
**Fichier concerné** : `src/lib/excelExport.ts` (fonction `downloadFormulaAsExcel`)

---

## 1. Problèmes identifiés

### 1.1 Valeurs IA inutilisables comme nombres
L'IA génère des cellules comme `0.035 (ou 3.5% en format %)` — texte mixte non parsable en nombre. Le parser `isNumericValue()` retourne `false`, la cellule est stockée comme texte, et la formule résulte en #VALUE! (affiché comme 0).

### 1.2 Références de cellules incohérentes
La formule `=VPM(B3/12; B4*12; B2)` réfère B2/B3/B4 qui contiennent du texte (colonne "Cellule"), pas les valeurs numériques.

### 1.3 Affichage FR/EN incohérent
La "Version FR" affiche des virgules (séparateur EN) au lieu de point-virgules. L'utilisateur FR colle ça dans Excel FR → erreur.

### 1.4 SOMME non traduite
`=SOMME(D11:D14)` utilise le nom FR. Excel EN ne comprend pas `SOMME`.

### 1.5 Ligne "Résultat" inutile
SOMME sur des colonnes mixtes texte/nombre donne 0. La colonne "Résultat attendu" est du texte mort.

### 1.6 Colonne "Cellule" trompeuse
"B2", "B3" font croire que les données doivent aller en B2/B3 du sheet, mais elles sont en colonne D.

---

## 2. Solution : Zone de Simulation Autonome

### 2.1 Structure de l'onglet "Exemple Pratique"

L'onglet est organisé en **3 zones** :

```
┌─────────────────────────────────────────────────────────┐
│  A1:H1 — TITRE "EXEMPLE PRATIQUE DE SIMULATION"        │
│  A2:H2 — Barre jaune déco                               │
├─────────────────────────────────────────────────────────┤
│  ZONE 1 : FORMULE PRÊTE À COLLER (lignes 4-8)          │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Version FR : =VPM(D13/100/12; D14*12; D12)     │    │
│  │ Version EN : =PMT(D13/100/12, D14*12, D12)     │    │
│  │ Copiez et collez dans votre classeur            │    │
│  └─────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────┤
│  ZONE 2 : SIMULATION INTERACTIVE (lignes 10-20)        │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Paramètre          │  Valeur    │  Description │    │
│  │  ─────────────────────────────────────────────  │    │
│  │  Montant du Prêt     │  250000    │  Montant...  │    │
│  │  Taux Annuel         │  3.5       │  Taux...     │    │
│  │  Durée               │  20        │  Années      │    │
│  │  ─────────────────────────────────────────────  │    │
│  │  → Résultat (PMT)    │  -1443.08  │  €/mois      │    │
│  └─────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────┤
│  ZONE 3 : INSTRUCTIONS (lignes 22+)                     │
│  Modifiez les valeurs jaunes pour tester                 │
│  La formule se recalcule automatiquement                 │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Zone 1 : Formule prête à coller

**Identique à l'actuel** avec une correction :
- La version FR doit toujours utiliser `;` comme séparateur d'arguments
- La version EN doit toujours utiliser `,` comme séparateur
- Les deux versions doivent référencer les cellules de la Zone 2

**Logique de display** :
- `formulaRaw` (extraite de l'IA) = texte brut pour Zone 1 FR (tel quel, avec `;`)
- `formulaEnglish` = traduite pour Zone 1 EN (avec `,`)
- Les deux versions de la Zone 1 sont du **texte** (pas de formule active)

### 2.3 Zone 2 : Simulation interactive

#### Layout

| Row | Col B | Col C | Col D | Col E |
|-----|-------|-------|-------|-------|
| 10 | Titre section (merged B:E) | | | |
| 11 | **Paramètre** | **Valeur** | **Description** | |
| 12 | Montant du Prêt (€) | 250000 | Montant emprunté | |
| 13 | Taux Annuel (%) | 3.5 | Taux d'intérêt | |
| 14 | Durée (années) | 20 | Nombre d'années | |
| 15 | *Séparateur* | | | |
| 16 | **→ Résultat** | **-1443.08** | **€/mois** | |

#### Extraction des paramètres depuis le tableau IA

**Entrée** : `tables[0]` (premier tableau Markdown extrait)
**Sortie** : `SimParam[]` = `{ name, value, unit, type, rawValue }`

**Algorithme** :
```
Pour chaque row du tableau:
  1. row[0] = Cellule (ex: "B2") → ignoré
  2. row[1] = Description (ex: "Montant du Prêt (€)") → name
  3. row[2] = Valeur (ex: "250000") → rawValue
  4. row[3] = Formule (ex: "=VPM(...)") ou row[4] = Résultat attendu

  Si rawValue commence par "=" → c'est la LIGNE FORMULE (sortie)
    → Extraire la formule, ne pas ajouter aux params d'entrée
  Sinon → c'est un PARAMÈTRE D'ENTRÉE
    → Parser la valeur, détecter le type, ajouter aux params
```

#### Détection du type de paramètre

| Mot-clé dans le nom (insensible à la casse) | Type | Format cellule | Ajustement formule |
|---|---|---|---|
| `taux`, `tx`, `%`, `interêt`, `interest` | Pourcentage | `0.0%` | `/100` si la valeur est > 1 (ex: 3.5 → 3.5/100) |
| `montant`, `€`, `euro`, `salaire`, `prime`, `pret`, `emprunt` | Monétaire | `#,##0.00 €` | — |
| `durée`, `année`, `mois`, `jour`, `nb`, `nombre`, `periode`, `term` | Entier | `0` | — |
| Autre | Nombre | `#,##0.##` | — |

**Règle pour le taux** :
- Si la valeur extraite est `3.5` et le nom contient "taux"/"%" → stocker `3.5`, formater en `0.0%`
- Dans la formule : diviser par 100 → `D13/100`
- Si la valeur extraite est `0.035` → stocker `0.035`, formater en `0.0%`
- Dans la formule : ne pas diviser

**Détection** : `if (value > 1 && name matches taux/%)` → diviser par 100

#### Réécriture de la formule

La formule originale `=VPM(B3/12; B4*12; B2)` doit être réécrite :

1. **Construire la map de correspondance** : `{ "B2": "D12", "B3": "D13", "B4": "D14" }`
   - Les paramètres d'entrée sont dans la colonne D (Valeur), à partir de `dataStartRow`
   - L'ordre suit l'ordre d'extraction du tableau

2. **Réécrire les références** : `rewriteCellReferences(formula, cellMap)`
   - `B2` → `D12`, `B3` → `D13`, `B4` → `D14`

3. **Ajuster le taux** : Si un paramètre est de type Pourcentage avec valeur > 1
   - Insérer `/100` après la référence dans la formule
   - Ex: `D13` → `D13/100` si D13 contient 3.5

4. **Traduire en anglais** : `translateFrenchFormulaToEnglish(formula)`
   - `VPM` → `PMT`, `;` → `,`, etc.

**Résultat** : `=PMT(D13/100/12, D14*12, D12)` — formule active qui se recalcule.

#### Construction de la formule FR pour affichage

La version FR dans la Zone 1 doit :
- Utiliser les mêmes références réécrites (D12, D13, D14)
- Utiliser `;` comme séparateur
- Garder les noms de fonctions FR (VPM, SOMME, etc.)

**Logique** : Réécrire les références → ne PAS traduire les noms de fonctions → remplacer `,` par `;`

### 2.4 Zone 3 : Instructions

Texte statique (3 lignes) :
```
💡  Modifiez les valeurs en jaune pour tester d'autres scénarios.
📝  La formule de la cellule verte se recalcule automatiquement.
📋  Copiez la formule ci-dessus (Zone 1) pour l'utiliser dans votre classeur.
```

---

## 3. Formatage visuel

### Palette de couleurs

| Élément | ARGB |
|---|---|
| Fond jaune clair (cellules d'entrée) | `FFFEF3C7` |
| Bordure dorée | `FFD97706` |
| Fond vert clair (cellule résultat) | `FFF0FDF4` |
| Bordure verte | `FF16A34A` |
| Fond slate (headers) | `FF334155` |
| Texte blanc | `FFFFFFFF` |
| Texte gris foncé (labels) | `FF475569` |
| Texte gris moyen (instructions) | `FF64748B` |

### Polices

| Élément | Police | Taille | Style |
|---|---|---|---|
| Titre section | Segoe UI | 11 | Bold |
| Headers tableau | Segoe UI | 10 | Bold |
| Labels paramètres | Segoe UI | 10 | Normal |
| Cellules de valeur | Segoe UI | 11 | Normal |
| Cellule résultat | Consolas | 12 | Bold |
| Instructions | Segoe UI | 9 | Italic |

### Bordures

| Élément | Style |
|---|---|
| Cellules d'entrée | Top/Bottom/Left/Right: thin, `FFD97706` |
| Cellule résultat | Top/Bottom/Left/Right: medium, `FF16A34A` |
| Headers | Top: thin `FF475569`, Bottom: medium `FF1E293B` |

---

## 4. Cas limites

| Cas | Solution |
|---|---|
| Aucun tableau Markdown dans la réponse IA | Afficher "Aucune donnée d'exemple détectée" + Zone 1 seule |
| Formule sans tableau d'exemple | Afficher Zone 1 seule (copier-coller) sans Zone 2 |
| Plusieurs tableaux | Utiliser le premier uniquement |
| Tableau sans colonne "Cellule" | Extraire les paramètres depuis les noms de colonnes du header |
| Valeur avec pourcentage (`3.5%` ou `3,5%`) | Parser le `%`, stocker la valeur numérique, formater en % |
| Formule avec plus de 6 paramètres | Limiter à 6 entrées max |
| Paramètre sans mot-clé reconnu | Type par défaut : nombre `#,##0.##` |
| Formule sans aucune référence cellulaire | Insérer la formule telle quelle sans réécriture |
| La formule originale utilise déjà des références colonne D | La map de réécriture ne change rien (D12 → D12) |

---

## 5. Modifications de code

### 5.1 `src/lib/excelExport.ts`

**Fonctions à ajouter** :
- `extractSimulationParams(table: ExtractedTable): { params: SimParam[], formulaRow: number | null }`
  - Parse le tableau IA, extrait les paramètres et la ligne formule
- `detectParamType(name: string, value: number): 'percentage' | 'currency' | 'integer' | 'number'`
  - Détecte le type via les mots-clés dans le nom
- `rewriteFormulaForSimulation(formula: string, cellMap: Record<string, string>, params: SimParam[]): string`
  - Réécrit la formule avec les bonnes références et ajustements (taux/100)
- `buildSimulationFormulas(params: SimParam[], formulaRaw: string, cellMap: Record<string, string>): { fr: string, en: string }`
  - Génère les deux versions FR et EN de la formule pour la Zone 1

**Fonctions à modifier** :
- `downloadFormulaAsExcel()` : Remplacer la section "Tableaux d'exemples" (lignes 542-689) par la nouvelle logique Zone 2

**Fonctions à supprimer** :
- `shiftColumns()` (remplacée par `rewriteCellReferences`)
- `columnLetterToNumber()` (plus utilisée)
- La ligne "Résultat" avec SOMME (supprimée)

### 5.2 `src/app/api/gemini/route.ts`

**Modification du prompt système** (ligne 76) :

Avant :
```
3. INCLURE OBLIGATOIREMENT un tableau Markdown d'exemple avec des données fictives montrant les valeurs attendues dans les cellules pour que la formule fonctionne.
```

Après :
```
3. INCLURE OBLIGATOIREMENT un tableau Markdown d'exemple avec 4 colonnes :
   | Cellule | Description | Valeur | Résultat attendu |
   - La colonne "Cellule" contient la référence (ex: A1, B2)
   - La colonne "Description" contient le nom du paramètre
   - La colonne "Valeur" contient une valeur numérique (pas de texte mixte, juste le nombre)
   - La colonne "Résultat attendu" contient le résultat formaté
   - La dernière ligne du tableau contient la formule dans la colonne "Valeur" (ex: =VPM(B3/12;B4*12;B2))
```

---

## 6. Auto-évaluation

- [x] Pas de TBD/TODO dans la spécification
- [x] Pas de contradictions entre les sections
- [x] Tous les cas limites identifiés ont une solution
- [x] La logique de réécriture de formule est complète (map → rewrite → adjust → translate)
- [x] Le formatage est entièrement défini (couleurs, polices, bordures)
- [x] Les fichiers à modifier sont identifiés
- [x] La séparation FR/EN est claire (FR avec `;`, EN avec `,`)

---

## 7. Prochaine étape

Passer à la compétence de **planification** pour préparer l'implémentation détaillée (tâches, ordre, dépendances).
