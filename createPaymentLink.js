const Razorpay = require('razorpay');

const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

async function createPaymentLink(customerData) {
  const paymentLink = await razorpay.paymentLink.create({
    amount:      customerData.amount,
    currency:    'INR',
    description: customerData.description || 'PaanalFarms Order',
    customer: {
      name:    customerData.name,
      contact: customerData.phone,
      email:   customerData.email || 'customer@example.com'
    },
    notify: {
      sms:   false,
      email: false
    },
    notes: {
      name:  customerData.name,
      phone: customerData.phone,        // ← WhatsApp number stored here
      items: JSON.stringify(customerData.items || [])
    },
    reminder_enable: false
  });

  console.log(`🔗 Payment link: ${paymentLink.short_url}`);
  return paymentLink.short_url;
}

module.exports = { createPaymentLink };
