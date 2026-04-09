const PDFDocument = require('pdfkit');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

function generateInvoicePDF(orderData) {
  return new Promise((resolve, reject) => {

    const doc = new PDFDocument({
      margin:        0,
      autoFirstPage: false,
      bufferPages:   true,
      size:          'A4'
    });

    const filename   = `invoice_${orderData.orderId}.pdf`;
    const outputPath = path.join(os.tmpdir(), filename);
    const stream     = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    // ═══════════════════════════════════════════
    //  PAGE CONSTANTS
    // ═══════════════════════════════════════════
    const PAGE_W = 595;
    const PAGE_H = 842;
    const ML     = 28;       // left margin
    const MR     = 28;       // right margin
    const CW     = PAGE_W - ML - MR;  // 539

    // ═══════════════════════════════════════════
    //  ITEMS
    // ═══════════════════════════════════════════
    const items = orderData.items && orderData.items.length > 0
      ? orderData.items
      : [{
          name:      orderData.description || 'Product',
          qty:       1,
          unitPrice: orderData.amount / 100,
          total:     orderData.amount / 100
        }];

    // ═══════════════════════════════════════════
    //  COLUMN X POSITIONS  (matching image exactly)
    //  Sno | Name of Product | Item Col | Qty | Rate | MRP | Disc | Disc.Rate | Amount
    // ═══════════════════════════════════════════
    const C = {
      sno:      { x: ML,        w: 28  },
      name:     { x: ML+28,     w: 160 },
      itemcol:  { x: ML+188,    w: 52  },
      qty:      { x: ML+240,    w: 36  },
      rate:     { x: ML+276,    w: 52  },
      mrp:      { x: ML+328,    w: 52  },
      disc:     { x: ML+380,    w: 40  },
      discrate: { x: ML+420,    w: 52  },
      amount:   { x: ML+472,    w: CW-472 }
    };
    const TABLE_RIGHT = ML + CW;

    // ═══════════════════════════════════════════
    //  CALCULATIONS
    // ═══════════════════════════════════════════
    const grossAmount = items.reduce((s, it) => s + Number(it.total || 0), 0);
    const discount2   = Number(orderData.discount2 || 0);
    const netAmount   = grossAmount - discount2;

    function amountInWords(n) {
      const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
                    'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen',
                    'Seventeen','Eighteen','Nineteen'];
      const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
      const num  = Math.floor(n);
      if (num === 0) return 'Zero';
      if (num < 20)  return ones[num];
      if (num < 100) return tens[Math.floor(num/10)] + (num%10 ? ' '+ones[num%10] : '');
      if (num < 1000) return ones[Math.floor(num/100)]+' Hundred'+(num%100 ? ' '+amountInWords(num%100) : '');
      if (num < 100000) return amountInWords(Math.floor(num/1000))+' Thousand'+(num%1000 ? ' '+amountInWords(num%1000) : '');
      if (num < 10000000) return amountInWords(Math.floor(num/100000))+' Lakh'+(num%100000 ? ' '+amountInWords(num%100000) : '');
      return amountInWords(Math.floor(num/10000000))+' Crore'+(num%10000000 ? ' '+amountInWords(num%10000000) : '');
    }
    const wordsStr = amountInWords(netAmount) + ' Only';

    // ═══════════════════════════════════════════
    //  DRAWING HELPERS
    // ═══════════════════════════════════════════
    function hline(x1, x2, y, lw) {
      doc.moveTo(x1, y).lineTo(x2, y).lineWidth(lw || 0.5).strokeColor('#000').stroke();
    }
    function vline(x, y1, y2, lw) {
      doc.moveTo(x, y1).lineTo(x, y2).lineWidth(lw || 0.5).strokeColor('#000').stroke();
    }
    function box(x, y, w, h, lw) {
      doc.rect(x, y, w, h).lineWidth(lw || 0.5).strokeColor('#000').stroke();
    }
    // Draw all column vertical dividers for a row band
    function colDividers(y1, y2) {
      Object.values(C).forEach(c => vline(c.x, y1, y2, 0.4));
      vline(TABLE_RIGHT, y1, y2, 0.5);
    }
    // Cell text helper
    function cell(text, col, y, opts) {
      const align = opts?.align || 'center';
      const pad   = opts?.pad   || 3;
      doc.text(String(text || ''), col.x + pad, y, { width: col.w - pad*2, align });
    }

    // ═══════════════════════════════════════════
    //  PAGING
    // ═══════════════════════════════════════════
    const ROW_H      = 16;
    const HDR_H      = 108;   // header block height
    const BILLEDTO_H = 58;
    const TBLHDR_H   = 16;
    const SUMMARY_H  = 130;
    const FOOTER_H   = 45;
    const AVAIL_P1   = PAGE_H - HDR_H - BILLEDTO_H - TBLHDR_H - SUMMARY_H - FOOTER_H - 10;
    const AVAIL_PN   = PAGE_H - 40 - TBLHDR_H - SUMMARY_H - FOOTER_H - 10;
    const ROWS_P1    = Math.floor(AVAIL_P1 / ROW_H);
    const ROWS_PN    = Math.floor(AVAIL_PN / ROW_H);

    const pages = [];
    let rem = [...items];
    pages.push({ items: rem.splice(0, ROWS_P1), isFirst: true });
    while (rem.length > 0) pages.push({ items: rem.splice(0, ROWS_PN), isFirst: false });
    const totalPages = pages.length;

    // ═══════════════════════════════════════════
    //  RENDER PAGES
    // ═══════════════════════════════════════════
    pages.forEach((pageData, pgIndex) => {
      doc.addPage({ size: 'A4', margin: 0 });

      const isFirst   = pageData.isFirst;
      const isLast    = pgIndex === pages.length - 1;
      const pageNum   = pgIndex + 1;
      const pageItems = pageData.items;

      let y = 18;

      // ── Outer border ───────────────────────
      box(ML, y, CW, PAGE_H - y - 18, 0.8);

      if (isFirst) {
        // ════════════════════════════════════
        //  COMPANY HEADER
        // ════════════════════════════════════
        doc.fillColor('#000').fontSize(14).font('Helvetica-Bold')
           .text('PAANAL FARMS F2C', ML, y + 7, { width: CW, align: 'center' });

        doc.fontSize(8).font('Helvetica')
           .text('No. 55/16 VOC Street,New Lakshmipuram', ML, y + 24, { width: CW, align: 'center' })
           .text('Kolathur Chennai - 600099',              ML, y + 33, { width: CW, align: 'center' })
           .text('GSTIN : 33AAYFP3257A1Z7',               ML, y + 42, { width: CW, align: 'center' })
           .text(`Phone No : ${orderData.phone || ''}`, ML + 5, y + 55,{ width: CW, align: 'center' });

        // Left: Phone + State
        doc.fontSize(8).font('Helvetica')
           
           .text('State : Tamil Nadu',                  ML + 5, y + 65);

        // Center: BILL OF SUPPLY
        doc.fontSize(9).font('Helvetica-Bold')
           .text('BILL  OF  SUPPLY', ML, y + 60, { width: CW, align: 'center' });

        // Right: Bill No + Bill Date
        const billDate = new Date().toLocaleDateString('en-IN', {
          day: '2-digit', month: '2-digit', year: '2-digit'
        }) + ', ' + new Date().toLocaleTimeString('en-IN', {
          hour: '2-digit', minute: '2-digit', hour12: true
        });
        const rightX = ML + CW - 200;
        doc.fontSize(8).font('Helvetica')
           .text(`Bill No  :  CR${orderData.orderId}`, rightX, y + 55, { width: 195 })
           .text(`Bill Date : ${billDate}`,             rightX, y + 65, { width: 195 });

        y += HDR_H - 2;
        hline(ML, ML + CW, y, 0.5);

        // ════════════════════════════════════
        //  BILLED TO SECTION
        // ════════════════════════════════════
        const btY = y;
        y += 1;

        // "Billed to:" header (full width)
        doc.fontSize(8).font('Helvetica-Bold')
           .text('Billed to:', ML + 5, y + 3);

        hline(ML, ML + CW, y + 14, 0.4);

        // Left col: customer details
        const detY = y + 17;
        doc.fontSize(8).font('Helvetica')
           .text('Name',    ML + 5, detY)
           .text(`:  ${orderData.customerName || ''}`, ML + 55, detY)
           .text('Address', ML + 5, detY + 11)
           .text(':  ',     ML + 55, detY + 11)
           .text('Phone',   ML + 5, detY + 22)
           .text(`:  ${orderData.phone || ''}`, ML + 55, detY + 22)
           .text('GSTIN',   ML + 5, detY + 33)
           .text(':  ',     ML + 55, detY + 33);

        // Right col: Additional Info box
        const aiX = ML + CW / 2;
        const aiW = CW / 2;
        box(aiX, btY + 1, aiW, 14, 0.5);
        doc.fontSize(8).font('Helvetica-Bold')
           .text('Additional Info', aiX + 5, btY + 4, { width: aiW - 10 });

        // Invoice type row below Additional Info
        hline(aiX, ML + CW, btY + 15, 0.4);
        doc.fontSize(8).font('Helvetica')
           .text('Invoice type', aiX + 5, detY + 3)
           .text(':  Credit Bill', aiX + 70, detY + 3);

        // vertical divider between left/right in billed to
        vline(aiX, btY + 1, btY + BILLEDTO_H, 0.5);

        y = btY + BILLEDTO_H;
        hline(ML, ML + CW, y, 0.5);

      } else {
        // Continuation
        doc.fontSize(9).font('Helvetica-Bold')
           .text('PAANAL FARMS F2C', ML, y + 5, { width: CW, align: 'center' });
        doc.fontSize(7.5).font('Helvetica')
           .text(`(Continued — Page ${pageNum} of ${totalPages})`, ML, y + 17, { width: CW, align: 'center' });
        y += 32;
        hline(ML, ML + CW, y, 0.5);
      }

      // ════════════════════════════════════
      //  TABLE HEADER ROW
      // ════════════════════════════════════
      const tblHdrY = y;
      colDividers(tblHdrY, tblHdrY + TBLHDR_H);
      hline(ML, TABLE_RIGHT, tblHdrY + TBLHDR_H, 0.5);

      const thY = tblHdrY + 3;
      doc.fillColor('#000').fontSize(7.5).font('Helvetica-Bold');
      cell('Sno',           C.sno,      thY);
      cell('Name of Product', C.name,   thY, { align: 'left', pad: 4 });
      cell('Item Col',      C.itemcol,  thY);
      cell('Qty',           C.qty,      thY);
      cell('Rate',          C.rate,     thY);
      cell('MRP',           C.mrp,      thY);
      cell('Disc',          C.disc,     thY);
      cell('Disc.Rate',     C.discrate, thY);
      cell('Amount',        C.amount,   thY);

      y = tblHdrY + TBLHDR_H;

      // ════════════════════════════════════
      //  TABLE ROWS
      // ════════════════════════════════════
      const globalStart = pages.slice(0, pgIndex).reduce((s, p) => s + p.items.length, 0);

      pageItems.forEach((item, i) => {
        const gi   = globalStart + i;
        const rowY = y + i * ROW_H;
        const txY  = rowY + 4;

        colDividers(rowY, rowY + ROW_H);
        hline(ML, TABLE_RIGHT, rowY + ROW_H, 0.4);

        const rate     = Number(item.unitPrice || item.rate || 0);
        const mrp      = Number(item.mrp       || rate);
        const disc     = Number(item.disc      || 0);
        const discRate = Number(item.discRate  || 0);
        const amount   = Number(item.total     || 0);

        doc.fillColor('#000').fontSize(7.5).font('Helvetica');
        cell(gi + 1,                  C.sno,      txY);
        cell(item.name || '',         C.name,     txY, { align: 'left', pad: 4 });
        cell(item.itemcol || '',      C.itemcol,  txY);
        cell(item.qty,                C.qty,      txY);
        cell(rate.toFixed(2),         C.rate,     txY);
        cell(mrp.toFixed(2),          C.mrp,      txY);
        cell(disc.toFixed(2),         C.disc,     txY);
        cell(discRate.toFixed(2),     C.discrate, txY);
        cell(amount.toFixed(2),       C.amount,   txY);
      });

      y += pageItems.length * ROW_H;

      // ════════════════════════════════════
      //  SUMMARY — last page only
      // ════════════════════════════════════
      if (isLast) {
        hline(ML, TABLE_RIGHT, y, 0.5);

        const sumStartY = y + 5;
        const splitX    = ML + CW * 0.53;
        const sumBoxX   = splitX;
        const sumBoxW   = TABLE_RIGHT - splitX;

        // Amount in Words
        doc.fontSize(8).font('Helvetica-Bold')
           .text('Amount in Words', ML + 5, sumStartY);
        doc.fontSize(8).font('Helvetica')
           .text(wordsStr, ML + 5, sumStartY + 13, { width: splitX - ML - 10 });

        // Tax note at bottom of left
        doc.fontSize(7).font('Helvetica')
           .text('"composition taxable: person not eligible to collect tax on "',
                 ML + 5, sumStartY + 75, { width: splitX - ML - 10 });

        // Summary box right side
        const sRows = [
          { label: 'Gross Amount',     value: grossAmount.toFixed(2), bold: false },
          { label: 'Transport',        value: '0.00',                 bold: false },
          { label: 'Discount 1',       value: '0',                    bold: false },
          { label: 'Discount 2',       value: discount2 ? discount2.toFixed(0) : '0', bold: false },
          { label: 'Total Dis Amount', value: discount2 ? discount2.toFixed(0) : '0', bold: false },
          { label: 'Rounded Off',      value: '0.00',                 bold: false },
          { label: 'Net Amount',       value: netAmount.toFixed(2),   bold: true  },
        ];

        const sRowH = 15;
        const boxH  = sRows.length * sRowH + 2;
        box(sumBoxX, sumStartY - 2, sumBoxW, boxH, 0.5);

        sRows.forEach((row, ri) => {
          const ry = sumStartY - 2 + ri * sRowH;
          if (ri > 0) hline(sumBoxX, sumBoxX + sumBoxW, ry, 0.3);

          const font = row.bold ? 'Helvetica-Bold' : 'Helvetica';
          doc.fontSize(row.bold ? 8.5 : 8).font(font).fillColor('#000')
             .text(row.label, sumBoxX + 5, ry + 4, { width: sumBoxW * 0.55 })
             .text(':', sumBoxX + sumBoxW * 0.58, ry + 4)
             .text(row.value, sumBoxX + sumBoxW * 0.62, ry + 4,
                   { width: sumBoxW * 0.35, align: 'right' });
        });

        // Vertical divider between left/right summary
        vline(splitX, y, y + boxH + 7, 0.5);

        // Authorized Signatory
        const sigY = PAGE_H - 45;
        hline(ML, TABLE_RIGHT, sigY, 0.5);
        doc.fontSize(8).font('Helvetica-Bold')
           .text('Authorized Signatory', ML + CW - 150, sigY + 10);

      } else {
        doc.fillColor('#888').fontSize(7).font('Helvetica')
           .text('Continued on next page...', ML, y + 5, { width: CW, align: 'right' });
      }
    });

    doc.end();
    stream.on('finish', () => {
      console.log(`✅ PDF ready: ${outputPath}`);
      resolve(outputPath);
    });
    stream.on('error', reject);
  });
}

module.exports = { generateInvoicePDF };