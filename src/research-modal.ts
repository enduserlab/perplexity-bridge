import { App, Modal, Setting } from "obsidian";
import type { SearchRecency } from "./perplexity-api";

export interface ResearchRequest {
	query: string;
	recency: SearchRecency;
	deep: boolean;
}

/**
 * Modal for entering a Perplexity research query.
 */
export class ResearchModal extends Modal {
	private query = "";
	private recency: SearchRecency = "none";
	private deep: boolean;
	private onSubmit: (request: ResearchRequest) => void;

	constructor(
		app: App,
		onSubmit: (request: ResearchRequest) => void,
		options?: { deep?: boolean; prefill?: string }
	) {
		super(app);
		this.onSubmit = onSubmit;
		this.deep = options?.deep ?? false;
		this.query = options?.prefill ?? "";
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.createEl("h3", {
			text: this.deep
				? "Perplexity Deep Research"
				: "Research with Perplexity",
		});

		// Query input
		new Setting(contentEl)
			.setName("Query")
			.addTextArea((text) => {
				text.inputEl.rows = 3;
				text.inputEl.style.width = "100%";
				text.inputEl.style.minWidth = "350px";
				text
					.setPlaceholder("What would you like to research?")
					.setValue(this.query)
					.onChange((value) => {
						this.query = value;
					});

				// Submit on Cmd/Ctrl+Enter
				text.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
					if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
						e.preventDefault();
						this.submit();
					}
				});

				// Auto-focus
				setTimeout(() => text.inputEl.focus(), 50);
			});

		// Recency filter
		if (!this.deep) {
			new Setting(contentEl)
				.setName("Recency")
				.setDesc("Limit sources to recent content.")
				.addDropdown((dropdown) =>
					dropdown
						.addOption("none", "Any time")
						.addOption("hour", "Past hour")
						.addOption("day", "Past day")
						.addOption("week", "Past week")
						.addOption("month", "Past month")
						.addOption("year", "Past year")
						.setValue(this.recency)
						.onChange((value) => {
							this.recency = value as SearchRecency;
						})
				);
		}

		// Submit button
		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText(this.deep ? "Start deep research" : "Research")
				.setCta()
				.onClick(() => this.submit())
		);
	}

	private submit(): void {
		if (!this.query.trim()) return;
		this.close();
		this.onSubmit({
			query: this.query.trim(),
			recency: this.recency,
			deep: this.deep,
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
