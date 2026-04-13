/**
 * A single Q&A turn from a Perplexity thread.
 */
export interface ThreadTurn {
	/** The user's query */
	query: string;
	/** Perplexity's response */
	response: string;
	/** Citations extracted from the response */
	citations: Citation[];
	/** Turn index (0-based) */
	index: number;
}

/**
 * A citation found in a Perplexity response.
 */
export interface Citation {
	/** Citation number as it appears in the text */
	number: number;
	/** URL of the source */
	url: string;
	/** Title of the source, if extractable */
	title: string;
}

/**
 * A parsed Perplexity research thread.
 */
export interface ParsedThread {
	/** Title derived from the first query or thread metadata */
	title: string;
	/** All Q&A turns in order */
	turns: ThreadTurn[];
	/** All unique citations across the thread */
	citations: Citation[];
	/** Raw markdown content */
	rawContent: string;
	/** Source URL if the thread was imported from a share link */
	sourceUrl?: string;
	/** When this was imported */
	importedAt: Date;
}

/**
 * A wiki-ready structured page generated from a Perplexity thread.
 */
export interface StructuredResearch {
	/** Clean title for the wiki page */
	title: string;
	/** One-paragraph executive summary */
	summary: string;
	/** Key findings extracted from the thread */
	findings: string[];
	/** Open questions that emerged */
	openQuestions: string[];
	/** Tags for categorization */
	tags: string[];
	/** All citations with titles */
	sources: Citation[];
	/** The original thread for reference */
	thread: ParsedThread;
	/** Suggested wiki connections (topics this relates to) */
	relatedTopics: string[];
}

/**
 * How the research was imported.
 */
export type ImportMethod =
	| "clipboard"    // Pasted from clipboard
	| "file-drop"    // Dropped markdown file into hot folder
	| "share-link"   // Imported from a Perplexity share URL
	| "manual";      // Manually triggered on an existing file

/**
 * The type of Perplexity content being imported.
 * Each type produces different output structure.
 */
export type PerplexityContentType =
	| "thread"           // Standard Q&A thread
	| "deep-research"    // Extended deep research report
	| "space"            // A full Space (multi-thread project)
	| "computer-artifact" // File/screenshot from Computer/Comet
	| "unknown";

/**
 * A Perplexity Space — a project-level container with multiple threads
 * and curated sources.
 */
export interface ParsedSpace {
	/** Space name/title */
	name: string;
	/** Space description if available */
	description: string;
	/** All threads within the space */
	threads: ParsedThread[];
	/** Curated source URLs attached to the space */
	curatedSources: string[];
	/** When this was imported */
	importedAt: Date;
}

/**
 * A structured Space produces a folder of interlinked pages.
 */
export interface StructuredSpace {
	/** Clean name for the Space folder */
	name: string;
	/** Overview page summarizing the entire Space */
	overview: StructuredResearch;
	/** Individual structured pages for each thread */
	threads: StructuredResearch[];
	/** Tags spanning the whole Space */
	tags: string[];
	/** Cross-cutting themes Claude identified across threads */
	themes: string[];
}

/**
 * An artifact produced by Perplexity Computer/Comet.
 */
export interface ComputerArtifact {
	/** Original filename */
	filename: string;
	/** File type (screenshot, pdf, html, etc.) */
	fileType: string;
	/** Description of what task produced this */
	taskDescription: string;
	/** The Space or thread this is connected to, if any */
	parentContext?: string;
	/** Raw file content or path */
	content: string;
	/** When this was created */
	createdAt: Date;
}

/**
 * Plugin settings.
 */
export interface PerplexityBridgeSettings {
	/** Folder for raw Perplexity imports (relative to vault) */
	importPath: string;
	/** Subfolder for Space imports */
	spacesImportPath: string;
	/** Subfolder for Computer/Comet artifacts */
	artifactsImportPath: string;
	/** Folder for structured research output (relative to vault) */
	outputPath: string;
	/** Folder for structured Space output */
	spacesOutputPath: string;
	/** Folder for raw source assets from Computer/Comet */
	rawSourcesPath: string;
	/** Perplexity API key (for direct research queries) */
	perplexityApiKey: string;
	/** Perplexity model for research queries */
	perplexityModel: string;
	/** Claude API key (for structuring imported research) */
	claudeApiKey: string;
	/** Claude model */
	claudeModel: string;
	/** Whether to also run Claude structuring on API research results */
	structureApiResults: boolean;
	/** Whether to auto-structure new imports */
	autoStructure: boolean;
	/** Whether to watch the import folder for new files */
	watchImportFolder: boolean;
	/** Poll interval in seconds */
	pollIntervalSeconds: number;
	/** Whether to keep the raw import after structuring */
	keepRawImport: boolean;
	/** Whether to auto-detect content type or ask */
	autoDetectContentType: boolean;
	/** Custom structuring prompt override */
	structuringPrompt: string;
}

export const DEFAULT_SETTINGS: PerplexityBridgeSettings = {
	importPath: "_inbox/perplexity",
	spacesImportPath: "_inbox/perplexity/spaces",
	artifactsImportPath: "_inbox/perplexity/artifacts",
	outputPath: "wiki/research",
	spacesOutputPath: "wiki/spaces",
	rawSourcesPath: "raw/perplexity",
	perplexityApiKey: "",
	perplexityModel: "sonar-pro",
	claudeApiKey: "",
	claudeModel: "claude-sonnet-4-20250514",
	structureApiResults: false,
	autoStructure: true,
	watchImportFolder: true,
	pollIntervalSeconds: 10,
	keepRawImport: true,
	autoDetectContentType: true,
	structuringPrompt: "",
};
