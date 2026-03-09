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
      size:          'LETTER'
    });

    const filename   = `invoice_${orderData.orderId}.pdf`;
    const outputPath = path.join(os.tmpdir(), filename);
    const stream     = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    // ═══════════════════════════════════════════
    //  PAGE LAYOUT CONSTANTS
    // ═══════════════════════════════════════════
    const PAGE_W        = 612;
    const PAGE_H        = 792;
    const MARGIN        = 30;
    const HEADER_H      = 55;   // top green bar
    const FROM_BILL_H   = 70;   // FROM / BILL TO section
    const TABLE_HDR_H   = 22;   // column header row
    const FOOTER_H      = 42;   // bottom green bar
    const SUMMARY_H     = 145;  // GST + total + payment + thank you
    const CONTINUED_H   = 22;   // "continued" label on page 2+
    const GAP           = 10;   // small spacing between sections
    const MIN_ROW_H     = 14;   // minimum row height (very small font)
    const MAX_ROW_H     = 24;   // maximum row height (comfortable reading)

    const items = orderData.items && orderData.items.length > 0
      ? orderData.items
      : [{
          name:      orderData.description || 'Product',
          qty:       1,
          unitPrice: orderData.amount / 100,
          total:     orderData.amount / 100
        }];

    // ═══════════════════════════════════════════
    //  CALCULATE HOW MANY ITEMS FIT PER PAGE
    // ═══════════════════════════════════════════

    // Space available for rows on page 1
    const usedP1    = HEADER_H + GAP + FROM_BILL_H + GAP + TABLE_HDR_H + SUMMARY_H + FOOTER_H + GAP;
    const availP1   = PAGE_H - usedP1;

    // Space available for rows on page 2+
    const usedP2    = HEADER_H + GAP + CONTINUED_H + TABLE_HDR_H + SUMMARY_H + FOOTER_H + GAP;
    const availP2   = PAGE_H - usedP2;

    // Calculate row height that fills page 1 perfectly
    function getRowHeight(numRows, availSpace) {
      const rh = availSpace / numRows;
      // clamp between min and max
      return Math.min(MAX_ROW_H, Math.max(MIN_ROW_H, rh));
    }

    // Calculate how many rows fit in available space at a given row height
    function rowsFit(availSpace, rowH) {
      return Math.floor(availSpace / rowH);
    }

    // ── Split items into pages ────────────────
    // Try fitting all items on page 1 first
    const rhP1All = getRowHeight(items.length, availP1);
    const pages   = [];

    if (rhP1All >= MIN_ROW_H && items.length <= rowsFit(availP1, MIN_ROW_H)) {
      // All items fit on page 1
      pages.push({ items: items, isFirst: true });
    } else {
      // Need multiple pages
      let remaining = [...items];
      let pageNum   = 0;

      while (remaining.length > 0) {
        const availSpace = pageNum === 0 ? availP1 : availP2;
        const rh         = MAX_ROW_H;
        const maxRows    = rowsFit(availSpace, rh);
        const chunk      = remaining.splice(0, maxRows);
        pages.push({ items: chunk, isFirst: pageNum === 0 });
        pageNum++;
      }
    }

    const totalPages = pages.length;

    // ═══════════════════════════════════════════
    //  GST CALCULATIONS
    // ═══════════════════════════════════════════
    const baseAmount = orderData.amount / 100;
    const cgst       = (baseAmount * 0.025).toFixed(2);
    const sgst       = (baseAmount * 0.025).toFixed(2);
    const grandTotal = (baseAmount + parseFloat(cgst) + parseFloat(sgst)).toFixed(2);

    // ═══════════════════════════════════════════
    //  HELPER: Draw Green Header Bar
    // ═══════════════════════════════════════════
    function drawHeader() {
      const top = PAGE_H - HEADER_H;

      // Green bar
      doc.rect(0, top, PAGE_W, HEADER_H).fill('#2e7d32');

      // Business name
      doc.fillColor('white').fontSize(17).font('Helvetica-Bold')
         .text('KITCHEN FRESH', 0, top + 10, { align: 'center', width: PAGE_W });

      doc.fillColor('#c8e6c9').fontSize(8.5).font('Helvetica')
         .text('Fresh Kitchen Products', 0, top + 31, { align: 'center', width: PAGE_W });

      // Invoice meta (right side)
      doc.fillColor('white').fontSize(7.5).font('Helvetica')
         .text(`INV-${orderData.orderId}`,      MARGIN, top + 10, { align: 'right', width: PAGE_W - MARGIN * 2 })
         .text(`Date: ${new Date().toLocaleDateString('en-IN', {
             day: '2-digit', month: 'long', year: 'numeric'
         })}`,                                  MARGIN, top + 23, { align: 'right', width: PAGE_W - MARGIN * 2 })
         .text(`Payment ID: ${orderData.paymentId}`, MARGIN, top + 36, { align: 'right', width: PAGE_W - MARGIN * 2 });
    }

    // ═══════════════════════════════════════════
    //  HELPER: Draw FROM / BILL TO Section
    // ═══════════════════════════════════════════
    function drawFromBillTo(startY) {
      // FROM
      doc.fillColor('#2e7d32').fontSize(7.5).font('Helvetica-Bold')
         .text('FROM', MARGIN, startY);
      doc.fillColor('#1a1a1a').fontSize(10).font('Helvetica-Bold')
         .text('Kitchen Fresh Store', MARGIN, startY + 12);
      doc.fillColor('#555555').fontSize(7.5).font('Helvetica')
         .text('GSTIN: 33AAAAA0000A1Z5',        MARGIN, startY + 24)
         .text('Chennai, Tamil Nadu - 600001',   MARGIN, startY + 34)
         .text('Phone: +91 98765 43210',         MARGIN, startY + 44)
         .text('Email: kitchenfresh@gmail.com',  MARGIN, startY + 54);

      // BILL TO
      const col2 = PAGE_W / 2 + 10;
      doc.fillColor('#2e7d32').fontSize(7.5).font('Helvetica-Bold')
         .text('BILL TO', col2, startY);
      doc.fillColor('#1a1a1a').fontSize(10).font('Helvetica-Bold')
         .text(orderData.customerName, col2, startY + 12);
      doc.fillColor('#555555').fontSize(7.5).font('Helvetica')
         .text(`Phone: +${orderData.phone}`, col2, startY + 24)
         .text(`Email: ${orderData.email}`,  col2, startY + 34);

      // Divider line
      const lineY = startY + FROM_BILL_H - 4;
      doc.moveTo(MARGIN, lineY)
         .lineTo(PAGE_W - MARGIN, lineY)
         .lineWidth(1.2).strokeColor('#2e7d32').stroke();
    }

    // ═══════════════════════════════════════════
    //  HELPER: Draw Table Column Header
    // ═══════════════════════════════════════════
    function drawTableHeader(y) {
      doc.rect(MARGIN, y - TABLE_HDR_H, PAGE_W - MARGIN * 2, TABLE_HDR_H).fill('#2e7d32');
      doc.fillColor('white').fontSize(7.5).font('Helvetica-Bold')
         .text('#',           MARGIN + 5,  y - TABLE_HDR_H + 6)
         .text('Product Name',MARGIN + 25, y - TABLE_HDR_H + 6, { width: 240 })
         .text('Qty',         330,         y - TABLE_HDR_H + 6, { width: 50,  align: 'center' })
         .text('Unit Price',  390,         y - TABLE_HDR_H + 6, { width: 85,  align: 'right' })
         .text('Total',       490,         y - TABLE_HDR_H + 6, { width: 90,  align: 'right' });
    }

    // ═══════════════════════════════════════════
    //  HELPER: Draw Summary (GST + Total)
    // ═══════════════════════════════════════════
    function drawSummary(y) {
      const sumRowH = 22;

      // Horizontal line above summary
      doc.moveTo(MARGIN, y)
         .lineTo(PAGE_W - MARGIN, y)
         .lineWidth(1).strokeColor('#2e7d32').stroke();
      y -= 4;

      // Summary rows
      const summaryRows = [
        { label: 'Subtotal:',    value: `Rs. ${baseAmount.toFixed(2)}`, color: '#444' },
        { label: 'CGST @ 2.5%:',value: `Rs. ${cgst}`,                  color: '#444' },
        { label: 'SGST @ 2.5%:',value: `Rs. ${sgst}`,                  color: '#444' },
        { label: 'Delivery:',    value: 'FREE',                         color: '#2e7d32' },
      ];

      summaryRows.forEach(row => {
        doc.fillColor('#444').fontSize(8.5).font('Helvetica')
           .text(row.label, 370, y - sumRowH + 7, { width: 100, align: 'right' });
        doc.fillColor(row.color).fontSize(8.5)
           .text(row.value, 475, y - sumRowH + 7, { width: 105, align: 'right' });
        y -= sumRowH;
      });

      // Grand total box (green)
      doc.moveTo(310, y + 2)
         .lineTo(PAGE_W - MARGIN, y + 2)
         .lineWidth(1.2).strokeColor('#2e7d32').stroke();

      doc.rect(310, y - 24, PAGE_W - MARGIN - 310, 24).fill('#2e7d32');
      doc.fillColor('white').fontSize(9.5).font('Helvetica-Bold')
         .text('GRAND TOTAL:',   315, y - 18, { width: 155, align: 'right' })
         .text(`Rs. ${grandTotal}`, 475, y - 18, { width: 105, align: 'right' });

      // Payment received badge
      doc.rect(MARGIN, y - 24, 230, 24).fill('#e8f5e9');
      doc.fillColor('#2e7d32').fontSize(9).font('Helvetica-Bold')
         .text('PAYMENT RECEIVED', MARGIN + 8, y - 17);

      y -= 38;

      // Thank you
      doc.fillColor('#2e7d32').fontSize(11).font('Helvetica-Bold')
         .text('Thank you for your order!', 0, y, { align: 'center', width: PAGE_W });
      doc.fillColor('#666666').fontSize(8).font('Helvetica')
         .text('Your order will be delivered within 2-3 business days.',
               0, y + 16, { align: 'center', width: PAGE_W });
    }

    // ═══════════════════════════════════════════
    //  HELPER: Draw Footer
    // ═══════════════════════════════════════════
    function drawFooter(pageNum) {
      doc.rect(0, 0, PAGE_W, FOOTER_H - 4).fill('#2e7d32');
      doc.fillColor('white').fontSize(8).font('Helvetica')
         .text('Kitchen Fresh  |  kitchenfresh@gmail.com  |  +91 98765 43210',
               0, 18, { align: 'center', width: PAGE_W });
      doc.fillColor('#c8e6c9').fontSize(7)
         .text('This is a computer-generated invoice and does not require a physical signature.',
               0, 8, { align: 'center', width: PAGE_W });
      // Page number
      doc.fillColor('#aaaaaa').fontSize(7)
         .text(`Page ${pageNum} of ${totalPages}`,
               0, FOOTER_H + 2, { align: 'right', width: PAGE_W - MARGIN });
    }

    // ═══════════════════════════════════════════
    //  RENDER ALL PAGES
    // ═══════════════════════════════════════════
    pages.forEach((pageData, pgIndex) => {
      doc.addPage({ size: 'LETTER', margin: 0 });

      const pageNum    = pgIndex + 1;
      const isFirst    = pageData.isFirst;
      const isLast     = pgIndex === pages.length - 1;
      const pageItems  = pageData.items;

      // ── Draw Header ─────────────────────────
      drawHeader();

      // ── Starting Y (top content area) ───────
      let y = PAGE_H - HEADER_H - GAP;

      // ── FROM / BILL TO (page 1 only) ────────
      if (isFirst) {
        drawFromBillTo(y - FROM_BILL_H + 10);
        y -= FROM_BILL_H + GAP;
      } else {
        // "Continued" label on page 2+
        doc.fillColor('#888888').fontSize(8).font('Helvetica')
           .text(`(Continued from Page ${pageNum - 1})`,
                 0, y - CONTINUED_H + 5, { align: 'center', width: PAGE_W });
        y -= CONTINUED_H + GAP;
      }

      // ── Table Header ─────────────────────────
      drawTableHeader(y);
      y -= TABLE_HDR_H;

      // ── Calculate row height for this page ──
      // Reserve space for summary on last page
      const reserveForSummary = isLast ? SUMMARY_H : 20;
      const availForRows      = y - FOOTER_H - reserveForSummary;
      const rowH = Math.min(MAX_ROW_H, Math.max(MIN_ROW_H,
                    availForRows / pageItems.length));

      // ── Draw Product Rows ────────────────────
      const rowColors  = ['#f9fbe7', '#ffffff'];
      const globalStart = pages.slice(0, pgIndex).reduce((sum, p) => sum + p.items.length, 0);

      pageItems.forEach((item, i) => {
        const globalIdx = globalStart + i;
        const bg        = rowColors[globalIdx % 2];
        const rowY      = y - (i + 1) * rowH;

        doc.rect(MARGIN, rowY, PAGE_W - MARGIN * 2, rowH).fill(bg);

        const textY = rowY + rowH / 2 - 4;
        doc.fillColor('#333333').fontSize(7).font('Helvetica')
           .text(String(globalIdx + 1), MARGIN + 5, textY)
           .text(item.name,             MARGIN + 25, textY, { width: 240 })
           .text(String(item.qty),      330, textY, { width: 50,  align: 'center' })
           .text(`Rs. ${Number(item.unitPrice).toFixed(2)}`,
                                        390, textY, { width: 85,  align: 'right' })
           .text(`Rs. ${Number(item.total).toFixed(2)}`,
                                        490, textY, { width: 90,  align: 'right' });

        // Row divider line
        doc.moveTo(MARGIN, rowY)
           .lineTo(PAGE_W - MARGIN, rowY)
           .lineWidth(0.3).strokeColor('#dddddd').stroke();
      });

      y -= pageItems.length * rowH;

      // ── Summary on Last Page ─────────────────
      if (isLast) {
        y -= 6;
        drawSummary(y);
      } else {
        // "Continued" hint
        doc.fillColor('#aaaaaa').fontSize(7).font('Helvetica')
           .text('Continued on next page...',
                 0, FOOTER_H + 10, { align: 'right', width: PAGE_W - MARGIN });
      }

      // ── Footer ───────────────────────────────
      drawFooter(pageNum);
    });

    // ═══════════════════════════════════════════
    //  FINALIZE
    // ═══════════════════════════════════════════
    doc.end();
    stream.on('finish', () => {
      console.log(`✅ Invoice PDF ready: ${outputPath}`);
      resolve(outputPath);
    });
    stream.on('error', reject);
  });
}

module.exports = { generateInvoicePDF };
