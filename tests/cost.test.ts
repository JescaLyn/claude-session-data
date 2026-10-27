import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { extractSessionCost, extractSessionCostById } from '../src/cost.js';

const FIXTURES_DIR = join(fileURLToPath(import.meta.url), '..', 'fixtures');

describe('extractSessionCost', () => {
  it('extracts a valid cost-state entry', () => {
    const result = extractSessionCost(join(FIXTURES_DIR, 'cost-state-valid.jsonl'));
    expect(result).toEqual({
      sessionId: 'sess-abc',
      totalCostUSD: 0.0245,
      totalDuration: 3600,
      totalLinesAdded: 42,
      totalLinesRemoved: 10,
      modelUsage: {
        'claude-opus-5-5': {
          inputTokens: 300,
          outputTokens: 150,
          thinkingTokens: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
          webSearchRequests: 0,
          costUSD: 0.0245,
        },
      },
    });
  });

  it('defaults missing fields to zero or empty object', () => {
    const result = extractSessionCost(join(FIXTURES_DIR, 'cost-state-missing-fields.jsonl'));
    expect(result).toEqual({
      sessionId: 'sess-sparse',
      totalCostUSD: 0,
      totalDuration: 0,
      totalLinesAdded: 0,
      totalLinesRemoved: 0,
      modelUsage: {},
    });
  });

  it('returns null when no cost-state entry exists', () => {
    const result = extractSessionCost(join(FIXTURES_DIR, 'no-cost-state.jsonl'));
    expect(result).toBeNull();
  });

  it('returns null when the cost-state line is malformed JSON', () => {
    const result = extractSessionCost(join(FIXTURES_DIR, 'cost-state-malformed.jsonl'));
    expect(result).toBeNull();
  });

  it('returns null for a nonexistent file', () => {
    const result = extractSessionCost(join(FIXTURES_DIR, 'does-not-exist.jsonl'));
    expect(result).toBeNull();
  });
});

describe('extractSessionCostById', () => {
  it('returns null for an unknown session id', () => {
    const result = extractSessionCostById('nonexistent-session-id');
    expect(result).toBeNull();
  });
});
