---
title: "Building an MCP server for Claude Code"
description: "A walkthrough of the FastMCP server I expose to Claude Code: eight tools for searching past conversations, logging actions, and watching the indexing queue."
heroImage: "/images/blog/mcp-server.webp"
heroImgPrompt: "A small cube server connected by one pipe, seven plain tool-shaped icons fanning out from a single doorway toward a larger machine block"
heroPalette: ["#6DC402", "#1F2D4D", "#E9664B", "#2A9D8F", "#7A4E8C", "#E8A93C", "#F3B4C1", "#A9D3EF", "#2C2C34", "#EBD9B4"]
heroBgColor: "#F6DCE2"
heroAlt: "A small server cube with tool icons fanning out from a single doorway toward a larger machine"
publishDate: 2027-01-18
series: "Claude RAG + Tooling"
tags: ["claude-code", "mcp", "python", "fastmcp", "ai-tooling"]
locale: en
campaign: "claude-mcp-server"
relatedPosts: ["giving-claude-a-memory-with-a-local-rag", "the-watcher-and-indexer-behind-a-local-rag", "pairing-claude-rag-with-a-curated-wiki"]
---

This is part 2 of a four-part series on giving Claude Code persistent memory. Part 1 covered [the design and the lessons from the build](/blog/giving-claude-a-memory-with-a-local-rag/). This part is the tutorial: write a small MCP server in Python, register it with Claude Code, and end up with eight new tools the model can call.

Full source for the server: [`rag/src/server.py`](https://github.com/warrendeleon/dotfiles/blob/main/rag/src/server.py) in my dotfiles.

## Where MCP earns its place

Claude Code already gives the model a decent toolbox. The built-in `Read`, `Bash`, and `Grep` tools cover a lot. Custom slash commands handle deterministic recipes. Sub-agents handle long-running orchestration. If those cover the job, use them. The bar for adding an MCP server should be: I want a piece of behaviour the model can reach from any session, in any project, without the user remembering a slash command.

That's the niche this one fills. Hybrid search across transcripts and a curated wiki. A persistent audit log. A read-only view into a background indexing queue. None of those map cleanly to a built-in tool or a slash command. They want to be sat behind a Python process that owns the embedding model and the SQLite database.

Model Context Protocol is the contract Claude Code uses to discover that process. You write something that speaks MCP over stdio, register it in a JSON file, and on the next session the model has new tools in its tool list. Claude calls them the same way it calls `Read` or `Bash`.

The minimum viable MCP server is a few dozen lines of Python with FastMCP, the high-level API that ships inside the official [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk) (the `mcp` package; a separate, newer project also called FastMCP exists, but this code imports the bundled one). FastMCP handles the protocol layer. You write functions and decorate them with `@mcp.tool()`. No HTTP server, no auth flow, no message-pump boilerplate.

A note on the threat model. This server runs locally over stdio, not as a public HTTP service. Claude Code spawns it as a subprocess and talks to it through pipes, so there's no listening port and no remote attack surface. The boundary that does matter: the tools below return private transcript snippets, audit-log entries, and arbitrary file paths under `~/.claude/`. Only register this server in environments you trust with that data. Don't drop the same registration into a shared workstation or a CI runner.

## Project layout

```text
rag/
  pyproject.toml
  src/
    __init__.py
    server.py      ← the MCP server (this post)
    store.py       ← ChromaDB + embedding wrapper
    fts.py         ← SQLite FTS5 keyword index (the other half of search)
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
    "chromadb>=0.5.0,<1.0",
    "mcp[cli]>=1.0.0,<2.0",
    "pyyaml>=6.0",
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
import time
from pathlib import Path
from typing import Any

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

Three lazily-initialised singletons. ChromaDB takes a few hundred milliseconds to open. The embedding model takes a couple of seconds to load. You don't want either happening at server startup, because Claude Code waits on the handshake before declaring the server ready.

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
    """Search the curated wiki and past conversations semantically.

    Returns a COMPACT INDEX of merged, ranked hits from two sources: the curated
    wiki (section-level chunks of human-reviewed knowledge) and past Claude Code
    conversations (raw turns, for recall). Each hit shows its source, a one-line
    snippet, an id, and an approximate token cost. To read the full text of the
    hits you want, call get_chunks with their ids. Use get_context instead when
    you want the full text of the top few hits in one go.

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

    return (
        f"{len(results)} hit(s). Compact index below; call get_chunks([ids]) "
        f"for full text.\n\n" + format_index(results)
    )
```

The store call behind it does the heavy lifting: hybrid retrieval, a vector leg fused with a SQLite FTS5 keyword leg, across two collections (conversation turns and wiki page sections). That's [part 3's](/blog/the-watcher-and-indexer-behind-a-local-rag/) territory. What matters here is the return shape.

