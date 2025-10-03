const { randomUUID } = require('crypto');

module.exports = function requestId(req, res, next) {
  const headerId = req.headers['x-request-id'];
  const id = headerId && String(headerId).trim() ? String(headerId).trim() : randomUUID();
  req.id = id;
  res.setHeader('x-request-id', id);
  next();
};
