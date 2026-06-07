export class ApiError extends Error {
  constructor(status, body) {
    const message = body?.error?.message || body?.error || body?.message || `Request failed with status ${status}`;
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export class TimeoutError extends Error {
  constructor() {
    super("Request timed out");
    this.name = "TimeoutError";
  }
}

export class AbortError extends Error {
  constructor() {
    super("Request was aborted");
    this.name = "AbortError";
  }
}