**The tool returns an index, not documents.** Early versions returned the top ten hits with each document truncated to 500 characters. That's the worst of both worlds: long enough to flood the context window, short enough to cut off the part you needed. The current design is progressive disclosure. `search` returns one line per hit (source, snippet, id, estimated token cost); the model scans the index and opens only the hits it wants:

```python
def _estimate_tokens(text: str) -> int:
    """Rough token count so the caller can budget before opening a chunk."""
    return max(1, len(text) // 4)


def _snippet(text: str, limit: int = 160) -> str:
    """One-line preview: whitespace collapsed, capped, with an ellipsis."""
    flat = " ".join(text.split())
    return flat[:limit] + ("..." if len(flat) > limit else "")


def format_index(results: list[dict[str, Any]]) -> str:
    """Compact index: one block per hit with its id, a snippet, and token cost.

    Progressive disclosure, the caller scans this and opens only what it needs
    via get_chunks(ids), rather than every full document arriving inline.
    """
    parts: list[str] = []
    for i, r in enumerate(results, 1):
        doc = r.get("document", "")
        header = _result_header(i, r, with_relevance=True)
        parts.append(
            f"{header}  |  id: {r.get('id', '?')}  |  ~{_estimate_tokens(doc)} tokens\n"
            f"    {_snippet(doc)}"
        )
    return "\n\n".join(parts)
```

`_result_header` builds the source line: a `(wiki)` or `(conversation)` tag, the file path, a relevance percentage for vector hits (or `match: keyword` for keyword-only ones), and source-specific metadata like session id or page section.

The other half of the pair fetches full text by id:

```python
@mcp.tool()
def get_chunks(ids: list[str]) -> str:
    """Fetch the full text of search hits by their ids.

    Pass the ids from a search result to read their full documents. Ids that no
    longer exist are skipped.

    Args:
        ids: Document ids from a prior search.
    """
    if not ids:
        return "No ids given."
    store = _get_store()
    try:
        docs = store.get_documents(ids)
    except Exception:
        logger.exception("get_chunks failed")
        return "Failed to fetch chunks."

    if not docs:
        return "No matching chunks found for those ids."

    # Preserve the caller's id order.
    by_id = {d["id"]: d for d in docs}
    ordered = [by_id[i] for i in ids if i in by_id]
    return format_full(ordered, with_relevance=False)
```

A few non-obvious things in there.

**The docstring is the prompt.** Claude reads the docstring to decide when to call the tool and what arguments to pass. "To read the full text of the hits you want, call get_chunks with their ids" is what teaches the model the two-step flow; no other wiring connects the two tools. Write docstrings the way you'd write a CLAUDE.md instruction.

**Return strings, not objects.** Tool returns get fed back into the model as text. JSON or dicts get coerced and the formatting is yours to control. I format the index as compact labelled lines with a relevance percentage. Dense, readable, easy to cite.

**Make the model budget its own context.** The `~N tokens` estimate on each hit is there so the model can decide whether opening a chunk is worth the cost. Ten snippets cost a few hundred tokens; ten full turns could cost tens of thousands. The index makes that trade visible instead of making it for the model badly.

**Catch and convert exceptions.** A raised exception inside a tool returns an error to Claude that's hard for the model to recover from. A returned string ("Search failed. Check that the embedding model is available.") is something the model can read and reason about. Same shape, much friendlier failure mode.

## The other six tools

Same pattern, different jobs:

