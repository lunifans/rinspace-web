export type DemoRepositoryErrorCode =
  | 'closed'
  | 'corrupt_metadata'
  | 'quota_exceeded'
  | 'seed_invalid'
  | 'transaction_failed'
  | 'unavailable'
  | 'upgrade_blocked'
  | 'version_changed';

export class DemoRepositoryError extends Error {
  constructor(
    readonly code: DemoRepositoryErrorCode,
    message: string,
    readonly recoverable: boolean,
    options: ErrorOptions = {},
  ) {
    super(message, options);
    this.name = 'DemoRepositoryError';
  }
}

function errorName(error: unknown): string {
  return error && typeof error === 'object' && 'name' in error && typeof error.name === 'string'
    ? error.name
    : '';
}

export function normalizeDemoRepositoryError(error: unknown, fallback = 'Demo repository operation failed.'): DemoRepositoryError {
  if (error instanceof DemoRepositoryError) return error;
  if (['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED'].includes(errorName(error))) {
    return new DemoRepositoryError('quota_exceeded', 'Browser storage quota was exceeded.', true, { cause: error });
  }
  if (errorName(error) === 'VersionError') {
    return new DemoRepositoryError('version_changed', 'The demo repository version changed.', true, { cause: error });
  }
  return new DemoRepositoryError('transaction_failed', fallback, true, { cause: error });
}
