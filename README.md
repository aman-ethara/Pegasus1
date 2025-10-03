# Pegasus Payments Service

A modular Node.js Express service with structured JSON logs, a `/health` endpoint, env-driven configuration, mocked Shopify and Razorpay clients, and full unit tests. Includes stubbed service functions for order lifecycle and webhook handling.

## Features
- **Health endpoint**: `GET /health`
- **Structured logs**: Pino + pino-http
- **Env-driven config**: `src/config/index.js`
- **Mocked integrations**: `src/clients/` with local fixtures in `src/data/`
## Getting Started
 1. Install dependencies
   ```bash
   npm install
   ```
 2. Copy env defaults and adjust as needed
   ```bash
   cp .env.example .env
   ```
   or on Windows PowerShell:
   ```powershell
   Copy-Item .env.example .env
   ```
   Edit `.env` to set PORT, LOG_LEVEL, etc.
 3. Start dev server
   ```bash
   npm run dev
   ```
   Or start normally:
   ```bash
   npm start
   ```

Service will listen on `http://localhost:<PORT>` (default `3000`).

## Environment Variables
Defined in `.env` (see `.env.example`):
- `PORT` (default: 3000)
- `LOG_LEVEL` (default: info)
- `SHOPIFY_API_KEY`, `SHOPIFY_SHOP` (mocked)
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` (mocked)
- `WEBHOOK_SECRET` (default: `whsec_dev`) used for Razorpay webhook signature verification

## API
- `GET /health` → `{ status, uptime, timestamp }`

## Project Structure
```
src/
  app.js                # Express app (JSON parsing, logging, routes, error handlers)
  index.js              # Server bootstrap
  config/               # Env-driven configuration
  logger/               # Pino logger
  middleware/           # Request ID middleware
  routes/
    health.js           # /health route
  clients/
    razorpayClient.js   # Mocked Razorpay API wrapper
    shopifyClient.js    # Mocked Shopify API wrapper
  services/
    orderService.js     # Business logic + required stubs
  data/
    razorpay/           # Mock Razorpay fixtures
    shopify/            # Mock Shopify fixtures
tests/                  # Jest unit tests
```

## Testing
Run the full test suite:
```bash
npm test
```
Tests cover:
- `GET /health` route
- config module
- mocked Shopify and Razorpay clients
- service stubs: `createOrder`, `verifyRazorpaySignature`, `handleWebhook`, `updateOrderStatus`, `persistPayment`, `getOrderById`

## Notes
- Third-party calls are mocked via local fixtures. Replace mocked clients with real SDK calls when integrating with live services.
- Logging is structured JSON (Pino). Adjust `LOG_LEVEL` as needed.