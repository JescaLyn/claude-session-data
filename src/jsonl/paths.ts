import { readdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { homedir } from 'os';

export const PROJECT_DIRS = [
  resolve(homedir(), '.config/claude/projects'),
  resolve(homedir(), '.claude/projects'),
];

export function findJsonlFiles(): string[] {
  const files = new Set<string>();

  for (const projectDir of PROJECT_DIRS) {
    if (!existsSync(projectDir)) continue;
    walkDir(projectDir, (filePath) => {
      if (filePath.endsWith('.jsonl')) {
        files.add(filePath);
      }
    });
  }

  return Array.from(files);
}

export function findSessionFile(sessionId: string): string | null {
  for (const projectDir of PROJECT_DIRS) {
    if (!existsSync(projectDir)) continue;

    let subdirs: string[];
    try {
      subdirs = readdirSync(projectDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => join(projectDir, e.name));
    } catch {
      continue;
    }

    for (const subdir of subdirs) {
      const filePath = join(subdir, `${sessionId}.jsonl`);
      if (existsSync(filePath)) return filePath;
    }
  }

  return null;
}

function walkDir(dir: string, callback: (path: string) => void): void {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath, callback);
      } else if (entry.isFile()) {
        callback(fullPath);
      }
    }
  } catch {
    // ignore read errors
  }
}
