require('dotenv').config();
const { generateInvoicePDF }    = require('./generateInvoice');
const { uploadPDFToCloudinary } = require('./uploadToCloudinary');
const { sendInvoiceOnWhatsApp } = require('./sendWhatsApp');

// ── Simulate exactly what Razorpay live webhook sends ──
const testOrder = {
  orderId:      'order_LiveTest001',       // ← fake live order id format
  paymentId:    'pay_LiveTest001',         // ← fake live payment id format
  customerName: 'Vedhika Test',
  phone:        '917418108940',            // ← your WhatsApp number
  email:        'test@gmail.com',
  amount:       50000,                     // ← Rs. 500 in paise
  description:  'Kitchen Fresh Live Test',
  items: [
    { name: 'Idly Podi 200g',    qty: 2, unitPrice: 120, total: 240 },
    { name: 'Sambar Powder 100g',qty: 1, unitPrice: 150, total: 150 },
    { name: 'Rasam Powder 100g', qty: 1, unitPrice: 110, total: 110 }
  ]
};

async function runLiveTest() {
  console.log('\n🔴 LIVE ENV TEST STARTED');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // ── Check all env variables are loaded ──
  console.log('\n🔍 Checking ENV variables...');
  const required = [
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
    'RAZORPAY_WEBHOOK_SECRET',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'HALOSENDER_API_KEY'
  ];

  let allGood = true;
  required.forEach(key => {
    if (process.env[key]) {
      console.log(`  ✅ ${key} = ${process.env[key].substring(0, 6)}...`);
    } else {
      console.log(`  ❌ ${key} = MISSING`);
      allGood = false;
    }
  });

  // ── Check if live or test keys ──
  const keyId = process.env.RAZORPAY_KEY_ID || '';
  if (keyId.startsWith('rzp_live_')) {
    console.log('\n✅ Razorpay → LIVE MODE');
  } else if (keyId.startsWith('rzp_test_')) {
    console.log('\n⚠️  Razorpay → TEST MODE (change to live keys for production)');
  } else {
    console.log('\n❌ Razorpay key not found');
  }

  if (!allGood) {
    console.log('\n❌ Fix missing env variables first!');
    return;
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    // Step 1: Generate PDF
    console.log('\n📄 Step 1: Generating PDF...');
    const pdfPath = await generateInvoicePDF(testOrder);
    console.log('✅ PDF generated:', pdfPath);

    // Step 2: Upload to Cloudinary
    console.log('\n☁️  Step 2: Uploading to Cloudinary...');
    const pdfUrl = await uploadPDFToCloudinary(pdfPath, testOrder.orderId);
    console.log('✅ Cloudinary URL:', pdfUrl);

    // Step 3: Send WhatsApp
    console.log('\n📲 Step 3: Sending WhatsApp invoice...');
    const result = await sendInvoiceOnWhatsApp(
      testOrder.phone,
      pdfUrl,
      testOrder.customerName,
      testOrder.orderId
    );
    console.log('✅ WhatsApp sent! Message ID:', result?.messages?.[0]?.id);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 ALL STEPS PASSED — Ready for live payments!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (err) {
    console.error('\n❌ Test failed at:', err.message);
  }
}

runLiveTest();