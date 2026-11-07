import type { TableColumn, TableSchema } from "./schemaParser";

export type ColumnTotal = "sum" | "none" | "auto" | "once";

const NUMERIC_TYPES = new Set(["currency", "percentage", "integer", "number"]);

// En-têtes qui ne représentent JAMAIS une grandeur additive : même un
// "total": "sum" erroné du modèle est ignoré (années, dates, IDs, taux, prix unitaires, moyennes...).
const NEVER_SUM_HEADER_PATTERNS: RegExp[] = [
  // Prix et coûts unitaires, tarifs horaires/journaliers
  /prix\s*(?:u\b|unit\b|unitaire|catalogue|standard|achat\s*unitaire|vente\s*unitaire)/,
  /cout\s*(?:u\b|unit\b|unitaire|achat\s*unitaire|revient\s*unitaire)/,
  /unit\s*price/,
  /unit\s*cost/,
  /\bpu\b/,
  /\bp\.u\.?\b/,
  /pu\s*(?:ht|ttc)/,
  /tarif\s*(?:u\b|unit\b|unitaire|horaire|journalier|jour\b|heure\b)/,
  /\btjm\b/,
  /\bcjm\b/,
  /taux\s*(?:horaire|journalier|marge|marque|tva)/,
  /forfait\s*unitaire/,
  /valeur\s*unitaire/,

  // Taux, pourcentages, remises
  /\btaux\b/,
  /\brate\b/,
  /pourcentage/,
  /percent/,
  /remise/,
  /discount/,
  /rabais/,
  /ristourne/,

  // Éléments calendaires / temporels
  /annee/,
  /\byear\b/,
  /\bmois\b/,
  /\bmonth\b/,
  /\bjour\b/,
  /\bday\b/,
  /date/,
  /exercice/,
  /semaine\s*n[°o]?/,

  // Identifiants, codes, références
  /numero/,
  /\bnum\b/,
  /\bn[°o](?=\s|$)/,
  /\bref\b/,
  /\bid\b/,
  /identifiant/,
  /\bcode\b/,
  /\bpostal\b/,
  /\bmatricule\b/,
  /\bsiret\b/,
  /\bsiren\b/,
  /\bean\b/,
  /\bsku\b/,
  /\btelephone\b/,
  /\btel\b/,
  /\bcompte\b/,

  // Statistiques, moyennes, scores, notes, rangs
  /\bmoyenne\b/,
  /\baverage\b/,
  /\bavg\b/,
  /\bmediane\b/,
  /\bmedian\b/,
  /\bscore\b/,
  /\bnote\b/,
  /\bevaluation\b/,
  /\brang\b/,
  /\brank\b/,
  /\bclassement\b/,
  /\bposition\b/,
  /\bcoefficient\b/,
  /\bcoeff\b/,
  /\bratio\b/,
  /\bmultiplicateur\b/,
  /\bpriorite\b/,
  /\bpriority\b/,
  /\bechelon\b/,
  /\bniveau\b/,
  /\blevel\b/,

  // Amortissement / VNC / Annuité (grandeurs comptables non additives)
  /\bvnc\b/,
  /\bannuite\b/,
  /valeur\s*nette\s*comptable/,
  /valeur\s*residuelle/,

  // Mesures non additives
  /\bage\b/,
  /(?:^|\s)duree(?!\s*(?:en\s*)?(?:heures?|hours?|min|h\b))/,
  /(?:^|\s)duration(?!\s*(?:in\s*)?(?:hours?|min|h\b))/,
  /temperature/,
  /degre/,
  /celsius/,
  /fahrenheit/,
  /poids\s*unitaire/,
];

// Exclusions « souples » : un "total": "sum" explicite peut les rétablir.
const EXCLUDED_HEADER_PATTERNS: RegExp[] = [
  /indice/,
  /\bindex\b/,
];

const AGGREGATE_FORMULA_PATTERN =
  /(COUNTIFS?|NB\.SI(\.ENS)?|SUMIFS?|SOMME\.SI(\.ENS)?|MAXIFS?|MAX\.SI(\.ENS)?|MINIFS?|MIN\.SI(\.ENS)?|AVERAGEIFS?|MOYENNE\.SI(\.ENS)?|SUMPRODUCT|SOMMEPROD)/;

