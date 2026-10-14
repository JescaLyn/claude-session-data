import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'path';

vi.mock('os', () => ({
  homedir: vi.fn(() => '/fake/home'),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
}));

import { existsSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { findJsonlFiles, findSessionFile } from '../../src/jsonl/paths.js';

const FAKE_HOME = '/fake/home';
const XDG_PROJECTS = join(FAKE_HOME, '.config/claude/projects');
const LEGACY_PROJECTS = join(FAKE_HOME, '.claude/projects');

function dirEntry(name: string) {
  return { name, isDirectory: () => true, isFile: () => false } as unknown as ReturnType<
    typeof readdirSync
  >[number];
}

function fileEntry(name: string) {
  return { name, isDirectory: () => false, isFile: () => true } as unknown as ReturnType<
    typeof readdirSync
  >[number];
}

beforeEach(() => {
  vi.mocked(homedir).mockReturnValue(FAKE_HOME);
  vi.mocked(existsSync).mockReset();
  vi.mocked(readdirSync).mockReset();
});

describe('findJsonlFiles', () => {
  it('returns an empty array when neither projects directory exists', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const result = findJsonlFiles();

    expect(result).toEqual([]);
    expect(readdirSync).not.toHaveBeenCalled();
  });

  it('recursively walks the legacy projects dir and filters to .jsonl files', () => {
    const subDir = join(LEGACY_PROJECTS, 'subdir');

    vi.mocked(existsSync).mockImplementation((p) => p === LEGACY_PROJECTS);
    vi.mocked(readdirSync).mockImplementation(((dir: string) => {
      if (dir === LEGACY_PROJECTS) {
        return [fileEntry('a.jsonl'), fileEntry('b.txt'), dirEntry('subdir')];
      }
      if (dir === subDir) {
        return [fileEntry('c.jsonl')];
      }
      throw new Error(`unexpected readdirSync(${dir})`);
    }) as typeof readdirSync);

    const result = findJsonlFiles();

    expect(result.sort()).toEqual([join(LEGACY_PROJECTS, 'a.jsonl'), join(subDir, 'c.jsonl')].sort());
  });

  it('checks both XDG and legacy locations and merges results', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockImplementation(((dir: string) => {
      if (dir === XDG_PROJECTS) return [fileEntry('xdg.jsonl')];
      if (dir === LEGACY_PROJECTS) return [fileEntry('legacy.jsonl')];
      return [];
    }) as typeof readdirSync);

    const result = findJsonlFiles();

    expect(result.sort()).toEqual(
      [join(XDG_PROJECTS, 'xdg.jsonl'), join(LEGACY_PROJECTS, 'legacy.jsonl')].sort()
    );
  });

  it('silently skips a subtree when readdirSync throws (e.g. permission denied)', () => {
    const restrictedDir = join(LEGACY_PROJECTS, 'restricted');

    vi.mocked(existsSync).mockImplementation((p) => p === LEGACY_PROJECTS);
    vi.mocked(readdirSync).mockImplementation(((dir: string) => {
      if (dir === LEGACY_PROJECTS) {
        return [fileEntry('good.jsonl'), dirEntry('restricted')];
      }
      if (dir === restrictedDir) {
        throw new Error('EACCES: permission denied');
      }
      throw new Error(`unexpected readdirSync(${dir})`);
    }) as typeof readdirSync);

    expect(() => findJsonlFiles()).not.toThrow();
    expect(findJsonlFiles()).toEqual([join(LEGACY_PROJECTS, 'good.jsonl')]);
  });
});

describe('findSessionFile', () => {
  it('returns the path when the session file exists', () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      if (p === LEGACY_PROJECTS) return true;
      if (p === join(LEGACY_PROJECTS, 'project-a', 'sess-123.jsonl')) return true;
      return false;
    });
    vi.mocked(readdirSync).mockImplementation(((dir: string) => {
      if (dir === LEGACY_PROJECTS) return [dirEntry('project-a')];
      return [];
    }) as typeof readdirSync);

    expect(findSessionFile('sess-123')).toBe(
      join(LEGACY_PROJECTS, 'project-a', 'sess-123.jsonl')
    );
  });

  it('returns null when the session file does not exist', () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      if (p === LEGACY_PROJECTS) return true;
      return false;
    });
    vi.mocked(readdirSync).mockImplementation(((dir: string) => {
      if (dir === LEGACY_PROJECTS) return [dirEntry('project-a')];
      return [];
    }) as typeof readdirSync);

    expect(findSessionFile('nonexistent')).toBeNull();
  });

  it('returns null when no project directories exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(findSessionFile('sess-123')).toBeNull();
  });
});
