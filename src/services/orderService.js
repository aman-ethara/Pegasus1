const crypto = require('crypto');
const config = require('../config');
const logger = require('../logger');
const razorpayClient = require('../clients/razorpayClient');
const shopifyClient = require('../clients/shopifyClient');
const { withRetry, withTimeout } = require('../utils/retry');
const SignatureVerificationError = require('../errors/SignatureVerificationError');

// in-memory store for demo/testing
const store = {
  orders: new Map(),
  payments: new Map(),
  processedEvents: new Set(),
};

async function createOrder(input) {
  const { amount, currency = 'INR', receipt = 'rcpt_mock' } = input || {};
  logger.info({ amount, currency, receipt }, 'Create order requested');
  const order = await withRetry(
    () => withTimeout(
      Promise.resolve(razorpayClient.createOrder({ amount, currency, receipt })),
      config.httpTimeoutMs,
      'razorpay_create_order_timeout'
    ),
    {
      attempts: config.retryAttempts,
      backoffMs: config.retryBackoffMs,
      label: 'razorpay_create_order',
      onRetry: (err, attempt) => logger.warn({ err, attempt }, 'Razorpay createOrder retry'),
    }
  );
  store.orders.set(order.id, order);
  logger.info({ orderId: order.id }, 'Order created (mock)');
  return order;
}

function extractIdempotencyKey(headers = {}, eventBody = {}) {
  const h = headers || {};
  const key =
    h['x-razorpay-event-id'] ||
    h['X-Razorpay-Event-Id'] ||
    h['x-razorpay-idempotency-key'] ||
    h['X-Razorpay-Idempotency-Key'] ||
    eventBody?.payload?.payment?.entity?.id ||
    eventBody?.payload?.order?.entity?.id ||
    eventBody?.id || null;
  return key ? String(key) : null;
}

function computeSignatureBase(payload, headerValue) {
  return headerValue ? `${payload}|${headerValue}` : payload;
}

async function verifyRazorpaySignature(payload, signature, headers = {}, eventBody = {}) {
  const idemKey = extractIdempotencyKey(headers, eventBody);
  const base = computeSignatureBase(payload, headers['x-razorpay-event-id'] || headers['X-Razorpay-Event-Id'] || headers['x-razorpay-idempotency-key'] || headers['X-Razorpay-Idempotency-Key'] || '');
  const computed = crypto.createHmac('sha256', config.webhookSecret).update(base).digest('hex');
  const valid = computed === signature;
  if (!valid) {
    logger.warn(
      {
        reason: 'signature_mismatch',
        idempotencyKey: idemKey,
        providedSig: signature ? String(signature).slice(0, 8) : undefined,
        computedSig: computed.slice(0, 8),
        hasEventIdHeader: Boolean(headers['x-razorpay-event-id'] || headers['X-Razorpay-Event-Id']),
        hasIdempotencyHeader: Boolean(headers['x-razorpay-idempotency-key'] || headers['X-Razorpay-Idempotency-Key']),
      },
      'Razorpay signature verification failed'
    );
    throw new SignatureVerificationError('Invalid Razorpay signature', {
      idempotencyKey: idemKey,
    });
  }
  return { idempotencyKey: idemKey };
}

