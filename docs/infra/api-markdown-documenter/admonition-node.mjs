/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

//@ts-check
/** @typedef {import("@fluid-tools/api-markdown-documenter").BlockContent} BlockContent */
/** @typedef {import("@fluid-tools/api-markdown-documenter").ToMarkdownContext} ToMarkdownContext */
/** @typedef {import("mdast").BlockContent} MdastBlockContent */
/** @typedef {import("mdast").PhrasingContent} MdastPhrasingContent */

import {
	blockContentToMarkdown,
	DocumentationParentNodeBase,
} from "@fluid-tools/api-markdown-documenter";

/**
 * A block of content representing a notice that should be highlighted for the user.
 * E.g., a tip or warning for the reader about the described API.
 *
 * @see {@link https://docusaurus.io/docs/markdown-features/admonitions}
 *
 * @remarks {@link renderAdmonitionNode} demonstrates how the contents are rendered to take advantage of Docusaurus's `admonition` syntax.
 *
 * @example Example rendering output (in Docusaurus Markdown)
 *
 * With title:
 *
 * ```md
 * :::note[Unit tests are super useful!]
 *
 * More details about unit testing...
 *
 * :::
 * ```
 *
 * Without title:
 *
 * ```md
 * :::danger
 *
 * Notes about the danger!
 *
 * :::
 * ```
 *
 * @public
 */
export class AdmonitionNode extends DocumentationParentNodeBase {
	/**
	 * @param {BlockContent[]} children - Child node content.
	 * @param {string} admonitionKind - The kind of admonition. See {@link https://docusaurus.io/docs/markdown-features/admonitions}.
	 * @param {string | undefined} title - (Optional) Title text for the admonition.
	 */
	constructor(children, admonitionKind, title) {
		super(children);

		this.type = "admonition";

		this.admonitionKind = admonitionKind;
		this.title = title;
	}

	/**
	 * Generates Markdown representing a Docusaurus Admonition.
	 *
	 * @param {ToMarkdownContext} context - The transformation context.
	 *
	 * @returns {MdastBlockContent[]} The Markdown AST representing the admonition.
	 */
	toMarkdown(context) {
		/**
		 * @type {MdastBlockContent[]}
		 */
		const transformedChildren = [];
		for (const child of this.children) {
			// @ts-ignore -- Limitation of using types in JavaScript: we can't explicitly mark `AdmonitionNode` as only containing phrasing content.
			transformedChildren.push(...blockContentToMarkdown(child, context));
		}

		return [
			{
				type: "paragraph",
				children: [
					{
						type: "text",
						value: `:::${this.admonitionKind}${this.title === undefined ? "" : `[${this.title}]`}`
					},
				]
			},
			...transformedChildren,
			{
				type: "paragraph",
				children: [
					{
						type: "text",
						value: ":::"
					},
				]
			}
		];
	}
}
