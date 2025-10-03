const shopify = require('../src/clients/shopifyClient');

describe('shopifyClient', () => {
  test('getOrderById returns order with provided id', async () => {
    const order = await shopify.getOrderById('order_123');
    expect(order).toHaveProperty('id', 'order_123');
    expect(order).toHaveProperty('name');
  });
});
