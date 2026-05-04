---
title: "Giving Claude a memory with a local RAG"
description: "Claude Code starts every session cold. I gave it a memory by indexing every JSONL transcript on my machine into a local RAG, exposed over MCP. The architecture, the trade-offs, and a battery lesson I didn't see coming."
publishDate: 2026-08-17
tags: ["claude-code", "rag", "mcp", "local-llm", "ai-tooling"]
locale: en
campaign: "claude-local-rag"
relatedPosts: ["building-an-mcp-server-for-claude-code", "the-watcher-and-indexer-behind-a-local-rag", "pairing-claude-rag-with-a-curated-wiki"]
---

This is part 1 of a four-part series on giving Claude Code persistent memory: design (this post), [the MCP server](/blog/building-an-mcp-server-for-claude-code/), [the watcher and indexer](/blog/the-watcher-and-indexer-behind-a-local-rag/), and [pairing the RAG with a curated wiki](/blog/pairing-claude-rag-with-a-curated-wiki/).

## Claude Code starts every session cold

You finish a long session. You closed the laptop, made dinner, came back. New `claude` session. The model has no idea what you talked about an hour ago. None of the decisions, none of the context, none of the dead ends you already ruled out.

The transcripts are right there. Every conversation is a JSONL file under `~/.claude/projects/`. The model just can't see them.

The naive fix is to dump the recent ones into the prompt. That breaks for two reasons: most sessions hit hundreds of thousands of tokens, and you don't want *all* of yesterday's chat, you want the bits that match what you're doing now.

Which is exactly what retrieval-augmented generation is for.

## What I wanted

A few constraints up front, because they shaped everything:

- **Local-first.** No third-party embedding API, no transcripts leaving the machine. My JSONLs contain code, project context, half-finished ideas. They stay on the laptop.
- **Always works offline.** A flight, a hotel, a flaky cafe wifi. The retrieval has to work whether the network does or not.
- **Disposable index.** If the database corrupts or I want to switch embedding model, I rebuild from JSONLs in a few hours. The index is never the source of truth.
- **Available to Claude automatically.** I don't want to copy-paste search results. The model should just *call* the search when it makes sense.

That last one is the part MCP solves.

> 💡 **MCP, in one sentence:** the Model Context Protocol lets you expose tools to Claude Code as if they were built in. Claude calls `mcp__rag__search(query)` the same way it calls `Read` or `Bash`.

## The shape of the system

Two parts, decoupled on purpose.

**A per-machine local RAG.** The laptop has its own ChromaDB, its own embedding worker, its own queue. No cloud, no shared backend. Everything that matters runs on the machine in front of me.

**A shared wiki.** Curated markdown pulled from a private GitHub repo. That's the topic of [a later post in this series](/blog/pairing-claude-rag-with-a-curated-wiki/) and is where the human-curated knowledge lives.

The split matters. JSONLs are heavy and personal: they belong on machines I trust, indexed locally, never copied to a server. The wiki is light and shareable: git handles it. Vector indexes are disposable: never sync them, never back them up, just rebuild.

## The pipeline

A file watcher (`fswatch`) tails `~/.claude/projects/`. When a JSONL changes, which happens every few seconds during an active session, the file gets enqueued in a tiny SQLite job table.

A background indexer dequeues jobs, opens the file, and pairs each user message with the assistant's reply into a "turn". Each turn becomes one record:

- The raw text (user prompt + assistant response, joined)
- Metadata: session ID, project, turn number, timestamp, file path, machine hostname
- A vector from the embedding model

That's it. No summarisation, no tagging, no LLM inference in the indexing path. The raw text is what gets embedded and what comes back from search.

## Why no summarisation

A more elaborate pipeline is the obvious design: run a 27B model to summarise long turns, a 4B model to extract topic tags, and an 8B model to embed the result. The reasoning is plausible. A summary gives the embedding model cleaner signal, and tags let you filter results.

