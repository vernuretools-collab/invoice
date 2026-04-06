require('dotenv').config();
const express = require('express');
const crypto  = require('crypto');
const { generateInvoicePDF }    = require('./generateInvoice');
const { uploadPDFToCloudinary } = require('./uploadToCloudinary');
const { sendInvoiceOnWhatsApp } = require('./sendWhatsApp');
const { createPaymentLink }     = require('./createPaymentLink');

const app = express();

// ═══════════════════════════════════════════════════
//  HEALTH CHECK
// ═══════════════════════════════════════════════════
app.get('/', (req, res) => {
  res.send('✅ Kitchen Fresh Invoice Server is running!');
});

// ═══════════════════════════════════════════════════
//  RAZORPAY WEBHOOK  ← MUST be before express.json()
// ═══════════════════════════════════════════════════
app.post('/razorpay-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const webhookSecret       = process.env.RAZORPAY_WEBHOOK_SECRET;
    const receivedSignature   = req.headers['x-razorpay-signature'];

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(req.body)
      .digest('hex');

    if (receivedSignature !== expectedSignature) {
      console.error('❌ Invalid webhook signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const payload = JSON.parse(req.body.toString());

    if (payload.event !== 'payment.captured') {
      return res.status(200).send('Event ignored');
    }

    const payment = payload.payload.payment.entity;

    let items = [];
    try {
      items = JSON.parse(payment.notes?.items || '[]');
    } catch {
      items = [{
        name:      payment.description || 'Product',
        qty:       1,
        unitPrice: payment.amount / 100,
        total:     payment.amount / 100
      }];
    }

    const rawPhone  = payment.notes?.phone || payment.contact || '';
    const orderData = {
      orderId:      payment.order_id || payment.id,
      paymentId:    payment.id,
      customerName: payment.notes?.name || 'Valued Customer',
      phone:        rawPhone.replace(/[^0-9]/g, ''),
      email:        payment.email || 'N/A',
      amount:       payment.amount,
      description:  payment.description || 'Kitchen Fresh Order',
      items:        items
    };

    console.log(`\n🔔 Payment Captured! ${orderData.customerName} (${orderData.phone}) Rs.${orderData.amount / 100}`);

    // Respond immediately, process async
    res.status(200).json({ status: 'received' });
    processInvoice(orderData);

  } catch (err) {
    console.error('❌ Webhook error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════
//  JSON middleware  ← AFTER webhook
// ═══════════════════════════════════════════════════
app.use(express.json());

// ═══════════════════════════════════════════════════
//  HALOSENDER INCOMING WEBHOOK
// ═══════════════════════════════════════════════════
app.post('/halosender-webhook', (req, res) => {
  const body = req.body;

  if (body.object === 'whatsapp_business_account') {
    const changes     = body.entry?.[0]?.changes?.[0]?.value;
    const contacts    = changes?.contacts?.[0];
    const message     = changes?.messages?.[0];

    if (message) {
      console.log(`\n📩 Incoming WhatsApp Message`);
      console.log(`📱 From    : ${contacts?.wa_id || message.from}`);
      console.log(`👤 Name    : ${contacts?.profile?.name || 'Customer'}`);
      console.log(`💬 Message : ${message.text?.body || ''}`);
    }
  }

  res.status(200).send('OK');
});

// ═══════════════════════════════════════════════════
//  CREATE PAYMENT LINK
// ═══════════════════════════════════════════════════
app.post('/create-payment-link', async (req, res) => {
  const { name, phone, email, amount, description, items } = req.body;

  if (!name || !phone || !amount) {
    return res.status(400).json({ success: false, error: 'name, phone and amount are required' });
  }

  try {
    const paymentUrl = await createPaymentLink({ name, phone, email, amount, description, items });
    console.log(`🔗 Payment link created for ${name} (${phone})`);
    res.json({ success: true, payment_url: paymentUrl });
  } catch (err) {
    console.error('❌ Payment link error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════
//  PROCESS INVOICE (async)
// ═══════════════════════════════════════════════════
async function processInvoice(orderData) {
  try {
    const pdfPath = await generateInvoicePDF(orderData);
    const pdfUrl  = await uploadPDFToCloudinary(pdfPath, orderData.orderId);
    await sendInvoiceOnWhatsApp(orderData.phone, pdfUrl, orderData.customerName, orderData.orderId);
    console.log(`✅ Invoice completed: ${orderData.orderId}`);
  } catch (err) {
    console.error(`❌ Invoice failed [${orderData.orderId}]:`, err.message);
  }
}

// ═══════════════════════════════════════════════════
//  KEEP-ALIVE PING (Render free tier)
// ═══════════════════════════════════════════════════
setInterval(() => {
  const url = process.env.RENDER_URL || '';
  if (url) require('https').get(url);
}, 10 * 60 * 1000);

// ═══════════════════════════════════════════════════
//  START SERVER
// ═══════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`📬 Webhook: https://paanal-farms.onrender.com/razorpay-webhook`);
});