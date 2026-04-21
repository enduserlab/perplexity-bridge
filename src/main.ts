import { Notice, Plugin, normalizePath, TFile, TFolder } from "obsidian";
import type { PerplexityBridgeSettings } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { ResearchWatcher } from "./watcher";
import { PerplexityBridgeSettingTab } from "./settings";
import {
	searchPerplexity,
	deepResearch,
	renderSonarResponse,
} from "./perplexity-api";
import { ResearchModal } from "./research-modal";
import type { ResearchRequest } from "./research-modal";
import { parsePerplexityThread } from "./parser";
import { structureResearch, renderResearchPage } from "./structurer";
import { checkCloudEgress } from "./privacy-gate";

export default class PerplexityBridgePlugin extends Plugin {
	settings: PerplexityBridgeSettings = DEFAULT_SETTINGS;
	watcher: ResearchWatcher | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.watcher = new ResearchWatcher(this.app, this.settings);
		this.app.workspace.onLayoutReady(() => this.watcher?.start());

		this.register(() => this.watcher?.stop());

		// Ribbon icon — quick research
		this.addRibbonIcon(
			"search",
			"Research",
			() => {
				if (!this.settings.perplexityApiKey) {
					new Notice(
						"Set your API key in settings."
					);
					return;
				}
				this.openResearchModal();
			}
		);

		// ========================
		// Direct research commands
		// ========================

		this.addCommand({
			id: "research-query",
			name: "Research query",
			callback: () => {
				if (!this.settings.perplexityApiKey) {
					new Notice(
						"Set your API key in settings."
					);
					return;
				}
				this.openResearchModal();
			},
		});

		this.addCommand({
			id: "deep-research",
			name: "Deep research query",
			callback: () => {
				if (!this.settings.perplexityApiKey) {
					new Notice(
						"Set your API key in settings."
					);
					return;
				}
				this.openResearchModal(true);
			},
		});

		this.addCommand({
			id: "research-selection",
			name: "Research selected text",
			editorCallback: (editor, view) => {
				if (!this.settings.perplexityApiKey) {
					new Notice(
						"Set your API key in settings."
					);
					return;
				}
				const selection = editor.getSelection().trim();
				if (!selection) {
					new Notice("No text selected.");
					return;
				}
				const sourcePath = view.file?.path;
				void (async () => {
					if (sourcePath) {
						const proceed = await checkCloudEgress(
							this.app,
							sourcePath,
							"cloud:perplexity"
						);
						if (!proceed) return;
					}
					this.openResearchModal(false, selection);
				})();
			},
		});

		// ========================
		// Import commands
		// ========================

		this.addCommand({
			id: "import-clipboard",
			name: "Import research from clipboard",
			callback: async () => {
				await this.importFromClipboard();
			},
		});

		this.addCommand({
			id: "import-space",
			name: "Import space from clipboard",
			callback: async () => {
				await this.importSpaceFromClipboard();
			},
		});

		this.addCommand({
			id: "process-current-file",
			name: "Structure current file as research",
			editorCallback: async (_editor, view) => {
				if (view.file) {
					const proceed = await checkCloudEgress(
						this.app,
						view.file.path,
						"cloud:anthropic"
					);
					if (!proceed) return;
					new Notice("Structuring...");
					await this.watcher?.processFileByPath(view.file.path);
				}
			},
		});

		this.addCommand({
			id: "process-import-folder",
			name: "Process all files in import folder",
			callback: async () => {
				new Notice("Processing import folder...");
				await this.watcher?.restart();
			},
		});

		// ========================
		// Navigation commands
		// ========================

		this.addCommand({
			id: "open-import-folder",
			name: "Open import folder",
			callback: () => this.openFolder(this.settings.importPath),
		});

		this.addCommand({
			id: "open-research-folder",
			name: "Open research output folder",
			callback: () => this.openFolder(this.settings.outputPath),
		});

		this.addCommand({
			id: "open-spaces-folder",
			name: "Open spaces output folder",
			callback: () => this.openFolder(this.settings.spacesOutputPath),
		});

