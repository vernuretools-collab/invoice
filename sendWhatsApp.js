const axios = require('axios');

async function sendInvoiceOnWhatsApp(phone, pdfUrl, customerName, orderId) {
  const url = `https://graph.facebook.com/v21.0/${process.env.HALOSENDER_PHONE_NUMBER_ID}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    recipient_type:    "individual",
    to:                phone,
    type:              "template",
    template: {
      name:     "invoice_after_payment",
      language: { code: "en" },
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
        },
        {
          type: "body",
          parameters: [
            { type: "text", text: customerName },  // {{1}}
            { type: "text", text: orderId }         // {{2}}
          ]
        }
      ]
    }
  };

  const response = await axios.post(url, payload, {
    headers: {
      'Authorization': `Bearer ${process.env.HALOSENDER_API_KEY}`,
      'Content-Type':  'application/json'
    }
  });

  console.log(`📲 WhatsApp sent to: ${phone}`);
  return response.data;
}

module.exports = { sendInvoiceOnWhatsApp };
