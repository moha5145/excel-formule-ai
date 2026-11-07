import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { buildComplexWorkbook } from "./excelExport/complexExcelBuilder";
import { patchWorkbookForceCalc } from "./excelExport";
import type { TableSchema } from "./excelExport/schemaParser";

describe("packaging des tableaux dynamiques (spill)", () => {
  it("ajoute cm=1, t=array et metadata.xml pour une formule FILTER", async () => {
    const schema: TableSchema = {
      type: "complex_table",
      title: "Factures impayées",
      parameters: [],
      columns: [
        { header: "N° Facture", type: "text", formula: null, formula_en: null },
        { header: "Statut", type: "text", formula: null, formula_en: null },
        {
          header: "Factures impayées",
          type: "text",
          formula: '=FILTRE(C{row}:C14;D{row}:D14="Impayée")',
          formula_en: '=FILTER(C{row}:C14,D{row}:D14="Impayée")',
          total: "none",
        },
      ],
      data_start_row: 5,
      sample_rows: 5,
      total_row: false,
    };

    const response = `
| Ligne | N° Facture | Statut |
|---|---|---|
| Ligne 1 | FAC-2024-01 | Impayée |
| Ligne 2 | FAC-2024-02 | Payée |
| Ligne 3 | FAC-2024-03 | Impayée |
| Ligne 4 | FAC-2024-04 | Payée |
| Ligne 5 | FAC-2024-05 | Impayée |
`;

    const wb = new ExcelJS.Workbook();
    const { workbook } = buildComplexWorkbook(wb, schema, response, "test", "excel-fr");
    const blob = await patchWorkbookForceCalc(workbook);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());

    const sheetXml = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    expect(sheetXml).toMatch(/<c r="E5"[^>]*cm="1"/);
    expect(sheetXml).toMatch(/<f[^>]*ref="E5:E7"[^>]*>/);
    expect(sheetXml).toMatch(/<f[^>]*t="array"[^>]*>/);
    expect(sheetXml).toContain("_xlfn._xlws.FILTER");

    const metadata = await zip.file("xl/metadata.xml")!.async("string");
    expect(metadata).toContain("XLDAPR");
    expect(metadata).toContain("dynamicArrayProperties");

    const contentTypes = await zip.file("[Content_Types].xml")!.async("string");
    expect(contentTypes).toContain("/xl/metadata.xml");

    const rels = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
    expect(rels).toContain("relationships/sheetMetadata");
  });
});
