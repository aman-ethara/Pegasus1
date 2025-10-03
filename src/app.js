const express = require('express');
const pinoHttp = require('pino-http');
const logger = require('./logger');
const requestId = require('./middleware/requestId');

const healthRouter = require('./routes/health');

const app = express();

app.use(express.json({ type: ['application/json', 'application/*+json'] }));
app.use(requestId);
app.use(pinoHttp({ logger, genReqId: req => req.id }));

// health endpoint
app.use('/health', healthRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (req.log) req.log.error({ err }, 'Unhandled error');
  else logger.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

module.exports = app;
