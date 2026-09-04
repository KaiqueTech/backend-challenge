import { describe, expect, it } from 'vitest';
import { classifyProcessingError, retryDelayMs } from './retry-policy.js';

describe('SQS retry policy', () => {
  it('classifies business errors as terminal', () => {
    expect(classifyProcessingError(new Error('INSUFFICIENT_FUNDS'))).toBe('BUSINESS');
    expect(classifyProcessingError(new Error('REFERENCE_NOT_FOUND'))).toBe('BUSINESS');
  });

  it('classifies infrastructure errors as transient', () => {
    expect(classifyProcessingError(new Error('ECONNRESET'))).toBe('TRANSIENT');
    expect(classifyProcessingError(new Error('request timeout'))).toBe('TRANSIENT');
  });

  it('grows delay exponentially with bounded jitter input', () => {
    expect(retryDelayMs(1, 1000, 0)).toBe(1000);
    expect(retryDelayMs(2, 1000, 0)).toBe(2000);
    expect(retryDelayMs(3, 1000, 0)).toBe(4000);
  });
});
