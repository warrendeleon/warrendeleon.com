---
title: "The watcher and indexer behind a local RAG"
description: "How conversation JSONLs become searchable vectors: fswatch, a SQLite job queue, a streaming JSONL parser, and a ChromaDB indexer with power-aware throttle."
heroImage: "/images/blog/rag-watcher-indexer.webp"
heroImgPrompt: "A flat conveyor belt carrying plain file shapes past a single large eye into a drum, then gears stamping them into a grid of small squares, a circular arrow and a small valve"
heroPalette: ["#6DC402", "#1F2D4D", "#E9664B", "#2A9D8F", "#7A4E8C", "#E8A93C", "#F3B4C1", "#A9D3EF", "#2C2C34", "#EBD9B4"]
heroBgColor: "#F6DCE2"
heroAlt: "A conveyor belt carrying files past a watching eye into a drum where gears stamp them into a grid of squares"
publishDate: 2027-01-25
series: "Claude RAG + Tooling"
tags: ["claude-code", "rag", "python", "chromadb", "sqlite", "launchd"]
locale: en
campaign: "claude-rag-watcher-indexer"
relatedPosts: ["giving-claude-a-memory-with-a-local-rag", "building-an-mcp-server-for-claude-code", "pairing-claude-rag-with-a-curated-wiki"]
---

[Part 1](/blog/giving-claude-a-memory-with-a-local-rag/) of this series designed the memory; [part 2](/blog/building-an-mcp-server-for-claude-code/) gave Claude the tools to read it. This third part is the pipeline that fills the vector store: a watcher that notices new conversation files, a queue that holds work, and an indexer that embeds turns into ChromaDB.

