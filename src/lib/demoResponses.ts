// Réponses pré-calculées pour la démo sans clé API
// Aucun appel réseau — 100% légal, 0€ de coût

export interface DemoEntry {
  keywords: string[];
  response: string;
}

export const demoResponses: DemoEntry[] = [
  {
    keywords: ["mensualité", "prêt", "immobilier", "emprunt", "remboursement"],
    response: `Voici la formule Excel pour calculer la mensualité d'un prêt immobilier :

\`\`\`excel
=VPM(B1/12; C1*12; -A1)
\`\`\`

**Explication :**
La fonction \`VPM\` (Valeur de Paiement constant) calcule les remboursements périodiques d'un emprunt à taux fixe.

- \`B1/12\` : Le taux d'intérêt **annuel** (en B1) divisé par 12 pour obtenir le taux **mensuel**.
- \`C1*12\` : La durée en **années** (en C1) multipliée par 12 pour obtenir le nombre de **mois**.
- \`-A1\` : Le montant du prêt (en A1) est mis en **négatif** car c'est une sortie de fonds pour la banque.

> 💡 **Conseil d'expert :** Si le résultat est négatif, ajoutez un signe \`-\` devant \`VPM\` pour afficher une valeur positive : \`=-VPM(B1/12; C1*12; A1)\``
  },
  {
    keywords: ["prix", "produit", "recherche", "retrouver", "liste", "recherchev", "recherchex"],
    response: `Voici la formule moderne et robuste pour retrouver un prix depuis une liste :

\`\`\`excel
=RECHERCHEX(G2; A:A; D:D; "Produit introuvable")
\`\`\`

**Explication :**
\`RECHERCHEX\` est la version moderne et supérieure à l'ancien RECHERCHEV.

- \`G2\` : La **valeur à chercher** (le nom du produit).
- \`A:A\` : La **colonne où chercher** (votre liste de noms).
- \`D:D\` : La **colonne à retourner** (vos prix).
- \`"Produit introuvable"\` : Le texte affiché si aucune correspondance n'est trouvée (évite l'erreur \`#N/A\`).

> 💡 **Pourquoi pas RECHERCHEV ?** RECHERCHEX fonctionne dans les deux sens, ne dépend pas de la position des colonnes, et gère les erreurs nativement. C'est la formule à utiliser en 2024.`
  },
  {
    keywords: ["prime", "si", "condition", "objectif", "chiffre", "affaires", "marge"],
    response: `Voici la formule avec les conditions imbriquées pour le calcul de prime :

\`\`\`excel
=SI(ET(C4>100000; D4>0.2); C4*0.05; SI(C4>50000; C4*0.02; 0))
\`\`\`

**Explication :**
Cette formule utilise \`SI\` et \`ET\` pour gérer trois niveaux de prime.

**Niveau 1 (Condition principale) :** \`ET(C4>100000; D4>0.2)\`
→ Si le CA **ET** la marge sont atteints simultanément → Prime de **5%**

**Niveau 2 (Condition intermédiaire) :** \`SI(C4>50000; ...)\`
→ Si seulement le CA dépasse 50 000€ → Prime de **2%**

**Niveau 3 (Défaut) :** \`0\`
→ Aucune condition remplie → **Pas de prime**

> 💡 **Conseil :** Pour rendre la formule plus lisible, vous pouvez nommer vos cellules (\`Gestionnaire de noms\`) et remplacer C4 par \`CA_Mensuel\`.`
  },
  {
    keywords: ["erreur", "div", "division", "zéro", "sierreur", "vérifier"],
    response: `Pour protéger votre formule contre l'erreur #DIV/0!, utilisez SIERREUR :

\`\`\`excel
=SIERREUR(A2/B2; "À vérifier")
\`\`\`

**Explication :**
\`SIERREUR\` est votre garde-fou universel contre toutes les erreurs Excel.

- **Argument 1 :** \`A2/B2\` — Votre calcul normal.
- **Argument 2 :** \`"À vérifier"\` — Le texte affiché **uniquement** si le calcul génère une erreur (\`#DIV/0!\`, \`#N/A\`, \`#REF!\`, etc.).

> 💡 **Variantes utiles :**
> - Afficher \`0\` au lieu d'un texte : \`=SIERREUR(A2/B2; 0)\`
> - Afficher une cellule vide : \`=SIERREUR(A2/B2; "")\`
> - Encapsuler un RECHERCHEV : \`=SIERREUR(RECHERCHEV(E1;A:B;2;0); "Non trouvé")\``
  },
  {
    keywords: ["tva", "taxe", "ht", "ttc", "calcul"],
    response: `Pour calculer la TVA, le montant HT ou le montant TTC :

**1. Trouver le montant HT à partir du TTC (taux de 20% en B2) :**
\`\`\`excel
=A2/(1+B2)
\`\`\`

**2. Trouver le montant TTC à partir du HT :**
\`\`\`excel
=A2*(1+B2)
\`\`\`

**3. Calculer uniquement la part de TVA :**
\`\`\`excel
=A2*B2
\`\`\`

**Explication :**
- \`A2\` contient le montant de base (HT ou TTC).
- \`B2\` contient le taux de TVA (ex: 20% ou 0,20).

> 💡 **Version Excel 365 / dynamique :** Vous pouvez utiliser \`=A2:A10*(1+B2)\` pour calculer instantanément les taxes sur toute une colonne.`
  },
  {
    keywords: ["somme.si", "sommesi", "somme si", "sommer", "somme.si.ens"],
    response: `Voici la formule de sommation multicritère avancée (SOMME.SI.ENS) :

\`\`\`excel
=SOMME.SI.ENS(C:C; A:A; "Nord"; B:B; ">=01/01/2024")
\`\`\`

**Explication :**
\`SOMME.SI.ENS\` permet d'additionner des cellules répondant à plusieurs critères.

- \`C:C\` : La plage de cellules à additionner (ex: les montants).
- \`A:A\` et \`"Nord"\` : Premier critère (la région doit être "Nord").
- \`B:B\` et \`">=01/01/2024"\` : Second critère (la date doit être égale ou postérieure au 1er janvier 2024).

> ⚠️ **Attention à l'ordre :** Contrairement à \`SOMME.SI\`, la plage à sommer vient toujours en **premier** dans \`SOMME.SI.ENS\`.`
  },
  {
    keywords: ["nb.si", "nbsi", "nb si", "compter", "compte"],
    response: `Voici la formule pour compter des lignes selon plusieurs conditions :

\`\`\`excel
=NB.SI.ENS(A:A; "Payé"; B:B; ">1000")
\`\`\`

**Explication :**
La fonction \`NB.SI.ENS\` compte le nombre de fois où toutes les conditions spécifiées sont vraies.

- \`A:A\` et \`"Payé"\` : Compter uniquement si la colonne A contient le statut "Payé".
- \`B:B\` et \`">1000"\` : Compter uniquement si la colonne B est strictement supérieure à 1000.

> 💡 **Exemple simple :** Pour compter simplement le nombre de doublons d'une cellule A2 sur toute la colonne A : \`=NB.SI(A:A; A2)\`. Si le résultat est supérieur à 1, c'est un doublon !`
  },
  {
    keywords: ["date", "datedif", "jours", "ouvré", "ancienneté", "mois", "annee"],
    response: `Pour calculer la différence de jours ou le nombre de jours ouvrés réels :

**1. Nombre de jours ouvrés réels (hors week-ends et jours fériés) :**
\`\`\`excel
=NB.JOURS.OUVRES(A2; B2; H2:H15)
\`\`\`

**2. Calculer l'ancienneté précise (ex: en années complètes) :**
\`\`\`excel
=DATEDIF(A2; AUJOURDHUI(); "Y")
\`\`\`

**Explication :**
- \`A2\` : Date de début (ex: embauche).
- \`B2\` : Date de fin.
- \`H2:H15\` : (Optionnel) Une plage contenant votre liste de jours fériés annuels.
- \`"Y"\` : Indique à \`DATEDIF\` de renvoyer la différence en années complètes (utilisez \`"M"\` pour les mois, \`"D"\` pour les jours).`
  },
  {
    keywords: ["texte", "concatener", "concat", "stxt", "gauche", "droite", "extraire"],
    response: `Voici les formules les plus utiles pour manipuler du texte :

**1. Fusionner du texte (Prénom + Nom en majuscule) :**
\`\`\`excel
=CONCAT(A2; " "; MAJUSCULE(B2))
\`\`\`

**2. Extraire les 3 premiers caractères d'un code :**
\`\`\`excel
=GAUCHE(A2; 3)
\`\`\`

**3. Extraire une partie située au milieu (ex: à partir du 4e caractère, sur une longueur de 5) :**
\`\`\`excel
=STXT(A2; 4; 5)
\`\`\`

> 💡 **Astuce moderne :** Dans Excel 365, utilisez \`FRACTIONNER.TEXTE\` pour découper instantanément une phrase selon un délimiteur (ex: un espace).`
  },
  {
    keywords: ["arrondi", "plancher", "plafond", "arrondir"],
    response: `Voici comment maîtriser les arrondis de montants dans Excel :

**1. Arrondir à 2 décimales (classique) :**
\`\`\`excel
=ARRONDI(A2; 2)
\`\`\`

**2. Arrondir au multiple de 5 centimes supérieur (utile en facturation suisse par exemple) :**
\`\`\`excel
=PLAFOND.MATH(A2; 0,05)
\`\`\`

**3. Arrondir au multiple entier inférieur :**
\`\`\`excel
=PLANCHER.MATH(A2; 1)
\`\`\`

**Explication :**
- \`ARRONDI\` arrondit au plus proche selon la règle mathématique (>=5 arrondit au-dessus, <5 au-dessous).
- \`PLAFOND.MATH\` force l'arrondi vers le haut.
- \`PLANCHER.MATH\` force l'arrondi vers le bas.`
  },
  {
    keywords: ["tcd", "tableau croisé", "croisé dynamique", "analyse"],
    response: `Les Tableaux Croisés Dynamiques (TCD) ne nécessitent pas de formules complexes mais une configuration visuelle. Voici la méthode :

1. Sélectionnez vos données (incluant les en-têtes).
2. Allez dans le ruban : **Insertion** > **Tableau croisé dynamique**.
3. Choisissez l'emplacement (nouvelle feuille recommandée).
4. Glissez-déposez vos champs dans le volet de droite :
   - **Lignes** : Vos axes d'analyse (ex: Région, Catégorie).
   - **Valeurs** : Vos indicateurs numériques (ex: Somme de Chiffre d'Affaires).
   - **Colonnes** : (Optionnel) Axe temporel ou segments (ex: Années).
   - **Filtres** : Pour filtrer globalement votre analyse.

> 💡 **Conseil de comptable :** Si vos montants comptables ne s'affichent pas correctement, faites un clic droit dans le tableau sur une valeur > **Paramètres des champs de valeurs** > **Format de nombre** et choisissez **Monétaire**.`
  },
  {
    keywords: ["maximum", "minimum", "max", "min", "max.si.ens", "min.si.ens"],
    response: `Pour trouver le montant maximum ou minimum sous conditions :

**1. Trouver le plus grand montant de la colonne C pour la catégorie "Compta" :**
\`\`\`excel
=MAX.SI.ENS(C:C; A:A; "Compta")
\`\`\`

**2. Trouver le plus petit montant sous deux conditions :**
\`\`\`excel
=MIN.SI.ENS(C:C; A:A; "Finance"; B:B; ">=2024")
\`\`\`

**Explication :**
- \`C:C\` : La plage de cellules contenant les valeurs numériques à évaluer.
- \`A:A\` et \`"Compta"\` : La plage de critères et la condition associée.
- Ces formules ignorent automatiquement les cellules vides ou contenant du texte.`
  },
  {
    keywords: ["validation", "liste déroulante", "déroulante", "restreindre"],
    response: `Pour créer une liste déroulante dynamique de valeurs autorisées :

1. Sélectionnez la cellule ou la colonne où insérer la liste.
2. Allez dans le ruban : **Données** > **Validation des données**.
3. Dans l'onglet **Options**, sous "Autoriser", choisissez **Liste**.
4. Dans le champ **Source**, vous pouvez :
   - Saisir les valeurs séparées par un point-virgule (ex: \`Validé;En attente;Refusé\`).
   - Sélectionner une plage de cellules contenant vos valeurs (ex: \`=$H$2:$H$10\`).
5. Cliquez sur **OK**.

> 💡 **Astuce pro :** Pour éviter les erreurs de saisie, cochez l'option "Alerte d'erreur" afin d'afficher un message personnalisé si l'utilisateur saisit autre chose que les choix autorisés.`
  },
  {
    keywords: ["mise en forme", "conditionnelle", "couleur", "colorer", "surligner"],
    response: `Pour appliquer une couleur automatique de ligne selon une condition (ex: si statut est "Retard") :

1. Sélectionnez l'ensemble de votre tableau (ex: \`$A$2:$F$100\`).
2. Allez dans le ruban : **Accueil** > **Mise en forme conditionnelle** > **Nouvelle règle**.
3. Choisissez : **Utiliser une formule pour déterminer pour quelles cellules le format sera appliqué**.
4. Saisissez la formule suivante (en fixant la colonne avec \`$\` mais pas la ligne) :
   \`\`\`excel
   =$E2="Retard"
   \`\`\`
5. Cliquez sur le bouton **Format**, choisissez un remplissage (ex: rouge clair) et validez.

> ⚠️ **Erreur courante :** N'oubliez pas le signe \`$\` devant la colonne (\`$E2\`). Sans cela, la coloration se décalera sur les colonnes adjacentes.`
  },
  {
    keywords: ["xlookup", "recherchex", "avancé", "multi-critère", "multicritère"],
    response: `Pour effectuer une recherche avancée avec plusieurs critères (ex: chercher le prix d'un article spécifique d'une taille spécifique) :

\`\`\`excel
=RECHERCHEX(1; (A:A="T-shirt") * (B:B="XL"); C:C; "Indisponible")
\`\`\`

**Explication :**
Cette technique de multiplication matricielle remplace les formules complexes à base de INDEX/EQUIV.

- \`(A:A="T-shirt")\` renvoie une série de VRAI (1) ou FAUX (0).
- \`(B:B="XL")\` renvoie également une série de VRAI ou FAUX.
- La multiplication de ces deux séries donne 1 uniquement là où les deux conditions sont VRAIES en même temps.
- \`RECHERCHEX\` cherche la valeur \`1\` dans ce résultat et renvoie la cellule correspondante de la colonne \`C:C\` (prix).`
  }
];

export function findDemoResponse(prompt: string): string | null {
  const lowerPrompt = prompt.toLowerCase();
  
  for (const entry of demoResponses) {
    const matches = entry.keywords.filter(kw => lowerPrompt.includes(kw));
    if (matches.length >= 1) {
      return entry.response;
    }
  }
  
  // Réponse générique si aucun mot-clé ne correspond
  return `Voici un exemple de formule avancée basé sur votre demande :

\`\`\`excel
=SI(A1<>""; GAUCHE(A1; TROUVE(" "; A1&" ")-1); "Cellule vide")
\`\`\`

**Explication :**
Cette formule illustre les capacités de l'assistant. Elle extrait le premier mot d'une cellule contenant du texte, tout en gérant le cas des cellules vides.

> 🔑 **Pour débloquer des formules 100% personnalisées** basées sur vos besoins exacts, entrez votre clé API Google Gemini gratuite (30 secondes sur [aistudio.google.com](https://aistudio.google.com/app/apikey)).`;
}
