const crypto = require('crypto');
const service = require('../src/services/orderService');
const rpWebhook = require('../src/data/razorpay/payment_webhook.json');

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

describe('orderService', () => {
  test('createOrder stores and returns an order', async () => {
    const order = await service.createOrder({ amount: 111, currency: 'INR', receipt: 'r1' });
    const fetched = await service.getOrderById(order.id);
    expect(fetched).toMatchObject({ id: order.id, amount: 111 });
  });

  test('verifyRazorpaySignature true for valid signature', async () => {
    const payload = JSON.stringify({ hello: 'world' });
    const signature = sign(payload, 'whsec_dev');
    await expect(service.verifyRazorpaySignature(payload, signature)).resolves.toBe(true);
  });

  test('handleWebhook updates order status to paid on payment.captured', async () => {
    const created = await service.createOrder({ amount: rpWebhook.payload.payment.entity.amount, currency: 'INR', receipt: 'r2' });
    // align webhook order id to created order id
    const event = JSON.parse(JSON.stringify(rpWebhook));
    event.payload.payment.entity.order_id = created.id;
    const payload = JSON.stringify(event);
    const signature = sign(payload, 'whsec_dev');
    const result = await service.handleWebhook(event, { 'x-razorpay-signature': signature });
    expect(result).toEqual({ received: true });
    const updated = await service.getOrderById(created.id);
    expect(updated).toHaveProperty('status', 'paid');
  });

  test('updateOrderStatus returns updated order', async () => {
    const order = await service.createOrder({ amount: 10, currency: 'INR', receipt: 'r3' });
    const updated = await service.updateOrderStatus(order.id, 'processing');
    expect(updated).toHaveProperty('status', 'processing');
  });

  test('persistPayment returns the payment object', async () => {
    const payment = { id: 'pay_1', order_id: 'order_1', amount: 100 };
    const saved = await service.persistPayment(payment);
    expect(saved).toEqual(payment);
  });

  test('getOrderById returns from Shopify mock when not in store', async () => {
    const order = await service.getOrderById('nonexistent_order');
    expect(order).toHaveProperty('id', 'nonexistent_order');
  });
});
