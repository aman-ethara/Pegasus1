const dotenv = require('dotenv');

dotenv.config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  logLevel: process.env.LOG_LEVEL || 'info',
  shopify: {
    apiKey: process.env.SHOPIFY_API_KEY || '',
    shop: process.env.SHOPIFY_SHOP || ''
  },
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || ''
  },
  webhookSecret: process.env.WEBHOOK_SECRET || 'whsec_dev'
};

module.exports = config;
