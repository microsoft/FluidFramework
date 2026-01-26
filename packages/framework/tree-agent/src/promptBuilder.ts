/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A DSL for building structured prompts with consistent spacing and organization.
 */
export class PromptBuilder {
	private readonly sections: string[] = [];

	/**
	 * Adds a heading (with # prefix) to the prompt.
	 */
	public addHeading(level: 1 | 2 | 3 | 4 | 5 | 6, text: string): this {
		const prefix = "#".repeat(level);
		this.sections.push(`${prefix} ${text}`);
		return this;
	}

	/**
	 * Adds one or more paragraphs of text to the prompt.
	 */
	public addParagraphs(...texts: string[]): this {
		this.sections.push(...texts);
		return this;
	}

	/**
	 * Adds a code block with the specified language.
	 */
	public addCodeBlock(language: string, code: string): this {
		this.sections.push(`\`\`\`${language}\n${code}\n\`\`\``);
		return this;
	}

	/**
	 * Adds a TypeScript code block.
	 */


	/**
	 * Adds a blank line to the prompt.
	 */
	public addBlank(): this {
		this.sections.push("");
		return this;
	}

	/**
	 * Adds raw content without any modification.
	 */
	public addRaw(content: string): this {
		this.sections.push(content);
		return this;
	}

	/**
	 * Builds the prompt string from all added sections.
	 */
	public build(): string {
		return this.sections.join("\n");
	}
}
