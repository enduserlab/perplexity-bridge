import { type App, TFile, TFolder, Notice, normalizePath } from "obsidian";
import type { PerplexityBridgeSettings } from "./types";
import { parsePerplexityThread } from "./parser";
import { structureResearch, renderResearchPage } from "./structurer";
import { detectContentType } from "./content-detector";
import {
	parseSpaceFromMarkdown,
	structureSpace,
	renderSpacePages,
} from "./space-processor";
import { ArtifactHandler } from "./artifact-handler";

/**
 * Watches import folders for new Perplexity exports and
 * routes them to the appropriate processing pipeline based
 * on content type (thread, deep research, space, artifact).
 */
export class ResearchWatcher {
	private app: App;
	private settings: PerplexityBridgeSettings;
	private artifactHandler: ArtifactHandler;
	private pollInterval: number | null = null;
	private processedFiles: Set<string> = new Set();
	private processing: boolean = false;

	constructor(app: App, settings: PerplexityBridgeSettings) {
		this.app = app;
		this.settings = settings;
		this.artifactHandler = new ArtifactHandler(app, settings);
	}

	updateSettings(settings: PerplexityBridgeSettings): void {
		this.settings = settings;
		this.artifactHandler.updateSettings(settings);
	}

	async start(): Promise<void> {
		await this.ensureFolder(this.settings.importPath);
		await this.ensureFolder(this.settings.spacesImportPath);
		await this.ensureFolder(this.settings.artifactsImportPath);
		await this.ensureFolder(this.settings.outputPath);
		await this.scanExisting();

		if (this.settings.watchImportFolder) {
			this.pollInterval = window.setInterval(
				() => this.poll(),
				this.settings.pollIntervalSeconds * 1000
			);
		}

		// Watcher running
	}

	stop(): void {
		if (this.pollInterval !== null) {
			window.clearInterval(this.pollInterval);
			this.pollInterval = null;
		}
	}

	async restart(): Promise<void> {
		this.stop();
		this.processedFiles.clear();
		await this.start();
	}

	async processFileByPath(filePath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (file instanceof TFile) {
			await this.processFile(file);
		}
	}

	async processClipboard(content: string): Promise<void> {
		const timestamp = new Date()
			.toISOString()
			.slice(0, 19)
			.replace(/:/g, "");
		const filename = `perplexity_${timestamp}.md`;
		const filepath = normalizePath(
			`${this.settings.importPath}/${filename}`
		);

		await this.ensureFolder(this.settings.importPath);
		await this.app.vault.create(filepath, content);

		new Notice("Perplexity Bridge: Saved clipboard content. Processing...");

		const file = this.app.vault.getAbstractFileByPath(filepath);
		if (file instanceof TFile) {
			await this.processFile(file);
		}
	}

	private async scanExisting(): Promise<void> {
		const folders = [
			this.settings.importPath,
			this.settings.spacesImportPath,
			this.settings.artifactsImportPath,
		];

		for (const folderPath of folders) {
			const folder = this.app.vault.getAbstractFileByPath(
				normalizePath(folderPath)
			);
			if (folder instanceof TFolder) {
				for (const child of folder.children) {
					if (child instanceof TFile) {
						this.processedFiles.add(child.path);
					}
				}
			}
		}
	}

	private async poll(): Promise<void> {
		if (this.processing) return;
		this.processing = true;

		try {
			// Check all import folders
			const folders = [
				this.settings.importPath,
				this.settings.spacesImportPath,
				this.settings.artifactsImportPath,
			];

			const newFiles: TFile[] = [];

			for (const folderPath of folders) {
				const folder = this.app.vault.getAbstractFileByPath(
					normalizePath(folderPath)
				);

				if (!(folder instanceof TFolder)) continue;

				for (const child of folder.children) {
					if (
						child instanceof TFile &&
						!this.processedFiles.has(child.path)
					) {
						newFiles.push(child);
					}
				}
			}

			if (newFiles.length === 0) return;

			new Notice(
				`Perplexity Bridge: ${newFiles.length} new file(s) detected`
			);

			for (const file of newFiles) {
				await this.processFile(file);
			}
		} catch {
			// Errors handled in processFile
		} finally {
			this.processing = false;
		}
	}

