---
title: "Giving Claude a memory with a local RAG"
description: "How I gave Claude Code a local memory by indexing JSONL transcripts into a local RAG exposed through MCP. Architecture, trade-offs, and a battery lesson."
heroImage: "/images/blog/local-rag-memory.webp"
heroImgPrompt: "A flat geometric brain built from plain stacked square blocks resting on a flat circuit board, a simple battery shape beside it, a plain magnifying lens outline over one block, strictly flat 2D shapes only"
heroPalette: ["#6DC402", "#1F2D4D", "#E9664B", "#2A9D8F", "#7A4E8C", "#E8A93C", "#F3B4C1", "#A9D3EF", "#2C2C34", "#EBD9B4"]
heroBgColor: "#F6DCE2"
heroAlt: "A geometric brain built from stacked blocks resting on a circuit board, with a battery and a magnifying lens"
publishDate: 2027-01-11
series: "Claude RAG + Tooling"
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
- **Always works offline.** A flight, a hotel, a flaky café Wi-Fi. The retrieval has to work whether the network does or not.
- **Disposable index.** If the database corrupts or I want to switch embedding model, I rebuild from JSONLs in a few hours. The index is never the source of truth.
- **Available to Claude automatically.** I don't want to copy-paste search results. The model should just *call* the search when it makes sense.

That last one is the part MCP solves. The Model Context Protocol lets you expose tools to Claude Code as if they were built in. Claude calls `mcp__rag__search(query)` the same way it calls `Read` or `Bash`. No copy-paste, no separate UI, no extra step.

There are obvious alternatives worth naming before defending this one. Claude Code already has a CLAUDE.md memory file. You can paste relevant transcripts into the prompt. Dedicated products (Mem, Rewind, hosted vector DBs) solve adjacent problems. CLAUDE.md is great for instructions and conventions but doesn't scale to the contents of every past conversation. Pasting context works for the session in front of you and falls apart at the second one. Hosted products handle scale but ship your transcripts off the machine, which is exactly what I wanted to avoid. A local RAG sits in the gap: searchable history, no upload, no per-session prep.

## The shape of the system

Two parts, decoupled on purpose.

**A per-machine local RAG.** The laptop has its own ChromaDB, its own embedding worker, its own queue. No cloud, no shared backend. Everything that matters runs on the machine in front of me.

**A shared wiki.** Curated markdown pulled from a private GitHub repo. That's the topic of [a later post in this series](/blog/pairing-claude-rag-with-a-curated-wiki/) and is where the human-curated knowledge lives.

The split matters. JSONLs are heavy and personal: they belong on machines I trust, indexed locally, never copied to a server. The wiki is light and shareable: git handles it. Vector indexes are disposable: never sync them, never back them up, just rebuild.

## The pipeline

A file watcher (`fswatch`) tails `~/.claude/projects/`. When a JSONL changes, which happens every few seconds during an active session, the file gets enqueued in a tiny SQLite job table.

A background indexer dequeues jobs, opens the file, and pairs each user message with the assistant's reply into a "turn". Each turn becomes one record:

- The raw text (user prompt + assistant response, joined)
- Metadata: session ID, project, turn number, timestamp, file path
- A vector from the embedding model

That's it. No summarisation, no tagging, no LLM inference in the indexing path. The raw text is what gets embedded and what comes back from search.

## Why no summarisation

The first version of this pipeline was the more elaborate design: a 27B model to summarise long turns, a 4B model to extract topic tags, and an 8B model to embed the result. The reasoning is plausible. A summary gives the embedding model cleaner signal, and tags let you filter results.

What forced the change was power, not principle. Three models per turn held the GPU at roughly 60W of sustained draw, and the first bulk import drained the battery overnight on a plugged-in laptop (the full story is below). The pipeline had to get lighter.

It could get lighter because the extra models added nothing retrieval needed. The embedding model already captures enough semantic signal to retrieve a turn from a vague query. A summary is a lossy paraphrase, and on technical conversations where specific function names and error messages are the thing you're searching for, summarisation makes retrieval *worse*. The tags never got used either: semantic search retrieves the right turn without filtering, and a tag system you never query is overhead with no payoff.

