const logger = require('../logger');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry(fn, { attempts = 3, backoffMs = 200, factor = 2, label = 'retry', onRetry } = {}) {
  let lastErr;
  let delay = backoffMs;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn(i);
    } catch (err) {
      lastErr = err;
      if (i === attempts) break;
      if (onRetry) onRetry(err, i);
      logger.warn({ err, attempt: i, label }, 'Transient failure, retrying');
      await sleep(delay + Math.floor(Math.random() * 50));
      delay *= factor;
    }
  }
  throw lastErr;
}

async function withTimeout(promise, ms, label = 'timeout') {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const err = new Error(`${label} after ${ms}ms`);
      err.code = 'ETIMEDOUT';
      reject(err);
    }, ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = {
  withRetry,
  withTimeout,
  sleep,
};
