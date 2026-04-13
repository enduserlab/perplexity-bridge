# Perplexity Research Bridge

Run Perplexity AI research directly from Obsidian and import research threads as structured, wiki-ready notes with citations, findings, and related topics.

## Features

### Direct research (via Perplexity Sonar API)

- **Research from command palette** — type a query, get a structured note with sources
- **Research selected text** — highlight text in any note and research it
- **Deep Research** — comprehensive multi-source reports via `sonar-deep-research`
- **Search recency filters** — limit sources to past hour, day, week, month, or year
- **Model selection** — Sonar, Sonar Pro, or Sonar Reasoning Pro

### Import pipeline (paste/drop Perplexity exports)

- **Thread import** — paste from clipboard or drop markdown files into the import folder
- **Deep Research import** — auto-detected and handled with the full structured pipeline
- **Space import** — multi-thread research projects imported as interlinked wiki pages
- **Computer/Comet artifacts** — screenshots, PDFs, and files catalogued with companion notes
- **Auto-detect content type** — the plugin figures out what you pasted

### Claude structuring (optional)

- Extracts title, summary, key findings, open questions, tags, and related topics
- Generates wiki-links for related topics to build knowledge graph connections
- Works on both API results and imported content
- Falls back gracefully when Claude API is unavailable

## Quick start

### 1. Add your Perplexity API key

Get one at [perplexity.ai/settings/api](https://www.perplexity.ai/settings/api).

Open **Settings → Perplexity Research Bridge** and enter it under "Perplexity API".

### 2. Research something

`Cmd/Ctrl+P` → "Research with Perplexity" → type your question → Enter.

Your results appear as a new note with citations and sources.

### 3. (Optional) Add Claude API key

For deeper structuring of imported content, add your Anthropic API key under "Claude API" in settings.

## Commands

| Command | Description |
|---------|-------------|
| **Research with Perplexity** | Open research modal, type a query |
| **Deep research with Perplexity** | Comprehensive multi-source report |
| **Research selected text** | Research the highlighted text |
| **Import research from clipboard** | Import a pasted Perplexity thread |
| **Import Perplexity Space from clipboard** | Import a multi-thread Space |
| **Structure current file as research** | Run Claude structuring on any file |
| **Process all files in import folder** | Batch process the import folder |
| **Open import/research/Spaces folder** | Navigate to plugin folders |

## Output format

```yaml
---
title: "Quantum Computing Applications"
type: "research"
source: "perplexity"
model: "sonar-pro"
imported: "2026-04-13T12:00:00.000Z"
citations: 8
sources:
  - "https://nature.com/quantum-article"
  - "https://arxiv.org/quantum-paper"
---

# Quantum Computing Applications

> **Query:** What are the practical applications of quantum computing?

Quantum computing has several practical applications...

## Sources

1. [nature.com](https://nature.com/quantum-article)
2. [arxiv.org](https://arxiv.org/quantum-paper)

## Related Questions

- How does quantum error correction work?
- What industries will quantum computing disrupt first?
```

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Perplexity API key | — | Your Perplexity API key for direct research |
| Perplexity model | Sonar Pro | sonar, sonar-pro, or sonar-reasoning-pro |
| Claude API key | — | (Optional) Anthropic key for structuring imports |
| Claude model | Sonnet 4 | Claude model for structuring |
| Import folder | `_inbox/perplexity` | Where raw exports land |
| Output folder | `wiki/research` | Where structured notes are created |
| Spaces import | `_inbox/perplexity/spaces` | Space exports |
| Spaces output | `wiki/spaces` | Structured Space pages |
| Artifacts | `raw/perplexity` | Computer/Comet artifact notes |
| Auto-structure | on | Auto-run Claude on new imports |
| Watch folder | on | Detect new files in import folder |
| Keep raw imports | on | Keep originals after structuring |

## Supported Perplexity features

| Feature | How it works |
|---------|-------------|
| **Search / Threads** | Direct API queries or clipboard import |
| **Pro Search** | Via Sonar Pro model |
| **Deep Research** | Via `sonar-deep-research` model or content detection on imports |
| **Reasoning** | Via Sonar Reasoning Pro model |
| **Spaces** | Clipboard import → interlinked wiki pages with overview |
| **Computer / Comet** | Artifact files catalogued with companion markdown notes |
| **Pages** | Copy content → clipboard import |
| **Assistant** | Same threads — captured via search pipeline |

## Network disclosure

This plugin makes API calls to:
- **api.perplexity.ai** — for direct research queries (Sonar API)
- **api.anthropic.com** — for structuring imported content (Claude API, optional)

Both are user-configured and documented. No other network requests are made.

## Development

```bash
npm install
npm run dev    # watch mode
npm run build  # production build
```

## License

MIT
