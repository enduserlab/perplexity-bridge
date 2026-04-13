import { requestUrl } from "obsidian";
import type {
	ParsedSpace,
	ParsedThread,
	StructuredSpace,
	StructuredResearch,
	PerplexityBridgeSettings,
} from "./types";
import { parsePerplexityThread } from "./parser";
import { structureResearch, renderResearchPage } from "./structurer";

const SPACE_OVERVIEW_PROMPT = `You are a research librarian. You've been given multiple research threads from a Perplexity Space — a project-level container where someone explored a topic through several threads.

Each thread has already been individually structured. Your job is to create an OVERVIEW that ties them together. Respond with ONLY a JSON object:

{
  "title": "Clean title for the overall research area",
  "summary": "2-4 sentence synthesis of what was learned across ALL threads. Not a list of threads — a unified narrative.",
  "findings": ["Cross-cutting finding that spans multiple threads", ...],
  "openQuestions": ["Gap that none of the threads resolved", ...],
  "tags": ["tag", ...],
  "relatedTopics": ["Broader topic this connects to", ...],
  "themes": ["Recurring theme across threads", ...]
}

Guidelines:
- The overview should SYNTHESIZE, not just summarize each thread
- Findings should be things that only become clear when you see all threads together
- Open questions should be gaps visible from the cross-thread perspective
- Themes are patterns that recur across multiple threads

Space name: {SPACE_NAME}

Individual thread summaries:
---
{THREAD_SUMMARIES}
---

Respond with the JSON object only.`;

/**
 * Parses a Space export into a structured multi-thread object.
 *
 * Perplexity Space exports can come as:
 * 1. A single markdown file with threads separated by clear boundaries
 * 2. A folder of markdown files (one per thread)
 * 3. A JSON export from the Thread Exporter extension
 *
 * This handles case 1. The watcher handles case 2 by detecting
 * a folder in the spaces import path.
 */
export function parseSpaceFromMarkdown(
	content: string,
	spaceName: string
): ParsedSpace {
	// Look for thread boundaries — typically ## or --- separators
	// with distinct Q&A patterns in each section
	const threads: ParsedThread[] = [];

	// Strategy: Split on H1 headers (each thread often starts with one)
	const h1Pattern = /^# (.+)$/gm;
	const h1Matches = [...content.matchAll(h1Pattern)];

	if (h1Matches.length > 1) {
		for (let i = 0; i < h1Matches.length; i++) {
			const start = h1Matches[i].index!;
			const end = i + 1 < h1Matches.length
				? h1Matches[i + 1].index!
				: content.length;

			const threadContent = content.slice(start, end).trim();
			threads.push(parsePerplexityThread(threadContent));
		}
	} else {
		// Single thread or can't detect boundaries — treat as one
		threads.push(parsePerplexityThread(content));
	}

	// Extract curated source URLs
	const urlPattern = /https?:\/\/[^\s)>\]]+/g;
	const allUrls = [...content.matchAll(urlPattern)].map((m) => m[0]);
	const curatedSources = [...new Set(allUrls)];

	return {
		name: spaceName,
		description: "",
		threads,
		curatedSources,
		importedAt: new Date(),
	};
}

/**
 * Parse a Space from a folder of individual thread files.
 */
export function parseSpaceFromFolder(
	threadContents: Array<{ filename: string; content: string }>,
	spaceName: string
): ParsedSpace {
	const threads = threadContents.map((tc) =>
		parsePerplexityThread(tc.content)
	);

	const allUrls = threadContents.flatMap((tc) => {
		const matches = [...tc.content.matchAll(/https?:\/\/[^\s)>\]]+/g)];
		return matches.map((m) => m[0]);
	});

	return {
		name: spaceName,
		description: "",
		threads,
		curatedSources: [...new Set(allUrls)],
		importedAt: new Date(),
	};
}

/**
 * Structure an entire Space: individually structure each thread,
 * then create a cross-cutting overview.
 */
export async function structureSpace(
	space: ParsedSpace,
	settings: PerplexityBridgeSettings
): Promise<StructuredSpace> {
	// Structure each thread individually
	const structuredThreads: StructuredResearch[] = [];
	for (const thread of space.threads) {
		const structured = await structureResearch(thread, settings);
		structuredThreads.push(structured);
	}

	// Generate the cross-cutting overview
	const overview = await generateSpaceOverview(
		space,
		structuredThreads,
		settings
	);

	// Collect all tags and deduplicate
	const allTags = new Set<string>();
	for (const thread of structuredThreads) {
		for (const tag of thread.tags) {
			allTags.add(tag);
		}
	}

	return {
		name: space.name,
		overview,
		threads: structuredThreads,
		tags: [...allTags],
		themes: (overview as StructuredResearch & { themes?: string[] }).themes || [],
	};
}

