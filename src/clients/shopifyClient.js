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

module.exports = {
  getOrderById,
};
