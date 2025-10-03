const config = require('../config');
const logger = require('../logger');
const razorpayClient = require('../clients/razorpayClient');
const shopifyClient = require('../clients/shopifyClient');

// in-memory store for demo/testing
const store = {
  orders: new Map(),
  payments: new Map(),
};

async function createOrder(input) {
  const { amount, currency = 'INR', receipt = 'rcpt_mock' } = input || {};
  const order = await razorpayClient.createOrder({ amount, currency, receipt });
  store.orders.set(order.id, order);
  logger.info({ orderId: order.id }, 'Order created (mock)');
  return order;
}

async function verifyRazorpaySignature(payload, signature) {
  return razorpayClient.verifySignature({ payload, signature, secret: config.webhookSecret });
}

async function handleWebhook(eventBody, headers = {}) {
  const sig = headers['x-razorpay-signature'] || headers['X-Razorpay-Signature'] || '';
  const payload = JSON.stringify(eventBody);
  const ok = await verifyRazorpaySignature(payload, sig);
  if (!ok) {
    const err = new Error('Invalid signature');
    err.status = 400;
    throw err;
  }

  if (eventBody.event === 'payment.captured' && eventBody.payload?.payment?.entity) {
    const payment = eventBody.payload.payment.entity;
    await persistPayment(payment);
    await updateOrderStatus(payment.order_id, 'paid');
  }

  return { received: true };
}

async function updateOrderStatus(orderId, status) {
  const existing = store.orders.get(orderId) || { id: orderId, status: 'unknown' };
  const updated = { ...existing, status };
  store.orders.set(orderId, updated);
  logger.info({ orderId, status }, 'Order status updated (mock)');
  return updated;
}

async function persistPayment(payment) {
  store.payments.set(payment.id, payment);
  logger.info({ paymentId: payment.id }, 'Payment persisted (mock)');
  return payment;
}

async function getOrderById(orderId) {
  if (store.orders.has(orderId)) return store.orders.get(orderId);
  return shopifyClient.getOrderById(orderId);
}

module.exports = {
  createOrder,
  verifyRazorpaySignature,
  handleWebhook,
  updateOrderStatus,
  persistPayment,
  getOrderById,
  // exported for tests only (optional)
  __store: store,
};
