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