Source: [`rag/src/watcher.py`](https://github.com/warrendeleon/dotfiles/blob/main/rag/src/watcher.py), [`rag/src/queue_db.py`](https://github.com/warrendeleon/dotfiles/blob/main/rag/src/queue_db.py), [`rag/src/indexer.py`](https://github.com/warrendeleon/dotfiles/blob/main/rag/src/indexer.py), [`rag/src/store.py`](https://github.com/warrendeleon/dotfiles/blob/main/rag/src/store.py), [`rag/src/parsers/jsonl.py`](https://github.com/warrendeleon/dotfiles/blob/main/rag/src/parsers/jsonl.py).

## What a broken pipeline looks like

You search for something you wrote yesterday and get nothing back. Or worse, you get hits from three weeks ago for a file you've since rewritten. The indexer is wedged on a malformed JSONL, the queue is full of duplicates, or the embedding model never released GPU memory and the Mac is at 90% swap.

This is the bit between "Claude wrote a JSONL" and "the MCP server can search it". When it breaks, retrieval lies quietly. The rest of the post is how to keep it honest.

## The shape

Three processes, decoupled by a SQLite queue:

```text
fswatch  →  watcher.py  →  queue.db  →  indexer.py  →  ChromaDB + FTS
                                              ↓
                                       embedding model
                                       (Ollama / sentence-transformers)
```

The watcher only enqueues. The indexer only dequeues. Either can crash, restart, or fall behind, and the other doesn't care. The queue is the contract.

```bash
brew install fswatch
```

That's the only system dependency the watcher needs.

## The watcher

There's no shortage of options here. Python's `watchdog` package gives you a cross-platform API with handlers and a thread pool. Facebook's `watchman` is the heavy artillery for large trees. `fsnotify` on Linux, `FSEvents` on macOS, or a polling loop with `os.scandir` if you want zero dependencies.

`fswatch` is a CLI that tails a directory and emits one line per change. Pick it for two reasons: it's a separate process, so a bug in the Python wrapper can't take it down between events, and the wire format is one path per line, which is trivial to parse. The watcher process wraps it in Python so it can filter and enqueue.

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

EXCLUDED_PROJECT_SUFFIXES = [
    "-dotfiles-rag",
    "summariser-workdir",
]
```

The first exclusion is important. The dotfiles repo has its own Claude Code project, which means *this* code's development sessions are JSONLs in the same directory. Indexing them creates a feedback loop: writing to the audit log triggers the watcher, which queues a job, which embeds the action of writing to the audit log, which writes to the audit log again. Skip the project that contains the indexer. The second entry guards a different loop of the same shape: a session summariser elsewhere in the system (it appears in [the last post](/blog/pairing-claude-rag-with-a-curated-wiki/)) runs its own headless Claude, and its transcripts would otherwise feed straight back into the index.

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

`--exclude '.*'` then `--include '\.jsonl$'` is a fswatch pattern: exclude everything, then the include adds JSONL files back.

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

A queue with retry, dedup, and exponential backoff sounds like a job for Redis or RabbitMQ. For this workload, SQLite covers it.

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

One table, four statuses, one job type. The enum leaves room for new job types; I haven't needed any.

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

`file_hash` is the dedup key: SHA-256 of the whole file streamed in 8KB chunks, truncated to the first 16 hex characters. Full content (so two distinct sessions don't collide on a shared prefix), small key (so the index stays compact).

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

        if completed and completed["file_hash"] and fhash and completed["file_hash"] == fhash:
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

The explicit null checks on both hashes matter more than they look. `_file_hash` returns `None` when a file can't be read, and without the guards two unreadable files compare equal (`None == None`) and a legitimate job gets silently dropped. A file that can't be hashed is never "unchanged".

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

SQLite is a fine job queue for this shape of work. WAL journaling, deterministic commits, single-writer. For a laptop chewing through tens of thousands of files over weeks, a broker like Redis or RabbitMQ is more operational cost than the workload justifies.

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

ChromaDB does the actual vector work. There are two embedding backends, and their roles swapped mid-project: production today is Ollama running a quantised `qwen3-embedding:8b` out of process, and the original in-process sentence-transformers path survives as a fallback. Both are worth reading, one for what it does and one for what it taught.

### The Ollama backend

The wrapper looks like it should be ten lines: POST the inputs to `/api/embed`, read back the vectors. The real one is longer because that version doesn't work:

```python
OLLAMA_KEEP_ALIVE = "60s"   # unload the model 60s after the last embed
OLLAMA_CHUNK_SIZE = 1800    # chars; the qwen3-embedding runner EOFs on long single inputs
OLLAMA_CHUNK_OVERLAP = 200
OLLAMA_EMBED_RETRIES = 2
OLLAMA_RETRY_DELAY = 3.0    # seconds between retries, lets a crashed runner respawn


def _chunk_text(text: str, size: int = OLLAMA_CHUNK_SIZE, overlap: int = OLLAMA_CHUNK_OVERLAP) -> list[str]:
    """Split text into overlapping chunks. Most turns fit in a single chunk."""
    if len(text) <= size:
        return [text]
    chunks, start = [], 0
    while start < len(text):
        chunks.append(text[start:start + size])
        start += size - overlap
    return chunks


class OllamaEmbeddingFunction(EmbeddingFunction[Documents]):
    def _embed_chunk(self, text: str) -> list[float] | None:
        """Embed one chunk via a single Ollama request, with retry on crashes."""
        url = f"{self.base_url}/api/embed"
        payload = json.dumps({
            "model": self.model,
            "input": text,
            "keep_alive": self.keep_alive,
        }).encode()

        for attempt in range(OLLAMA_EMBED_RETRIES + 1):
            try:
                req = urllib.request.Request(
                    url, data=payload,
                    headers={"Content-Type": "application/json"}, method="POST",
                )
                with urllib.request.urlopen(req, timeout=120) as resp:
                    return json.loads(resp.read())["embeddings"][0]
            except (urllib.error.URLError, OSError, KeyError, IndexError) as e:
                if attempt < OLLAMA_EMBED_RETRIES:
                    time.sleep(OLLAMA_RETRY_DELAY)
                    continue
                logger.error("Ollama embed failed after %d retries: %s", OLLAMA_EMBED_RETRIES, e)
                return None
        return None

    def __call__(self, input: Documents) -> Embeddings:
        """One vector per input. Long inputs are chunked and mean-pooled."""
        import numpy as np

        out: Embeddings = []
        for text in input:
            text = text or ""
            vecs = [v for v in (self._embed_chunk(c) for c in _chunk_text(text)) if v is not None]
            if not vecs:
                raise RuntimeError(
                    f"Ollama embedding failed for every chunk of a {len(text)}-char input"
                )
            mean = np.asarray(vecs, dtype=np.float32).mean(axis=0)
            norm = float(np.linalg.norm(mean)) or 1.0
            out.append((mean / norm).tolist())
        return out
```

Every awkward line maps to a failure the obvious version hit:

- Ollama's embed endpoint 400s on a batched input array, so it's one POST per item.
- The qwen3-embedding runner crashes (EOF) on long single inputs, so anything over 1,800 characters is split into overlapping chunks, and the chunk vectors are mean-pooled then L2-normalised into one vector per turn. Most turns never need it.
- The runner also dies intermittently on requests it normally handles, and respawns on the next request, so a failed chunk waits three seconds and retries before giving up.
- `keep_alive: "60s"` unloads the model a minute after the last embed, so several gigabytes of weights don't sit in RAM between jobs.

Quantised and out of process, the model costs 6-10GB inside Ollama only while embedding, and the Python indexer stays small. That, plus Ollama owning the model lifecycle, is why this backend holds the production slot.

### The sentence-transformers fallback, and what it taught

The original production backend ran the full fp16 model in-process on MPS (Apple's Metal GPU backend):

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
        import torch

        self._ensure_loaded()
        with torch.no_grad():
            embeddings = self._model.encode(
                list(input),
                convert_to_numpy=True,
                normalize_embeddings=True,
                show_progress_bar=False,
            )
        result = embeddings.tolist()
        del embeddings
        if torch.backends.mps.is_available():
            torch.mps.empty_cache()
        return result
```

`torch.mps.empty_cache()` on every batch isn't optional. On Apple Silicon the Metal allocator pools blocks between calls and never returns them to the OS unless you ask. On Qwen3-Embedding-8B I watched the graphics footprint climb to 123 GB in under an hour before I added the per-call empty. The sync has a cost. The leak is worse.

The `unload()` method does the heavier eviction when the indexer goes idle:

```python
def unload(self) -> None:
    if self._model is None:
        return
    import gc
    import torch
    del self._model
    self._model = None
    gc.collect()
    if torch.backends.mps.is_available():
        torch.mps.empty_cache()
```

Per-batch empty stops the pool from growing within a job. Idle unload returns the model weights themselves. You need both. One without the other and either each job leaks, or the model sits in GPU memory for hours after the last job.

All that leak management is what the Ollama migration made someone else's problem. The code stays: it guards the fallback path, and it's the documented answer if this system ever runs on a machine without Ollama.

### Picking a backend

The store picks by whether the configured model name looks like a HuggingFace path:

```python
if "/" in model_name:
    # e.g. "Qwen/Qwen3-Embedding-4B" - sentence-transformers
    embedding_fn = SentenceTransformersEmbeddingFunction(model=model_name)
else:
    # e.g. "qwen3-embedding:8b" - Ollama
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

### The keyword mirror

Vectors alone miss a class of query this system exists for: exact strings. An error message, a ticket id, a function name. Semantic similarity gets close; a keyword match is exact. So every upsert also mirrors the chunk into a SQLite FTS5 table (`~/.rag/fts.db`, built in `fts.py`), best-effort by design: a keyword-index failure never blocks the vector upsert, and if FTS5 is unavailable the leg disables itself and search falls back to vectors alone. At query time the store over-fetches both legs and merges them with reciprocal-rank fusion, so exact-identifier hits and semantic hits surface in one ranked list. It's a second index over the same documents for one SQLite file's worth of overhead.

## The indexer loop

The shape is dequeue, process, sleep, repeat, with three gates on top: battery, foreground Claude session, idle unload.

```python
while self._running:
    idle = self._should_pause() or self._session_active()

    if (
        not self._idle_unloaded
        and time.monotonic() - self._last_job_time > IDLE_UNLOAD_SECONDS
    ):
        self.store.unload()
        gc.collect()
        self._idle_unloaded = True

    if idle:
        time.sleep(POLL_INTERVAL)
        continue

    jobs = self.queue.dequeue(batch_size=BATCH_SIZE)
    if not jobs:
        time.sleep(POLL_INTERVAL)
        continue

    self._last_job_time = time.monotonic()
    for job in jobs:
        if not self._running or self._should_pause() or self._session_active():
            break
        self.process_job(job)
        gc.collect()
        if self._should_throttle():
            time.sleep(self._throttle_delay)
```

`_should_pause()` halts work entirely below 15% battery and resumes above 20%. `_should_throttle()` adds an inter-job delay when on AC but the battery is still discharging, which means the charger isn't keeping up.

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

`_session_active()` is the third gate. Indexing competes with Claude itself for the same GPU. If a `claude` process is in `ps -axo comm`, the indexer steps back until the foreground session is gone. The chat stays responsive; embeddings wait. Cached for 10 seconds, same reason.

### The watchdog

Python can't reliably interrupt a blocked C extension call. If MPS wedges inside a single `model.encode()`, no signal handler will get a look in. The recovery has to be external.

```python
def _watchdog_loop(self) -> None:
    while self._running:
        time.sleep(WATCHDOG_POLL)
        jid = self._current_job_id
        if jid is None:
            continue
        stalled = time.monotonic() - self._progress_ts
        if stalled <= WATCHDOG_TIMEOUT:
            continue
        self.queue.fail(jid, f"watchdog timeout after {int(stalled)}s")
        os._exit(2)
```

A daemon thread bumps `_progress_ts` after every embed batch. If the timestamp ages past `WATCHDOG_TIMEOUT` (600 seconds), the watchdog marks the job failed and calls `os._exit(2)`. launchd respawns the process, `recover_stale()` flips any `processing` rows back to `pending`, and the queue retry/backoff stops a poisoned job from running forever.

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

Two launchd plists run this part of the system, both in `~/Library/LaunchAgents/` (the wiki sync and the summariser from the next post get their own). Watcher:

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
        <string>/Users/warrendeleon/.rag/venv/bin/python</string>
        <string>-m</string>
        <string>src.watcher</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/warrendeleon/Developer/dotfiles/rag</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/warrendeleon/.rag/logs/watcher.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/warrendeleon/.rag/logs/watcher.err</string>
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

The exception was the initial backlog: every conversation on the machine, ~35,000 turns across ~1,500 sessions. That's the bulk import behind the battery lesson in [part 1](/blog/giving-claude-a-memory-with-a-local-rag/): run it on Low Power energy mode, and check what your battery manager is quietly doing before you blame the workload. Once the backlog cleared, the system has been invisible.

## What's next

Three posts in. The pipeline turns conversation events into vectors and the MCP server hands them to the model on demand. The fourth and last post pairs this with a curated wiki: a separate, structured knowledge base for the things that need to be *correct* and *current* rather than just *findable*. The RAG is recall; the wiki is reference. Each fixes the other one's weakness.
