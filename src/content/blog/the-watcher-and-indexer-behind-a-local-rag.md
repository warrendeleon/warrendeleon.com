---
title: "The watcher and indexer behind a local RAG"
description: "How conversation JSONLs become searchable vectors: fswatch, a SQLite job queue, a streaming JSONL parser, and a ChromaDB indexer with power-aware throttle."
publishDate: 2026-08-31
tags: ["claude-code", "rag", "python", "chromadb", "sqlite", "launchd"]
locale: en
campaign: "claude-rag-watcher-indexer"
relatedPosts: ["giving-claude-a-memory-with-a-local-rag", "building-an-mcp-server-for-claude-code", "pairing-claude-rag-with-a-curated-wiki"]
---

This is part 3 of the series on giving Claude Code persistent memory. Part 1 covered [the design](/blog/giving-claude-a-memory-with-a-local-rag/), part 2 [the MCP server](/blog/building-an-mcp-server-for-claude-code/). This part is the pipeline that fills the vector store: a watcher that notices new conversation files, a queue that holds work, and an indexer that embeds turns into ChromaDB.

Source: [`rag/src/watcher.py`](https://github.com/warrendeleon/dotfiles/blob/main/rag/src/watcher.py), [`rag/src/queue_db.py`](https://github.com/warrendeleon/dotfiles/blob/main/rag/src/queue_db.py), [`rag/src/indexer.py`](https://github.com/warrendeleon/dotfiles/blob/main/rag/src/indexer.py), [`rag/src/store.py`](https://github.com/warrendeleon/dotfiles/blob/main/rag/src/store.py), [`rag/src/parsers/jsonl.py`](https://github.com/warrendeleon/dotfiles/blob/main/rag/src/parsers/jsonl.py).

## The shape

Three processes, decoupled by a SQLite queue:

```text
fswatch  →  watcher.py  →  queue.db  →  indexer.py  →  ChromaDB
                                              ↓
                                       embedding model
                                       (sentence-transformers / Ollama)
```

The watcher only enqueues. The indexer only dequeues. Either can crash, restart, or fall behind, and the other doesn't care. The queue is the contract.

```bash
brew install fswatch
```

That's the only system dependency the watcher needs.

## The watcher

`fswatch` is a single-purpose tool: it tails a directory and emits one line per change. The watcher process wraps it in Python so it can filter and enqueue.

```python
"""File watcher: fswatch subprocess -> enqueue conversation JSONL changes."""
from __future__ import annotations

import logging
import signal
import subprocess
from pathlib import Path
from typing import Any

from .queue_db import JobQueue, JobType

logger = logging.getLogger(__name__)
CLAUDE_PROJECTS_DIR = Path.home() / ".claude" / "projects"

EXCLUDED_PROJECT_SUFFIXES = ["-dotfiles-rag"]
```

The exclusion is important. The dotfiles repo has its own Claude Code project, which means *this* code's development sessions are JSONLs in the same directory. Indexing them creates a feedback loop: writing to the audit log triggers the watcher, which queues a job, which embeds the action of writing to the audit log, which writes to the audit log again. Skip the project that contains the indexer.

```python
class Watcher:
    def __init__(self, queue: JobQueue | None = None) -> None:
        self.queue = queue or JobQueue()
        self._process: subprocess.Popen | None = None
        self._running = False

    def _build_fswatch_cmd(self) -> list[str]:
        return [
            "fswatch",
            "--recursive",
            "--event", "Created",
            "--event", "Updated",
            "--event", "Renamed",
            "--event", "MovedTo",
            "--include", r"\.jsonl$",
            "--exclude", r".*",
            str(CLAUDE_PROJECTS_DIR),
        ]
```

`--exclude '.*'` then `--include '\.jsonl$'` is a fswatch pattern: exclude everything, then add back JSONL files. fswatch evaluates excludes first; the order of flags matters less than the order of evaluation.

```python
    def _handle_event(self, path_str: str) -> None:
        path_str = path_str.strip()
        if not path_str:
            return

        path = Path(path_str)
        if not path.is_file() or path.suffix != ".jsonl":
            return

        if not str(path.resolve()).startswith(str(CLAUDE_PROJECTS_DIR)):
            return

        for suffix in EXCLUDED_PROJECT_SUFFIXES:
            if suffix in str(path):
                return

        job_id = self.queue.enqueue(
            str(path), JobType.CONVERSATION.value, priority=10,
        )
        if job_id:
            logger.debug("Enqueued %s (job %d)", path.name, job_id)
```

Belt-and-braces filtering. fswatch already filters by include pattern, but the event might be a directory rename, a file that's been deleted by the time we look, or a symlink to outside the projects tree. Cheap to re-check; expensive to crash inside a loop that's expected to run forever.

```python
    def run(self) -> None:
        self._running = True

        def _stop(signum: int, frame: Any) -> None:
            self._running = False
            if self._process:
                self._process.terminate()

        signal.signal(signal.SIGINT, _stop)
        signal.signal(signal.SIGTERM, _stop)

        cmd = self._build_fswatch_cmd()
        self._process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
        )

        for line in self._process.stdout:
            if not self._running:
                break
            try:
                self._handle_event(line)
            except Exception:
                logger.exception("Error handling event: %s", line.strip()[:100])
```

`for line in self._process.stdout` blocks until the next event. No polling, no busy loop. Signal handlers terminate the subprocess cleanly so launchd doesn't have a zombie to reap.

The whole watcher is ~120 lines. `fswatch` does the hard part.

## The queue

A vector store with retry, dedup, and exponential backoff sounds like a job for Redis or RabbitMQ. It's actually a job for SQLite.

```python
DEFAULT_QUEUE_PATH = Path.home() / ".rag" / "queue.db"
MAX_ATTEMPTS = 4  # 1 initial + 3 retries with backoff: 30s, 120s, 480s
BACKOFF_BASE = 30


class JobStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class JobType(str, Enum):
    CONVERSATION = "conversation"
```

One table, four statuses, one job type. Future-proofed for new job types via the enum but I never needed any.

```python
def _init_db(self) -> None:
    with self._conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path TEXT NOT NULL,
                job_type TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                priority INTEGER NOT NULL DEFAULT 0,
                attempts INTEGER NOT NULL DEFAULT 0,
                max_attempts INTEGER NOT NULL DEFAULT 4,
                next_retry REAL NOT NULL DEFAULT 0,
                error TEXT,
                created_at REAL NOT NULL,
                file_hash TEXT
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_jobs_status_retry
            ON jobs (status, next_retry)
        """)
```

`file_hash` is the dedup key. SHA-256 of the file's first chunk is enough.

```python
def _file_hash(path: str) -> str | None:
    try:
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                h.update(chunk)
        return h.hexdigest()[:16]
    except OSError:
        return None
```

### Dedup on enqueue

Claude Code rewrites the active JSONL several times a second. Without dedup the queue would accumulate thousands of duplicate jobs for the file the user is currently working in.

```python
def enqueue(self, file_path, job_type, priority=0) -> int | None:
    jtype = job_type.value if isinstance(job_type, JobType) else job_type
    fhash = _file_hash(file_path)

    with self._conn() as conn:
        # Skip if a pending/processing job exists for the same path
        row = conn.execute(
            """SELECT id, file_hash FROM jobs
               WHERE file_path = ? AND status IN ('pending', 'processing')
               LIMIT 1""",
            (file_path,),
        ).fetchone()

        if row:
            # Same hash as an in-flight job? Drop it.
            if row["file_hash"] and fhash and row["file_hash"] == fhash:
                return None
            # File changed; update the existing job rather than queue a new one.
            conn.execute(
                "UPDATE jobs SET file_hash = ?, priority = MAX(priority, ?) WHERE id = ?",
                (fhash, priority, row["id"]),
            )
            return row["id"]

        # Also skip if the most recent completed job had the same hash.
        completed = conn.execute(
            """SELECT file_hash FROM jobs
               WHERE file_path = ? AND status = 'completed'
               ORDER BY id DESC LIMIT 1""",
            (file_path,),
        ).fetchone()

        if completed and completed["file_hash"] == fhash:
            return None

        cursor = conn.execute(
            """INSERT INTO jobs (file_path, job_type, status, priority,
                                 attempts, max_attempts, next_retry, created_at, file_hash)
               VALUES (?, ?, 'pending', ?, 0, ?, 0, ?, ?)""",
            (file_path, jtype, priority, MAX_ATTEMPTS, time.time(), fhash),
        )
        return cursor.lastrowid
```

Three deduplication rules:

1. If there's already a pending/processing job for this path with the same content hash, drop the new event entirely.
2. If there's a pending/processing job for this path but the hash is different, *update* the existing job to point at the new content. The watcher just signalled the file changed again before the indexer got to it.
3. If the most recent completed job had the same hash, the file hasn't actually changed since we last indexed. Drop it.

Three cheap rules turn an event firehose into a small backlog of real work.

### Dequeue with priority

```python
def dequeue(self, batch_size: int = 1) -> list[Job]:
    now = time.time()
    jobs: list[Job] = []

    with self._conn() as conn:
        rows = conn.execute(
            """SELECT * FROM jobs
               WHERE status = 'pending' AND next_retry <= ?
               ORDER BY (priority + (? - created_at) / 3600.0) DESC,
                        created_at ASC
               LIMIT ?""",
            (now, now, batch_size),
        ).fetchall()

        for row in rows:
            conn.execute(
                "UPDATE jobs SET status = 'processing',"
                " attempts = attempts + 1 WHERE id = ?",
                (row["id"],),
            )
            ...
```

The `ORDER BY` is the only clever bit. Each job's effective priority decays by 1 per hour it's been queued. A high-priority job stays high. A low-priority job from yesterday eventually gets in front of a low-priority job from now. Fairness without a separate scheduling pass.

### Retry with backoff

```python
def fail(self, job_id: int, error: str) -> None:
    now = time.time()
    with self._conn() as conn:
        row = conn.execute(
            "SELECT attempts, max_attempts FROM jobs WHERE id = ?",
            (job_id,),
        ).fetchone()

        if row["attempts"] >= row["max_attempts"]:
            conn.execute(
                "UPDATE jobs SET status = 'failed', error = ? WHERE id = ?",
                (error, job_id),
            )
        else:
            # Exponential backoff: 30s, 120s, 480s
            exponent = max(0, row["attempts"] - 1)
            delay = BACKOFF_BASE * (4 ** exponent)
            conn.execute(
                "UPDATE jobs SET status = 'pending',"
                " error = ?, next_retry = ? WHERE id = ?",
                (error, now + delay, job_id),
            )
```

Four attempts total (1 initial + 3 retries) with 30s / 2m / 8m delays. Anything still failing after 8 minutes is a real failure: malformed JSONL, embedding model gone away, disk full. It stays in `failed` and shows up in `get_failed_jobs()`.

### Recovering from crashes

```python
def recover_stale(self) -> int:
    """Reset jobs stuck in 'processing' (e.g. after a crash)."""
    with self._conn() as conn:
        cursor = conn.execute(
            "UPDATE jobs SET status = 'pending',"
            " error = 'recovered after stale processing'"
            " WHERE status = 'processing'",
        )
        return cursor.rowcount
```

Called once at indexer startup. If the indexer was killed mid-job, the `processing` row is the only evidence. Reset to `pending` and the dequeue picks it up. Some jobs get processed twice; `upsert_batch` with stable IDs makes that idempotent.

> 💡 **The general lesson:** SQLite is a job queue if you want it to be. WAL journaling, deterministic commits, single-writer is fine for your laptop. You don't need a broker for low-throughput queues you can't justify operating.

## The JSONL parser

Claude Code transcripts are nested in a way that's not obvious from looking at them.

```python
def _get_message_content(msg: dict[str, Any]) -> str:
    """Extract content from a JSONL message, handling the nested structure.

    Claude Code JSONL uses:
      {"type": "user", "message": {"role": "user", "content": "..."}}
    The content is inside the nested 'message' object, not at the top level.
    """
    inner = msg.get("message")
    if isinstance(inner, dict):
        content = inner.get("content", "")
        if content:
            return _extract_text(content)
    content = msg.get("content", "")
    if content:
        return _extract_text(content)
    return ""
```

Some messages have content at the top level. Some have it under `message.content`. Some have content as a string, others as a list of blocks (`{"type": "text", "text": "..."}`, plus `tool_use`, `tool_result`, `thinking` blocks I want to skip). Handle both shapes; ignore everything except text.

```python
STRIP_CONTENT_TYPES = {"tool_use", "tool_result", "thinking"}

SYSTEM_REMINDER_RE = re.compile(
    r"<system-reminder>.*?</system-reminder>",
    re.DOTALL,
)

def _clean_text(text: str) -> str:
    text = SYSTEM_REMINDER_RE.sub("", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
```

System reminders are Claude Code's internal prompts injected into the model's context. They're not the user's content; they're not signal for retrieval. Strip them before embedding.

The output is a list of "turns": one user message paired with the corresponding assistant reply, plus metadata (session ID, project, turn number, timestamp).

## The store

ChromaDB does the actual vector work. Two embedding backends because I run on different hardware:

```python
class SentenceTransformersEmbeddingFunction(EmbeddingFunction[Documents]):
    """Embed text via a local sentence-transformers model.

    Auto-selects MPS (Apple Silicon), CUDA (NVIDIA), or CPU. Model is
    lazy-loaded on first call so startup stays fast.
    """
    def __init__(self, model: str | None = None, device: str | None = None) -> None:
        self.model_name = model or _load_embedding_model()
        if device is None:
            import torch
            if torch.backends.mps.is_available():
                device = "mps"
            elif torch.cuda.is_available():
                device = "cuda"
            else:
                device = "cpu"
        self.device = device
        self._model = None

    def __call__(self, input: Documents) -> Embeddings:
        if self._model is None:
            from sentence_transformers import SentenceTransformer
            self._model = SentenceTransformer(
                self.model_name,
                device=self.device,
                trust_remote_code=True,
            )
        return self._model.encode(
            list(input),
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        ).tolist()
```

For machines without sentence-transformers, an Ollama HTTP wrapper:

```python
class OllamaEmbeddingFunction(EmbeddingFunction[Documents]):
    def __call__(self, input: Documents) -> Embeddings:
        payload = json.dumps({
            "model": self.model,
            "input": input,
            "keep_alive": "5m",
        }).encode()
        req = urllib.request.Request(
            f"{self.base_url}/api/embed",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read())["embeddings"]
```

The store picks the backend based on whether the configured model name looks like a HuggingFace path:

```python
if "/" in model_name:
    # e.g. "Qwen/Qwen3-Embedding-4B" - sentence-transformers
    embedding_fn = SentenceTransformersEmbeddingFunction(model=model_name)
else:
    # e.g. "mxbai-embed-large" - Ollama
    embedding_fn = OllamaEmbeddingFunction(model=model_name)
```

The collection itself is one line:

```python
self._collections[name] = self._client.get_or_create_collection(
    name=name,
    embedding_function=self._embed_fn,
    metadata={"hnsw:space": "cosine"},
)
```

Cosine distance. Higher = less similar. The MCP server converts to a relevance percentage for display.

## The indexer loop

```python
class Indexer:
    def __init__(self, store=None, queue=None) -> None:
        self.store = store or Store()
        self.queue = queue or JobQueue()
        self._running = False
        self._paused = False
        self._job_delay, self._throttle_delay = _load_delays()

    def run(self) -> None:
        self._running = True
        # ... signal handlers ...
        self.queue.recover_stale()

        while self._running:
            if self._should_pause():
                time.sleep(POLL_INTERVAL)
                continue

            jobs = self.queue.dequeue(batch_size=1)
            if not jobs:
                time.sleep(POLL_INTERVAL)
                continue

            for job in jobs:
                if not self._running or self._should_pause():
                    break
                self.process_job(job)
                if self._should_throttle():
                    time.sleep(self._throttle_delay)
```

Dequeue, process, sleep, repeat. Two power checks: `_should_pause()` halts work entirely below 15% battery (resumes above 20%); `_should_throttle()` adds an inter-job delay when on AC but the battery is still discharging (the charger isn't keeping up).

```python
def _should_pause(self) -> bool:
    state = self._get_power_state()
    pct = state.get("percent")
    if pct is None:
        return False
    if self._paused:
        if pct >= RESUME_ABOVE:
            self._paused = False
        return self._paused
    if pct < PAUSE_BELOW:
        self._paused = True
    return self._paused
```

Hysteresis: pause at 15%, resume at 20%. Without the band the indexer would oscillate around the threshold every battery sample.

```python
def _get_power_state(self) -> dict[str, Any]:
    """Read battery and charging state from pmset (cached for 30s)."""
    now = time.monotonic()
    if now - self._last_power_check < POWER_CHECK_INTERVAL:
        return self._cached_power_state

    self._last_power_check = now
    state = {"percent": None, "ac_attached": False, "discharging": False}

    result = subprocess.run(
        ["pmset", "-g", "batt"],
        capture_output=True, text=True, timeout=5,
    )
    output = result.stdout
    state["ac_attached"] = "AC Power" in output
    for line in output.splitlines():
        if "InternalBattery" in line:
            for part in line.split(";"):
                part = part.strip()
                if "%" in part:
                    state["percent"] = int(part.split("%")[0].strip().split()[-1])
                elif part == "discharging":
                    state["discharging"] = True

    self._cached_power_state = state
    return state
```

`pmset -g batt` is a 5ms subprocess call but it's still a subprocess call. Cache for 30 seconds; the answer doesn't change faster than that.

The processing function itself is small because `store.upsert_batch` does the work:

```python
def _process_conversation(self, path: Path) -> None:
    turns = parse_conversation(path)
    if not turns:
        return

    identifiers, documents, metadatas = [], [], []
    for turn in turns:
        text = turn["text"]
        if not text or not text.strip():
            continue
        if len(text) > MAX_EMBED_CHARS:
            text = text[:MAX_EMBED_CHARS]
        identifiers.append(turn["identifier"])
        documents.append(text)
        metadatas.append(turn["metadata"])

    for i in range(0, len(documents), EMBED_BATCH_SIZE):
        self.store.upsert_batch(
            collection_name="conversations",
            identifiers=identifiers[i:i + EMBED_BATCH_SIZE],
            documents=documents[i:i + EMBED_BATCH_SIZE],
            metadatas=metadatas[i:i + EMBED_BATCH_SIZE],
        )
```

`MAX_EMBED_CHARS = 24_000` keeps each turn within the embedding model's ~8K token window. `EMBED_BATCH_SIZE = 4` prevents GPU OOM on long conversations where every turn happens to be at the limit.

## Running them as services

Two launchd plists in `~/Library/LaunchAgents/`. Watcher:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.dotfiles.rag-watcher</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/me/.rag/venv/bin/python</string>
        <string>-m</string>
        <string>src.watcher</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/me/Developer/dotfiles/rag</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/me/.rag/logs/watcher.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/me/.rag/logs/watcher.err</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>
    <key>ThrottleInterval</key>
    <integer>5</integer>
</dict>
</plist>
```

The indexer plist is identical except `src.indexer`. `KeepAlive` restarts on crash; `ThrottleInterval` prevents a crash loop from filling the log.

```bash
launchctl load ~/Library/LaunchAgents/com.dotfiles.rag-watcher.plist
launchctl load ~/Library/LaunchAgents/com.dotfiles.rag-indexer.plist
```

Both run on every login. `launchctl list | grep rag` confirms.

> 💡 **The path gotcha:** launchd doesn't inherit your shell PATH. The plist sets `PATH=/opt/homebrew/bin:...` so `fswatch` and `pmset` resolve. Without it, the watcher exits immediately with FileNotFoundError.

## What it costs

The watcher uses single-digit MB of RAM and 0% CPU when idle. The indexer is small at rest and burns the GPU when there's a job, but on day-to-day work the queue is empty most of the time. A long Claude Code session might queue one or two files; each takes 5-15 seconds to embed and the system goes back to idle.

The exception was the initial backlog: ~30,000 conversation files, ~570,000 turns. That's the scenario where I learned macOS Low Power mode caps the GPU clock at the hardware level and lets the indexer chew through the queue without exceeding the laptop's 100W power-delivery budget. Once the backlog cleared, the system has been invisible.

## What's next

Three posts in. The pipeline turns conversation events into vectors and the MCP server hands them to the model on demand. The fourth and last post pairs this with a curated wiki: a separate, structured knowledge base for the things that need to be *correct* and *current* rather than just *findable*. The RAG is recall; the wiki is reference. Each fixes the other one's weakness.
