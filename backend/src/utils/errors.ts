export class AppError extends Error {
  statusCode: number;
  code?: string;

  constructor(message: string, statusCode = 500, code?: string) {
    super(message);
    this.name       = this.constructor.name;
    this.statusCode = statusCode;
    this.code       = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) { super(message, 400); }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') { super(message, 401); }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied', code?: string) { super(message, 403, code); }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') { super(message, 404); }
}

export class ConflictError extends AppError {
  constructor(message: string) { super(message, 409); }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') { super(message, 429); }
}