async function generateSpaceOverview(
	space: ParsedSpace,
	threads: StructuredResearch[],
	settings: PerplexityBridgeSettings
): Promise<StructuredResearch> {
	if (!settings.claudeApiKey) {
		return {
			title: space.name,
			summary: `Research space with ${threads.length} threads.`,
			findings: threads.map((t) => t.title),
			openQuestions: [],
			tags: [],
			sources: threads.flatMap((t) => t.sources),
			thread: {
				title: space.name,
				turns: [],
				citations: [],
				rawContent: "",
				importedAt: space.importedAt,
			},
			relatedTopics: [],
		};
	}

	const threadSummaries = threads
		.map(
			(t, i) =>
				`Thread ${i + 1}: "${t.title}"\nSummary: ${t.summary}\nFindings: ${t.findings.join("; ")}`
		)
		.join("\n\n");

	const prompt = SPACE_OVERVIEW_PROMPT
		.replace("{SPACE_NAME}", space.name)
		.replace("{THREAD_SUMMARIES}", threadSummaries);

	try {
		const response = await requestUrl({
			url: "https://api.anthropic.com/v1/messages",
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": settings.claudeApiKey,
				"anthropic-version": "2023-06-01",
			},
			body: JSON.stringify({
				model: settings.claudeModel,
				max_tokens: 1200,
				messages: [{ role: "user", content: prompt }],
			}),
		});

		const result = response.json;
		const textBlock = result.content?.find(
			(block: { type: string }) => block.type === "text"
		);

		if (!textBlock?.text) throw new Error("No response from Claude");

		const parsed = JSON.parse(textBlock.text);

		return {
			title: parsed.title || space.name,
			summary: parsed.summary || "",
			findings: parsed.findings || [],
			openQuestions: parsed.openQuestions || [],
			tags: parsed.tags || [],
			sources: threads.flatMap((t) => t.sources),
			thread: {
				title: space.name,
				turns: [],
				citations: [],
				rawContent: "",
				importedAt: space.importedAt,
			},
			relatedTopics: parsed.relatedTopics || [],
		};
	} catch {
		return {
			title: space.name,
			summary: `Research space with ${threads.length} threads.`,
			findings: threads.map((t) => t.title),
			openQuestions: [],
			tags: [],
			sources: threads.flatMap((t) => t.sources),
			thread: {
				title: space.name,
				turns: [],
				citations: [],
				rawContent: "",
				importedAt: space.importedAt,
			},
			relatedTopics: [],
		};
	}
}

/**
 * Render a full Space as a set of interlinked wiki pages.
 * Returns a map of filename → content.
 */
export function renderSpacePages(
	space: StructuredSpace
): Map<string, string> {
	const pages = new Map<string, string>();

	// Overview page with links to all thread pages
	const overviewContent = renderSpaceOverview(space);
	pages.set(`${sanitize(space.name)} - Overview.md`, overviewContent);

	// Individual thread pages with backlinks to overview
	for (const thread of space.threads) {
		const threadContent = renderSpaceThread(thread, space.name);
		pages.set(`${sanitize(thread.title)}.md`, threadContent);
	}

	return pages;
}

function renderSpaceOverview(space: StructuredSpace): string {
	const lines: string[] = [];

	// Frontmatter
	lines.push("---");
	lines.push(`title: "${esc(space.name)}"`);
	lines.push(`type: "space-overview"`);
	lines.push(`source: "perplexity"`);
	lines.push(`threads: ${space.threads.length}`);
	if (space.tags.length > 0) {
		lines.push("tags:");
		for (const tag of space.tags) lines.push(`  - "${esc(tag)}"`);
	}
	lines.push("---");
	lines.push("");

	// Title
	lines.push(`# ${space.name}`);
	lines.push("");

	// Summary
	lines.push(`## Summary`);
	lines.push("");
	lines.push(space.overview.summary);
	lines.push("");

	// Themes (cross-cutting patterns)
	if (space.themes.length > 0) {
		lines.push(`## Themes`);
		lines.push("");
		for (const theme of space.themes) lines.push(`- ${theme}`);
		lines.push("");
	}

	// Key Findings
	if (space.overview.findings.length > 0) {
		lines.push(`## Key Findings`);
		lines.push("");
		for (const f of space.overview.findings) lines.push(`- ${f}`);
		lines.push("");
	}

	// Thread index with wiki-links
	lines.push(`## Research Threads`);
	lines.push("");
	for (const thread of space.threads) {
		lines.push(`- [[${thread.title}]] — ${thread.summary.slice(0, 100)}`);
	}
	lines.push("");

	// Open Questions
	if (space.overview.openQuestions.length > 0) {
		lines.push(`## Open Questions`);
		lines.push("");
		for (const q of space.overview.openQuestions) lines.push(`- ${q}`);
		lines.push("");
	}

	// Related Topics
	if (space.overview.relatedTopics.length > 0) {
		lines.push(`## Related Topics`);
		lines.push("");
		for (const t of space.overview.relatedTopics) lines.push(`- [[${t}]]`);
	}

	return lines.join("\n");
}

function renderSpaceThread(
	thread: StructuredResearch,
	spaceName: string
): string {
	// Use the standard research page renderer but prepend a backlink
	const basePage = renderResearchPage(thread);

	// Insert a backlink to the Space overview after the frontmatter
	const insertPoint = basePage.indexOf("---", 4) + 4; // After closing ---
	const backlink = `\n> Part of [[${spaceName} - Overview|${spaceName}]]\n`;

	return (
		basePage.slice(0, insertPoint) +
		backlink +
		basePage.slice(insertPoint)
	);
}

function sanitize(name: string): string {
	return name.replace(/[\\/:*?"<>|]/g, "-").slice(0, 100);
}

function esc(value: string): string {
	return value.replace(/"/g, '\\"');
}
