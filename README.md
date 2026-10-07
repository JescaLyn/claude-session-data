# claude-session-data

Read Claude Code's local session data: find and incrementally parse session transcripts (`.jsonl`), compute per-message cost, and resolve user-given session names. No database, no server, and no dependencies beyond Node's standard library.

claude-monitor uses it for JSONL ingestion, but it is usable on its own.

## Install

Ships as TypeScript source (`"main": "src/index.ts"`), so consuming projects need a TypeScript-aware runtime or bundler such as [tsx](https://github.com/privatenumber/tsx), Vite, or esbuild.

```bash
npm install claude-session-data
```

Or as a local `file:` dependency:

```json
"claude-session-data": "file:../claude-session-data"
```

## Usage

```ts
import { findJsonlFiles, parseFile, resolveSessionName } from 'claude-session-data';

for (const file of findJsonlFiles()) {
  const { entries, sessionNames, newOffset } = parseFile(file);
  for (const e of entries) {
    console.log(e.sessionId, e.message?.model, e.costUSD.toFixed(4));
  }
  // Store newOffset and pass it back next time to read only new lines:
  // parseFile(file, newOffset)
}

const name = resolveSessionName(sessionId); // string | null
```

## API

- **`findJsonlFiles(): string[]`** — every `.jsonl` file under `PROJECT_DIRS`
- **`findSessionFile(sessionId): string | null`** — path to one session's transcript
- **`PROJECT_DIRS: string[]`** — directories searched: `~/.config/claude/projects` and `~/.claude/projects`
- **`parseFile(filePath, fromOffset = 0): ParseResult`** — parses lines added since `fromOffset`. Returns `entries` (cost-bearing messages, deduplicated by message ID), `sessionNames` (session ID to custom title), `asyncAgentLaunches` (background agents with their descriptions and parent session), and `newOffset` for the next call. A truncated file is re-read from the start.
- **`resolveSessionName(sessionId, baseDir?, sessionsDir?): string | null`** — the user-given name from `~/.claude/sessions/*.json`. Those files exist only while the session is running. Results are cached for 5 seconds.
- **`clearSessionNameCache(): void`** — drops the name cache
- **`projectFromCwd(cwd): string`** — project name for a working directory (its basename), as claude-monitor groups it

Types: `JsonlEntry`, `ParseState`, `AsyncAgentLaunch`, `ParseResult`.

## Notes

- When a transcript entry has no `costUSD`, cost is computed from token counts using built-in per-model rates (Sonnet rates for unknown models). Treat it as an estimate.
- Session names aren't part of Claude Code's OpenTelemetry stream. This package reads them from local files, so it only sees sessions on the machine it runs on.

## License

MIT
