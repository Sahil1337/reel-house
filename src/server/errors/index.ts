/**
 * Typed errors thrown by src/server/services. Routes turn them into `{ error }` JSON with the
 * matching status through `handleError` (src/app/api/_lib/http.ts); anything else is a 500.
 * The message is shown to the user as-is, so keep it short and safe to display.
 */
import "server-only";

export class ServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Machine-readable reason, e.g. "PROFILE_LIMIT". */
    readonly code?: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** 422: the input breaks a validation rule (wrong length, unknown id, out of range…). */
export class ValidationError extends ServiceError {
  constructor(message: string, code?: string) {
    super(message, 422, code);
  }
}

/** 401: no valid session. */
export class UnauthorizedError extends ServiceError {
  constructor(message = "Sign in to continue.", code?: string) {
    super(message, 401, code);
  }
}

/** 403: signed in, but not allowed (e.g. not an admin). */
export class ForbiddenError extends ServiceError {
  constructor(message = "You can't do that.", code?: string) {
    super(message, 403, code);
  }
}

/** 404: the row doesn't exist, or belongs to someone else (never reveal which). */
export class NotFoundError extends ServiceError {
  constructor(message = "Not found.", code?: string) {
    super(message, 404, code);
  }
}

/** 409: a uniqueness or state rule blocks the write (name taken, profile limit, last profile…). */
export class ConflictError extends ServiceError {
  constructor(message: string, code?: string) {
    super(message, 409, code);
  }
}
