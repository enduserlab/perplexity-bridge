import { requestUrl } from "obsidian";
import type { PerplexityBridgeSettings } from "./types";

const API_BASE = "https://api.perplexity.ai";

/** Sonar API response shape. */
export interface SonarResponse {
	content: string;
	citations: string[];
	relatedQuestions: string[];
	model: string;
	usage: { promptTokens: number; completionTokens: number };
}

/** Search recency filter options. */
export type SearchRecency = "hour" | "day" | "week" | "month" | "year" | "none";

/**
 * Query Perplexity Sonar API (synchronous).
 * Works for sonar, sonar-pro, and sonar-reasoning-pro.
 */
export async function searchPerplexity(
	query: string,
	settings: PerplexityBridgeSettings,
	options?: {
		model?: string;
		recency?: SearchRecency;
		systemPrompt?: string;
	}
): Promise<SonarResponse> {
	const model = options?.model ?? settings.perplexityModel;

	const messages: Array<{ role: string; content: string }> = [];

	if (options?.systemPrompt) {
		messages.push({ role: "system", content: options.systemPrompt });
	}

	messages.push({ role: "user", content: query });

	const body: Record<string, unknown> = {
		model,
		messages,
		return_citations: true,
		return_related_questions: true,
	};

	if (options?.recency && options.recency !== "none") {
		body.search_recency_filter = options.recency;
	}

	const response = await requestUrl({
		url: `${API_BASE}/chat/completions`,
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${settings.perplexityApiKey}`,
		},
		body: JSON.stringify(body),
	});

	const result = response.json;
	const choice = result.choices?.[0];

	return {
		content: choice?.message?.content ?? "",
		citations: result.citations ?? [],
		relatedQuestions: result.related_questions ?? [],
		model: result.model ?? model,
		usage: {
			promptTokens: result.usage?.prompt_tokens ?? 0,
			completionTokens: result.usage?.completion_tokens ?? 0,
		},
	};
}

/**
 * Run a Perplexity Deep Research query.
 * This uses the sonar-deep-research model which may take longer
 * and produce comprehensive multi-source reports.
 */
export async function deepResearch(
	query: string,
	settings: PerplexityBridgeSettings
): Promise<SonarResponse> {
	return searchPerplexity(query, settings, {
		model: "sonar-deep-research",
		systemPrompt:
			"Provide a comprehensive, well-structured research report with clear sections, findings, and citations.",
	});
}

/**
 * Format a Sonar API response as a wiki-ready markdown note.
 * Used when the user doesn't also want Claude structuring.
 */
export function renderSonarResponse(
	query: string,
	response: SonarResponse,
	importedAt: Date
): string {
	const lines: string[] = [];

	// Frontmatter
	lines.push("---");
	lines.push(`title: "${escapeYaml(deriveTitleFromQuery(query))}"`);
	lines.push(`type: "research"`);
	lines.push(`source: "perplexity"`);
	lines.push(`model: "${response.model}"`);
	lines.push(`imported: "${importedAt.toISOString()}"`);
	lines.push(`citations: ${response.citations.length}`);
	if (response.citations.length > 0) {
		lines.push("sources:");
		for (const url of response.citations) {
			lines.push(`  - "${escapeYaml(url)}"`);
		}
	}
	lines.push("---");
	lines.push("");

	// Title
	lines.push(`# ${deriveTitleFromQuery(query)}`);
	lines.push("");

	// Query
	lines.push(`> **Query:** ${query}`);
	lines.push("");

	// Answer content
	lines.push(response.content);
	lines.push("");

	// Sources
	if (response.citations.length > 0) {
		lines.push("## Sources");
		lines.push("");
		for (let i = 0; i < response.citations.length; i++) {
			const url = response.citations[i];
			const domain = extractDomain(url);
			lines.push(`${i + 1}. [${domain}](${url})`);
		}
		lines.push("");
	}

	// Related questions
	if (response.relatedQuestions.length > 0) {
		lines.push("## Related Questions");
		lines.push("");
		for (const q of response.relatedQuestions) {
			lines.push(`- ${q}`);
		}
		lines.push("");
	}

	return lines.join("\n");
}

/**
 * Convert a query into a clean note title.
 */
function deriveTitleFromQuery(query: string): string {
	// Remove question marks and trailing punctuation
	let title = query.replace(/[?!]+$/, "").trim();
	// Capitalize first letter
	title = title.charAt(0).toUpperCase() + title.slice(1);
	// Truncate long queries
	if (title.length > 80) {
		title = title.slice(0, 77) + "...";
	}
	return title;
}

function extractDomain(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

function escapeYaml(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
