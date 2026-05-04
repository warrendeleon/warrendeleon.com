---
title: "Building an MCP server for Claude Code"
description: "A walkthrough of the FastMCP server I expose to Claude Code: six tools for searching past conversations, logging actions, and watching the indexing queue. Code, registration, and the bits the docs leave out."
publishDate: 2026-08-24
tags: ["claude-code", "mcp", "python", "fastmcp", "ai-tooling"]
locale: en
campaign: "claude-mcp-server"
relatedPosts: ["giving-claude-a-memory-with-a-local-rag", "the-watcher-and-indexer-behind-a-local-rag", "pairing-claude-rag-with-a-curated-wiki"]
---

This is part 2 of a four-part series on giving Claude Code persistent memory. Part 1 covered [the design and the lessons from the build](/blog/giving-claude-a-memory-with-a-local-rag/). This part is the tutorial: write a small MCP server in Python, register it with Claude Code, and end up with six new tools the model can call.

Full source for the server: [`rag/src/server.py`](https://github.com/warrendeleon/dotfiles/blob/main/rag/src/server.py) in my dotfiles.

## What MCP gives you

Model Context Protocol is the contract Claude Code uses to discover external tools. You write a process that speaks MCP over stdio, register it in a JSON file, and on the next session the model has new tools in its tool list. Claude calls them the same way it calls `Read` or `Bash`.

The minimum viable MCP server is a few dozen lines of Python with [FastMCP](https://github.com/jlowin/fastmcp).

> 💡 **What you don't have to do:** no HTTP server, no auth flow, no message-pump boilerplate. FastMCP handles the protocol. You write functions and decorate them with `@mcp.tool()`.

## Project layout

```text
rag/
  pyproject.toml
  src/
    __init__.py
    server.py      ← the MCP server (this post)
    store.py       ← ChromaDB + embedding wrapper
    queue_db.py    ← SQLite job queue
    audit.py       ← audit log
```

Dependencies in `pyproject.toml`:

```toml
[project]
name = "rag"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "mcp[cli]",
    "chromadb",
    "sentence-transformers",
    "pyyaml",
]
```

Install into a venv:

```bash
python3 -m venv ~/.rag/venv
~/.rag/venv/bin/pip install -e ~/Developer/dotfiles/rag
```

The server runs as a subprocess Claude Code spawns. It needs a venv it can find at a stable path.

## The skeleton

```python
"""FastMCP server exposing RAG tools to Claude Code."""
from __future__ import annotations

import logging
from mcp.server.fastmcp import FastMCP

from .store import Store
from .queue_db import JobQueue, JobType
from .audit import AuditLog

logger = logging.getLogger(__name__)
mcp = FastMCP("rag", log_level="WARNING")

_store: Store | None = None
_queue: JobQueue | None = None
_audit: AuditLog | None = None
```

Three lazily-initialised singletons. ChromaDB takes a few hundred milliseconds to open, the embedding model takes a couple of seconds to load. You don't want either happening at server startup, because Claude Code waits on the handshake.

```python
def _get_store() -> Store:
    global _store
    if _store is None:
        _store = Store()
    return _store
```

Same pattern for `_get_queue` and `_get_audit`. The store loads on the first `search` call, not before.

## A tool is just a decorated function

```python
@mcp.tool()
def search(query: str, n_results: int = 10) -> str:
    """Search indexed conversations semantically.

    Use this to find past discussions, decisions, or context from previous
    Claude Code sessions.

    Args:
        query: Natural language search query.
        n_results: Number of results to return (default 10).
    """
    n_results = min(max(1, n_results), MAX_SEARCH_RESULTS)
    store = _get_store()

    try:
        results = store.search(query, n_results=n_results)
    except Exception:
        logger.exception("Search failed")
        return "Search failed. Check that the embedding model is available."

    if not results:
        return "No results found."

    parts: list[str] = []
    for i, r in enumerate(results, 1):
        meta = r.get("metadata", {})
        source = meta.get("file_path", "unknown")
        distance = r.get("distance", 0)
        relevance = f"{max(0, (1 - distance)) * 100:.0f}%" if distance < 1 else "low"
        header = f"[{i}] {source} -- relevance: {relevance}"

        meta_parts = []
        if meta.get("session_id"):
            meta_parts.append(f"session: {meta['session_id']}")
        if meta.get("project"):
            meta_parts.append(f"project: {meta['project']}")
        if meta.get("timestamp"):
            meta_parts.append(f"time: {meta['timestamp']}")
        if meta_parts:
            header += f" [{', '.join(meta_parts)}]"

        doc = r.get("document", "")
        if len(doc) > 500:
            doc = doc[:500] + "..."

        parts.append(f"{header}\n{doc}")

    return "\n\n---\n\n".join(parts)
```

A few non-obvious things in there.

**The docstring is the prompt.** Claude reads the docstring to decide when to call the tool and what arguments to pass. "Use this to find past discussions, decisions, or context" matters more than the function name. Write it the way you'd write a CLAUDE.md instruction.

**Return strings, not objects.** Tool returns get fed back into the model as text. JSON or dicts get coerced and the formatting is yours to control. I format results as numbered, dashed-separated blocks with a relevance percentage. Dense, readable, easy to cite.

**Truncate aggressively.** `doc[:500] + "..."` keeps each result short. Search returns ten of these by default, so 10 × 500 chars is the upper bound. The model can call `search` again with a more specific query if it wants the next page.

**Catch and convert exceptions.** A raised exception inside a tool returns an error to Claude that's hard for the model to recover from. A returned string ("Search failed. Check that the embedding model is available.") is something the model can read and reason about. Same shape, much friendlier failure mode.

## The other five tools

Same pattern, different jobs:

```python
@mcp.tool()
def get_context(topic: str, n_results: int = 5) -> str:
    """Quick context retrieval for a topic.

    Use this when you need quick background on a topic discussed previously.
    """
    return search(query=topic, n_results=n_results)
```

A thin wrapper on `search`. It exists so the model has a more semantically obvious entry point for "I need background on X" rather than "I want to find Y". Both end up calling the same code.

```python
@mcp.tool()
def log_action(description: str, files_affected: list[str] | None = None) -> str:
    """Record an action in the audit log.

    Call this after completing significant work (commits, refactors,
    architectural decisions) so the action is searchable later.
    """
    try:
        audit = _get_audit()
        entry_id = audit.log(description=description, files_affected=files_affected)
        return f"Logged (entry #{entry_id}): {description}"
    except Exception:
        logger.exception("Failed to write audit log")
        return "Failed to write audit log entry."
```

Writes to a separate SQLite table. Conversations get embedded into vectors; audit entries stay as plain text rows with a timestamp. `get_audit_log(since="24h")` reads them back.

```python
@mcp.tool()
def index_file(path: str) -> str:
    """Manually trigger indexing for a conversation JSONL file."""
    file_path = Path(path)
    if not file_path.exists():
        return f"File not found: {path}"
    if file_path.suffix != ".jsonl":
        return "Only conversation JSONL files are supported."
    if not _is_allowed_path(file_path):
        return "Path is outside allowed directories."
    if file_path.is_symlink():
        resolved = file_path.resolve()
        if not _is_allowed_path(resolved):
            return "Symlink target is outside allowed directories."

    queue = _get_queue()
    job_id = queue.enqueue(
        str(file_path.resolve()),
        JobType.CONVERSATION.value,
        priority=100,
    )
    return f"Queued for indexing (job #{job_id}): {path}" if job_id \
        else f"Already queued or unchanged: {path}"
```

This one needed input validation. The model will pass any string the user mentions. Three cheap defences, all returning friendly strings rather than raising:

```python
_ALLOWED_ROOTS = (Path.home() / ".claude",)

def _is_allowed_path(path: Path) -> bool:
    """Check that a resolved path falls under an allowed root."""
    try:
        resolved = path.resolve(strict=True)
    except OSError:
        return False
    return any(
        resolved == root or root in resolved.parents
        for root in _ALLOWED_ROOTS
    )
```

Resolve symlinks. Check the resolved path falls under an allow-listed root. Reject anything else. The function the model can reach has no way to point the indexer at `/etc/passwd`.

```python
@mcp.tool()
def get_indexing_status() -> str:
    """Check whether the indexing queue is idle or still processing."""
    queue = _get_queue()
    counts = queue.stats()
    if not counts:
        return "Queue is empty. No jobs have been submitted."

    pending = counts.get("pending", 0)
    processing = counts.get("processing", 0)
    completed = counts.get("completed", 0)
    failed = counts.get("failed", 0)

    if pending == 0 and processing == 0:
        status = "idle"
    elif processing > 0:
        status = "processing"
    else:
        status = "queued"

    parts = [
        f"Status: {status}",
        f"Pending: {pending}  |  Processing: {processing}  |  "
        f"Completed: {completed}  |  Failed: {failed}",
    ]

    if processing > 0:
        active = queue.get_processing_jobs()
        if active:
            parts.append("\nCurrently processing:")
            for job in active:
                parts.append(
                    f"  - [{job['job_type']}] {job['file_path']} "
                    f"(attempt {job['attempts']})"
                )
    return "\n".join(parts)
```

Useful when you've just started a session and want to know whether the RAG is caught up. The model also calls this on its own when the user asks "is the indexing done?".

```python
@mcp.tool()
def get_failed_jobs(limit: int = 20) -> str:
    """View jobs that failed indexing, with error details."""
    queue = _get_queue()
    jobs = queue.get_failed_jobs(limit=limit)
    if not jobs:
        return "No failed jobs."

    parts: list[str] = []
    for job in jobs:
        ts = time.strftime("%Y-%m-%d %H:%M", time.localtime(job["created_at"]))
        error = job.get("error") or "unknown error"
        parts.append(
            f"[{ts}] #{job['id']} ({job['job_type']}) {job['file_path']}\n"
            f"  Attempts: {job['attempts']}/{job['max_attempts']}  "
            f"|  Error: {error}"
        )
    return "\n\n".join(parts)
```

Failed jobs are weirdly the most useful debugging tool I added. When the embedding model can't open a file, or a JSONL has a malformed turn, the failure ends up here with a stack-trace tail. Asking Claude "what failed?" gets you a list of files and reasons in two seconds.

## The entrypoint

```python
def main() -> None:
    logging.basicConfig(
        level=logging.WARNING,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
```

`mcp.run(transport="stdio")` is the whole protocol layer. FastMCP reads JSON-RPC messages from stdin, dispatches to the decorated functions, writes responses to stdout. Claude Code spawns this process on session start and tears it down on exit.

Important: the process must not write anything else to stdout. Logs go to stderr (or a file). A stray `print()` will corrupt the protocol stream and Claude Code will silently drop the server.

## Registering with Claude Code

A wrapper script activates the venv and runs the module:

```bash
#!/bin/bash
# ~/.rag/start-server.sh
cd "$HOME/Developer/dotfiles/rag"
exec "$HOME/.rag/venv/bin/python" -m src.server
```

```bash
chmod +x ~/.rag/start-server.sh
```

Then `~/.claude/mcp_servers.json`:

```json
{
  "mcpServers": {
    "rag": {
      "command": "/Users/warrendeleon/.rag/start-server.sh"
    }
  }
}
```

That's the whole registration. Restart Claude Code; the next session has six new tools.

You can verify the server is alive without going through Claude:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  | ~/.rag/start-server.sh
```

Returns the JSON-RPC tool list. If that works, Claude will see them.

> 💡 **Gotcha worth knowing:** `claude mcp add -s user rag` writes to `~/.claude.json` (the settings file), which is the wrong place. Claude Code reads MCP server registrations from `~/.claude/mcp_servers.json`. Edit that file directly instead.

## Telling Claude to use the tools

Registered tools that the model never reaches for are dead weight. Half the work is a paragraph in `~/.claude/CLAUDE.md`:

```markdown
### Past Conversations
- **Never say "I don't remember" or "I don't have access to previous
  conversations".** A local RAG system indexes all past conversations.
- When I reference a past discussion ("we talked about X", "remember when",
  "like before"), call `mcp__rag__search` first.

### When to log (call `log_action` proactively):
- After creating a commit
- After completing a multi-step task (setup, refactor, migration, bug fix)
- After resolving a non-obvious bug (include root cause)
- After significant config changes (dotfiles, CI, deploy)
```

Without this, Claude defaults to "I don't have access to previous sessions". The trained behaviour is true for a fresh API call, no longer true here. The instructions reframe what the model assumes about its own capabilities.

## What you've got

A Python module with six decorated functions and around 300 lines of code. A 30-line JSON file. A two-line bash wrapper. That's enough to give Claude Code persistent search over your conversation history, an audit log it writes to itself, and visibility into the indexing pipeline.

The interesting part isn't the protocol. FastMCP makes that almost invisible. The interesting parts are the things that don't show up in MCP tutorials: lazy initialisation so the handshake stays fast, returning strings not objects, catching exceptions to friendly messages, validating paths before they reach the file system, and writing docstrings that read like prompts.

The next post covers the other half of the system: the watcher that detects new conversation files and the indexer that actually populates the vector store. The MCP server is the front door; the watcher and indexer are what fill the building.
