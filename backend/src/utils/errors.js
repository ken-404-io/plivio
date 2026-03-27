/**
 * Domain-specific error classes.
 * Each carries an HTTP status code so the error handler can respond correctly.
 */

export class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message) { super(message, 400); }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') { super(message, 401); }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') { super(message, 403); }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') { super(message, 404); }
}

export class ConflictError extends AppError {
  constructor(message) { super(message, 409); }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') { super(message, 429); }
}
