const ExcelJS = require('exceljs');
async function run() {
  const wb = new ExcelJS.Workbook();
  const ws1 = wb.addWorksheet('Sheet1');
  const ws2 = wb.addWorksheet('RefProduits');
  
  ws2.getCell('B2').value = 'Clavier';
  ws2.getCell('C2').value = 25;
  ws2.getCell('B3').value = 'Souris';
  ws2.getCell('C3').value = 15;
  
  ws1.getCell('C10').value = 'Clavier';
  
  // Normal INDEX MATCH
  ws1.getCell('D10').value = { formula: 'INDEX(RefProduits!$C$2:$C$6, MATCH(C10, RefProduits!$B$2:$B$6, 0))' };
  
  await wb.xlsx.writeFile('test_index.xlsx');
  console.log('Saved test_index.xlsx');
}
run();
