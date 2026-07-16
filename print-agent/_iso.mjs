import PDFDocument from 'pdfkit';
import { createWriteStream } from 'node:fs';
const OUT='/private/tmp/claude-501/-Users-vfore-Desktop-churchCoffeePay/4582ead4-795d-4b82-a5f3-df1e50bca5f7/scratchpad';
const note='! Extra hot, light foam, no whip please';
for (const [tag, mod] of [['mods4','Large\nOat Milk\nVanilla, Caramel\nExtra Shot'],['mods3','Large, Oat Milk\nVanilla, Caramel\nExtra Shot']]) {
  const doc=new PDFDocument({size:[141.7,226.77],margin:0});
  doc.pipe(createWriteStream(`${OUT}/seq_${tag}.pdf`));
  doc.font('Helvetica').fontSize(8.68).fillColor('#000');
  doc.text(mod, 5.67, 55, { width:121.89, height:8.68*6, ellipsis:true });
  const y=doc.y+2;
  doc.font('Helvetica-Bold').fontSize(8.68);
  doc.text(note, 5.67, y, { width:121.89, height:20.66, ellipsis:true });
  doc.end();
}
setTimeout(()=>{},300);
