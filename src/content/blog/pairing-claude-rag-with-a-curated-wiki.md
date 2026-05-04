---
title: "Pairing Claude's RAG with a curated wiki"
description: "A vector search over old conversations is great at fuzzy recall and terrible at structured answers. Add a curated markdown wiki alongside the RAG, give Claude a strict lookup order, and the two cover each other's weaknesses. Use cases, setup, schema, sync."
publishDate: 2026-09-07
tags: ["claude-code", "rag", "knowledge-management", "obsidian", "ai-tooling"]
locale: en
campaign: "claude-rag-wiki"
relatedPosts: ["giving-claude-a-memory-with-a-local-rag", "building-an-mcp-server-for-claude-code", "the-watcher-and-indexer-behind-a-local-rag"]
---

This is part 4, the last in the series on giving Claude Code persistent memory. Part 1 covered [the design](/blog/giving-claude-a-memory-with-a-local-rag/), part 2 [the MCP server](/blog/building-an-mcp-server-for-claude-code/), and part 3 [the watcher and indexer](/blog/the-watcher-and-indexer-behind-a-local-rag/). This one pairs the RAG with a curated wiki: a separate, human-curated knowledge base for the things that need to be *current* rather than just *findable*.

## Search recalls. A wiki answers.

The local RAG is great at one thing: pulling up the exact conversation where you argued through a decision, even when you can only half-remember the topic. It's a search engine over your own thinking.

It's bad at a different thing: telling you *what's true now*.

Conversations contain abandoned ideas, bad fixes that got rolled back the next day, and decisions that later got reversed. A semantic search returns whichever turn matches the query, including the wrong ones. Ask "how do we handle auth refresh?" and the RAG cheerfully returns the old approach and the new approach with no signal that one replaced the other.

The thing missing was a place where the *current* answer lives. Curated, structured, dated. Not a transcript of how you got there. A statement of where you are.

The fix is a wiki.

## What goes in the wiki

The rule that decides what's worth a page: *would I want to read this in six months?* The wiki ends up serving two contexts at once.

### In a work setting

- **Meeting summaries.** Drop a transcript or a notes file in, ask for a summary that follows the schema. The result is a dated page with decisions, action items, and links to related projects. Easier to find six weeks later than a buried calendar invite.
- **Project wiki.** One page per project, linked from the index. What the project is, who's on it, what decisions have been made, what's still open. The kind of thing a new joiner would want on day one and that nobody bothers to write because it's drudge work.
- **Roadmap and product state.** What's shipped, what's in flight, what's planned, what got cut and why. Easier to keep current than a Jira board because Claude can update it from a transcript or a status doc on demand.
- **Architecture decisions and the reasoning behind them.** Why we chose Postgres over Mongo. Why the auth flow uses signed cookies and not JWTs. Decisions you'll be asked about again.
- **End-to-end process pages.** The publishing pipeline, the deploy flow, the indexing loop. The kind of thing you'd send to a new hire instead of giving them a tour.
- **Debugging recipes for non-obvious bugs.** A page per gnarly bug: symptom, root cause, fix. Future-you will hit it again.
- **Third-party API quirks.** Stripe's pagination behaviour. The undocumented rate limit on a vendor's webhook. Things that aren't in the docs but will bite you twice.

### In a personal setting

- **The blog.** I use the wiki to plan articles for warrendeleon.com. Each post idea gets a page with the angle, the audience, the references, and what code from my portfolio repo it should link to. When I sit down to write, the structure is already there.
- **The website itself.** A project page tracks what's deployed, what's in IDEAS.md, the publishing pipeline, the hosting setup. When I touch the site after a few weeks away, the page tells me where I left off without re-reading the code.
- **Understanding complex personal things.** I have a page for my pension. What's in each pot, what the contribution rules are, what the tax treatment looks like, what I've decided about consolidation. Same shape for any topic that's confusing the first time and infuriating to re-derive.
- **Hardware and setup notes.** Why the laptop charges only when the energy mode is set to one specific value. Which monitor needs which cable. The dotfiles wiring that took an afternoon to debug. Invisible to git and obvious in hindsight.
- **Personal reading and ideas.** Books read with a one-paragraph distillation. Articles worth re-reading. Talks given. Side-project ideas at various stages of "maybe one day".

### What *doesn't* go in

- **Anything derivable from the code.** Source is the source of truth for source. A wiki page describing what `useReducer` does is dead weight; React's docs already do that.
- **Step-by-step setup instructions for a specific project.** Those belong in the project's README. The wiki is for cross-cutting knowledge.
- **Conversation context the RAG already has.** The wiki is the *distillation*, not the archive.

The wiki stays small because most things don't pass the six-months test. The pages that do pass it earn their keep many times over.

