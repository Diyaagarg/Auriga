class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

class InsufficientBalanceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InsufficientBalanceError';
    this.statusCode = 409;
  }
}

class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConflictError';
    this.statusCode = 409;
  }
}

class UnauthorizedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnauthorizedError';
    this.statusCode = 401;
  }
}

module.exports = {
  NotFoundError,
  ValidationError,
  InsufficientBalanceError,
  ConflictError,
  UnauthorizedError,
};
