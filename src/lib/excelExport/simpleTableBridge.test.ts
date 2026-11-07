import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { convertSimpleTableToSchema } from "./simpleTableBridge";
import { buildComplexWorkbook } from "./complexExcelBuilder";

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
    expect(schema?.total_row).toBe("auto");
    // "TVA (20%)" sans mot monétaire explicite reste un taux (le montant serait "Montant TVA").
    expect(schema?.columns[1].type).toBe("percentage");
    expect(schema?.columns[1].total).toBe("none");
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

  it("devrait renvoyer null si aucun tableau Markdown n'est présent dans la réponse", () => {
    const response = `
Voici votre formule :
\`\`\`excel
=A1 + B1
\`\`\`
Pas de tableau ici.
`;
    const schema = convertSimpleTableToSchema(response, "Sans tableau");
    expect(schema).toBeNull();
  });

  it("devrait typer 'Montant TVA' en currency et 'Taux TVA' en percentage (pas l'inverse)", () => {
    const response = `
Voici votre formule de calcul de TVA :
\`\`\`excel
=C10*D10
\`\`\`

| Ligne | Montant HT | Taux TVA | Montant TVA |
| :--- | :--- | :--- | :--- |
| Ligne 1 | 100 | 20% | 20 |
| Ligne 2 | 250 | 20% | 50 |
| Ligne 3 | 1500 | 20% | 300 |

<!-- FORMULA_EN: =C10*D10 -->
`;
    const schema = convertSimpleTableToSchema(response, "Calculer la TVA à 20%");
    expect(schema).not.toBeNull();

    // "Montant HT" → currency (contient "montant")
    expect(schema?.columns[0].type).toBe("currency");

    // "Taux TVA" → percentage (contient "taux", priorité sur "tva")
    expect(schema?.columns[1].type).toBe("percentage");

    // "Montant TVA" → currency (contient "montant", PAS percentage malgré "tva")
    expect(schema?.columns[2].type).toBe("currency");
    // La colonne de résultat monétaire est sommable.
    expect(schema?.columns[2].total).toBe("sum");
  });
  it("devrait typer 'Montant TVA (20%)' en currency et non en percentage", () => {
    const response = `
Calcul de la TVA :
\`\`\`excel
=C10 * $C$5
\`\`\`
<!-- PARAM C5 = 0.20 -->

| Ligne | Montant HT (€) | Taux TVA | Montant TVA (20%) (€) |
| :--- | :--- | :--- | :--- |
| Ligne 1 | 100,00 | 20,00 % | 20,00 |
| Ligne 2 | 250,50 | 20,00 % | 50,10 |
| Ligne 3 | 5 000,00 | 20,00 % | 1 000,00 |

<!-- FORMULA_EN: =C10 * $C$5 -->
`;
    const schema = convertSimpleTableToSchema(response, "Calculer la TVA à 20% d'un montant HT");
    expect(schema).not.toBeNull();

    // "Montant HT (€)" → currency
    expect(schema?.columns[0].type).toBe("currency");
    // "Taux TVA" → percentage (contient "taux")
    expect(schema?.columns[1].type).toBe("percentage");
    // "Montant TVA (20%) (€)" → currency malgré le "%" dans le libellé
    expect(schema?.columns[2].type).toBe("currency");
    expect(schema?.columns[2].total).toBe("sum");
  });
});

describe("simpleTableBridge – colonnes de date", () => {
  it("devrait typer 'Date de l'opération' en date (le mot 'opération' contient 'ratio')", () => {
    const response = `
Déterminer l'année fiscale d'une date :
\`\`\`excel
=ANNEE(C10)+SI(MOIS(C10)>$C$5;1;0)
\`\`\`
<!-- PARAM C5 = 6 -->

| Ligne | Date de l'opération | Année fiscale |
| :--- | :--- | :--- |
| Ligne 1 | 15/03/2023 | 2023 |
| Ligne 2 | 30/06/2023 | 2023 |
| Ligne 3 | 01/07/2023 | 2024 |

<!-- FORMULA_EN: =YEAR(C10)+IF(MONTH(C10)>$C$5,1,0) -->
`;
    const schema = convertSimpleTableToSchema(response, "Année fiscale");
    expect(schema).not.toBeNull();

    // "Date de l'opération" doit rester une date : le sous-mot "ratio" dans
    // "opération" ne doit pas la faire passer en percentage.
    expect(schema?.columns[0].type).toBe("date");
    expect(schema?.columns[0].formula).toBeNull();

    // Vérification de bout en bout : la cellule Excel doit contenir une vraie
    // date (et non 0 avec un format pourcentage).
    const wb = new ExcelJS.Workbook();
    const { workbook } = buildComplexWorkbook(wb, schema!, response, "Année fiscale", "libreoffice-fr");
    const sheet = workbook.getWorksheet("Tableau Interactif")!;
    const dateCell = sheet.getCell("C10");
    expect(dateCell.value).toBeInstanceOf(Date);
    expect((dateCell.value as Date).toISOString().slice(0, 10)).toBe("2023-03-15");
  });
});

