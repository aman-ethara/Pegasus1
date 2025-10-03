const crypto = require('crypto');
const rp = require('../src/clients/razorpayClient');

describe('razorpayClient', () => {
  test('createOrder returns fixture-based order with overrides', async () => {
    const order = await rp.createOrder({ amount: 12345, currency: 'INR', receipt: 'rcpt_1' });
    expect(order).toMatchObject({ amount: 12345, currency: 'INR', receipt: 'rcpt_1' });
    expect(order).toHaveProperty('id');
  });

  test('verifySignature validates HMAC', () => {
    const payload = 'test_payload';
    const secret = 'secret';
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    expect(rp.verifySignature({ payload, signature, secret })).toBe(true);
    expect(rp.verifySignature({ payload, signature: 'bad', secret })).toBe(false);
  });
});
