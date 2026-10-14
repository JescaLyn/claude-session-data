import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, appendFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/jsonl/parser.js';

function makeTempFile(lines: object[]): { filePath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'jsonl-test-'));
  const filePath = join(dir, 'session.jsonl');
  writeFileSync(filePath, lines.map(l => JSON.stringify(l)).join('\n') + '\n', 'utf-8');
  return { filePath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const BASE_ASSISTANT = {
  type: 'assistant',
  sessionId: 'sess-1',
  timestamp: '2026-01-01T00:00:00Z',
  costUSD: 0.01,
  message: {
    id: 'msg-1',
    model: 'claude-sonnet-4-6',
    usage: { input_tokens: 100, output_tokens: 50 },
  },
};

describe('parseFile', () => {
  describe('agentType extraction', () => {
    it('extracts agentType from toolUseResult on a user entry', () => {
      const line = {
        type: 'user',
        sessionId: 'sess-1',
        timestamp: '2026-01-01T00:00:00Z',
        costUSD: 0.01,
        toolUseResult: {
          agentType: 'Explore',
          agentId: 'sub-1',
          usage: { input_tokens: 100, output_tokens: 50 },
        },
      };
      const { filePath, cleanup } = makeTempFile([line]);
      try {
        const { entries } = parseFile(filePath, 0);
        expect(entries).toHaveLength(1);
        expect(entries[0].agentType).toBe('Explore');
      } finally {
        cleanup();
      }
    });

    it('extracts agentType from top-level obj.agentType', () => {
      const line = {
        ...BASE_ASSISTANT,
        agentType: 'code-reviewer',
      };
      const { filePath, cleanup } = makeTempFile([line]);
      try {
        const { entries } = parseFile(filePath, 0);
        expect(entries).toHaveLength(1);
        expect(entries[0].agentType).toBe('code-reviewer');
      } finally {
        cleanup();
      }
    });

    it('extracts agentType from message.content Agent tool_use block', () => {
      const line = {
        ...BASE_ASSISTANT,
        message: {
          ...BASE_ASSISTANT.message,
          id: 'msg-2',
          content: [
            {
              type: 'tool_use',
              name: 'Agent',
              input: { subagent_type: 'general-purpose' },
            },
          ],
        },
      };
      const { filePath, cleanup } = makeTempFile([line]);
      try {
        const { entries } = parseFile(filePath, 0);
        expect(entries).toHaveLength(1);
        expect(entries[0].agentType).toBe('general-purpose');
      } finally {
        cleanup();
      }
    });

    it('extracts agentType from message.content Task tool_use block', () => {
      const line = {
        ...BASE_ASSISTANT,
        message: {
          ...BASE_ASSISTANT.message,
          id: 'msg-3',
          content: [
            {
              type: 'tool_use',
              name: 'Task',
              input: { subagent_type: 'analyst' },
            },
          ],
        },
      };
      const { filePath, cleanup } = makeTempFile([line]);
      try {
        const { entries } = parseFile(filePath, 0);
        expect(entries).toHaveLength(1);
        expect(entries[0].agentType).toBe('analyst');
      } finally {
        cleanup();
      }
    });

    it('prefers toolUseResult.agentType over top-level agentType', () => {
      const line = {
        type: 'user',
        sessionId: 'sess-1',
        timestamp: '2026-01-01T00:00:00Z',
        costUSD: 0.01,
        agentType: 'top-level-type',
        toolUseResult: {
          agentType: 'tool-result-type',
          agentId: 'sub-1',
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      };
      const { filePath, cleanup } = makeTempFile([line]);
      try {
        const { entries } = parseFile(filePath, 0);
        expect(entries).toHaveLength(1);
        expect(entries[0].agentType).toBe('tool-result-type');
      } finally {
        cleanup();
      }
    });
  });

  describe('sessionName extraction', () => {
    it('extracts sessionName from obj.customTitle on an entry', () => {
      const line = {
        ...BASE_ASSISTANT,
        customTitle: 'my session',
      };
      const { filePath, cleanup } = makeTempFile([line]);
      try {
        const { entries } = parseFile(filePath, 0);
        expect(entries).toHaveLength(1);
        expect(entries[0].sessionName).toBe('my session');
      } finally {
        cleanup();
      }
    });

    it('leaves sessionName undefined when customTitle is absent', () => {
      const { filePath, cleanup } = makeTempFile([BASE_ASSISTANT]);
      try {
        const { entries } = parseFile(filePath, 0);
        expect(entries).toHaveLength(1);
        expect(entries[0].sessionName).toBeUndefined();
      } finally {
        cleanup();
      }
    });
  });

  describe('custom-title lines', () => {
    it('populates sessionNames from custom-title lines', () => {
      const titleLine = {
        type: 'custom-title',
        sessionId: 'sess-1',
        customTitle: 'My Session',
      };
      const { filePath, cleanup } = makeTempFile([titleLine]);
      try {
        const { sessionNames, entries } = parseFile(filePath, 0);
        expect(sessionNames.get('sess-1')).toBe('My Session');
        expect(entries).toHaveLength(0);
      } finally {
        cleanup();
      }
    });

    it('does not produce a JsonlEntry for custom-title lines', () => {
      const titleLine = {
        type: 'custom-title',
        sessionId: 'sess-2',
        customTitle: 'Another Session',
      };
      const { filePath, cleanup } = makeTempFile([titleLine, BASE_ASSISTANT]);
      try {
        const { sessionNames, entries } = parseFile(filePath, 0);
        expect(sessionNames.get('sess-2')).toBe('Another Session');
        expect(entries).toHaveLength(1);
        expect(entries[0].sessionId).toBe('sess-1');
      } finally {
        cleanup();
      }
    });
  });

  describe('entries without usage', () => {
    it('returns empty entries when no lines have usage data', () => {
      const noUsageLine = {
        type: 'assistant',
        sessionId: 'sess-1',
        timestamp: '2026-01-01T00:00:00Z',
        costUSD: 0,
        message: { id: 'msg-x', model: 'claude-sonnet-4-6' },
      };
      const titleLine = {
        type: 'custom-title',
        sessionId: 'sess-1',
        customTitle: 'No Usage Session',
      };
      const { filePath, cleanup } = makeTempFile([noUsageLine, titleLine]);
      try {
        const { entries, sessionNames } = parseFile(filePath, 0);
        expect(entries).toHaveLength(0);
        expect(sessionNames.get('sess-1')).toBe('No Usage Session');
      } finally {
        cleanup();
      }
    });
  });

  describe('fromOffset handling', () => {
    it('returns empty entries and empty sessionNames when file has not grown', () => {
      const { filePath, cleanup } = makeTempFile([BASE_ASSISTANT]);
      try {
        const first = parseFile(filePath, 0);
        const fileSize = first.newOffset;

        const second = parseFile(filePath, fileSize);
        expect(second.entries).toHaveLength(0);
        expect(second.sessionNames).toEqual(new Map());
      } finally {
        cleanup();
      }
    });

    it('only parses new bytes when fromOffset is mid-file', () => {
      const line1 = { ...BASE_ASSISTANT, message: { ...BASE_ASSISTANT.message, id: 'msg-a' } };
      const line2 = { ...BASE_ASSISTANT, message: { ...BASE_ASSISTANT.message, id: 'msg-b' } };
      const { filePath, cleanup } = makeTempFile([line1]);
      try {
        const first = parseFile(filePath, 0);
        expect(first.entries).toHaveLength(1);

        appendFileSync(filePath, JSON.stringify(line2) + '\n', 'utf-8');
        const second = parseFile(filePath, first.newOffset);
        expect(second.entries).toHaveLength(1);
        expect(second.entries[0].message?.id).toBe('msg-b');
      } finally {
        cleanup();
      }
    });

    it('resets to beginning when file is truncated (offset > file size)', () => {
      const { filePath, cleanup } = makeTempFile([BASE_ASSISTANT]);
      try {
        const result = parseFile(filePath, 999999);
        expect(result.entries).toHaveLength(1);
        expect(result.entries[0].message?.id).toBe('msg-1');
      } finally {
        cleanup();
      }
    });
  });

  describe('asyncAgentLaunch extraction', () => {
    it('extracts async agent launches from toolUseResult', () => {
      const line = {
        type: 'user',
        sessionId: 'parent-sess',
        timestamp: '2026-01-01T00:00:00Z',
        toolUseResult: {
          isAsync: true,
          status: 'async_launched',
          agentId: 'agent-abc',
          description: 'Review code changes',
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      };
      const { filePath, cleanup } = makeTempFile([line]);
      try {
        const { asyncAgentLaunches } = parseFile(filePath, 0);
        expect(asyncAgentLaunches).toHaveLength(1);
        expect(asyncAgentLaunches[0]).toEqual({
          agentId: 'agent-abc',
          description: 'Review code changes',
          parentSessionId: 'parent-sess',
        });
      } finally {
        cleanup();
      }
    });

    it('ignores non-async toolUseResults', () => {
      const line = {
        type: 'user',
        sessionId: 'sess-1',
        timestamp: '2026-01-01T00:00:00Z',
        toolUseResult: {
          isAsync: false,
          agentId: 'agent-abc',
          description: 'Not async',
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      };
      const { filePath, cleanup } = makeTempFile([line]);
      try {
        const { asyncAgentLaunches } = parseFile(filePath, 0);
        expect(asyncAgentLaunches).toHaveLength(0);
      } finally {
        cleanup();
      }
    });
  });

  describe('cost computation', () => {
    it('uses raw costUSD when present and positive', () => {
      const line = {
        ...BASE_ASSISTANT,
        costUSD: 0.42,
      };
      const { filePath, cleanup } = makeTempFile([line]);
      try {
        const { entries } = parseFile(filePath, 0);
        expect(entries[0].costUSD).toBe(0.42);
      } finally {
        cleanup();
      }
    });

    it('computes cost from tokens when costUSD is zero', () => {
      const line = {
        ...BASE_ASSISTANT,
        costUSD: 0,
        message: {
          id: 'msg-cost-0',
          model: 'claude-sonnet-4-6',
          usage: { input_tokens: 1000, output_tokens: 500 },
        },
      };
      const { filePath, cleanup } = makeTempFile([line]);
      try {
        const { entries } = parseFile(filePath, 0);
        // sonnet-4-6: $3/M input + $15/M output = 1000*3/1M + 500*15/1M = 0.003 + 0.0075 = 0.0105
        expect(entries[0].costUSD).toBeCloseTo(0.0105, 6);
      } finally {
        cleanup();
      }
    });

    it('computes cost from tokens when costUSD is null', () => {
      const line = {
        ...BASE_ASSISTANT,
        costUSD: null,
        message: {
          id: 'msg-cost-null',
          model: 'claude-haiku-4-5',
          usage: { input_tokens: 1000, output_tokens: 500 },
        },
      };
      const { filePath, cleanup } = makeTempFile([line]);
      try {
        const { entries } = parseFile(filePath, 0);
        // haiku: $1/M input + $5/M output = 0.001 + 0.0025 = 0.0035
        expect(entries[0].costUSD).toBeCloseTo(0.0035, 6);
      } finally {
        cleanup();
      }
    });

    it('includes cache tokens in cost computation', () => {
      const line = {
        ...BASE_ASSISTANT,
        costUSD: 0,
        message: {
          id: 'msg-cache',
          model: 'claude-sonnet-4-6',
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            cache_read_input_tokens: 10000,
            cache_creation_input_tokens: 5000,
          },
        },
      };
      const { filePath, cleanup } = makeTempFile([line]);
      try {
        const { entries } = parseFile(filePath, 0);
        // sonnet-4-6: cache_read $0.30/M, cache_write $3.75/M
        // 10000*0.30/1M + 5000*3.75/1M = 0.003 + 0.01875 = 0.02175
        expect(entries[0].costUSD).toBeCloseTo(0.02175, 6);
      } finally {
        cleanup();
      }
    });

    it('uses default pricing for unknown models', () => {
      const line = {
        ...BASE_ASSISTANT,
        costUSD: 0,
        message: {
          id: 'msg-unknown',
          model: 'claude-unknown-99',
          usage: { input_tokens: 1000, output_tokens: 500 },
        },
      };
      const { filePath, cleanup } = makeTempFile([line]);
      try {
        const { entries } = parseFile(filePath, 0);
        // default = sonnet-4-6 rates: $3/M input + $15/M output
        expect(entries[0].costUSD).toBeCloseTo(0.0105, 6);
      } finally {
        cleanup();
      }
    });

    it('matches opus-5-5 pricing (different from other opus models)', () => {
      const line = {
        ...BASE_ASSISTANT,
        costUSD: 0,
        message: {
          id: 'msg-opus55',
          model: 'claude-opus-5-5',
          usage: { input_tokens: 1000, output_tokens: 500 },
        },
      };
      const { filePath, cleanup } = makeTempFile([line]);
      try {
        const { entries } = parseFile(filePath, 0);
        // opus-5-5: $4/M input + $20/M output = 0.004 + 0.01 = 0.014
        expect(entries[0].costUSD).toBeCloseTo(0.014, 6);
      } finally {
        cleanup();
      }
    });

    it('matches generic opus pricing for 4.x models', () => {
      const line = {
        ...BASE_ASSISTANT,
        costUSD: 0,
        message: {
          id: 'msg-opus46',
          model: 'claude-opus-4-6',
          usage: { input_tokens: 1000, output_tokens: 500 },
        },
      };
      const { filePath, cleanup } = makeTempFile([line]);
      try {
        const { entries } = parseFile(filePath, 0);
        // opus-4.x: $5/M input + $25/M output = 0.005 + 0.0125 = 0.0175
        expect(entries[0].costUSD).toBeCloseTo(0.0175, 6);
      } finally {
        cleanup();
      }
    });
  });

  describe('deduplication', () => {
    it('deduplicates entries by message ID, keeping the last occurrence', () => {
      const line1 = { ...BASE_ASSISTANT, costUSD: 0.01 };
      const line2 = { ...BASE_ASSISTANT, costUSD: 0.02 };
      const { filePath, cleanup } = makeTempFile([line1, line2]);
      try {
        const { entries } = parseFile(filePath, 0);
        expect(entries).toHaveLength(1);
        expect(entries[0].costUSD).toBe(0.02);
      } finally {
        cleanup();
      }
    });
  });

  describe('invalid JSON handling', () => {
    it('skips invalid JSON lines and parses valid ones', () => {
      const dir = mkdtempSync(join(tmpdir(), 'jsonl-test-'));
      const filePath = join(dir, 'session.jsonl');
      const validLine = JSON.stringify(BASE_ASSISTANT);
      writeFileSync(filePath, `not valid json\n${validLine}\n{broken\n`, 'utf-8');
      try {
        const { entries } = parseFile(filePath, 0);
        expect(entries).toHaveLength(1);
        expect(entries[0].message?.id).toBe('msg-1');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('usage from toolUseResult fallback', () => {
    it('reads usage from toolUseResult when message.usage is absent', () => {
      const line = {
        type: 'user',
        sessionId: 'sess-1',
        timestamp: '2026-01-01T00:00:00Z',
        costUSD: 0.01,
        toolUseResult: {
          agentId: 'sub-1',
          usage: { input_tokens: 200, output_tokens: 100 },
        },
      };
      const { filePath, cleanup } = makeTempFile([line]);
      try {
        const { entries } = parseFile(filePath, 0);
        expect(entries).toHaveLength(1);
        expect(entries[0].message?.usage?.input_tokens).toBe(200);
        expect(entries[0].message?.usage?.output_tokens).toBe(100);
      } finally {
        cleanup();
      }
    });
  });

  describe('field extraction', () => {
    it('extracts agentId from top-level obj.agentId', () => {
      const line = { ...BASE_ASSISTANT, agentId: 'agent-top' };
      const { filePath, cleanup } = makeTempFile([line]);
      try {
        const { entries } = parseFile(filePath, 0);
        expect(entries[0].agentId).toBe('agent-top');
      } finally {
        cleanup();
      }
    });

    it('falls back to toolUseResult.agentId when obj.agentId is absent', () => {
      const line = {
        type: 'user',
        sessionId: 'sess-1',
        timestamp: '2026-01-01T00:00:00Z',
        costUSD: 0.01,
        toolUseResult: {
          agentId: 'agent-tur',
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      };
      const { filePath, cleanup } = makeTempFile([line]);
      try {
        const { entries } = parseFile(filePath, 0);
        expect(entries[0].agentId).toBe('agent-tur');
      } finally {
        cleanup();
      }
    });

    it('falls back to promptId when message.id is absent', () => {
      const line = {
        type: 'assistant',
        sessionId: 'sess-1',
        timestamp: '2026-01-01T00:00:00Z',
        costUSD: 0.01,
        promptId: 'prompt-xyz',
        message: {
          model: 'claude-sonnet-4-6',
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      };
      const { filePath, cleanup } = makeTempFile([line]);
      try {
        const { entries } = parseFile(filePath, 0);
        expect(entries[0].message?.id).toBe('prompt-xyz');
      } finally {
        cleanup();
      }
    });

    it('extracts cwd from the entry', () => {
      const line = { ...BASE_ASSISTANT, cwd: '/home/user/project' };
      const { filePath, cleanup } = makeTempFile([line]);
      try {
        const { entries } = parseFile(filePath, 0);
        expect(entries[0].cwd).toBe('/home/user/project');
      } finally {
        cleanup();
      }
    });
  });

  describe('type filtering', () => {
    it('excludes entries with unrecognized type', () => {
      const line = {
        type: 'system',
        sessionId: 'sess-1',
        timestamp: '2026-01-01T00:00:00Z',
        message: {
          id: 'msg-sys',
          model: 'claude-sonnet-4-6',
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      };
      const { filePath, cleanup } = makeTempFile([line]);
      try {
        const { entries } = parseFile(filePath, 0);
        expect(entries).toHaveLength(0);
      } finally {
        cleanup();
      }
    });

    it('includes user-type entries', () => {
      const line = {
        type: 'user',
        sessionId: 'sess-1',
        timestamp: '2026-01-01T00:00:00Z',
        costUSD: 0.01,
        toolUseResult: {
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      };
      const { filePath, cleanup } = makeTempFile([line]);
      try {
        const { entries } = parseFile(filePath, 0);
        expect(entries).toHaveLength(1);
      } finally {
        cleanup();
      }
    });
  });

  describe('error handling', () => {
    it('returns empty result for nonexistent file', () => {
      const result = parseFile('/nonexistent/path/session.jsonl', 0);
      expect(result.entries).toHaveLength(0);
      expect(result.newOffset).toBe(0);
    });
  });
});
