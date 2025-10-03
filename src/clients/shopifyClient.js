const path = require('path');
const fs = require('fs');

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

const orderFixturePath = path.join(__dirname, '..', 'data', 'shopify', 'order.json');
const orderFixture = readJSON(orderFixturePath);

async function getOrderById(id) {
  return { ...orderFixture, id: id ?? orderFixture.id };
}

async function confirmOrder(id, { transactionId, amount } = {}) {
  // Mock: pretend Shopify confirms the order
  return {
    id,
    status: 'confirmed',
    financial_status: 'paid',
    transaction_id: transactionId || 'txn_mock',
    amount: amount || orderFixture.current_total_price,
  };
}

module.exports = {
  getOrderById,
  confirmOrder,
};
