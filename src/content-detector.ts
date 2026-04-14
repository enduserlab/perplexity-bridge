import type { PerplexityContentType } from "./types";

/**
 * Auto-detects what type of Perplexity content a file contains.
 * This determines which processing pipeline to use.
 */
export function detectContentType(
	content: string,
	filename: string
): PerplexityContentType {
	const ext = filename.split(".").pop()?.toLowerCase() || "";

	// Non-markdown files are likely Computer/Comet artifacts
	if (!["md", "txt"].includes(ext)) {
		return "computer-artifact";
	}

	// Deep research: typically longer, more structured, with extensive citations
	// and sections like "Analysis", "Conclusion", "Key Takeaways"
	const deepResearchSignals = [
		/^#\s+deep\s+research/im,
		/##\s+(analysis|conclusion|key\s+takeaways|executive\s+summary)/im,
		/\[\d+\].*\[\d+\].*\[\d+\].*\[\d+\].*\[\d+\]/s, // 5+ inline citations
	];

	const deepResearchScore = deepResearchSignals.reduce(
		(score, pattern) => score + (pattern.test(content) ? 1 : 0),
		0
	);

	// Long content with high citation density suggests deep research
	const wordCount = content.split(/\s+/).length;
	const citationCount = (content.match(/\[\d+\]/g) || []).length;
	const citationDensity = wordCount > 0 ? citationCount / wordCount : 0;

	if (deepResearchScore >= 2 || (wordCount > 3000 && citationDensity > 0.01)) {
		return "deep-research";
	}

	// Space: multiple distinct research threads in one file
	// Look for multiple H1 headers or clear thread boundaries
	const h1Count = (content.match(/^# .+$/gm) || []).length;
	const separatorCount = (content.match(/^---$/gm) || []).length;

	if (h1Count >= 3 || (h1Count >= 2 && separatorCount >= 2)) {
		return "space";
	}

	// Default: standard thread
	if (wordCount > 50) {
		return "thread";
	}

	return "unknown";
}

/**
 * Returns a human-readable label for a content type.
 */
export function contentTypeLabel(type: PerplexityContentType): string {
	const labels: Record<PerplexityContentType, string> = {
		thread: "Research Thread",
		"deep-research": "Deep Research Report",
		space: "Research Space",
		"computer-artifact": "Computer/Comet Artifact",
		unknown: "Unknown Content",
	};
	return labels[type];
}
