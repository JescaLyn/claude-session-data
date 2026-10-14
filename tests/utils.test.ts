import { describe, it, expect } from 'vitest';
import { projectFromCwd } from '../src/utils.js';

describe('projectFromCwd', () => {
  it('returns the basename of the path', () => {
    expect(projectFromCwd('/home/user/projects/my-app')).toBe('my-app');
  });

  it('handles paths with trailing slash', () => {
    expect(projectFromCwd('/home/user/projects/my-app/')).toBe('my-app');
  });

  it('returns the directory name for a root-level path', () => {
    expect(projectFromCwd('/my-app')).toBe('my-app');
  });
});