So the indexing path runs a single model (the embedder) over raw text. Nothing between a JSONL landing on disk and its vector is an LLM call. Retrieval quality is at least as good, the indexing throughput is higher, and the failure surface is smaller. The wider system did later grow a summariser (a separate loop that writes session resume notes, covered in [the wiki post](/blog/pairing-claude-rag-with-a-curated-wiki/)), but it sits outside this path entirely.

The wider point: when a model is doing the right job, adding other models around it on principle is a regression. Measure before composing.

## The MCP server

A small Python server using FastMCP. Eight tools the model can call:

- `search(query, n_results)`: hybrid search (vector plus keyword) over conversation turns and wiki pages, returning a compact index of hits
- `get_chunks(ids)`: fetch the full text of chosen hits from that index
- `get_context(topic)`: full text of the top few hits in one call, for quick background
- `log_action(description, files_affected?)`: write to a separate audit log
- `get_audit_log(since?, limit)`: read recent audit entries back
- `index_file(path)`: manually queue a JSONL
- `get_indexing_status()`: check if the queue is idle, processing, or backed up
- `get_failed_jobs()`: pull errors and retry counts when something breaks

The search deliberately returns an index rather than documents: one line per hit with an id, a snippet, and a token estimate. The model scans the index and opens only the hits it needs via `get_chunks`. Ten full turns inline would swamp the context window; ten snippets cost almost nothing.

Registration is a JSON block in the user-level `~/.claude.json`, plus a paragraph in `~/.claude/CLAUDE.md` telling Claude *when* to reach for the tools, because a registered tool the model never calls is dead weight. MCP gives the model new capabilities; CLAUDE.md tells it when to use them. You need both, and both are walked through step by step in [the MCP server post](/blog/building-an-mcp-server-for-claude-code/).

## The architecture matters here

The host is an Apple M5 Max: 18 CPU cores (6 Super and 12 Performance), 40 GPU cores, and 128GB of unified memory. Three things about that shape the rest of the post.

**Unified memory.** On a traditional PC, the CPU and GPU live on separate memory. The CPU pulls from DDR5 modules on the motherboard. A discrete GPU (an NVIDIA card, say) pulls from VRAM on the card itself, with the model copied across the PCIe bus to get there. The "does it fit in VRAM?" question is real and hard, and that's why people fight for cards with 24GB or more.

On Apple Silicon there's a single physical pool of memory, accessible to every compute unit. The CPU and GPU read from the same 128GB. There's no copy step and no separate VRAM ceiling. A 16GB model is a 16GB model whether the CPU or the GPU is the one running it.

More GPU cores than CPU, doing different work. 40 GPU cores aren't comparable to 18 CPU cores like-for-like, even before you count which is bigger. CPU cores are general-purpose execution units, optimised for branchy serial code with deep pipelines and large caches. GPU cores are simpler units, designed to run the same arithmetic across thousands of data points in parallel. Transformer inference is dominated by matrix multiplications, which is exactly what GPU cores were built for.

The performance gap that falls out: embedding the same JSONL file takes about 10 seconds on the GPU via MPS, and more than 25 minutes on the CPU with no completion in sight. At least 150x slower on the CPU, on the same model and the same memory. CPU embedding for an 8B model is effectively unusable.

Put it together and the model-selection question collapses. "Will it fit in RAM?" gets answered by checking the model size against 128GB; on a sane choice the answer is yes. "Will it fit in VRAM?" doesn't apply, because there isn't separate VRAM. "Should I run it on CPU or GPU?" has only one answer at the scale you care about: GPU.

The question that's left is the one nobody talks about: *can the chassis sustain the power draw of running the model on the GPU at the workload you're actually going to run?*

## The battery lesson

The first battery incident was real and self-inflicted. The original three-model pipeline held the GPU at ~60W for hours at a stretch, and the battery drained from 100% to 7% overnight while plugged in. That incident is why the indexing path is a single embedder today.

