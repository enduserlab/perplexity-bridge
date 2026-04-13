import { type App, TFile, normalizePath, requestUrl } from "obsidian";
import type {
	ComputerArtifact,
	PerplexityBridgeSettings,
} from "./types";

const ARTIFACT_CLASSIFICATION_PROMPT = `You are cataloguing a file that was produced by Perplexity Computer/Comet (an AI browser agent). This file was generated during a research or task session.

Based on the filename and any content provided, respond with ONLY a JSON object:

{
  "description": "One sentence describing what this artifact contains",
  "taskDescription": "What task likely produced this (e.g., 'screenshot of competitor pricing page', 'downloaded research paper')",
  "tags": ["tag1", "tag2"],
  "relatedTopics": ["Topic this might connect to in a wiki"],
  "category": "screenshot" | "document" | "data" | "webpage" | "media" | "other"
}

Filename: {FILENAME}
File type: {FILETYPE}
Content preview (if text):
---
{CONTENT_PREVIEW}
---

Respond with the JSON object only.`;

/**
 * Handles artifacts produced by Perplexity Computer/Comet.
 * These are raw source files — screenshots, PDFs, downloaded pages —
 * that get catalogued and linked into the wiki.
 */
export class ArtifactHandler {
	private app: App;
	private settings: PerplexityBridgeSettings;

	constructor(app: App, settings: PerplexityBridgeSettings) {
		this.app = app;
		this.settings = settings;
	}

	updateSettings(settings: PerplexityBridgeSettings): void {
		this.settings = settings;
	}

	/**
	 * Process an artifact file: classify it and create a companion
	 * markdown note with metadata and wiki links.
	 */
	async processArtifact(file: TFile): Promise<void> {
		const artifact = await this.classifyArtifact(file);
		await this.createCompanionNote(artifact, file);
	}

	/**
	 * Classify an artifact using Claude (for text-based files)
	 * or based on file metadata alone.
	 */
	private async classifyArtifact(file: TFile): Promise<ComputerArtifact> {
		const fileType = file.extension;
		let contentPreview = "";

		// For text-based files, read a preview
		const textExtensions = ["md", "txt", "html", "csv", "json", "xml"];
		if (textExtensions.includes(fileType)) {
			const content = await this.app.vault.read(file);
			contentPreview = content.slice(0, 2000);
		}

		// If we have an API key, ask Claude to classify
		if (this.settings.claudeApiKey && (contentPreview || fileType)) {
			try {
				const prompt = ARTIFACT_CLASSIFICATION_PROMPT
					.replace("{FILENAME}", file.name)
					.replace("{FILETYPE}", fileType)
					.replace("{CONTENT_PREVIEW}", contentPreview || "(binary file, no preview)");

				const response = await requestUrl({
					url: "https://api.anthropic.com/v1/messages",
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"x-api-key": this.settings.claudeApiKey,
						"anthropic-version": "2023-06-01",
					},
					body: JSON.stringify({
						model: this.settings.claudeModel,
						max_tokens: 300,
						messages: [{ role: "user", content: prompt }],
					}),
				});

				const result = response.json;
				const textBlock = result.content?.find(
					(block: { type: string }) => block.type === "text"
				);

				if (textBlock?.text) {
					const classification = JSON.parse(textBlock.text);
					return {
						filename: file.name,
						fileType,
						taskDescription: classification.taskDescription || "Unknown task",
						content: contentPreview,
						createdAt: new Date(file.stat.ctime),
					};
				}
			} catch {
				// Fallback to extension-based classification
			}
		}

		// Fallback: classify by extension
		return {
			filename: file.name,
			fileType,
			taskDescription: this.guessTaskFromExtension(fileType),
			content: contentPreview,
			createdAt: new Date(file.stat.ctime),
		};
	}

	/**
	 * Create a companion markdown note next to the artifact,
	 * serving as its wiki entry with metadata and links.
	 */
	private async createCompanionNote(
		artifact: ComputerArtifact,
		originalFile: TFile
	): Promise<void> {
		const baseName = originalFile.basename;
		const notePath = normalizePath(
			`${this.settings.rawSourcesPath}/${baseName}.md`
		);

		const content = [
			"---",
			`title: "${escapeYaml(baseName)}"`,
			`type: "raw-source"`,
			`source: "perplexity-computer"`,
			`file-type: "${artifact.fileType}"`,
			`original-file: "[[${originalFile.path}]]"`,
			`task: "${escapeYaml(artifact.taskDescription)}"`,
			`created: "${artifact.createdAt.toISOString()}"`,
			"---",
			"",
			`# ${baseName}`,
			"",
			`**Source:** Perplexity Computer/Comet`,
			`**Task:** ${artifact.taskDescription}`,
			`**File:** [[${originalFile.path}]]`,
			"",
			"## Notes",
			"",
			"_Add context about this artifact here, or let the LLM Wiki ingest process handle it._",
			"",
		].join("\n");

		// Ensure output folder exists
		await this.ensureFolder(this.settings.rawSourcesPath);

		const existing = this.app.vault.getAbstractFileByPath(notePath);
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, content);
		} else {
			await this.app.vault.create(notePath, content);
		}
	}

	private guessTaskFromExtension(ext: string): string {
		const guesses: Record<string, string> = {
			png: "Screenshot captured during browsing session",
			jpg: "Image captured or downloaded",
			jpeg: "Image captured or downloaded",
			webp: "Image captured or downloaded",
			pdf: "Document downloaded during research",
			html: "Web page saved for reference",
			csv: "Data exported during research",
			json: "Structured data from API or export",
			xlsx: "Spreadsheet downloaded during research",
		};
		return guesses[ext.toLowerCase()] || "File created during Perplexity session";
	}

	private async ensureFolder(path: string): Promise<void> {
		const normalized = normalizePath(path);
		const existing = this.app.vault.getAbstractFileByPath(normalized);
		if (existing) return;

		const parts = normalized.split("/");
		let current = "";
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			if (!this.app.vault.getAbstractFileByPath(current)) {
				await this.app.vault.createFolder(current);
			}
		}
	}
}

function escapeYaml(value: string): string {
	return value.replace(/"/g, '\\"');
}
