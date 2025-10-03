const express = require('express');
const request = require('supertest');
const requestId = require('../src/middleware/requestId');

function makeApp() {
  const app = express();
  app.use(requestId);
  app.get('/echo', (req, res) => {
    res.set('x-request-id', req.id);
    res.json({ id: req.id });
  });
  return app;
}

describe('requestId middleware', () => {
  test('generates a request id when none provided', async () => {
    const app = makeApp();
    const res = await request(app).get('/echo');
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.body).toHaveProperty('id');
  });

  test('uses provided x-request-id', async () => {
    const app = makeApp();
    const res = await request(app).get('/echo').set('x-request-id', 'custom-id-123');
    expect(res.headers['x-request-id']).toBe('custom-id-123');
    expect(res.body.id).toBe('custom-id-123');
  });
});
