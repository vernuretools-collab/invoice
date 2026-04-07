const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

async function uploadPDFToCloudinary(filePath, orderId) {
  const result = await cloudinary.uploader.upload(filePath, {
    resource_type: 'raw',
    folder:        'invoices',
    public_id:     `INV-${orderId}`,
    format:        'pdf',
    access_mode:   'public',   // ✅ Makes PDF publicly accessible
    type:          'upload'    // ✅ Ensures it's a public upload
  });

  console.log(`📁 PDF uploaded: ${result.secure_url}`);
  return result.secure_url;
}

module.exports = { uploadPDFToCloudinary };