import { requestUrl } from "obsidian";
import type {
	ParsedThread,
	StructuredResearch,
	PerplexityBridgeSettings,
} from "./types";

const DEFAULT_STRUCTURING_PROMPT = `You are a research librarian helping build a personal wiki. You've been given a Perplexity AI research thread — a conversation where someone explored a topic through multiple queries.

Your job is to distill this into a structured research page. Respond with ONLY a JSON object (no markdown, no code fences):

{
  "title": "Clean, descriptive title for the research topic (not the first query verbatim)",
  "summary": "One-paragraph executive summary of what was learned. 2-4 sentences.",
  "findings": ["Key finding 1", "Key finding 2", ...],
  "openQuestions": ["Question that emerged but wasn't fully answered", ...],
  "tags": ["lowercase-tag", ...],
  "relatedTopics": ["Topic this connects to", "Another related topic", ...]
}

Guidelines:
- Title should be a clean topic name, not a question
- Summary should capture the most important takeaway
- Findings should be specific and actionable, not vague
- Include 3-8 findings, ordered by importance
- Open questions are gaps — things worth investigating further
- Tags should be 3-7 lowercase terms useful for categorization
- Related topics help build wiki connections — think broadly about what this connects to

Research thread:
---
{THREAD_CONTENT}
---

Respond with the JSON object only.`;

/**
 * Sends a parsed thread to Claude to extract structured research data.
 */
export async function structureResearch(
	thread: ParsedThread,
	settings: PerplexityBridgeSettings
): Promise<StructuredResearch> {
	if (!settings.claudeApiKey) {
		return fallbackStructure(thread);
	}

	// Build a condensed version of the thread for Claude
	const threadContent = thread.turns
		.map((turn) => `**Q: ${turn.query}**\n\n${turn.response}`)
		.join("\n\n---\n\n");

	const prompt = (settings.structuringPrompt || DEFAULT_STRUCTURING_PROMPT)
		.replace("{THREAD_CONTENT}", threadContent);

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
				max_tokens: 1000,
				messages: [
					{
						role: "user",
						content: prompt,
					},
				],
			}),
		});

		const result = response.json;
		const textBlock = result.content?.find(
			(block: { type: string }) => block.type === "text"
		);

		if (!textBlock?.text) {
			throw new Error("No text response from Claude");
		}

		const structured = JSON.parse(textBlock.text);

		return {
			title: structured.title || thread.title,
			summary: structured.summary || "",
			findings: Array.isArray(structured.findings) ? structured.findings : [],
			openQuestions: Array.isArray(structured.openQuestions)
				? structured.openQuestions
				: [],
			tags: Array.isArray(structured.tags) ? structured.tags : [],
			sources: thread.citations,
			thread,
			relatedTopics: Array.isArray(structured.relatedTopics)
				? structured.relatedTopics
				: [],
		};
	} catch {
		return fallbackStructure(thread);
	}
}

/**
 * Fallback structuring when Claude is unavailable.
 * Preserves the thread content in a basic wiki format.
 */
function fallbackStructure(thread: ParsedThread): StructuredResearch {
	return {
		title: thread.title,
		summary: `Research thread with ${thread.turns.length} queries and ${thread.citations.length} citations.`,
		findings: thread.turns.map((t) => t.query),
		openQuestions: [],
		tags: ["perplexity", "research", "unstructured"],
		sources: thread.citations,
		thread,
		relatedTopics: [],
	};
}

/**
 * Renders a StructuredResearch object as a wiki-ready markdown page.
 */
export function renderResearchPage(research: StructuredResearch): string {
	const frontmatter = buildFrontmatter(research);
	const body = buildBody(research);

	return `${frontmatter}\n\n${body}\n`;
}

function buildFrontmatter(research: StructuredResearch): string {
	const lines = [
		"---",
		`title: "${escapeYaml(research.title)}"`,
		`type: "research"`,
		`source: "perplexity"`,
		`imported: "${research.thread.importedAt.toISOString()}"`,
		`turns: ${research.thread.turns.length}`,
		`citations: ${research.sources.length}`,
	];

	if (research.tags.length > 0) {
		lines.push("tags:");
		for (const tag of research.tags) {
			lines.push(`  - "${escapeYaml(tag)}"`);
		}
	}

	if (research.relatedTopics.length > 0) {
		lines.push("related:");
		for (const topic of research.relatedTopics) {
			lines.push(`  - "[[${escapeYaml(topic)}]]"`);
		}
	}

	if (research.thread.sourceUrl) {
		lines.push(`source-url: "${research.thread.sourceUrl}"`);
	}

	lines.push("---");
	return lines.join("\n");
}

function buildBody(research: StructuredResearch): string {
	const sections: string[] = [];

	// Title
	sections.push(`# ${research.title}`);

	// Summary
	sections.push(`## Summary\n\n${research.summary}`);

	// Key Findings
	if (research.findings.length > 0) {
		const findings = research.findings
			.map((f) => `- ${f}`)
			.join("\n");
		sections.push(`## Key Findings\n\n${findings}`);
	}

	// Open Questions
	if (research.openQuestions.length > 0) {
		const questions = research.openQuestions
			.map((q) => `- ${q}`)
			.join("\n");
		sections.push(`## Open Questions\n\n${questions}`);
	}

	// Related Topics (as wiki links)
	if (research.relatedTopics.length > 0) {
		const links = research.relatedTopics
			.map((t) => `- [[${t}]]`)
			.join("\n");
		sections.push(`## Related Topics\n\n${links}`);
	}

	// Sources
	if (research.sources.length > 0) {
		const sourceList = research.sources
			.filter((s) => s.url)
			.map((s) => `- [${s.title || s.url}](${s.url})`)
			.join("\n");
		if (sourceList) {
			sections.push(`## Sources\n\n${sourceList}`);
		}
	}

	// Research Thread (collapsible)
	sections.push(`## Research Thread\n`);
	for (const turn of research.thread.turns) {
		sections.push(`### Q: ${turn.query}\n\n${turn.response}\n`);
	}

	return sections.join("\n\n");
}

function escapeYaml(value: string): string {
	return value.replace(/"/g, '\\"');
}
