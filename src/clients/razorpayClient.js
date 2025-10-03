const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

const orderFixturePath = path.join(__dirname, '..', 'data', 'razorpay', 'order.json');
const orderFixture = readJSON(orderFixturePath);

async function createOrder({ amount, currency, receipt } = {}) {
  return {
    ...orderFixture,
    amount: amount ?? orderFixture.amount,
    currency: currency ?? orderFixture.currency,
    receipt: receipt ?? orderFixture.receipt,
  };
}

function verifySignature({ payload, signature, secret }) {
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return expected === signature;
}

module.exports = {
  createOrder,
  verifySignature,
};