describe("simpleTableBridge – fonctions dynamiques (spill)", () => {
  it("devrait exporter FILTRE en _xlfn._xlws.FILTER une seule fois (pas de #NOM ? / #SPILL!)", () => {
    const response = `
Filtrer les factures impayées :
\`\`\`excel
=FILTRE(C10:C14;D10:D14="Impayée")
\`\`\`

| Ligne | N° Facture | Statut | Factures impayées |
| :--- | :--- | :--- | :--- |
| Ligne 1 | FAC-2024-01 | Impayée | FAC-2024-01 |
| Ligne 2 | FAC-2024-02 | Payée | FAC-2024-03 |
| Ligne 3 | FAC-2024-03 | Impayée | |
| Ligne 4 | FAC-2024-04 | Payée | |
| Ligne 5 | FAC-2024-05 | Impayée | |

<!-- FORMULA_EN: =FILTER(C10:C14,D10:D14="Impayée") -->
`;
    const schema = convertSimpleTableToSchema(response, "Filtrer les factures impayées");
    expect(schema).not.toBeNull();

    const wb = new ExcelJS.Workbook();
    const { workbook } = buildComplexWorkbook(wb, schema!, response, "Filtrer les factures impayées", "excel-fr");
    const sheet = workbook.getWorksheet("Tableau Interactif")!;

    // data_start_row = 4 (pas de paramètres) → 1ère ligne de données = 5
    expect(sheet.getCell("E5").value).toEqual({
      formula: '_xlfn._xlws.FILTER(C5:C14,D5:D14="Impayée")',
    });
    // Les lignes suivantes doivent rester vides pour laisser le spill opérer.
    expect(sheet.getCell("E6").value).toBeNull();
    expect(sheet.getCell("E7").value).toBeNull();
  });
});

describe("simpleTableBridge – heures / quantités avec % dans l'en-tête", () => {
  it("devrait typer 'Heures sup (à 25%)' en number et non en percentage", () => {
    const response = `
Calcul des heures supplémentaires :
\`\`\`excel
=SI(C10>$C$5;C10-$C$5;0)
\`\`\`
<!-- PARAM C5 = 35 -->

| Ligne | Heures travaillées | Heures normales | Heures sup (à 25%) |
| :--- | :--- | :--- | :--- |
| Ligne 1 | 39 | 35 | 4 |
| Ligne 2 | 35 | 35 | 0 |
| Ligne 3 | 42,5 | 35 | 7,5 |

<!-- FORMULA_EN: =IF(C10>$C$5,C10-$C$5,0) -->
`;
    const schema = convertSimpleTableToSchema(response, "Heures supplémentaires majorées à 25%");
    expect(schema).not.toBeNull();

    // "Heures travaillées" → number (contient "heure")
    expect(schema?.columns[0].type).toBe("number");

    // "Heures normales" → number (contient "heure")
    expect(schema?.columns[1].type).toBe("number");

    // "Heures sup (à 25%)" → number malgré le "%" dans le libellé
    expect(schema?.columns[2].type).toBe("number");

    // Les heures sup sont sommables
    expect(schema?.columns[2].total).toBe("sum");
  });

  it("devrait typer 'Quantité rebut (5%)' en number et non en percentage", () => {
    const response = `
Quantités rebut :
\`\`\`excel
=C10*0.05
\`\`\`

| Ligne | Quantité produite | Quantité rebut (5%) |
| :--- | :--- | :--- |
| Ligne 1 | 100 | 5 |
| Ligne 2 | 200 | 10 |

<!-- FORMULA_EN: =C10*0.05 -->
`;
    const schema = convertSimpleTableToSchema(response, "Calcul rebut");
    expect(schema).not.toBeNull();

    // "Quantité rebut (5%)" → number malgré le "%"
    expect(schema?.columns[1].type).toBe("number");
    expect(schema?.columns[1].total).toBe("sum");
  });
});
