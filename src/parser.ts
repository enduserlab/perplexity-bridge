import type { ParsedThread, ThreadTurn, Citation } from "./types";

/**
 * Parses a Perplexity markdown export into structured thread data.
 *
 * Perplexity exports follow a pattern of alternating user queries
 * and AI responses. Queries are typically shorter and may appear as
 * headers or distinct paragraphs. Responses contain citations in
 * [n] format with a references section at the end.
 */
export function parsePerplexityThread(
	content: string,
	sourceUrl?: string
): ParsedThread {
	const turns = extractTurns(content);
	const citations = extractAllCitations(content);
	const title = deriveTitle(content, turns);

	return {
		title,
		turns,
		citations,
		rawContent: content,
		sourceUrl,
		importedAt: new Date(),
	};
}

/**
 * Extract Q&A turns from the markdown content.
 *
 * Perplexity exports vary in format. Common patterns:
 * 1. Headers as queries: "## query text" followed by response
 * 2. Bold queries: "**query text**" followed by response
 * 3. Simple alternation with separators (---)
 * 4. Native markdown export with clear turn boundaries
 */
function extractTurns(content: string): ThreadTurn[] {
	const turns: ThreadTurn[] = [];

	// Strategy 1: Look for ## headers as turn markers
	const headerPattern = /^##\s+(.+)$/gm;
	const headerMatches = [...content.matchAll(headerPattern)];

	if (headerMatches.length >= 1) {
		for (let i = 0; i < headerMatches.length; i++) {
			const query = headerMatches[i][1].trim();
			const start = (headerMatches[i].index ?? 0) + headerMatches[i][0].length;
			const end = i + 1 < headerMatches.length
				? (headerMatches[i + 1].index ?? content.length)
				: content.length;

			const response = content.slice(start, end).trim();
			const citations = extractCitationsFromText(response);

			turns.push({ query, response, citations, index: i });
		}
		if (turns.length > 0) return turns;
	}

	// Strategy 2: Look for horizontal rule separators
	const sections = content.split(/\n---\n/).filter((s) => s.trim());

	if (sections.length >= 2) {
		for (let i = 0; i < sections.length; i += 2) {
			const query = sections[i].trim().replace(/^#+\s*/, "");
			const response = sections[i + 1]?.trim() || "";
			const citations = extractCitationsFromText(response);

			turns.push({
				query,
				response,
				citations,
				index: Math.floor(i / 2),
			});
		}
		if (turns.length > 0) return turns;
	}

	// Strategy 3: Treat the whole content as a single research response
	// Use the first line or sentence as the implicit query
	const firstLine = content.split("\n")[0].replace(/^#+\s*/, "").trim();
	const citations = extractCitationsFromText(content);

	turns.push({
		query: firstLine || "Research thread",
		response: content,
		citations,
		index: 0,
	});

	return turns;
}

/**
 * Extract citations in [n] format and their corresponding URLs.
 */
function extractAllCitations(content: string): Citation[] {
	const citations: Map<number, Citation> = new Map();

	// Match inline citations: [1], [2], etc.
	const inlinePattern = /\[(\d+)\]/g;
	const inlineMatches = [...content.matchAll(inlinePattern)];

	for (const match of inlineMatches) {
		const num = parseInt(match[1], 10);
		if (!citations.has(num)) {
			citations.set(num, { number: num, url: "", title: "" });
		}
	}

	// Match reference-style links: [n]: URL or [n] URL "title"
	const refPattern = /\[(\d+)\]:\s*(https?:\/\/\S+)(?:\s+"([^"]*)")?/g;
	const refMatches = [...content.matchAll(refPattern)];

	for (const match of refMatches) {
		const num = parseInt(match[1], 10);
		citations.set(num, {
			number: num,
			url: match[2],
			title: match[3] || extractDomainName(match[2]),
		});
	}

	// Match markdown links near citation numbers: [Title](URL)
	const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
	const linkMatches = [...content.matchAll(linkPattern)];

	for (const match of linkMatches) {
		// Check if this link is associated with a citation number nearby
		const title = match[1];
		const url = match[2];

		// If the title is a number, it's a citation reference
		const num = parseInt(title, 10);
		if (!isNaN(num) && citations.has(num)) {
			const existing = citations.get(num)!;
			if (!existing.url) {
				existing.url = url;
			}
		}
	}

	return Array.from(citations.values()).sort((a, b) => a.number - b.number);
}

/**
 * Extract citations from a specific text block.
 */
function extractCitationsFromText(text: string): Citation[] {
	const citations: Citation[] = [];
	const pattern = /\[(\d+)\]/g;
	const seen = new Set<number>();

	const matches = [...text.matchAll(pattern)];
	for (const match of matches) {
		const num = parseInt(match[1], 10);
		if (!seen.has(num)) {
			seen.add(num);
			citations.push({ number: num, url: "", title: "" });
		}
	}

	return citations;
}

/**
 * Derive a title from the thread content.
 */
function deriveTitle(content: string, turns: ThreadTurn[]): string {
	// Check for a top-level header
	const h1Match = content.match(/^#\s+(.+)$/m);
	if (h1Match) return h1Match[1].trim();

	// Use the first query
	if (turns.length > 0 && turns[0].query) {
		const query = turns[0].query;
		// Truncate long queries
		return query.length > 80 ? query.slice(0, 77) + "..." : query;
	}

	return "Perplexity Research";
}

/**
 * Extract a readable domain name from a URL.
 */
function extractDomainName(url: string): string {
	try {
		const hostname = new URL(url).hostname;
		return hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}
