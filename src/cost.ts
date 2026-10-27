import { statSync, openSync, readSync, closeSync } from 'fs';
import { findSessionFile } from './jsonl/paths.js';

export interface ModelUsageEntry {
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  webSearchRequests: number;
  costUSD: number;
}

export interface SessionCost {
  sessionId: string;
  totalCostUSD: number;
  totalDuration: number;
  totalLinesAdded: number;
  totalLinesRemoved: number;
  modelUsage: Record<string, ModelUsageEntry>;
}

const CHUNK_SIZE = 512 * 1024;
const COST_STATE_MARKER = Buffer.from('"cost-state"');

export function extractSessionCost(filePath: string): SessionCost | null {
  try {
    const stat = statSync(filePath);
    const fd = openSync(filePath, 'r');
    try {
      let offset = stat.size;
      while (offset > 0) {
        const readStart = Math.max(0, offset - CHUNK_SIZE);
        const len = offset - readStart;
        const buf = Buffer.alloc(len);
        const bytesRead = readSync(fd, buf, 0, len, readStart);
        const data = buf.subarray(0, bytesRead);

        // Skip the leading partial line (it continues in the previous chunk) so
        // every line is parsed whole.
        let bodyStart = 0;
        if (readStart > 0) {
          const firstNewline = data.indexOf(0x0a);
          if (firstNewline !== -1) bodyStart = firstNewline + 1;
        }

        // Scan matches newest-first; a malformed or non-cost-state match
        // must not hide an earlier valid entry.
        let searchEnd = data.length;
        while (searchEnd > bodyStart) {
          const markerIdx = data.lastIndexOf(COST_STATE_MARKER, searchEnd - 1);
          if (markerIdx < bodyStart) break;
          const lineStart = Math.max(bodyStart, data.lastIndexOf(0x0a, markerIdx) + 1);
          let lineEnd = data.indexOf(0x0a, markerIdx);
          if (lineEnd === -1) lineEnd = data.length;
          try {
            const entry = JSON.parse(data.subarray(lineStart, lineEnd).toString('utf-8'));
            if (entry.type === 'cost-state') {
              return {
                sessionId: entry.sessionId,
                totalCostUSD: entry.totalCostUSD ?? 0,
                totalDuration: entry.totalDuration ?? 0,
                totalLinesAdded: entry.totalLinesAdded ?? 0,
                totalLinesRemoved: entry.totalLinesRemoved ?? 0,
                modelUsage: entry.modelUsage ?? {},
              };
            }
          } catch {
            // malformed line, keep searching
          }
          searchEnd = lineStart;
        }

        // Next chunk ends where this one's body begins (a line boundary).
        // Guard: if the chunk holds no complete line, step back without alignment.
        offset = readStart + bodyStart < offset ? readStart + bodyStart : readStart;
      }
      return null;
    } finally {
      closeSync(fd);
    }
  } catch {
    return null;
  }
}

export function extractSessionCostById(sessionId: string): SessionCost | null {
  const filePath = findSessionFile(sessionId);
  if (!filePath) return null;
  return extractSessionCost(filePath);
}