## The shape of a page

Every page follows the same template. Schema is enforced by `CLAUDE.md` in the wiki repo (more on that below) so the model produces homogeneous pages even when ingesting messy sources.

```markdown
# Page Title

> One-sentence summary of what this page covers.

## Key Points

- The most important facts, as bullets.

## Detail

Full content with sections as needed.

## Sources

- `~/path/to/source.md` (machine: hostname, date: YYYY-MM-DD)

## Related

- [[other-page]]: how it relates.
```

Five page types cover everything I write: **concept** (a pattern or technology), **project** (a specific thing being built), **decision** (a choice made and why), **entity** (a person or team), **process** (how something works end-to-end).

## Setting it up

The whole stack is git, markdown, and a launchd job. Five steps to a working wiki.

### 1. Create a private repo

```bash
gh repo create my-wiki --private --description "Personal wiki"
git clone git@github.com:me/my-wiki.git ~/.wiki
cd ~/.wiki
mkdir -p wiki
```

Private because some pages will reference projects, vendors, or codebases that aren't anyone else's business. The wiki is a working notebook, not a publication.

### 2. Install Obsidian and point it at the vault

[Obsidian](https://obsidian.md) is free for personal use. Open it, **Open folder as vault**, pick `~/.wiki`. The wiki-link syntax (`[[page-name]]`) and graph view come for free, and on every save it's just a markdown file git can track.

Not strictly required (you can edit the markdown in any editor), but Obsidian's `[[link autocomplete]]`, backlinks pane, and graph view make navigation nicer once the wiki passes a few dozen pages.

### 3. Create the schema (`CLAUDE.md`)

The wiki has its own `CLAUDE.md` at the root that defines the rules. Claude Code reads it automatically when working in the directory. Below is a starter you can paste in.

```markdown
# Wiki

This is a personal knowledge base maintained by AI. The AI reads source
material, extracts key concepts, and builds structured, interlinked
wiki pages. The human decides what goes in. The AI does the writing.

## Page formatting

Every wiki page must follow this structure:

# Page Title

> One-sentence summary.

## Key Points

- Bullet points of the most important facts.

## Detail

Full content.

## Sources

- `~/path/to/source.md` (machine: hostname, date: YYYY-MM-DD)

## Related

- [[other-page]]: how it relates.

## Page types

- **Concept**: a technology, pattern, or idea.
- **Project**: a specific thing being built.
- **Decision**: a choice made and why.
- **Entity**: a person or team.
- **Process**: how something actually works.

## Source ingestion

When told to ingest a file, folder, or codebase:

1. Read the source material at the path provided.
2. Extract key concepts, decisions, facts, and relationships.
3. For each concept:
   - If a wiki page exists, update it with the new information.
   - If no page exists, create one.
   - **Commit immediately** after each create/update:
       git commit -m "wiki: create page-name"
       git commit -m "wiki: update page-name"
4. Add source attribution to every claim:
   `[Source: path/to/file]`
5. Update the index page and commit.

## Linking rules

- Use Obsidian wiki-links: `[[page-name]]`
- Every page should have at least one incoming link.
- Every page should link to at least one related page.

## Naming conventions

- File names: lowercase, hyphens, no spaces (`redux-toolkit.md`)
- Page titles: title case in the H1.
- One concept per page. Split if a page exceeds 500 lines.

## Question answering

When asked a question:
1. Search the wiki first.
2. Cite specific wiki pages in your answer.
3. If the wiki doesn't have the answer, say so clearly.
4. Never fabricate information.
```

That file is the *whole* configuration. No tooling, no plugins. The constraints are explicit and the model re-reads them on every action, so pages stay homogeneous over time.

> 💡 **The point:** by writing rules in the repo Claude reads, you don't have to police the format yourself. The schema is enforced by re-reading it on every action, not by manual review.

### 4. Create the index page

```bash
cat > wiki/index.md <<'EOF'
# Index

> Top-level entry point into the wiki.

## Concepts

## Projects

## Decisions

## Processes

EOF
git add . && git commit -m "wiki: scaffold index" && git push
```

The index is the page every other page eventually links back to. As pages get added, they end up under the right heading. Empty headings now, populated as you ingest.

### 5. Wire the wiki into Claude Code

Add a section to your global `~/.claude/CLAUDE.md` so every Claude Code session knows the wiki exists and when to consult it:

```markdown
### Wiki (`~/.wiki`)

A personal knowledge base of structured markdown pages under
`~/.wiki/wiki/`. Full rules are in `~/.wiki/CLAUDE.md`.

**When answering questions**, check the wiki first:
1. Read relevant pages from `~/.wiki/wiki/` before answering.
2. Cite specific wiki pages in your answer.
3. If the wiki doesn't cover the topic, say so clearly.

**When to consult the wiki**: questions about architecture, project
decisions, personal projects, dotfiles setup, or any topic that may
have been ingested.

**Lookup order**: Wiki (structured knowledge) → RAG search
(conversation history) → codebase (source of truth)
```

The lookup order is the load-bearing line. The wiki has the answer if there is one. The RAG has the *story* of how the answer evolved. The codebase has what the code actually does right now, which sometimes differs from both.

In practice it plays out like this:

> *"How did I configure the embedding model for the M5 Max?"*

Claude reads `wiki/rag-sync-plan.md` first. The page has a config block, a date, and a link to the section explaining why MPS was the answer. Done in one read. Without the wiki, the same question hits the RAG and returns four conversation turns from different days, with no indication that three of them are obsolete.

> 💡 **The split:** wiki for "what's true", RAG for "how we got here", codebase for "what the code does". Each handles the question the other two are bad at.

## Filling the wiki

Two workflows. Both produce real git commits I can review.

**Targeted update.** When something interesting happens, a debugging session ends with a real lesson, a project hits a milestone, an architectural call:

```text
"Update wiki/rag-sync-plan.md with what we just learned about Low Power
energy mode and the 100W power-delivery cap."
```

Claude reads the existing page, merges the new information following the schema, commits. One commit per page change.

**Bulk ingest.** Dump a folder, codebase, or set of notes into the wiki and let Claude extract concepts:

```text
"Ingest ~/Developer/dotfiles into the wiki."
```

Claude reads each meaningful file, extracts concepts, creates or updates pages, commits each one separately. The schema says one concept per page, so a `dotfiles/rag/src/store.py` containing two embedding backends becomes two pages: one for sentence-transformers, one for Ollama.

The wiki ends up curated *by* an LLM but *under* a strict template, which is a much narrower failure mode than letting the model write freely.

A small thing I appreciate: every page change is its own commit. If a page goes wrong, `git log path/to/page.md`, find the commit, revert. No cross-contamination with twelve other edits.

## The sync

Multiple machines, same wiki. Git handles it. A `sync.sh` script:

```bash
#!/bin/bash
# Wiki sync: commit local changes, pull remote, push.
set -uo pipefail
WIKI_DIR="$HOME/.wiki"
cd "$WIKI_DIR" || exit 1

git fetch origin main --quiet 2>/dev/null

LOCAL_CHANGES=$(git status --porcelain)
BEHIND=$(git rev-list HEAD..origin/main --count 2>/dev/null || echo 0)

if [[ -z "$LOCAL_CHANGES" && "$BEHIND" == "0" ]]; then
  exit 0
fi

if [[ -n "$LOCAL_CHANGES" ]]; then
  git add -A
  HOSTNAME=$(hostname -s)
  git commit -m "wiki: auto-update from ${HOSTNAME}" --quiet
fi

if git pull --rebase origin main --quiet 2>/dev/null; then
  git push origin main --quiet 2>/dev/null
else
  echo "[wiki-sync] Rebase conflict. Manual resolution needed."
  git rebase --abort 2>/dev/null
  exit 1
fi
```

A launchd agent runs it every ten minutes. There's only one of you, on one machine at a time. The conflict rate is effectively zero. On the rare conflict, rebase fails loudly and you resolve it by hand.

`~/Library/LaunchAgents/com.dotfiles.wiki-sync.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.dotfiles.wiki-sync</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>/Users/me/.wiki/sync.sh</string>
    </array>
    <key>StartInterval</key>
    <integer>600</integer>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/me/.wiki/sync.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/me/.wiki/sync.err</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
        <key>HOME</key>
        <string>/Users/me</string>
    </dict>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.dotfiles.wiki-sync.plist
```

That's the entire sync system. Markdown in git, pulled on a timer.

## Why this works better than either alone

A pure RAG gives you search but no structure. Every "what's the current state of X?" query returns a wall of half-relevant turns. The model has no way to know which one is canonical.

A pure wiki gives you structure but no recall. Anything you forgot to write down is lost. And you forget to write things down constantly, because writing things down is friction and the RAG promises to remember them for you.

The combination splits the load. The RAG remembers everything you do. The wiki remembers what you decided. Claude knows which to ask first, in what order, and when to admit it doesn't know.

The interesting part is that the wiki *itself* is built using the RAG. When you ask Claude to "extract the concepts from this folder into wiki pages", it can search past conversations to enrich the synthesis. The two systems compose. Neither is interesting alone. Together they make Claude actually useful as a long-running collaborator instead of a fresh intern every morning.

That's the whole pitch. A search index for the unstructured stuff. A curated wiki for the structured stuff. A strict lookup order so Claude knows which to reach for. Each piece is small. The value is in the way they fit.
