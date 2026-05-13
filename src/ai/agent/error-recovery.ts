export type ErrorClass = 'transient' | 'auth' | 'rate_limit' | 'permanent' | 'unknown';

export function classifyError(error: string): ErrorClass {
  const lower = error.toLowerCase();
  if (lower.includes('timeout') || lower.includes('econnreset') || lower.includes('econnrefused')) return 'transient';
  if (lower.includes('401') || lower.includes('403') || lower.includes('unauthorized') || lower.includes('forbidden')) return 'auth';
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('too many requests')) return 'rate_limit';
  if (lower.includes('404') || lower.includes('not found') || lower.includes('invalid')) return 'permanent';
  return 'unknown';
}

export function shouldRetry(errorClass: ErrorClass): boolean {
  return errorClass === 'transient' || errorClass === 'rate_limit';
}

export function getRetryDelay(attempt: number, errorClass: ErrorClass): number {
  const base = errorClass === 'rate_limit' ? 5000 : 1000;
  return base * Math.pow(2, attempt);
}

export const MAX_RETRIES = 3;
