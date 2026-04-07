const axios = require('axios');

async function sendInvoiceOnWhatsApp(phone, pdfUrl, customerName, orderId) {
  const url = `https://partners.halosender.com/v1/message/send-message?token=${process.env.HALOSENDER_API_KEY}`;

  const payload = {
    to:   phone,
    type: "template",
    template: {
      language: {
        policy: "deterministic",
        code:   "en"
      },
      name: "invoice_after_payment",
      components: [
        {
          type: "header",
          parameters: [
            {
              type: "document",
              document: {
                link:     pdfUrl,
                filename: `Invoice_${orderId}.pdf`
              }
            }
          ]
        }
      ]
    }
  };

  const response = await axios.post(url, payload, {
    headers: { 'Content-Type': 'application/json' }
  });

  console.log(`📲 WhatsApp sent to: ${phone} →`, response.data);
  return response.data;
}

module.exports = { sendInvoiceOnWhatsApp };