```python
@mcp.tool()
def get_context(topic: str, n_results: int = 5) -> str:
    """Quick context retrieval for a topic, full text of the top few hits.

    Use this when you want quick background on a topic discussed previously and
    would rather get the full text directly than scan an index. For broader
    browsing, use search (compact) then get_chunks.
    """
    n_results = min(max(1, n_results), MAX_SEARCH_RESULTS)
    store = _get_store()
    try:
        results = store.search(query=topic, n_results=n_results)
    except Exception:
        logger.exception("get_context failed")
        return "Context lookup failed. Check that the embedding model is available."
    if not results:
        return "No results found."
    return format_full(results, with_relevance=True)
```

The same store call as `search`, but it skips the index step and returns the full text of the top few hits straight away. It exists because "give me background on X" wants documents, not a menu: one call instead of a search-then-open round trip, at the cost of spending context on hits the model didn't choose.

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
    if not file_path.is_file():
        return "Path is not a regular file."
    if file_path.suffix != ".jsonl":
        return "Only conversation JSONL files are supported."
    if not _is_allowed_path(file_path):
        return "Path is outside allowed directories."
    if "-dotfiles-rag" in str(file_path):
        return "Files in the dotfiles-rag project are excluded (pipeline artifacts)."
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

The `-dotfiles-rag` check mirrors the watcher's own exclusion: the RAG's development sessions are transcripts in the same directory, and indexing them creates a feedback loop (the next post covers it). The manual entry point has to refuse the same files the automatic one does, or the model can be talked into undoing the guard.

Beyond that, this one needed input validation. The model will pass any string the user mentions. Cheap defences, all returning friendly strings rather than raising:

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

```python
@mcp.tool()
def get_audit_log(since: str | None = None, limit: int = 20) -> str:
    """View recent audit log entries.

    Args:
        since: Optional time filter, hours ago ("24h"), days ago ("7d"),
               or Unix timestamp. Omit for the most recent entries.
        limit: Maximum entries to return (default 20).
    """
    ...
```

The body parses `"24h"` / `"7d"` strings into Unix timestamps and reads from the audit table. Pairs with `log_action`: that one writes the row, this one reads it back. Useful at the start of a session when I want a quick "what did I do yesterday" without scrolling shell history.

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
cd "/Users/warrendeleon/Developer/dotfiles/rag"
exec "/Users/warrendeleon/.rag/venv/bin/python" -m src.server "$@"
```

```bash
chmod +x ~/.rag/start-server.sh
```

Then register the server. The supported way is the CLI:

```bash
claude mcp add -s user rag /Users/warrendeleon/.rag/start-server.sh \
  -e ANONYMIZED_TELEMETRY=false \
  -e CHROMA_TELEMETRY=false
```

That writes the entry into `~/.claude.json` under `mcpServers`:

```json
"mcpServers": {
  "rag": {
    "type": "stdio",
    "command": "/Users/warrendeleon/.rag/start-server.sh",
    "args": [],
    "env": {
      "ANONYMIZED_TELEMETRY": "false",
      "CHROMA_TELEMETRY": "false"
    }
  }
}
```

That's the whole registration. Restart Claude Code; the next session has eight new tools.

The quick health check is the CLI:

```bash
claude mcp list
```

`rag` should be listed as connected. To verify the server itself without Claude in the loop, speak the protocol to it by hand. MCP requires an `initialize` exchange before it will answer anything, so a bare `tools/list` on its own returns nothing:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"0.0.1"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | ~/.rag/start-server.sh
```

Two JSON responses come back: the `initialize` result, then the full tool list with every docstring. If that works, Claude will see the tools.

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

A Python module with eight decorated functions and around 450 lines of code. A small block of JSON. A two-line bash wrapper. That's enough to give Claude Code persistent search over your conversation history, an audit log it writes to itself, and visibility into the indexing pipeline.

The interesting part isn't the protocol. FastMCP makes that almost invisible. The interesting parts are the things that don't show up in MCP tutorials: lazy initialisation so the handshake stays fast, returning strings not objects, returning an index instead of documents so the model budgets its own context, catching exceptions to friendly messages, validating paths before they reach the file system, and writing docstrings that read like prompts.

The next post covers the other half of the system: the watcher that detects new conversation files and the indexer that actually populates the vector store. The MCP server is the front door; the watcher and indexer are what fill the building.
