import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const cache = new Map<string, { name: string | null; timestamp: number }>();
const CACHE_DURATION_MS = 5000;

export function resolveSessionName(
  sessionId: string,
  baseDir: string = join(homedir(), '.claude', 'projects'),
  sessionsDir: string = join(homedir(), '.claude', 'sessions')
): string | null {
  const now = Date.now();
  const cached = cache.get(sessionId);
  if (cached && now - cached.timestamp < CACHE_DURATION_MS) {
    return cached.name;
  }

  const userSetName = findUserSetName(sessionId, sessionsDir);
  cache.set(sessionId, { name: userSetName ?? null, timestamp: now });
  return userSetName ?? null;
}

export function clearSessionNameCache(): void {
  cache.clear();
}

function findUserSetName(sessionId: string, sessionsDir: string): string | null {
  if (!existsSync(sessionsDir)) return null;
  let sessionFiles: string[];
  try {
    sessionFiles = readdirSync(sessionsDir, { withFileTypes: true })
      .filter(e => e.isFile() && e.name.endsWith('.json'))
      .map(e => join(sessionsDir, e.name));
  } catch {
    return null;
  }

  for (const filePath of sessionFiles) {
    try {
      const content = readFileSync(filePath, 'utf8');
      const record = JSON.parse(content) as Record<string, unknown>;
      if (record.sessionId === sessionId && typeof record.name === 'string' && record.name.length > 0) {
        return record.name;
      }
    } catch {
      // skip malformed files
    }
  }
  return null;
}