	private async processFile(file: TFile): Promise<void> {
		try {
			const content = file.extension === "md"
				? await this.app.vault.read(file)
				: "";

			// Auto-detect content type
			const contentType = this.settings.autoDetectContentType
				? detectContentType(content, file.name)
				: "thread";

			// Route to the appropriate pipeline

			switch (contentType) {
				case "thread":
				case "deep-research":
					await this.processThread(file, content);
					break;

				case "space":
					await this.processSpace(file, content);
					break;

				case "computer-artifact":
					await this.artifactHandler.processArtifact(file);
					new Notice(
						`Perplexity Bridge: Catalogued artifact "${file.name}"`
					);
					break;

				default:
					// Unknown — try processing as a thread anyway
					if (content.length > 50) {
						await this.processThread(file, content);
					}
					break;
			}

			this.processedFiles.add(file.path);
		} catch {
			new Notice(`Perplexity Bridge: Error processing "${file.name}"`);
			this.processedFiles.add(file.path);
		}
	}

	/**
	 * Process a standard thread or deep research export.
	 */
	private async processThread(file: TFile, content: string): Promise<void> {
		const thread = parsePerplexityThread(content);

		if (this.settings.autoStructure) {
			const research = await structureResearch(thread, this.settings);
			const wikiPage = renderResearchPage(research);

			const sanitizedTitle = research.title
				.replace(/[\\/:*?"<>|]/g, "-")
				.slice(0, 100);
			const outputPath = normalizePath(
				`${this.settings.outputPath}/${sanitizedTitle}.md`
			);

			await this.ensureFolder(this.settings.outputPath);

			const existing = this.app.vault.getAbstractFileByPath(outputPath);
			if (existing instanceof TFile) {
				await this.app.vault.modify(existing, wikiPage);
			} else {
				await this.app.vault.create(outputPath, wikiPage);
			}

			new Notice(
				`Perplexity Bridge: Created "${research.title}" in ${this.settings.outputPath}`
			);

			if (!this.settings.keepRawImport) {
				await this.app.vault.delete(file);
			}
		}
	}

	/**
	 * Process a Space export — creates a folder of interlinked pages.
	 */
	private async processSpace(file: TFile, content: string): Promise<void> {
		const spaceName = file.basename.replace(/[\\/:*?"<>|]/g, "-");
		const space = parseSpaceFromMarkdown(content, spaceName);

		if (this.settings.autoStructure) {
			const structured = await structureSpace(space, this.settings);
			const pages = renderSpacePages(structured);

			// Create a subfolder for the Space
			const spaceFolderPath = normalizePath(
				`${this.settings.spacesOutputPath}/${sanitize(structured.name)}`
			);
			await this.ensureFolder(spaceFolderPath);

			// Write all pages
			for (const [filename, pageContent] of pages) {
				const pagePath = normalizePath(
					`${spaceFolderPath}/${filename}`
				);
				const existing =
					this.app.vault.getAbstractFileByPath(pagePath);
				if (existing instanceof TFile) {
					await this.app.vault.modify(existing, pageContent);
				} else {
					await this.app.vault.create(pagePath, pageContent);
				}
			}

			new Notice(
				`Perplexity Bridge: Created Space "${structured.name}" with ${pages.size} pages`
			);

			if (!this.settings.keepRawImport) {
				await this.app.vault.delete(file);
			}
		}
	}

	private async ensureFolder(path: string): Promise<void> {
		const normalized = normalizePath(path);
		const existing = this.app.vault.getAbstractFileByPath(normalized);
		if (existing instanceof TFolder) return;

		const parts = normalized.split("/");
		let current = "";
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			const folder = this.app.vault.getAbstractFileByPath(current);
			if (!folder) {
				await this.app.vault.createFolder(current);
			}
		}
	}
}

function sanitize(name: string): string {
	return name.replace(/[\\/:*?"<>|]/g, "-").slice(0, 100);
}
