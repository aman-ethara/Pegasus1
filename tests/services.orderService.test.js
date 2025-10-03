const crypto = require('crypto');
const service = require('../src/services/orderService');
const shopifyClient = require('../src/clients/shopifyClient');
const SignatureVerificationError = require('../src/errors/SignatureVerificationError');
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

  test('handleWebhook is idempotent: duplicate event does not double-apply', async () => {
    const created = await service.createOrder({ amount: 200, currency: 'INR', receipt: 'dup' });
    const event = JSON.parse(JSON.stringify(rpWebhook));
    event.payload.payment.entity.order_id = created.id;
    const headers = { 'x-razorpay-event-id': 'evt_dup_1' };
    const payload = JSON.stringify(event);
    const signature = sign(`${payload}|evt_dup_1`, 'whsec_dev');

    const spyPersist = jest.spyOn(service, 'persistPayment');
    const first = await service.handleWebhook(event, { ...headers, 'x-razorpay-signature': signature });
    expect(first).toMatchObject({ received: true, applied: true, idempotencyKey: 'evt_dup_1' });

    const second = await service.handleWebhook(event, { ...headers, 'x-razorpay-signature': signature });
    expect(second).toMatchObject({ received: true, applied: false, duplicate: true, idempotencyKey: 'evt_dup_1' });
    expect(spyPersist).toHaveBeenCalledTimes(1);
    spyPersist.mockRestore();
  });

  test('handleWebhook failure logs error and does not mark as applied or processed', async () => {
    const created = await service.createOrder({ amount: 300, currency: 'INR', receipt: 'fail' });
    const event = JSON.parse(JSON.stringify(rpWebhook));
    event.payload.payment.entity.order_id = created.id;
    const headers = { 'x-razorpay-event-id': 'evt_fail_1' };
    const payload = JSON.stringify(event);
    const signature = sign(`${payload}|evt_fail_1`, 'whsec_dev');

    const err = new Error('persist failed');
    const spyPersist = jest.spyOn(service, 'persistPayment').mockRejectedValue(err);
    await expect(
      service.handleWebhook(event, { ...headers, 'x-razorpay-signature': signature })
    ).rejects.toThrow('persist failed');
    expect(service.__store.processedEvents.has('evt_fail_1')).toBe(false);
    spyPersist.mockRestore();
  });

  test('verifyRazorpaySignature returns idempotencyKey (no header)', async () => {
    const payload = JSON.stringify({ hello: 'world' });
    const signature = sign(payload, 'whsec_dev');
    await expect(service.verifyRazorpaySignature(payload, signature)).resolves.toEqual({ idempotencyKey: null });
  });

  test('verifyRazorpaySignature uses header in signature base', async () => {
    const payload = JSON.stringify({ hello: 'world' });
    const headers = { 'x-razorpay-event-id': 'evt_123' };
    const signature = sign(`${payload}|evt_123`, 'whsec_dev');
    const result = await service.verifyRazorpaySignature(payload, signature, headers, {});
    expect(result).toEqual({ idempotencyKey: 'evt_123' });
  });

  test('verifyRazorpaySignature throws typed error on mismatch', async () => {
    const payload = JSON.stringify({ hello: 'world' });
    const badSignature = 'deadbeef';
    await expect(service.verifyRazorpaySignature(payload, badSignature)).rejects.toBeInstanceOf(SignatureVerificationError);
  });

  test('handleWebhook updates order status to paid on payment.captured and returns idempotencyKey', async () => {
    const created = await service.createOrder({ amount: rpWebhook.payload.payment.entity.amount, currency: 'INR', receipt: 'r2' });
    // align webhook order id to created order id
    const event = JSON.parse(JSON.stringify(rpWebhook));
    event.payload.payment.entity.order_id = created.id;
    const payload = JSON.stringify(event);
    const signature = sign(payload, 'whsec_dev');
    const result = await service.handleWebhook(event, { 'x-razorpay-signature': signature });
    expect(result).toHaveProperty('received', true);
    expect(typeof result.idempotencyKey).toBe('string');
    const updated = await service.getOrderById(created.id);
    expect(updated).toHaveProperty('status', 'paid');
  });

  test('updateOrderStatus returns updated order', async () => {
    const order = await service.createOrder({ amount: 10, currency: 'INR', receipt: 'r3' });
    const updated = await service.updateOrderStatus(order.id, 'processing');
    expect(updated).toHaveProperty('status', 'processing');
  });

  test('updateOrderStatus paid triggers Shopify confirmation success', async () => {
    const order = await service.createOrder({ amount: 777, currency: 'INR', receipt: 'r-ok' });
    const spy = jest.spyOn(shopifyClient, 'confirmOrder').mockResolvedValue({ id: order.id, status: 'confirmed', transaction_id: 'txn_ok' });
    const updated = await service.updateOrderStatus(order.id, 'paid');
    expect(spy).toHaveBeenCalled();
    expect(updated).toHaveProperty('status', 'paid');
    expect(updated).toHaveProperty('confirmation');
    expect(updated.confirmation).toMatchObject({ attempted: true, success: true });
    spy.mockRestore();
  });

  test('updateOrderStatus paid preserves failure info when Shopify confirmation fails', async () => {
    const order = await service.createOrder({ amount: 888, currency: 'INR', receipt: 'r-fail' });
    const spy = jest.spyOn(shopifyClient, 'confirmOrder').mockRejectedValue(new Error('confirm failed'));
    const updated = await service.updateOrderStatus(order.id, 'paid');
    expect(spy).toHaveBeenCalled();
    expect(updated).toHaveProperty('status', 'paid');
    expect(updated).toHaveProperty('confirmation');
    expect(updated.confirmation).toMatchObject({ attempted: true, success: false });
    expect(updated.confirmation.error).toBeDefined();
    spy.mockRestore();
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
