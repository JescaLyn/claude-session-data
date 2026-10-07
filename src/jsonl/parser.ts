import { statSync, openSync, readSync, closeSync } from 'fs';

export interface JsonlEntry {
  sessionId: string;
  timestamp: string;
  type: string;
  costUSD: number;
  agentId?: string;
  agentType?: string;
  sessionName?: string;
  message?: {
    id: string;
    model: string;
    usage?: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  cwd?: string;
}

export interface ParseState {
  byteOffset: number;
  fileSize: number;
  mtime: string;
}

export interface AsyncAgentLaunch {
  agentId: string;
  description: string;
  parentSessionId: string;
}

export interface ParseResult {
  entries: JsonlEntry[];
  sessionNames: Map<string, string>;
  asyncAgentLaunches: AsyncAgentLaunch[];
  newOffset: number;
}

export function parseFile(
  filePath: string,
  fromOffset: number = 0
): ParseResult {
  try {
    const stat = statSync(filePath);

    if (stat.size === fromOffset) {
      return { entries: [], sessionNames: new Map(), asyncAgentLaunches: [], newOffset: fromOffset };
    }

    if (stat.size < fromOffset) {
      fromOffset = 0;
    }

    const fd = openSync(filePath, 'r');
    const bytesToRead = stat.size - fromOffset;
    const buf = Buffer.alloc(bytesToRead);

    try {
      readSync(fd, buf, 0, bytesToRead, fromOffset);
    } finally {
      closeSync(fd);
    }

    const text = buf.toString('utf-8');
    const lines = text.split('\n');

    const entries = new Map<string, JsonlEntry>();
    const sessionNames = new Map<string, string>();
    const asyncLaunches = new Map<string, AsyncAgentLaunch>();

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const raw = JSON.parse(line);
        const obj = raw as Record<string, unknown>;

        if (obj.type === 'custom-title' && obj.customTitle) {
          const sessionId = obj.sessionId as string;
          const customTitle = obj.customTitle as string;
          if (sessionId && customTitle) {
            sessionNames.set(sessionId, customTitle);
          }
        }

        const tur = obj.toolUseResult as Record<string, unknown> | undefined;
        if (tur && tur.isAsync === true && tur.status === 'async_launched') {
          const agentId = tur.agentId as string | undefined;
          const description = tur.description as string | undefined;
          const parentSessionId = obj.sessionId as string | undefined;
          if (agentId && description && parentSessionId) {
            asyncLaunches.set(agentId, { agentId, description, parentSessionId });
          }
        }

        const entry = normalizeEntry(raw);

        if (entry && entry.message?.id) {
          entries.set(entry.message.id, entry);
        }
      } catch {
        // skip invalid JSON lines
      }
    }

    return {
      entries: Array.from(entries.values()),
      sessionNames,
      asyncAgentLaunches: Array.from(asyncLaunches.values()),
      newOffset: stat.size,
    };
  } catch (err) {
    console.error(`[jsonl-parser] Error reading ${filePath}:`, err instanceof Error ? err.message : String(err));
    return { entries: [], sessionNames: new Map(), asyncAgentLaunches: [], newOffset: fromOffset };
  }
}

const MODEL_PRICING: Record<string, [number, number, number, number]> = {
  'claude-fable-5':    [10.00, 50.00, 0.25, 12.50],
  'claude-opus-5-5':   [4.00,  20.00, 0.20,  5.00],
  'claude-opus-':      [5.00,  25.00, 0.50,  6.25],
  'claude-sonnet-5':   [2.00,  10.00, 0.20,  2.50],
  'claude-sonnet-4-6': [3.00,  15.00, 0.30,  3.75],
  'claude-haiku-4-5':  [1.00,   5.00, 0.10,  1.25],
  'default':           [3.00,  15.00, 0.30,  3.75],
};

function computeCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheCreationTokens: number
): number {
  let pricing = MODEL_PRICING['default'];
  for (const [key, rates] of Object.entries(MODEL_PRICING)) {
    if (key !== 'default' && model.includes(key)) {
      pricing = rates;
      break;
    }
  }
  const [pIn, pOut, pCr, pCw] = pricing;
  return (inputTokens * pIn + outputTokens * pOut + cacheReadTokens * pCr + cacheCreationTokens * pCw) / 1_000_000;
}

function normalizeEntry(raw: unknown): JsonlEntry | null {
  if (typeof raw !== 'object' || raw === null) return null;

  const obj = raw as Record<string, unknown>;

  const message = obj.message as Record<string, unknown> | undefined;
  let usage = message?.usage as Record<string, unknown> | undefined;

  if (!usage) {
    const toolUseResult = obj.toolUseResult as Record<string, unknown> | undefined;
    usage = toolUseResult?.usage as Record<string, unknown> | undefined;
  }

  if (!usage || typeof usage !== 'object') return null;

  const inputTokens = usage.input_tokens as number | undefined;
  const outputTokens = usage.output_tokens as number | undefined;

  if (typeof inputTokens !== 'number' || typeof outputTokens !== 'number') {
    return null;
  }

  if (obj.type !== 'assistant' && obj.type !== 'user') return null;

  let agentType: string | undefined;

  const toolUseResult = obj.toolUseResult as Record<string, unknown> | undefined;
  if (toolUseResult && typeof toolUseResult === 'object') {
    agentType = toolUseResult.agentType as string | undefined;
  }

  if (!agentType) {
    agentType = obj.agentType as string | undefined;
  }

  if (!agentType && message) {
    const content = message.content as Record<string, unknown>[] | undefined;
    if (content && Array.isArray(content)) {
      for (const block of content) {
        if (typeof block === 'object' && block !== null) {
          const blockObj = block as Record<string, unknown>;
          if ((blockObj.type === 'tool_use') && (blockObj.name === 'Agent' || blockObj.name === 'Task')) {
            const input = blockObj.input as Record<string, unknown> | undefined;
            if (input && typeof input === 'object') {
              const extractedType = input.subagent_type as string | undefined;
              if (extractedType) {
                agentType = extractedType;
                break;
              }
            }
          }
        }
      }
    }
  }

  const messageId = message?.id ?? (obj.promptId as string) ?? 'unknown';
  const model = (message?.model as string) ?? 'unknown';

  const sessionName = obj.customTitle as string | undefined;

  const cacheCreationTokens = usage.cache_creation_input_tokens as number ?? 0;
  const cacheReadTokens = usage.cache_read_input_tokens as number ?? 0;
  const rawCost = obj.costUSD as number | null | undefined;
  const costUSD = (rawCost != null && rawCost > 0)
    ? rawCost
    : computeCost(model, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens);

  return {
    sessionId: obj.sessionId as string,
    timestamp: obj.timestamp as string,
    type: 'assistant',
    costUSD,
    agentId: (obj.agentId ?? (obj.toolUseResult as Record<string, unknown>)?.agentId) as string | undefined,
    agentType,
    sessionName,
    message: {
      id: messageId as string,
      model,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_creation_input_tokens: cacheCreationTokens || undefined,
        cache_read_input_tokens: cacheReadTokens || undefined,
      },
    },
    cwd: obj.cwd as string | undefined,
  };
}