Neither earns its place once you measure.

The embedding model already captures enough semantic signal to retrieve a turn from a vague query. A summary is a lossy paraphrase, and on technical conversations where specific function names and error messages are the thing you're searching for, summarisation makes retrieval *worse*. The tags never get used either: semantic search retrieves the right turn without filtering, and a tag system you never query is overhead with no payoff.

So the production pipeline runs a single model (the embedder) over raw text. No summariser. No tagger. Retrieval quality is at least as good, the indexing throughput is higher, and the failure surface is smaller.

The wider point: when a model is doing the right job, adding other models around it on principle is a regression. Measure before composing.

## The MCP server

A small Python server using FastMCP. Six tools the model can call:

- `search(query, n_results)`: vector similarity over conversation turns
- `get_context(topic)`: same as search, lighter wrapper
- `log_action(description, files_affected?)`: write to a separate audit log
- `index_file(path)`: manually queue a JSONL
- `get_indexing_status()`: check if the queue is idle, processing, or backed up
- `get_failed_jobs()`: pull errors and retry counts when something breaks

Registration is one line in `~/.claude/mcp_servers.json`:

```json
{
  "mcpServers": {
    "rag": {
      "command": "/Users/me/.rag/start-server.sh"
    }
  }
}
```

The wrapper script activates the Python venv and runs the server over stdio. Claude Code spawns it on session start. From the model's side, the tools just appear in its tool list.

## Telling Claude to use it

Tools the model never calls are dead weight. The other half of the work was a paragraph in `~/.claude/CLAUDE.md` telling Claude *when* to reach for them:

```text
**Never say "I don't remember" or "I don't have access to previous
conversations".** A local RAG system indexes all past conversations.

When I reference a past discussion ("we talked about X", "remember when",
"like before"), call `mcp__rag__search` first.

After completing significant work (commits, refactors, decisions), call
`log_action` to keep an audit trail.
```

Without that, Claude defaults to "I don't have access to previous sessions". That's the trained-in behaviour, true for the API but no longer true on this laptop. With the instruction in place, the search becomes the first move on any "remember when" question, and the audit log fills up on its own.

> 💡 **The general pattern:** MCP gives the model new capabilities. CLAUDE.md tells it when to use them. You need both.

## The architecture matters here

The host is an Apple M5 Max: 18 CPU cores (6 Super and 12 Performance), 40 GPU cores, and 128GB of unified memory. Three things about that shape the rest of the post.

**Unified memory.** On a traditional PC, the CPU and GPU live on separate memory. The CPU pulls from DDR5 modules on the motherboard. A discrete GPU (an NVIDIA card, say) pulls from VRAM on the card itself, with the model copied across the PCIe bus to get there. The "does it fit in VRAM?" question is real and hard, and that's why people fight for cards with 24GB or more.

On Apple Silicon there's a single physical pool of memory, accessible to every compute unit. The CPU and GPU read from the same 128GB. There's no copy step and no separate VRAM ceiling. A 16GB model is a 16GB model whether the CPU or the GPU is the one running it.

**More GPU cores than CPU, doing different work.** 40 GPU cores aren't comparable to 18 CPU cores like-for-like, even before you count which is bigger. CPU cores are general-purpose execution units, optimised for branchy serial code with deep pipelines and large caches. GPU cores are much simpler units, designed to run the same arithmetic operation across thousands of data points in parallel. Transformer inference is dominated by matrix multiplications, which is exactly what GPU cores were built for.

**The performance gap that follows.** Embedding the same JSONL file: ~10 seconds on the GPU via MPS, more than 25 minutes on the CPU with no completion in sight. At least 150× slower on the CPU, on the same model and the same memory. CPU embedding for an 8B model isn't slow, it's effectively unusable.

Put it together and the model-selection question collapses. "Will it fit in RAM?" gets answered by checking the model size against 128GB; on a sane choice the answer is yes. "Will it fit in VRAM?" doesn't apply, because there isn't separate VRAM. "Should I run it on CPU or GPU?" has only one answer at the scale you care about: GPU.

