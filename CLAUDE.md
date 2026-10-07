# claude-session-data

Shared utility package for reading Claude Code session data from the local filesystem.

## What This Package Does

Provides file discovery, incremental JSONL parsing, session name resolution, and project identification for Claude Code session files. Used by `@claude-monitor/core` and `session-manager`.

## Architecture

Leaf package with zero external dependencies (Node.js stdlib only). Consumers reference it via `file:` in package.json.

```
src/
  index.ts              # Barrel export
  jsonl/
    paths.ts            # findJsonlFiles(), findSessionFile(), PROJECT_DIRS
    parser.ts           # parseFile() — incremental byte-offset JSONL parser, cost computation
  session-names.ts      # resolveSessionName() — from ~/.claude/sessions/*.json
  utils.ts              # projectFromCwd()
```

## Key Design Decisions

- **Shared leaf package.** Exists so claude-monitor and session-manager share file discovery and parsing primitives without duplication.
- **No database.** This package reads files and returns data. Persistence (SQLite in monitor-core, in-memory in session-manager) is the consumer's concern.
- **Incremental parsing.** `parseFile()` accepts a byte offset and reads only new bytes. Consumers track state themselves (monitor-core persists offsets in SQLite; session-manager reads full files).
- **Cost-focused entry filtering.** `parseFile()` normalizes only entries with token usage (`message.usage`). Conversation content (text, thinking, tool_use blocks) is not extracted here. session-manager has its own content-focused parser (`transcript-reader.ts`) that reads the same files for different data.

## Ecosystem

Leaf dependency with no upstream dependencies. Both `@claude-monitor/core` and `session-manager` depend on it.

## Constraints

- **macOS paths.** Searches `~/.claude/projects/` and `~/.config/claude/projects/`. Linux/Windows deferred.
- **Not published to npm.** Consumed via `file:` references only.
- **Neutral naming in code and published files.** Package name and source must not reference internal project names so claude-monitor can push to GitHub independently.
