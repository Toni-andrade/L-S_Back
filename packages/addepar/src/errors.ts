export class AddeparApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "AddeparApiError";
  }
}

/**
 * 403 on licensed attributes (some market data, TWR, transaction attributes).
 * Callers catch this and degrade gracefully (Section 4/6), never fail the
 * whole sync.
 */
export class AddeparLicenseError extends AddeparApiError {
  constructor(message: string, body?: unknown) {
    super(message, 403, body);
    this.name = "AddeparLicenseError";
  }
}
