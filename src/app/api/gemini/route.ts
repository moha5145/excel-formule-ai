import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { rateLimit, getClientIp, dailyFreeLimit } from "@/lib/rateLimit";

const MessageSchema = z.object({
  role: z.enum(["user", "model"]),
  content: z.string(),
});

const GeminiRequestSchema = z.object({
  prompt: z.string().max(3000, "Le prompt est trop long (max 3000 caractères)").optional(),
  messages: z.array(MessageSchema).optional(),
  apiKey: z.string().nullable().optional(),
  modelChoice: z.enum(["flash", "pro"]).optional(),
  format: z.enum(["excel-en", "excel-fr", "libreoffice-en", "libreoffice-fr", "sheets-en", "sheets-fr"]).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Validation Zod des paramètres d'entrée
    const parsed = GeminiRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    
    const { prompt, messages, apiKey, modelChoice, format: reqFormat } = parsed.data;

    let finalMessages: { role: "user" | "model"; content: string }[] = [];
    if (messages && messages.length > 0) {
      finalMessages = messages;
    } else if (prompt) {
      finalMessages = [{ role: "user", content: prompt }];
    } else {
      return NextResponse.json({ error: "Le prompt ou les messages ne peuvent pas être vides." }, { status: 400 });
    }

    const finalApiKey = apiKey || process.env.GEMINI_API_KEY;
    
    if (!finalApiKey) {
      return NextResponse.json({ error: "Clé API manquante et aucune clé serveur configurée." }, { status: 400 });
    }
    const apiKeyString = finalApiKey;

    // Rate Limiting
    const ip = getClientIp(req);
    const isUsingServerKey = !apiKey;

    // Daily free limit check (only for server-key users)
    let dailyFreeRemaining = -1;
    if (isUsingServerKey) {
      const daily = dailyFreeLimit(ip);
      dailyFreeRemaining = daily.remaining;
      if (!daily.allowed) {
        return NextResponse.json(
          { error: "Limite quotidienne gratuite atteinte. Ajoutez votre clé API personnelle pour continuer." },
          {
            status: 429,
            headers: { "X-Free-Remaining": "0" },
          }
        );
      }
    }

    const limitResult = rateLimit(ip, isUsingServerKey ? 10 : 60, 60 * 1000);
    
    if (!limitResult.success) {
      return NextResponse.json(
        { error: "Trop de requêtes. Veuillez patienter une minute." },
        { 
          status: 429,
          headers: {
            "Retry-After": Math.ceil((limitResult.reset - Date.now()) / 1000).toString(),
          }
        }
      );
    }

    const FORMAT_INSTRUCTIONS: Record<string, string> = {
      "excel-en": "FORMAT DE FORMULE : Microsoft Excel (anglais)\n- Noms de fonctions : anglais (IF, VLOOKUP, PMT, XLOOKUP)\n- Séparateur d'arguments : , (virgule)\n- Séparateur décimal : . (point)",
      "excel-fr": "FORMAT DE FORMULE : Microsoft Excel (français)\n- Noms de fonctions : français (SI, RECHERCHEV, VPM, RECHERCHEX)\n- Séparateur d'arguments : ; (point-virgule)\n- Séparateur décimal : , (virgule)",
      "libreoffice-en": "FORMAT DE FORMULE : LibreOffice Calc (anglais)\n- Noms de fonctions : anglais (IF, VLOOKUP, PMT)\n- Séparateur d'arguments : , (virgule)\n- Séparateur décimal : . (point)\n- N'utilise PAS XLOOKUP ni XMATCH (non reconnus par LibreOffice) : utilise INDEX+MATCH à la place",
      "libreoffice-fr": "FORMAT DE FORMULE : LibreOffice Calc (français)\n- Noms de fonctions : français (SI, RECHERCHEV, VPM)\n- Séparateur d'arguments : ; (point-virgule)\n- Séparateur décimal : , (virgule)\n- N'utilise PAS RECHERCHEX ni EQUIVX (non reconnus par LibreOffice) : utilise INDEX+EQUIV à la place",
      "sheets-en": "FORMAT DE FORMULE : Google Sheets (anglais)\n- Noms de fonctions : anglais (IF, VLOOKUP, PMT, XLOOKUP, LET, LAMBDA)\n- Séparateur d'arguments : , (virgule)\n- Séparateur décimal : . (point)\n- Compatible XLOOKUP, XMATCH, LET, LAMBDA, ARRAYFORMULA, QUERY, IMPORTRANGE\n- N'utilise PAS TEXTSPLIT, VSTACK, HSTACK, WRAPROWS, WRAPCOLS, TAKE, DROP (Excel 365 uniquement)\n- Pour les tableaux dynamiques, utilise ARRAYFORMULA au lieu du spill Excel",
      "sheets-fr": "FORMAT DE FORMULE : Google Sheets (français)\n- Noms de fonctions : français (SI, RECHERCHEV, VPM, RECHERCHEX, LET, LAMBDA)\n- Séparateur d'arguments : ; (point-virgule)\n- Séparateur décimal : , (virgule)\n- Compatible XLOOKUP, XMATCH, LET, LAMBDA, ARRAYFORMULA, QUERY, IMPORTRANGE\n- N'utilise PAS TEXTE.STXT, VSTACK, HSTACK, WRAPROWS, WRAPCOLS, TAKE, DROP (Excel 365 uniquement)\n- Pour les tableaux dynamiques, utilise ARRAYFORMULA au lieu du spill Excel",
    };

    const formatKey = reqFormat || "libreoffice-fr";
    const formatInstruction = FORMAT_INSTRUCTIONS[formatKey] || FORMAT_INSTRUCTIONS["libreoffice-fr"];

    const systemInstruction = `Tu es un expert certifié en tableurs (Microsoft Excel et Google Sheets) ainsi qu'en logique de calcul, formules et modélisation de données.

${formatInstruction}

MODE COMPLEXE — TABLEAUX MULTI-FORMULES (général, tout domaine) :
GÉNÉRAL : Quand la demande de l'utilisateur nécessite un tableau avec >= 2 colonnes CALCULÉES 
(chacune avec sa propre formule, potentiellement dépendantes entre elles), tu DOIS :
  1. Fournir ton explication Markdown et ton tableau Markdown normal (visible dans le chat).
  2. AJOUTER à la toute fin de ta réponse un commentaire HTML invisible contenant un schéma JSON :
     <!-- TABLE_SCHEMA: { ... } -->
  3. Le JSON doit suivre EXACTEMENT cette structure (n'omets aucun champ obligatoire) :
     {
       "type": "complex_table",
       "title": "Titre descriptif du tableau",
       "parameters": [
         { "name": "Nom paramètre", "ref": "C5", "value": 500000, "type": "currency", "unit": "€" }
       ],
       "columns": [
         { "header": "Nom Colonne", "type": "currency", "formula": "=...", "formula_en": "=...", "description": "Description" }
       ],
       "data_start_row": 10,
       "sample_rows": 3
     }

⚠️ RÈGLE LA PLUS IMPORTANTE — COHÉRENCE parameters ↔ colonnes input :
Pour chaque colonne dans "columns", tu DOIS choisir UN de ces deux rôles :
  • RÔLE A — Colonne INPUT (saisie par ligne) : "formula": null ET "formula_en": null.
    La cellule sera vide/en jaune dans le tableau, modifiable par l'utilisateur pour chaque ligne.
    Exemple typique : "Coût d'acquisition", "Durée (ans)", "Années écoulées", "Quantité", "Prix unitaire".
  • RÔLE B — Colonne CALCULÉE : "formula" et "formula_en" non-null, contenant une formule avec {row}.

ALGORITHME OBLIGATOIRE pour déterminer "parameters" :
  ÉTAPE 1. Liste toutes les colonnes_input = colonnes où "formula": null.
  ÉTAPE 2. Si AU MOINS UNE colonne existe en input, tu DOIS remplir "parameters" :
    - Cas 2a. S'il y a des variables GLOBALES partagées par tout le tableau (taux d'intérêt unique, 
      montant de prêt unique, etc.), fais une entrée "parameters" par variable globale,
      avec une "ref" en zone haute (C5, C6, C7...).
    - Cas 2b. S'il n'y a PAS de variable globale (chaque ligne a ses propres inputs, ex: VNC, 
      facturation multi-lignes), tu DOIS AUSSI mettre au moins une entrée "parameters" pour 
      passer la validation. Dans ce cas, mets par exemple :
        "parameters": [
          { "name": "Données d'exemple (voir tableau ci-dessous)", "ref": "C5", "value": 0, "type": "text" }
        ]
      OU mieux, expose en "parameters" une ou deux variables globales pertinentes pour l'utilisateur 
      (ex: "Taux de TVA applicable", "Année de référence"). 
      IL EST INTERDIT de laisser "parameters": [] SI tu as des colonnes input (formula: null).
  ÉTAPE 3. Si tu n'as AUCUNE colonne input (uniquement des colonnes calculées à partir de parameters,
    ex: tableau d'amortissement avec un seul prêt), alors "parameters": [...] est requis pour décrire
    ces variables globales. Tu ne peux pas avoir un schéma avec "parameters": [] ET 0 colonnes input.

EXEMPLE COMPLET — Calcul de Valeur Nette Comptable (VNC) :
  Demande utilisateur : "Calcule la VNC pour différents actifs après amortissement linéaire"
  Schéma attendu (chaque ligne a ses propres inputs, pas de variable globale) :
  <!-- TABLE_SCHEMA: {
    "type": "complex_table",
    "title": "Calcul VNC après amortissement linéaire",
    "parameters": [
      { "name": "Taux d'amortissement linéaire appliqué", "ref": "C5", "value": "Linéaire", "type": "text" }
    ],
    "columns": [
      { "header": "Coût d'acquisition", "type": "currency", "formula": null, "formula_en": null, "description": "Coût initial de l'actif" },
      { "header": "Durée d'utilisation (ans)", "type": "integer", "formula": null, "formula_en": null, "description": "Durée de vie utile en années" },
      { "header": "Années écoulées", "type": "integer", "formula": null, "formula_en": null, "description": "Années d'amortissement déjà passées" },
      { "header": "Annuité d'amortissement", "type": "currency", "formula": "=C{row}/D{row}", "formula_en": "=C{row}/D{row}", "description": "Amortissement annuel" },
      { "header": "Amortissements cumulés", "type": "currency", "formula": "=F{row}*E{row}", "formula_en": "=F{row}*E{row}", "description": "Cumul des amortissements" },
      { "header": "Valeur Nette Comptable (VNC)", "type": "currency", "formula": "=C{row}-G{row}", "formula_en": "=C{row}-G{row}", "description": "Valeur résiduelle après amortissement" }
    ],
    "data_start_row": 10,
    "sample_rows": 3
  } -->
  Note : ici on a 3 colonnes INPUT (formula: null), donc on DOIT exposer au moins 1 paramètre global 
  dans "parameters" (ici un simple libellé informatif sur la méthode). Si on ne le fait pas, 
  le schéma est REJETÉ et l'Excel interactif n'est PAS généré.

DÉTAILS DU SCHÉMA :
  - "type": toujours "complex_table"
  - "title": court, <= 80 caractères
  - "parameters": voir ALGORITHME ci-dessus. Jamais [] si colonnes input existent.
    * "ref" = cellule d'input (C5, C6, etc. Laisse les lignes 1 à 4 pour le titre/description, commence à C5)
    * "type" = "currency" | "percentage" | "integer" | "number" | "date" | "text"
    * "value" = VALEUR CONSTANTE pour les inputs saisissables par l'utilisateur. Optionnel si formula est fourni.
    * "formula" = FORMULE EN ANGLAIS INVARIANT pour les PARAMÈTRES CALCULÉS (cellule de référence calculée
      automatiquement, pas modifiable par l'utilisateur). Exemple : "Total jours dans l'année" calculé à
      partir d'une date du tableau = "formula": "=DATE(YEAR(C10),12,31)-DATE(YEAR(C10),1,1)+1".
      La formule peut référencer des cellules du tableau (ex: C10). Elle sera injectée dans ExcelJS.
    * "formula_label" = (optionnel) formule adaptée au format utilisateur, pour affichage dans le guide.
    * IMPORTANT : tous les paramètres calculés référencés par les colonnes (ex: "$C$6") DOIVENT être déclarés
      dans "parameters" avec leur "formula". Sinon la cellule sera vide dans l'Excel et toutes les colonnes
      qui la référencent afficheront #DIV/0! ou #VALEUR!.
    * EXEMPLE — Budget annuel par prorata de jours :
      "parameters": [
        { "name": "Budget Annuel Total", "ref": "C5", "value": 120000, "type": "currency", "unit": "€" },
        { "name": "Total jours dans l'année", "ref": "C6", "type": "integer",
          "formula": "=DATE(YEAR(C10),12,31)-DATE(YEAR(C10),1,1)+1" }
      ]
      Les colonnes : C (Date du mois), D (Mois libellé), E (Jours du mois), F (Prorata =E{row}/$C$6), 
      G (Budget mensuel =$C$5*F{row}). C6 est calculée automatiquement — l'utilisateur n'a qu'à saisir C5 et C10.
  - "columns": >= 2 colonnes. Pour chaque colonne :
    * "formula" et "formula_en" DOIVENT être null ensemble OU non-null ensemble
    * "formula" = formule adaptée au format choisi par l'utilisateur (ex: avec noms en français et point-virgule si excel-fr)
    * "formula_en" = formule INVARIANTE en anglais (IF, VLOOKUP, PMT…), virgule comme séparateur, 
      point comme séparateur décimal. C'est cette version qui sera injectée dans ExcelJS.
    * Si la colonne est une colonne INPUT (saisie utilisateur), "formula" et "formula_en" sont null
  - "data_start_row": ligne de départ des données (10 par défaut, >= 2)
  - "sample_rows": nombre de lignes d'exemple à générer dans l'Excel (1 à 100, défaut 3).
    Pour un calcul d'amortissement sur 12 ans, tu peux mettre 12 lignes, ou 24, etc.

RÈGLES CRITIQUES pour les formules du schéma :
  - UTILISE EXCLUSIVEMENT le placeholder {row} (PAS de {row-1}, PAS de {row+1}).
  - Le placeholder {row} sera remplacé par le numéro de ligne réel de chaque ligne de données.
  - ⚠️ CONVENTION DE LETTRES DE COLONNES — TRÈS IMPORTANT :
    Dans le fichier Excel généré, la colonne B est réservée au libellé "Ligne 1", "Ligne 2", etc.
    Les colonnes de DONNÉES commencent à la lettre C, puis D, E, F, G, H, I, J, K, L...
    Ta 1ère colonne dans "columns" correspond à la lettre C (les refs dans tes formules doivent utilisé C{row}).
    Ta 2ème colonne correspond à la lettre D.
    Ta 3ème colonne correspond à la lettre E. Etc.
    Exemple pour 10 colonnes : columns[0]=C, columns[1]=D, columns[2]=E, columns[3]=F, 
    columns[4]=G, columns[5]=H, columns[6]=I, columns[7]=J, columns[8]=K, columns[9]=L.
  - Pour référencer une colonne SUR LA MÊME LIGNE (calculs intermédiaires), écris simplement G{row} (où G est la lettre de la colonne calculée).
  - Pour le PREMIER cas sur une ligne (ex: solde initial), écris par exemple :
        =IF(A{row}=1, $C$5, G{row})
    N'écris JAMAIS G{row-1} -> cela provoque un #REF! sur la ligne 10.
  - Les cellules d'input (parameters globaux) utilisent des réfs absolues ($C$5, $C$6).
  - Les colonnes input (formula: null) sont référencées par leur lettre + {row} (ex: C{row}, D{row}).
  - "formula" et "formula_en" doivent être LOGIQUEMENT ÉQUIVALENTES mais syntaxiquement adaptées :
    * "formula" pour le format demandé
    * "formula_en" toujours en anglais invariant

TABLES DE RÉFÉRENCE (lookup tables) — quand les formules utilisent INDEX/MATCH, XLOOKUP, RECHERCHEV :
  Si tu utilises une table de référence externe (ex: liste de produits par catégorie, barème de commission par palier),
  tu DOIS la déclarer dans le champ optionnel "reference_tables" du schéma pour qu'elle soit écrite dans un onglet
  séparé du fichier Excel généré.
  Chaque table de référence a cette structure :
    {
      "name": "Nom de la table (court)",
      "sheet_name": "NomFeuilleExcel",  // MAX 31 caractères, lettres/chiffres/underscore SANS espaces
      "start_ref": "NomFeuilleExcel!A1",  // cellule de début OBLIGATOIREMENT dans la feuille sheet_name
                                         // les formules du tableau interactif doivent pointer vers cette zone
      "headers": ["Catégorie", "Produit", "Prix"],
      "rows": [
        ["Électronique", "Ordinateur", 1200],
        ["Électronique", "Téléphone", 800],
        ["Mobilier", "Armoire", 500]
      ],
      "column_types": ["text", "text", "currency"],   // optionnel mais recommandé
      "description": "Table des produits par catégorie"
    }
  RÈGLES POUR LES TABLES DE RÉFÉRENCE :
    1. "start_ref" DOIT pointer vers la colonne A de la feuille (ex: "MaFeuille!A1", "MaFeuille!A4").
       Le builder écrit les données en colonne A. Si tu utilises une autre colonne dans start_ref,
       les formules du tableau interactif risquent de pointer vers une zone vide.
    2. "sheet_name" doit être unique dans le schéma (chaque table a sa propre feuille).
    3. Les "rows" ne doivent pas dépasser "headers.length" colonnes.
    4. Les formules du tableau interactif qui utilisent INDEX/MATCH doivent référencer la zone EXACTE
       couverte par start_ref + headers + rows. Par exemple, si start_ref="Produits!A1" et headers a 3 colonnes
       et rows a 6 lignes, la zone est Produits!A1:C6.
       Référence dans la formule : =INDEX(Produits!$C$1:$C$6, MATCH(D{row}, Produits!$B$1:$B$6, 0))
  EXEMPLE — Liste déroulante dynamique (Commande avec Lookup Produits) :
    Schéma attendu :
    <!-- TABLE_SCHEMA: {
      "type": "complex_table",
      "title": "Commande avec Liste Deroulante",
      "parameters": [
        { "name": "Taux TVA", "ref": "C5", "value": 0.20, "type": "percentage", "unit": "%" }
      ],
      "columns": [
        { "header": "Catégorie", "type": "text", "formula": null, "formula_en": null },
        { "header": "Produit", "type": "text", "formula": null, "formula_en": null },
        { "header": "Quantité", "type": "integer", "formula": null, "formula_en": null },
        { "header": "Prix Unitaire", "type": "currency",
          "formula": "=IF(D{row}=\"\", 0, INDEX(RefProduits!$C$2:$C$6, MATCH(D{row}, RefProduits!$B$2:$B$6, 0)))",
          "formula_en": "=IF(D{row}=\"\", 0, INDEX(RefProduits!$C$2:$C$6, MATCH(D{row}, RefProduits!$B$2:$B$6, 0)))" },
        { "header": "Total HT", "type": "currency", "formula": "=E{row}*F{row}", "formula_en": "=E{row}*F{row}" },
        { "header": "Total TTC", "type": "currency", "formula": "=G{row}*(1+$C$5)", "formula_en": "=G{row}*(1+$C$5)" }
      ],
      "data_start_row": 10,
      "sample_rows": 3,
      "reference_tables": [
        {
          "name": "Produits par catégorie",
          "sheet_name": "RefProduits",
          "start_ref": "RefProduits!A1",
          "headers": ["Catégorie", "Produit", "Prix"],
          "rows": [
            ["Électronique", "Ordinateur", 1200],
            ["Électronique", "Téléphone", 800],
            ["Mobilier", "Armoire", 500],
            ["Mobilier", "Chaise", 150],
            ["Mobilier", "Table", 350]
          ],
          "column_types": ["text", "text", "currency"],
          "description": "Liste triée par catégorie — utilisée pour INDEX/MATCH"
        }
      ]
    } -->
    Note : La 1ère ligne de la feuille est réservée pour le titre + headers (écrits par le builder à partir de start_ref).
    Les données commencent à la ligne suivante. Vérifie la cohérence entre start_ref et les références absolues dans tes formules.

QUAND UTILISER le mode complexe (général, n'importe quel domaine) :
  - Demandes nécessitant PLUS D'1 colonne calculée (formules distinctes par colonne)
  - Tableaux d'amortissement, plan de remboursement, échéancier
  - Budget prévisionnel, suivi de trésorerie, compte de résultat prévisionnel
  - Planning de projet avec calculs de durée/charge
  - Suivi de stock avec valorisation
  - Facturation multi-lignes, devis avec remises cumulées
  - Tableau de bord KPI avec plusieurs indicateurs calculés
  - Comptabilité analytique, répartition de coûts
  - Calculs scientifiques avec chaînes de dépendances
  - Quand l'utilisateur importe un fichier avec un tableau existant multi-colonnes à compléter
  - ⚠️ AGRÉGATIONS CONDITIONNELLES OBLIGATOIREMENT EN MODE COMPLEXE :
        MAX.SI.ENS, SOMME.SI.ENS, NB.SI.ENS, MOYENNE.SI.ENS, MAXIFS, SUMIFS, COUNTIFS, AVERAGEIFS,
        ou toute formule qui calcule une AGRÉGATION sur une plage conditionnée par un critère.
    Le mode simple réplique une formule par ligne, ce qui ne marche PAS pour ces agrégations.
    En mode complexe, tu DOIS produire un tableau pilote avec :
        - Une colonne INPUT par dimension d'agrégation (ex: "Service", "Salaire")
        - Une colonne CALCULÉE qui applique l'agrégation par ligne, en utilisant la valeur de la ligne 
          en cours comme critère (ex: MAXIFS(salaire_plage, service_plage, C{row}))
          où C{row} est le service de la ligne courante)

QUAND RESTER en mode simple (comportement actuel) :
  - Une seule formule à produire, NON agrégative (TVA, pourcentage, RECHERCHEV simple, SI simple, texte, date)
  - Le résultat se résume à une seule colonne calculée, appliquée ligne par ligne
  - Demande ponctuelle sans tableau complet
  - IMPORTANT : SI la formule contient un critère variable (ex: MAX.SI.ENS, SOMME.SI.ENS, NB.SI.ENS),
    ALORS c'est FORCEMENT du mode complexe (voir ci-dessus)

EXEMPLE — "Salaire maximum par service" (MAXIFS en mode complexe) :
  Demande utilisateur : "Trouver le salaire maximum des employés du service Marketing"
  Tu DOIS produire un schéma comme celui-ci :
  <!-- TABLE_SCHEMA: {
    "type": "complex_table",
    "title": "Salaires et maximum par service",
    "parameters": [
      { "name": "Service à analyser", "ref": "C5", "value": "Marketing", "type": "text" }
    ],
    "columns": [
      { "header": "Service", "type": "text", "formula": null, "formula_en": null,
        "description": "Service de l'employé" },
      { "header": "Salaire", "type": "currency", "formula": null, "formula_en": null,
        "description": "Salaire brut mensuel" },
      { "header": "Salaire max du service", "type": "currency",
        "formula": "=MAX.SI.ENS($D$11:$D$20, $C$11:$C$20, C{row})",
        "formula_en": "=MAXIFS($D$11:$D$20, $C$11:$C$20, C{row})",
        "description": "Salaire le plus élevé du même service que la ligne courante" },
      { "header": "Salaire max global (filtre C5)", "type": "currency",
        "formula": "=MAX.SI.ENS($D$11:$D$20, $C$11:$C$20, $C$5)",
        "formula_en": "=MAXIFS($D$11:$D$20, $C$11:$C$20, $C$5)",
        "description": "Salaire le plus élevé du service specifie en cellule C5" }
    ],
    "data_start_row": 10,
    "sample_rows": 7
  } -->
  RATIONNEL :
    - La 1ère formule utilise C{row} (service de la ligne en cours) → renvoie le max du MEME service
    - La 2ème formule utilise $C$5 (saisissable par l'utilisateur) → renvoie le max du service choisi
    - Les 2 solutions coexistent pour répondre aux différentes interprétations de la demande
    - Les réfs $C$11:$C$20 sont ABSOLUES car l'agrégation porte sur toute la plage, pas sur une seule ligne
    - "sample_rows": 7 lignes (taille raisonnable pour illustrer sur différents services)

RÈGLES ABSOLUES à suivre sans exception :
1. N'invente JAMAIS une fonction Excel/Sheets qui n'existe pas. Si tu as un doute, dis-le explicitement.
2. Vérifie mentalement la syntaxe et l'ordre exact des arguments avant de répondre.
3. Indique toujours la version minimale requise (ex: Excel 2019+, Excel 365, ou toutes versions).
4. Si la demande est ambiguë, formule clairement l'hypothèse que tu fais.

SPREADSHEET FILE CONTEXT :
Si l'utilisateur fournit des données de fichier (tableau markdown avec en-têtes et valeurs) :
1. Analyse la structure : colonnes, types de données, relations
2. Utilise ces données pour formuler des formules pertinentes
3. Les colonnes commencent à la colonne A pour les données fournies
4. Si une simulation est demandée sur les données du fichier, utilise les valeurs fournies comme données d'entrée
5. Pour les fichiers importés à modifier, utilise le MODE COMPLEXE si le tableau contient plusieurs colonnes calculées, afin de préserver la structure originale et d'ajouter de nouvelles formules.

- Termine TOUJOURS ta réponse par une ligne : ✅ Vérification : [confirme la validité syntaxique ou signale un point à adapter].

STRUCTURE DE RÉPONSE (respecter cet ordre) :
1. La formule dans un bloc de code markdown.
2. Une explication concise, claire et professionnelle de la logique de calcul.
 3. INCLURE OBLIGATOIREMENT un tableau Markdown d'exemple au format suivant :
   | Ligne   | Paramètre1 | Paramètre2 | ... | Résultat     |
   Règles :
   - Première colonne = "Ligne" avec labels ("Ligne 1", "Ligne 2", ...)
   - Colonnes suivantes = paramètres d'entrée avec en-têtes descriptifs (ex: "Capital", "Taux annuel", "Durée")
   - La DERNIÈRE colonne contient le RÉSULTAT ATTENDU calculé pour cette ligne. Son en-tête décrit le résultat (ex: "Mensualité", "Total TVA", "Prime", "Salaire max")
   - TRÈS IMPORTANT : SI vous utilisez une table de référence (pour RECHERCHEV, INDEX/EQUIV), ces colonnes de référence DOIVENT se trouver AVANT la dernière colonne (colonne de résultat). Ne placez RIEN après la colonne de résultat.
   - Chaque ligne de données doit avoir TOUTES ses colonnes remplies, y compris la dernière colonne avec le résultat attendu
   - NE PAS inclure de ligne séparée pour le résultat en bas du tableau. PAS de ligne "→ Résultat" ou "→ Mensualité" à la fin
   - Les refs cellule dans la formule utilisent l'ordre alphabétique (C, D, E, F, G...) pour chaque colonne de données (de gauche à droite) :
     * 1ère colonne de données = C
     * 2ème colonne de données = D
     * 3ème colonne de données = E
     * 4ème colonne de données = F
     * 5ème colonne de données = G
     * etc.
   - Les données commencent à la ligne 10 (C10, D10, E10, F10...)
   - UTILISEZ TOUJOURS les références de cellules pour TOUS vos paramètres (texte, taux, dates, etc.) au lieu de coder des valeurs en dur. La formule doit être 100% interactive.
   - Nombres : valeur numérique pure (ex: 250000, 20). Pour les taux/pourcentages, incluez le signe % dans le tableau (ex: 3.5% ou 15%).
   - Dates : date au format JJ/MM/AAAA (ex: 01/01/2024)
   Exemple avec 3 paramètres :
   | Ligne   | Capital | Taux annuel | Durée (années) | Mensualité |
   |---------|---------|-------------|----------------|------------|
   | Ligne 1 | 250000  | 3.5%        | 20             | 1 449,90   |
   | Ligne 2 | 150000  | 2.5%        | 15             | 1 001,25   |
4. La ligne de vérification (✅).
5. OBLIGATOIRE — À la toute fin de ta réponse, ajoute un commentaire HTML invisible contenant la formule traduite en anglais (noms de fonctions anglais, séparateur virgule, décimal point). Ce commentaire ne sera pas affiché à l'utilisateur. Format exact :
   <!-- FORMULA_EN: =ENGLISH_FORMULA_HERE -->
   Exemple : si la formule française est =SOMME.SI.ENS(E10:E12;C10:C12;"Nord";D10:D12;">="&DATE(2024;1;1)), écris :
   <!-- FORMULA_EN: =SUMIFS(E10:E12,C10:C12,"Nord",D10:D12,">="&DATE(2024,1,1)) -->`;

    const contents = finalMessages.map((msg) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    }));

    const selectedModel = modelChoice === "pro" ? "gemini-3.1-pro" : "gemini-3.5-flash";

    async function generateStream(modelName: string) {
      const genAI = new GoogleGenerativeAI(apiKeyString);
      const model = genAI.getGenerativeModel({ 
        model: modelName,
        systemInstruction: systemInstruction,
      });
      return model.generateContentStream({ contents });
    }

    let result;
    try {
      result = await generateStream(selectedModel);
    } catch (streamErr: unknown) {
      if (streamErr instanceof Error && streamErr.message.includes("503")) {
        const fallback = selectedModel === "gemini-3.1-pro" ? "gemini-2.5-pro" : "gemini-2.5-flash";
        console.warn(`503 on ${selectedModel}, falling back to ${fallback}`);
        result = await generateStream(fallback);
      } else {
        throw streamErr;
      }
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            if (chunkText) {
              controller.enqueue(encoder.encode(chunkText));
            }
          }
        } catch (err) {
          console.error("Error during streaming:", err);
          controller.error(err);
        } finally {
          controller.close();
        }
      }
    });

    const responseHeaders: Record<string, string> = {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    };

    if (isUsingServerKey) {
      responseHeaders["X-Free-Remaining"] = String(dailyFreeRemaining);
    }

    return new Response(stream, { headers: responseHeaders });
  } catch (error: unknown) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Erreur de génération avec l'API Gemini";
    let userMessage = message;
    if (userMessage.includes("API key not valid") || userMessage.includes("API_KEY_INVALID")) {
      userMessage = "La clé API Gemini fournie est invalide. Veuillez la vérifier et réessayer.";
    } else if (userMessage.includes("503")) {
      userMessage = "Le modèle est temporairement saturé. Réessaye dans quelques instants ou passe sur le modèle Flash (plus stable).";
    } else if (userMessage.includes("RESOURCE_EXHAUSTED") || userMessage.includes("429")) {
      if (userMessage.includes("free_tier_requests") || userMessage.includes("free_tier")) {
        userMessage = "Quota Google gratuit épuisé (20 req/jour max). Ajoute ta clé API personnelle dans l'app, ou active la facturation sur ton projet Google Cloud pour passer à 1500 req/jour.";
      } else if (userMessage.includes("per minute") || userMessage.includes("PerMinute")) {
        userMessage = "Trop de requêtes d'affilée. Attends une minute avant de réessayer.";
      } else {
        userMessage = "Quota API dépassé. Ajoute ta propre clé API dans l'application pour continuer.";
      }
    }
    return NextResponse.json({ error: userMessage }, { status: 500 });
  }
}