async function handleWebhook(eventBody, headers = {}) {
  const sig = headers['x-razorpay-signature'] || headers['X-Razorpay-Signature'] || '';
  const payload = JSON.stringify(eventBody);
  // log received
  const prelimIdem = extractIdempotencyKey(headers, eventBody);
  logger.info({ event: eventBody?.event, idempotencyKey: prelimIdem }, 'Webhook received');

  const { idempotencyKey } = await verifyRazorpaySignature(payload, sig, headers, eventBody);
  logger.info({ idempotencyKey }, 'Webhook validated');

  if (idempotencyKey && store.processedEvents.has(idempotencyKey)) {
    logger.info({ idempotencyKey }, 'Webhook already applied, skipping');
    return { received: true, idempotencyKey, applied: false, duplicate: true };
  }

  if (eventBody.event === 'payment.captured' && eventBody.payload?.payment?.entity) {
    const payment = eventBody.payload.payment.entity;
    try {
      // call exported function so tests can mock/spyon it
      if (module && module.exports && typeof module.exports.persistPayment === 'function') {
        await module.exports.persistPayment(payment);
      } else {
        await persistPayment(payment);
      }
      await updateOrderStatus(payment.order_id, 'paid');
      if (idempotencyKey) store.processedEvents.add(idempotencyKey);
      logger.info({ idempotencyKey, orderId: payment.order_id, paymentId: payment.id }, 'Webhook applied');
      return { received: true, idempotencyKey, applied: true };
    } catch (err) {
      logger.error({ err, idempotencyKey }, 'Webhook application failed');
      throw err;
    }
  }

  return { received: true, idempotencyKey, applied: false };
}


async function updateOrderStatus(orderId, status) {
  const existing = store.orders.get(orderId) || { id: orderId, status: 'unknown' };
  const updated = { ...existing, status };

  // If marking as paid, attempt Shopify confirmation with retries/timeouts
  if (status === 'paid') {
    // try to find related payment to enrich confirmation call
    let relatedPayment = null;
    for (const p of store.payments.values()) {
      if (p.order_id === orderId) {
        relatedPayment = p;
        break;
      }
    }

    const txId = relatedPayment?.id || 'txn_mock';
    const amt = relatedPayment?.amount || existing.amount || null;

    try {
      const confirm = await withRetry(
        () => withTimeout(
          Promise.resolve(shopifyClient.confirmOrder(orderId, { transactionId: txId, amount: amt })),
          config.httpTimeoutMs,
          'shopify_confirm_timeout'
        ),
        {
          attempts: config.retryAttempts,
          backoffMs: config.retryBackoffMs,
          label: 'shopify_confirm',
          onRetry: (err, attempt) => {
            logger.warn({ err, attempt, orderId }, 'Shopify confirm retry');
          },
        }
      );
      updated.confirmation = {
        attempted: true,
        success: true,
        at: new Date().toISOString(),
        shopify: { id: confirm.id, status: confirm.status, transaction_id: confirm.transaction_id },
      };
      logger.info({ orderId, status, txId }, 'Order confirmed on Shopify');
    } catch (err) {
      updated.confirmation = {
        attempted: true,
        success: false,
        at: new Date().toISOString(),
        error: { message: err.message, code: err.code },
      };
      logger.error({ err, orderId, status }, 'Shopify confirmation failed');
      // do not throw; preserve failure info and proceed
    }
  }

  store.orders.set(orderId, updated);
  logger.info({ orderId, status }, 'Order status updated');
  return updated;
}

async function persistPayment(payment) {
  store.payments.set(payment.id, payment);
  logger.info({ paymentId: payment.id }, 'Payment persisted (mock)');
  return payment;
}

async function getOrderById(orderId) {
  if (store.orders.has(orderId)) {
    logger.info({ orderId }, 'Order fetched from cache');
    return store.orders.get(orderId);
  }
  logger.info({ orderId }, 'Fetching order from Shopify');
  return withRetry(
    () => withTimeout(Promise.resolve(shopifyClient.getOrderById(orderId)), config.httpTimeoutMs, 'shopify_get_order_timeout'),
    {
      attempts: config.retryAttempts,
      backoffMs: config.retryBackoffMs,
      label: 'shopify_get_order',
      onRetry: (err, attempt) => logger.warn({ err, attempt, orderId }, 'Shopify get order retry'),
    }
  );
}

module.exports = {
  createOrder,
  verifyRazorpaySignature,
  handleWebhook,
  updateOrderStatus,
  persistPayment,
  getOrderById,
  extractIdempotencyKey,
  // exported for tests only (optional)
  __store: store,
};
