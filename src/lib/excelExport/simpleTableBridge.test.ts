import { describe, it, expect } from "vitest";
import { convertSimpleTableToSchema } from "./simpleTableBridge";

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
  });
});
