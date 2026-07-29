const ExcelJS = require('exceljs');
async function run() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.getCell('B2').value = 'Apple';
  ws.getCell('B3').value = 'Banana';
  ws.getCell('D4').value = { formula: 'OFFSET(B2, 0, 0, COUNTA(B2:B100), 1)' };
  ws.getCell('E4').value = { formula: 'OFFSET(B2, 0, 0, 2, 1)' };
  await wb.xlsx.writeFile('test_offset.xlsx');
  console.log('Saved test_offset.xlsx');
}
run();
