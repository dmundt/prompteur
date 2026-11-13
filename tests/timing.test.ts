import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertLocalDuration } from './timing';

afterEach(() => vi.unstubAllEnvs());

describe('local timing budgets', () => {
  it('enforces the threshold outside CI', () => {
    vi.stubEnv('CI', '');
    expect(() => assertLocalDuration(199, 200, 'Search')).not.toThrow();
    expect(() => assertLocalDuration(200, 200, 'Search')).toThrow(
      'Search exceeded 200 ms: 200.0 ms',
    );
  });

  it('does not enforce machine-dependent timing in CI', () => {
    vi.stubEnv('CI', 'true');
    expect(() => assertLocalDuration(10_000, 200, 'Search')).not.toThrow();
  });
});
