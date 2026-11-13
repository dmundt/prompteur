import * as assert from 'node:assert/strict';

export function assertLocalDuration(duration: number, limit: number, label: string): void {
  if (!process.env.CI)
    assert.ok(duration < limit, `${label} exceeded ${limit} ms: ${duration.toFixed(1)} ms`);
}