const INCLUDED_HEADER_PATTERNS: RegExp[] = [
  // Totaux et montants financiers
  /total/,
  /sous[- ]?total/,
  /montant/,
  /amount/,
  /budget/,
  /vente/,
  /sales/,
  /chiffre\s*d.affaires/,
  /\bca\b/,
  /salaire/,
  /salary/,
  /prime/,
  /bonus/,
  /stock/,
  /inventaire/,
  /charge/,
  /frais/,
  /depense/,
  /expense/,
  /impot/,
  /taxe/,
  /\btva\b/,
  /valeur/,
  /\bval\b/,
  /solde/,
  /devis/,
  /acompte/,
  /avance/,
  /reste(?:\s*a\s*payer)?/,
  /net(?:\s*a\s*payer)?/,
  /\bbrut\b/,
  /\bmarge\b/,
  /benefice/,
  /gain/,
  /perte/,
  /profit/,
  /\bloss\b/,
  /resultat/,
  /revenu/,
  /revenue/,
  /encaissement/,
  /decaissement/,
  /recette/,
  /facturation/,
  /facture/,
  /cotisation/,
  /versement/,
  /paiement/,
  /reglement/,
  /echeance/,
  /loyer/,
  /honoraires/,
  /prestation/,
  /remuneration/,
  /indemnite/,
  /allocation/,
  /aide/,
  /subvention/,
  /dotation/,
  /provision/,
  /\bdon\b/,
  /dons\b/,
  /tresorerie/,
  /cash\s*flow/,
  /credit/,
  /debit/,
  /capital/,
  /principal/,
  /interet/,
  /epargne/,
  /remboursement/,

  // Quantités, volumes, mesures
  /quantite/,
  /quantity/,
  /\bqty\b/,
  /nombre/,
  /\bnb\b/,
  /count/,
  /volume/,
  /poids/,
  /surface/,
  /superficie/,
  /heures?/,
  /hours?/,
  /jours?/,
  /days?/,
  /\bkm\b/,
  /kilometrage/,
  /kilometres?/,
  /litres?/,
  /unites?/,
  /pieces?/,
  /articles?/,
  /colis/,
  /palettes?/,
  /effectif/,
  /personnes?/,
  /visiteurs?/,
  /clients?/,
  /dossiers?/,
  /commandes?/,
  /points?/,

  // Périodes (tableaux croisés ou colonnes mensuelles)
  /janvier/,
  /fevrier/,
  /mars/,
  /avril/,
  /\bmai\b/,
  /juin/,
  /juillet/,
  /aout/,
  /septembre/,
  /octobre/,
  /novembre/,
  /decembre/,
  /trimestre/,
  /\bq[1-4]\b/,
  /semaine/,
  /week/,
  /^(19|20)\d{2}$/,
];

export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[$€%]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isNumericType(type: TableColumn["type"]): boolean {
  return NUMERIC_TYPES.has(type);
}

function isCalculated(column: TableColumn): boolean {
  return Boolean(column.formula || column.formula_en);
}

function formulaText(column: TableColumn): string {
  return `${column.formula ?? ""} ${column.formula_en ?? ""}`.toUpperCase();
}

// Agrégation (NB.SI.ENS, COUNTIFS, MAX.SI.ENS...) évaluée pour chaque ligne.
function isAggregateColumn(column: TableColumn): boolean {
  return AGGREGATE_FORMULA_PATTERN.test(formulaText(column));
}