The question that's left is the one nobody talks about: *can the chassis sustain the power draw of running the model on the GPU at the workload you're actually going to run?*

## The power constraint that shows up at scale

A bulk import of ~30,000 unprocessed conversation files puts the GPU under sustained load: 100% utilisation, 78°C, ~95W system draw. The 14" MacBook Pro ships with a 96W USB-C power adapter, and that's the cap on what the laptop will pull through the USB-C PD negotiation. With ~95W of GPU draw and roughly a watt of headroom, there's no power budget left to charge the battery. ~570K turns of backlog later, the battery drains from 100% to 7% overnight while plugged in.

Which mitigations work, and which don't:

| Approach | Result |
|---|---|
| Move the model to CPU | Power drops to ~32W; embedding speed collapses (>25 min per file vs ~10s on GPU). Unusable, as the architecture section already established. |
| Sleep between jobs (`job_delay_seconds`) | Works at 10s, fails at 5s. The load pattern is bursty, so there's no clean delay value, and the right value depends on workload. Fragile. |
| Energy Mode → Automatic | Still draws ~100W or more under sustained load. Still drains. |
| Energy Mode → Low Power on AC | Caps GPU clock at the hardware level. Same model, same MPS path, no software changes. Embedding goes from ~9s to ~23s per file, but GPU never spikes and power stays well below the adapter's 96W ceiling. Battery charges while indexing continuously. |

Low Power mode is the right answer for backlog clearing. After the queue drains, the energy mode goes back to High Performance on AC and Automatic on battery. Steady-state indexing is sparse: one or two files in flight when an active session is touching JSONLs every few seconds, and the GPU spikes are too brief to move the battery more than a percent. The fix is two-shaped: bulk import on Low Power, day-to-day on whatever default the OS picks.

The principle worth extracting: **on Apple Silicon, "does it fit in RAM" is the wrong selection criterion.** Anything that fits at all fits on either compute unit at zero copy cost, and on anything serious you're using the GPU regardless. The real ceiling is the chassis power envelope, and that ceiling moves with the workload. A trickle of incremental jobs is invisible to it. A sustained 100% GPU draw isn't, no matter how much memory is technically available.

For day-to-day operation:

```yaml
embedding_model: Qwen/Qwen3-Embedding-8B
embedding_device: mps
job_delay_seconds: 0
```

For bulk reindexing, set System Settings → Battery → Energy Mode → On Power Adapter → Low Power until the queue drains. The OS manages the power envelope at the hardware level; application-level sleep hacks can't.

## What it actually changed

Quantitatively: ~30,000 conversation files, ~570,000 turns indexed, retrieval in under a second on cold cache. Qualitatively, three things:

**No more re-explaining.** I can reference a decision from three weeks ago and Claude pulls the actual conversation, not a hallucinated summary of what it thinks I might have said.

**An audit trail I didn't have to write.** `log_action` calls accumulate as I work. "What did I do yesterday?" returns a real list, not a guess.

**A safety net on memory loss.** If a session ends abruptly or I switch machines, the next session can search what the last one was doing. The transcripts were always there. Now they're searchable.

The architecture itself is small: a watcher, an indexer, a server, a queue. Most of the value came from refusing to add things. No summariser, no tagger, no remote embedding API, no merged vector store across machines. The boring version is the version that works.

The architecture is the design post. The next three are the build:

- [Building an MCP server for Claude Code](/blog/building-an-mcp-server-for-claude-code/): the front door Claude calls.
- [The watcher and indexer behind a local RAG](/blog/the-watcher-and-indexer-behind-a-local-rag/): the pipeline that fills the vector store.
- [Pairing Claude's RAG with a curated wiki](/blog/pairing-claude-rag-with-a-curated-wiki/): the structured knowledge layer that handles what RAG search can't.
