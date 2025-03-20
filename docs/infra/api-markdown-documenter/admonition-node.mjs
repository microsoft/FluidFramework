/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

//@ts-check
/** @typedef {import("@fluid-tools/api-markdown-documenter").DocumentationNode} DocumentationNode */

import { DocumentationParentNodeBase } from "@fluid-tools/api-markdown-documenter";

/**
 * The {@link @fluid-tools/api-markdown-documenter#DocumentationNode."type"} of {@link AdmonitionNode}.
 */
export const admonitionNodeType = "Admonition";

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
	 * @param {DocumentationNode[]} children - Child node content.
	 * @param {string} admonitionKind - The kind of admonition. See {@link https://docusaurus.io/docs/markdown-features/admonitions}.
	 * @param {string | undefined} title - (Optional) Title text for the admonition.
	 */
	constructor(children, admonitionKind, title) {
		super(children);

		this.type = admonitionNodeType;

		this.admonitionKind = admonitionKind;
		this.title = title;
	}
}
