import { App, PluginSettingTab, Setting } from "obsidian";
import type PerplexityBridgePlugin from "./main";

export class PerplexityBridgeSettingTab extends PluginSettingTab {
	plugin: PerplexityBridgePlugin;

	constructor(app: App, plugin: PerplexityBridgePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// --- Perplexity API ---
		new Setting(containerEl).setName("Perplexity API").setHeading();

		new Setting(containerEl)
			.setName("API key")
			.setDesc(
				"Your Perplexity API key for running research queries directly from Obsidian."
			)
			.addText((text) => {
				text.inputEl.type = "password";
				text.inputEl.style.width = "260px";
				text
					.setPlaceholder("pplx-...")
					.setValue(this.plugin.settings.perplexityApiKey)
					.onChange(async (value) => {
						this.plugin.settings.perplexityApiKey = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Model")
			.setDesc("Perplexity model for research queries.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("sonar", "Sonar (fast, lightweight)")
					.addOption("sonar-pro", "Sonar Pro (deeper retrieval)")
					.addOption(
						"sonar-reasoning-pro",
						"Sonar Reasoning Pro (chain-of-thought)"
					)
					.setValue(this.plugin.settings.perplexityModel)
					.onChange(async (value) => {
						this.plugin.settings.perplexityModel = value;
						await this.plugin.saveSettings();
					})
			);

		// --- Claude API ---
		new Setting(containerEl).setName("Claude API").setHeading();

		new Setting(containerEl)
			.setName("API key")
			.setDesc("Your Anthropic API key for research structuring.")
			.addText((text) => {
				text.inputEl.type = "password";
				text.inputEl.style.width = "260px";
				text
					.setPlaceholder("sk-ant-...")
					.setValue(this.plugin.settings.claudeApiKey)
					.onChange(async (value) => {
						this.plugin.settings.claudeApiKey = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Model")
			.setDesc("Claude model for structuring research.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("claude-sonnet-4-20250514", "Claude Sonnet 4")
					.addOption("claude-haiku-4-5-20251001", "Claude Haiku 4.5 (faster, cheaper)")
					.setValue(this.plugin.settings.claudeModel)
					.onChange(async (value) => {
						this.plugin.settings.claudeModel = value;
						await this.plugin.saveSettings();
					})
			);

		// --- Folders ---
		new Setting(containerEl).setName("Folders").setHeading();

		new Setting(containerEl)
			.setName("Import folder")
			.setDesc(
				"Where raw Perplexity exports land. Drop markdown files here or use the clipboard import command."
			)
			.addText((text) =>
				text
					.setPlaceholder("_inbox/perplexity")
					.setValue(this.plugin.settings.importPath)
					.onChange(async (value) => {
						this.plugin.settings.importPath = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Output folder")
			.setDesc("Where structured research pages are created.")
			.addText((text) =>
				text
					.setPlaceholder("wiki/research")
					.setValue(this.plugin.settings.outputPath)
					.onChange(async (value) => {
						this.plugin.settings.outputPath = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Spaces import folder")
			.setDesc("Subfolder for Perplexity Space exports.")
			.addText((text) =>
				text
					.setPlaceholder("_inbox/perplexity/spaces")
					.setValue(this.plugin.settings.spacesImportPath)
					.onChange(async (value) => {
						this.plugin.settings.spacesImportPath = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Spaces output folder")
			.setDesc("Where structured Space pages are created.")
			.addText((text) =>
				text
					.setPlaceholder("wiki/spaces")
					.setValue(this.plugin.settings.spacesOutputPath)
					.onChange(async (value) => {
						this.plugin.settings.spacesOutputPath = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Artifacts folder")
			.setDesc("Where Computer/Comet artifacts and companion notes are stored.")
			.addText((text) =>
				text
					.setPlaceholder("raw/perplexity")
					.setValue(this.plugin.settings.rawSourcesPath)
					.onChange(async (value) => {
						this.plugin.settings.rawSourcesPath = value;
						await this.plugin.saveSettings();
					})
			);

		// --- Behavior ---
		new Setting(containerEl).setName("Behavior").setHeading();

		new Setting(containerEl)
			.setName("Structure API results")
			.setDesc(
				"Also run Claude structuring on Perplexity API research results to extract findings, tags, and wiki links."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.structureApiResults)
					.onChange(async (value) => {
						this.plugin.settings.structureApiResults = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Auto-structure imports")
			.setDesc(
				"Automatically send new file imports to Claude for structuring."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoStructure)
					.onChange(async (value) => {
						this.plugin.settings.autoStructure = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Watch import folder")
			.setDesc("Automatically detect new files in the import folder.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.watchImportFolder)
					.onChange(async (value) => {
						this.plugin.settings.watchImportFolder = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Poll interval (seconds)")
			.setDesc("How often to check for new files.")
			.addSlider((slider) =>
				slider
					.setLimits(5, 120, 5)
					.setValue(this.plugin.settings.pollIntervalSeconds)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.pollIntervalSeconds = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Keep raw imports")
			.setDesc(
				"Keep the original Perplexity export after creating the structured page."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.keepRawImport)
					.onChange(async (value) => {
						this.plugin.settings.keepRawImport = value;
						await this.plugin.saveSettings();
					})
			);

		// --- Advanced ---
		new Setting(containerEl).setName("Advanced").setHeading();

		new Setting(containerEl)
			.setName("Custom structuring prompt")
			.setDesc(
				"Override the default prompt for Claude. Use {THREAD_CONTENT} as a placeholder. Leave blank for the default."
			)
			.addTextArea((text) => {
				text.inputEl.rows = 10;
				text.inputEl.style.fontFamily = "monospace";
				text.inputEl.style.width = "100%";
				text
					.setPlaceholder("Leave blank for default prompt")
					.setValue(this.plugin.settings.structuringPrompt)
					.onChange(async (value) => {
						this.plugin.settings.structuringPrompt = value;
						await this.plugin.saveSettings();
					});
			});
	}
}