		// Settings tab
		this.addSettingTab(new PerplexityBridgeSettingTab(this.app, this));
	}

	onunload(): void {
		// Cleanup handled by this.register() callbacks
	}

	// ========================
	// Direct research
	// ========================

	private openResearchModal(deep = false, prefill = ""): void {
		new ResearchModal(
			this.app,
			(request) => { void this.executeResearch(request); },
			{ deep, prefill }
		).open();
	}

	private async executeResearch(request: ResearchRequest): Promise<void> {
		const label = request.deep ? "Deep research" : "Research";
		new Notice(
			`${label} started...${request.deep ? " This may take a minute." : ""}`
		);

		try {
			const response = request.deep
				? await deepResearch(request.query, this.settings)
				: await searchPerplexity(request.query, this.settings, {
						recency: request.recency,
					});

			const now = new Date();
			let pageContent: string;
			let title: string;

			// If Claude structuring is enabled and we have an API key, run it
			if (
				this.settings.structureApiResults &&
				this.settings.claudeApiKey
			) {
				const thread = parsePerplexityThread(
					response.content,
					undefined
				);
				// Inject the real citations from the API response
				for (let i = 0; i < response.citations.length; i++) {
					if (i < thread.citations.length) {
						thread.citations[i].url = response.citations[i];
					} else {
						thread.citations.push({
							number: i + 1,
							url: response.citations[i],
							title: "",
						});
					}
				}
				const structured = await structureResearch(
					thread,
					this.settings
				);
				pageContent = renderResearchPage(structured);
				title = structured.title;
			} else {
				pageContent = renderSonarResponse(
					request.query,
					response,
					now
				);
				title = request.query
					.replace(/[?!]+$/, "")
					.trim()
					.slice(0, 80);
				title =
					title.charAt(0).toUpperCase() + title.slice(1);
			}

			// Save the note
			const sanitized = title
				.replace(/[\\/:*?"<>|]/g, "-")
				.slice(0, 100);
			const outputPath = normalizePath(
				`${this.settings.outputPath}/${sanitized}.md`
			);

			await this.ensureFolder(this.settings.outputPath);

			const existing =
				this.app.vault.getAbstractFileByPath(outputPath);
			if (existing instanceof TFile) {
				await this.app.vault.modify(existing, pageContent);
			} else {
				await this.app.vault.create(outputPath, pageContent);
			}

			// Open the note
			const created = this.app.vault.getAbstractFileByPath(outputPath);
			if (created instanceof TFile) {
				const leaf = this.app.workspace.getLeaf(false);
				await leaf.openFile(created);
			}

			new Notice(
				`"${title}" saved with ${response.citations.length} sources`
			);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (msg.includes("401") || msg.includes("Unauthorized")) {
				new Notice(
					"Invalid API key. Check settings."
				);
			} else if (msg.includes("429")) {
				new Notice("Rate limited. Try again later.");
			} else {
				new Notice(`Research failed — ${msg}`);
			}
		}
	}

	// ========================
	// Import helpers
	// ========================

	private async importFromClipboard(): Promise<void> {
		try {
			const content = await navigator.clipboard.readText();
			if (!content.trim()) {
				new Notice("Clipboard is empty.");
				return;
			}
			if (content.length < 50) {
				new Notice(
					"Content too short — doesn't look like research."
				);
				return;
			}
			await this.watcher?.processClipboard(content);
		} catch {
			new Notice(
				"Could not read clipboard. Try Ctrl/Cmd+V instead."
			);
		}
	}

	private async importSpaceFromClipboard(): Promise<void> {
		try {
			const content = await navigator.clipboard.readText();
			if (!content.trim()) {
				new Notice("Clipboard is empty.");
				return;
			}

			const timestamp = new Date()
				.toISOString()
				.slice(0, 19)
				.replace(/:/g, "");
			const filename = `space_${timestamp}.md`;
			const filepath = normalizePath(
				`${this.settings.spacesImportPath}/${filename}`
			);

			await this.ensureFolder(this.settings.spacesImportPath);
			await this.app.vault.create(filepath, content);
			new Notice("Space saved. Processing...");
			await this.watcher?.processFileByPath(filepath);
		} catch {
			new Notice("Could not read clipboard.");
		}
	}

	// ========================
	// Utilities
	// ========================

	private openFolder(path: string): void {
		const files = this.app.vault
			.getFiles()
			.filter((f) => f.path.startsWith(path));
		if (files.length > 0) {
			const leaf = this.app.workspace.getLeaf(false);
			void leaf.openFile(files[0]);
		} else {
			new Notice(`No files in "${path}" yet.`);
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
			if (!this.app.vault.getAbstractFileByPath(current)) {
				await this.app.vault.createFolder(current);
			}
		}
	}

	// ========================
	// Settings
	// ========================

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.watcher?.updateSettings(this.settings);
	}
}
