describe('config', () => {
  it('loads defaults', () => {
    jest.resetModules();
    const config = require('../src/config');
    expect(typeof config.port).toBe('number');
    expect(config.port).toBeGreaterThan(0);
    expect(config.logLevel).toBeDefined();
  });
});