Then the drain came back. During the bulk import of the backlog (~35,000 turns across ~1,500 sessions), with only the one embedding model running, the battery kept discharging on AC. The GPU sat at 100% utilisation and 78°C, and the power monitor reported ~95W of system draw. The 14" MacBook Pro negotiates at most 100W through USB-C Power Delivery, a chassis cap that holds whatever charger you plug in (mine is 160W; the laptop won't ask it for more than 100). ~95W of draw against a 100W ceiling looks like a complete diagnosis: the model is eating the charge budget.

I blamed the model, and treated that diagnosis thoroughly:

| Approach | Result |
|---|---|
| Move the model to CPU | Power drops to ~32W; embedding speed collapses (>25 min per file vs ~10s on GPU). Unusable, as the architecture section already established. |
| Sleep between jobs (`job_delay_seconds`) | Works at 10s, fails at 5s. The load pattern is bursty, so there's no clean delay value, and the right value depends on workload. Fragile. |
| Energy Mode → Automatic | Still draws ~100W or more under sustained load. Still drains. |
| Energy Mode → Low Power on AC | Caps GPU clock at the hardware level. Same model, same code path, no software changes. Embedding goes from ~9s to ~23s per file, but the GPU never spikes and power stays well under the 100W ceiling. Battery charges while indexing continuously. |

Low Power mode worked, and those throughput numbers are real measurements. Bulk import on Low Power, day-to-day on whatever default the OS picks: that became the routine, and the queue drained with the battery charging.

The actual cause surfaced months later, while I was migrating the embedder and watching the power figures closely. AlDente, the battery manager I run, has a Heat Protection feature that stops charging when the battery crosses a temperature threshold. Mine was set to 35°C. A laptop battery idles at 30 to 33°C, so any sustained warmth pushed it over the line, and AlDente quietly throttled a healthy charger for as long as the import ran. Measured properly, one embedding stream draws about 20W; the power budget was never the constraint. With Heat Protection off (or set to a sane ~45°C), the battery holds its charge under the same load. Low Power mode almost certainly "worked" by keeping the machine cool enough to stay under the threshold, not by rescuing a saturated power budget.

The principle worth extracting: **when a laptop misbehaves under sustained load, audit the software that manages the hardware before blaming the workload.** A battery manager, an energy mode, a thermal daemon: each one throttles silently, and its threshold composes with your workload in ways no UI will show you. I spent weeks treating a power-envelope problem that was one slider in a menu bar app.

Low Power mode is still worth using for bulk reindexing (System Settings → Battery → Energy Mode → On Power Adapter → Low Power): it keeps the fans quiet and the chassis cool, and the OS manages the clock at the hardware level rather than through application-side sleep hacks. Just don't mistake it for the fix if your battery is draining on AC. Check the battery manager first.

## What it actually changed

Quantitatively: ~1,500 sessions, ~35,000 conversation turns indexed, retrieval in under a second on cold cache. Qualitatively, three things:

**No more re-explaining.** I can reference a decision from three weeks ago and Claude pulls the actual conversation, not a hallucinated summary of what it thinks I might have said.

**An audit trail I didn't have to write.** `log_action` calls accumulate as I work. "What did I do yesterday?" returns a real list, not a guess.

**A safety net on memory loss.** If a session ends abruptly or I switch machines, the next session can search what the last one was doing. The transcripts were always there. Now they're searchable.

The architecture itself is small: a watcher, an indexer, a server, a queue. Most of the value came from refusing to add things. No summariser or tagger in the indexing path, no remote embedding API, no merged vector store across machines. The boring version is the version that works.

The architecture is the design post. The next three are the build:

- [Building an MCP server for Claude Code](/blog/building-an-mcp-server-for-claude-code/): the front door Claude calls.
- [The watcher and indexer behind a local RAG](/blog/the-watcher-and-indexer-behind-a-local-rag/): the pipeline that fills the vector store.
- [Pairing Claude's RAG with a curated wiki](/blog/pairing-claude-rag-with-a-curated-wiki/): the structured knowledge layer that handles what RAG search can't.