// Une formule calculée sans {row} (et sans ROW()) produit la même valeur sur
// toutes les lignes : la somme serait fausse (ex. SUMIFS sur des paramètres).
function isRowDependentFormula(column: TableColumn): boolean {
  const text = formulaText(column);
  return /\{ROW\}/.test(text) || /\bROW\s*\(/.test(text);
}

function isConstantCalculated(column: TableColumn): boolean {
  return isCalculated(column) && !isRowDependentFormula(column);
}

const CUMULATIVE_HEADER_PATTERN =
  /cumul|running|progressif|progressi|ytd|to date|depuis le debut/;

// Un cumul (ou une plage qui s'étend jusqu'à la ligne courante) ne se somme pas :
// seule la dernière valeur représente le total cumulé.
function isCumulativeColumn(column: TableColumn): boolean {
  if (CUMULATIVE_HEADER_PATTERN.test(normalizeHeader(column.header))) return true;
  return /\$?[A-Z]{1,3}\$?\d+:[A-Z]{1,3}\{ROW\}/.test(formulaText(column));
}

// Détecte si un en-tête "Prix" ou "Tarif" ou "Coût" est en réalité un prix unitaire relatif,
// car le tableau possède par ailleurs une colonne quantité et/ou une colonne montant total.
function isRelativeUnitPrice(column: TableColumn, schema: TableSchema): boolean {
  const header = normalizeHeader(column.header);
  if (!/\b(prix|tarif|cout|cost|price)\b/.test(header)) return false;

  // Si c'est explicitement un total ("prix total", "cout total"), ce n'est pas unitaire
  if (/total|montant|sous[- ]?total/.test(header)) return false;

  const otherColumns = schema.columns.filter((c) => c !== column);
  const hasQuantity = otherColumns.some((c) =>
    /\b(quantite|quantity|qty|nb|nombre|unites?|pieces?|volume)\b/.test(normalizeHeader(c.header))
  );
  const hasTotal = otherColumns.some((c) =>
    /\b(total|montant|amount|sous[- ]?total|ca|chiffre\s*d.affaires|valeur)\b/.test(normalizeHeader(c.header))
  );

  return hasQuantity || hasTotal;
}

export function shouldSumColumn(column: TableColumn, schema: TableSchema): boolean {
  if (!isNumericType(column.type)) return false;

  // Un taux / pourcentage ne s'additionne jamais, même si "sum" est demandé.
  if (column.type === "percentage") return false;

  // Un cumul / running total ne se somme jamais.
  if (isCumulativeColumn(column)) return false;

  // Colonne calculée constante : même valeur sur chaque ligne → jamais sommée.
  if (isConstantCalculated(column)) return false;

  // Année, date, n°/ID, prix unitaire, taux, moyenne, score, code... : jamais additifs.
  const header = normalizeHeader(column.header);
  if (NEVER_SUM_HEADER_PATTERNS.some((pattern) => pattern.test(header))) return false;

  // Prix unitaire relatif (ex: colonne "Prix" dans un tableau avec "Quantité" et "Total")
  if (isRelativeUnitPrice(column, schema)) return false;

  // Agrégation ligne par ligne (critère variable via {row}) : on ne la somme
  // que si le modèle le demande, ou automatiquement dans un tableau croisé
  // (une ligne = une dimension, une colonne = une période).
  if (isCalculated(column) && isAggregateColumn(column)) {
    if (column.total === "none") return false;
    if (column.total === "sum") return true;
    return Boolean(schema.row_total_column);
  }

  if (column.total === "none") return false;
  if (column.total === "sum") return true;

  if (EXCLUDED_HEADER_PATTERNS.some((pattern) => pattern.test(header))) return false;
  if (INCLUDED_HEADER_PATTERNS.some((pattern) => pattern.test(header))) return true;

  // Une colonne de type devise (currency) est par nature un montant monétaire.
  // Si elle n'a pas été exclue ci-dessus (pas un prix unitaire, pas une moyenne...), elle est sommable.
  if (column.type === "currency") return true;

  // Règle 5 : colonne calculée ligne par ligne, de type numérique (currency, integer, number).
  // C'est le résultat calculé de chaque ligne (ex: Total HT, Marge, Écart, Bénéfice).
  if (isCalculated(column) && isRowDependentFormula(column)) return true;

  // Tableau croisé (pivot) : les colonnes calculées de période sont sommables.
  if (schema.row_total_column && isCalculated(column)) return true;

  return false;
}

interface TotalLabelsRule {
  pattern: RegExp;
  label: string;
}

const LABEL_RULES: TotalLabelsRule[] = [
  { pattern: /facture|commande|devis|achat|invoice|order|quote/, label: "TOTAL" },
  { pattern: /budget|previsionnel|forecast/, label: "TOTAL GÉNÉRAL" },
  { pattern: /vente|sales|chiffre\s*d.affaires/, label: "TOTAL VENTES" },
  { pattern: /stock|inventaire|inventory/, label: "TOTAL STOCK" },
  { pattern: /tresorerie|cash\s*flow/, label: "TOTAL TRÉSORERIE" },
  { pattern: /echeancier|amortissement|remboursement|schedule/, label: "CUMUL" },
  { pattern: /effectif|salaire|paie|salary|payroll/, label: "TOTAL EFFECTIFS" },
  { pattern: /depense|charge|frais|expense/, label: "TOTAL CHARGES" },
  { pattern: /commission|prime|bonus/, label: "TOTAL COMMISSIONS" },
  { pattern: /heure|temps|pointage|activite/, label: "TOTAL HEURES" },
  { pattern: /projet|chantier|mission/, label: "TOTAL PROJET" },
  { pattern: /client|compte|solde/, label: "TOTAL SOLDES" },
  { pattern: /cotisation|contribution/, label: "TOTAL COTISATIONS" },
  { pattern: /loyer|immobilier|bail/, label: "TOTAL LOYERS" },
  { pattern: /don|subvention|aide/, label: "TOTAL DONS" },
];

export function resolveTotalLabel(schema: TableSchema): string {
  if (schema.total_row_label && schema.total_row_label.trim()) {
    return schema.total_row_label.trim();
  }

  const context = normalizeHeader(
    [schema.title, ...schema.columns.map((column) => column.header)].join(" ")
  );
  const rule = LABEL_RULES.find((candidate) => candidate.pattern.test(context));
  return rule ? rule.label : "TOTAUX";
}

export interface ResolvedTotals {
  showTotalRow: boolean;
  label: string;
  summable: boolean[];
  // Colonne constante : afficher la valeur une seule fois (première ligne).
  displayOnce: boolean[];
  // Colonne cumulée : afficher la dernière valeur (le cumul final).
  displayLast: boolean[];
}

// Tableaux où une ligne de totaux est par nature inappropriée (sauf si explicitement activée avec total_row: true).
const NO_TOTAL_TABLE_PATTERNS = [
  /amortissement|amortization|vnc\b/,
  /bareme|grille\s*tarifaire|catalogue/,
  /releve\s*de\s*notes?|bulletin\s*scolaire|notes?\s*des?\s*eleves/,
  /classement|ranking|top\s*\d+|palmares/,
  /planning|calendrier|agenda/,
  /trombinoscope|annuaire|coordonnees/,
];

const COMMERCIAL_INVOICE_PATTERNS = [
  /facture|commande|devis|achat|bon\s*de\s*commande|invoice|order|quote/,
];

export function resolveTotals(schema: TableSchema): ResolvedTotals {
  const summable = schema.columns.map((column) => shouldSumColumn(column, schema));
  const displayOnce = schema.columns.map(
    (column) =>
      isNumericType(column.type) &&
      !isCumulativeColumn(column) &&
      isConstantCalculated(column)
  );
  const displayLast = schema.columns.map(
    (column) => isNumericType(column.type) && isCumulativeColumn(column)
  );
  const hasSummableColumn = summable.some(Boolean);
  const hasDisplayColumn = displayOnce.some(Boolean) || displayLast.some(Boolean);
  const hasAnyTotalValue = hasSummableColumn || hasDisplayColumn;
  const sampleRows = schema.sample_rows ?? 3;

  const normalizedTitle = normalizeHeader(schema.title || "");
  const isCommercialInvoice = COMMERCIAL_INVOICE_PATTERNS.some((p) => p.test(normalizedTitle));
  const isNoTotalContext = NO_TOTAL_TABLE_PATTERNS.some((p) => p.test(normalizedTitle));

  let showTotalRow: boolean;

  if (schema.total_row === true) {
    // Explicitement demandé : afficher dès qu'au moins une valeur de total peut être affichée.
    showTotalRow = hasAnyTotalValue;
  } else if (schema.total_row === false) {
    // Explicitement désactivé :
    // Pour une commande / facture / devis commercial qui contient des montants sommables,
    // le total général est essentiel (sécurité contre une omission accidentelle de l'IA).
    // Pour TOUT autre tableau (classements, amortissements, barèmes, notes, annuaires...),
    // la désactivation explicite est strictement respectée !
    if (isCommercialInvoice && hasSummableColumn) {
      showTotalRow = true;
    } else {
      showTotalRow = false;
    }
  } else {
    // Mode "auto" (par défaut) :
    // 1. Tableaux hors totaux par nature (amortissement, barème, classement, notes...) -> pas de totaux.
    // 2. Tableaux standards -> afficher si colonnes sommables et au moins 2 lignes d'exemple.
    if (isNoTotalContext) {
      showTotalRow = false;
    } else {
      showTotalRow = hasSummableColumn && sampleRows >= 2;
    }
  }

  return {
    showTotalRow,
    label: resolveTotalLabel(schema),
    summable,
    displayOnce,
    displayLast,
  };
}
