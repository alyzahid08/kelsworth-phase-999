// Server-side PDF invoice generation using PDFKit.
// Replaces the old print-to-PDF HTML approach with a proper downloadable PDF.

const PDFDocument = require("pdfkit");

const BRAND_COLOR = "#14141a";
const LIGHT_COLOR = "#55555f";
const ACCENT_COLOR = "#dcd7c9";
const FONT_REGULAR = "Helvetica";
const FONT_BOLD = "Helvetica-Bold";

function formatPKR(amount) {
  return "Rs. " + Number(amount).toLocaleString("en-PK");
}

/**
 * Generate a PDF invoice buffer for an order.
 * @returns {Promise<Buffer>} PDF file buffer
 */
async function generateInvoicePDF(order, items) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      info: {
        Title: `Invoice ${order.order_number} — Kelsworth`,
        Author: "Kelsworth",
        Subject: `Order invoice ${order.order_number}`,
      },
    });

    const buffers = [];
    doc.on("data", (chunk) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - 100; // margins

    // ---- Header ----
    doc.font(FONT_BOLD).fontSize(28).fillColor(BRAND_COLOR).text("KELSWORTH", { align: "left" });
    doc.moveDown(0.2);
    doc.font(FONT_REGULAR).fontSize(9).fillColor(LIGHT_COLOR).text("Premium Pakistani Denim", { align: "left" });

    // Invoice title on the right
    doc.font(FONT_BOLD).fontSize(10).fillColor(BRAND_COLOR).text("INVOICE", 50, 50, { align: "right" });
    doc.moveDown(0.2);

    // Divider
    doc.moveTo(50, doc.y + 5).lineTo(50 + pageWidth, doc.y + 5).strokeColor(ACCENT_COLOR).lineWidth(1).stroke();
    doc.moveDown(1);

    // ---- Order Meta ----
    const metaY = doc.y;
    doc.font(FONT_REGULAR).fontSize(9).fillColor(LIGHT_COLOR);
    doc.text(`Order #${order.order_number}`, 50, metaY);
    doc.text(`Date: ${new Date(order.created_at).toLocaleDateString("en-PK", { dateStyle: "long" })}`, 50, doc.y + 2);
    doc.text(`Payment: ${(order.payment_method || "cod").toUpperCase()}`, 50, doc.y + 2);
    if (order.payment_status && order.payment_status !== "pending") {
      doc.text(`Payment Status: ${order.payment_status}`, 50, doc.y + 2);
    }

    doc.moveDown(0.8);

    // Billed to / Shipped to
    const colWidth = pageWidth / 2 - 10;
    doc.font(FONT_BOLD).fontSize(8).fillColor(LIGHT_COLOR).text("BILLED TO", 50, doc.y);
    doc.font(FONT_BOLD).text("SHIPPED TO", 50 + colWidth + 20, doc.y - doc.currentLineHeight());
    doc.moveDown(0.3);

    const shipY = doc.y;
    doc.font(FONT_REGULAR).fontSize(9).fillColor(BRAND_COLOR);
    doc.text(`${order.first_name} ${order.last_name}`, 50, shipY, { width: colWidth });
    doc.text(order.email, 50, doc.y, { width: colWidth });
    doc.text(order.phone, 50, doc.y, { width: colWidth });

    doc.text(`${order.first_name} ${order.last_name}`, 50 + colWidth + 20, shipY, { width: colWidth });
    doc.text(order.address, 50 + colWidth + 20, doc.y, { width: colWidth });
    doc.text(`${order.city} ${order.postal_code || ""}`, 50 + colWidth + 20, doc.y, { width: colWidth });

    doc.moveDown(1.5);

    // ---- Items Table ----
    const tableTop = doc.y;
    const colX = [50, 230, 310, 370, 440, 520];
    const headers = ["Item", "", "Size", "Qty", "Unit Price", "Total"];

    // Table header row
    doc.font(FONT_BOLD).fontSize(8).fillColor(LIGHT_COLOR);
    headers.forEach((h, i) => {
      doc.text(h, colX[i], tableTop, { width: i === 0 ? 175 : undefined });
    });

    doc.moveTo(50, doc.y + 4).lineTo(50 + pageWidth, doc.y + 4).strokeColor(ACCENT_COLOR).lineWidth(0.5).stroke();
    doc.moveDown(0.6);

    // Table rows
    doc.font(FONT_REGULAR).fontSize(9).fillColor(BRAND_COLOR);
    for (const item of items) {
      const rowY = doc.y;
      doc.text(item.product_name, colX[0], rowY, { width: 175 });
      doc.text(item.size, colX[2], rowY);
      doc.text(String(item.qty), colX[3], rowY);
      doc.text(formatPKR(item.unit_price), colX[4], rowY);
      doc.text(formatPKR(item.unit_price * item.qty), colX[5], rowY);
      doc.moveDown(0.15);

      // Light row separator
      doc.moveTo(50, doc.y).lineTo(50 + pageWidth, doc.y).strokeColor("#eee").lineWidth(0.3).stroke();
      doc.moveDown(0.3);
    }

    // ---- Totals ----
    doc.moveDown(0.5);
    const totalsX = 370;
    const totalsWidth = 150;

    function totalLine(label, value) {
      const y = doc.y;
      doc.font(FONT_REGULAR).fontSize(9).fillColor(LIGHT_COLOR).text(label, totalsX, y);
      doc.font(FONT_REGULAR).fillColor(BRAND_COLOR).text(value, totalsX, y, { align: "right", width: totalsWidth });
      doc.moveDown(0.15);
    }

    totalLine("Subtotal", formatPKR(order.subtotal));
    totalLine("Shipping", order.shipping === 0 ? "Free" : formatPKR(order.shipping));
    if (order.tax && Number(order.tax) > 0) {
      totalLine("Tax", formatPKR(order.tax));
    }
    if (order.discount > 0) {
      const label = order.promo_code ? `Discount (${order.promo_code})` : "Discount";
      totalLine(label, `−${formatPKR(order.discount)}`);
    }

    // Grand total divider
    doc.moveTo(totalsX, doc.y + 2).lineTo(totalsX + totalsWidth, doc.y + 2).strokeColor(BRAND_COLOR).lineWidth(1.5).stroke();
    doc.moveDown(0.4);

    const grandY = doc.y;
    doc.font(FONT_BOLD).fontSize(12).fillColor(BRAND_COLOR).text("Total", totalsX, grandY);
    doc.text(formatPKR(order.total), totalsX, grandY, { align: "right", width: totalsWidth });

    // ---- Footer ----
    doc.moveDown(3);
    doc.moveTo(50, doc.y).lineTo(50 + pageWidth, doc.y).strokeColor(ACCENT_COLOR).lineWidth(0.5).stroke();
    doc.moveDown(0.5);
    doc.font(FONT_REGULAR).fontSize(7.5).fillColor(LIGHT_COLOR);
    doc.text("Thank you for shopping with Kelsworth.", 50, doc.y, { align: "center", width: pageWidth });
    doc.text("Free exchange within 14 days of delivery, tags attached and unworn.", { align: "center", width: pageWidth });
    doc.text("For support, reply to this email or visit kelsworth.com/contact.html.", { align: "center", width: pageWidth });

    doc.end();
  });
}

module.exports = { generateInvoicePDF };
