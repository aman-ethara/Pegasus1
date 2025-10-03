class SignatureVerificationError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = 'SignatureVerificationError';
    this.status = 400;
    this.code = 'SIGNATURE_VERIFICATION_FAILED';
    this.context = context;
  }
}

module.exports = SignatureVerificationError;
