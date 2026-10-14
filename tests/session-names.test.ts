import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { resolveSessionName, clearSessionNameCache } from '../src/session-names.js';

const FIXTURES_DIR = join(fileURLToPath(import.meta.url), '..', 'fixtures', 'claude-projects');
const SESSIONS_DIR = join(fileURLToPath(import.meta.url), '..', 'fixtures', 'sessions');

// Always pass SESSIONS_DIR so tests never read the real ~/.claude/sessions.
describe('resolveSessionName', () => {
  beforeEach(() => {
    clearSessionNameCache();
  });

  it('returns the user-set name from the sessions dir', () => {
    const result = resolveSessionName('test-session-with-name', FIXTURES_DIR, SESSIONS_DIR);
    expect(result).toBe('claude-monitor-build');
  });

  it('returns null when the session has no user-set name', () => {
    const result = resolveSessionName('test-session-id', FIXTURES_DIR, SESSIONS_DIR);
    expect(result).toBeNull();
  });

  it('returns null for an unknown session', () => {
    const result = resolveSessionName('unknown-session-id', FIXTURES_DIR, SESSIONS_DIR);
    expect(result).toBeNull();
  });

  it('returns null when the sessions dir does not exist', () => {
    const result = resolveSessionName('test-session-with-name', FIXTURES_DIR, join(SESSIONS_DIR, 'missing'));
    expect(result).toBeNull();
  });

  it('serves the cached result on a repeat call, even with a different sessions dir', () => {
    expect(resolveSessionName('test-session-with-name', FIXTURES_DIR, SESSIONS_DIR)).toBe('claude-monitor-build');
    expect(resolveSessionName('test-session-with-name', FIXTURES_DIR, join(SESSIONS_DIR, 'missing'))).toBe(
      'claude-monitor-build'
    );
  });
});
