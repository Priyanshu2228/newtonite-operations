export class VersionMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VersionMismatchError';
  }
}

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
