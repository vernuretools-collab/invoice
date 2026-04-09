require('dotenv').config();
const express = require('express');
const crypto  = require('crypto');
const https   = require('https');

const { generateInvoicePDF }    = require('./generateInvoice');
const { uploadPDFToCloudinary } = require('./uploadToCloudinary');
const { sendInvoiceOnWhatsApp } = require('./sendWhatsApp');
const { createPaymentLink }     = require('./createPaymentLink');

const app = express();

// ═══════════════════════════════════════════════════
//  HEALTH CHECK
// ═══════════════════════════════════════════════════
app.get('/', (req, res) => {
  res.send('✅ PaanalFarms Invoice Server is running!');
});

// ═══════════════════════════════════════════════════
//  RAZORPAY WEBHOOK  ← MUST be before express.json()
// ═══════════════════════════════════════════════════
app.post('/razorpay-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const webhookSecret     = process.env.RAZORPAY_WEBHOOK_SECRET;
    const receivedSignature = req.headers['x-razorpay-signature'];

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

    // ── Debug log (remove after testing) ──────────────
    console.log('📦 notes.items raw  :', payment.notes?.items);
    console.log('📦 product_name note:', payment.notes?.product_name);
    console.log('📦 description      :', payment.description);
    console.log('📦 source           :', payment.notes?.source || 'razorpay_dashboard');
    // ──────────────────────────────────────────────────

    // ── Parse items safely ────────────────────────────
    let items = [];
    try {
      const parsed = JSON.parse(payment.notes?.items || '[]');
      if (Array.isArray(parsed) && parsed.length > 0) {
        items = parsed;
      } else {
        // Empty array or missing → build from description/product_name
        items = [{
          name:      payment.notes?.product_name
                     || payment.description
                     || 'PaanalFarms Order',
          qty:       1,
          unitPrice: payment.amount / 100,
          total:     payment.amount / 100
        }];
      }
    } catch {
      items = [{
        name:      payment.notes?.product_name
                   || payment.description
                   || 'PaanalFarms Order',
        qty:       1,
        unitPrice: payment.amount / 100,
        total:     payment.amount / 100
      }];
    }

    console.log('📦 items final:', JSON.stringify(items));
    // ──────────────────────────────────────────────────

    const rawPhone  = payment.notes?.phone || payment.contact || '';
    const orderData = {
      orderId:      String(payment.order_id || payment.id),
      paymentId:    payment.id,
      customerName: payment.notes?.name || 'Valued Customer',
      phone:        rawPhone.replace(/[^0-9]/g, ''),
      email:        payment.email || 'N/A',
      amount:       payment.amount,
      description:  payment.description || 'PaanalFarms Order',
      source:       payment.notes?.source || 'razorpay_dashboard',
      items
    };

    console.log(`\n🔔 Payment Captured!`);
    console.log(`👤 Name   : ${orderData.customerName}`);
    console.log(`📱 Phone  : ${orderData.phone}`);
    console.log(`💰 Amount : ₹${orderData.amount / 100}`);
    console.log(`📦 Source : ${orderData.source}`);

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
    const changes  = body.entry?.[0]?.changes?.[0]?.value;
    const contacts = changes?.contacts?.[0];
    const message  = changes?.messages?.[0];

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
    return res.status(400).json({
      success: false,
      error: 'name, phone and amount are required'
    });
  }

  // Validate items if provided
  if (items && !Array.isArray(items)) {
    return res.status(400).json({
      success: false,
      error: 'items must be an array'
    });
  }

  try {
    const paymentUrl = await createPaymentLink({
      name,
      phone,
      email,
      amount,
      description,
      items: items || []
    });

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
    console.log(`\n⚙️  Processing invoice: ${orderData.orderId}`);

    const pdfPath = await generateInvoicePDF(orderData);
    console.log(`📄 PDF generated: ${pdfPath}`);

    const pdfUrl = await uploadPDFToCloudinary(pdfPath, orderData.orderId);
    console.log(`☁️  PDF uploaded: ${pdfUrl}`);

    await sendInvoiceOnWhatsApp(
      orderData.phone,
      pdfUrl,
      orderData.customerName,
      orderData.orderId
    );

    console.log(`✅ Invoice completed: ${orderData.orderId}`);

  } catch (err) {
    console.error(`❌ Invoice failed [${orderData.orderId}]: ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════
//  KEEP-ALIVE PING (Render free tier)
// ═══════════════════════════════════════════════════
setInterval(() => {
  const url = process.env.RENDER_URL || '';
  if (url) https.get(url);
}, 10 * 60 * 1000);

// ═══════════════════════════════════════════════════
//  START SERVER
// ═══════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`📬 Webhook : https://paanal-farms.onrender.com/razorpay-webhook`);
  console.log(`🔗 API     : https://paanal-farms.onrender.com/create-payment-link`);
});