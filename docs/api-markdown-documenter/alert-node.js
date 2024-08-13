/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DocumentationParentNodeBase } from "@fluid-tools/api-markdown-documenter";

/**
 * The {@link @fluid-tools/api-markdown-documenter#DocumentationNode."type"} of {@link AlertNode}.
 */
export const alertNodeType = "Alert";

/**
 * A block of content representing a notice that should be highlighted for the user.
 * E.g., a tip or warning for the reader about the described API.
 *
 * @remarks {@link renderAlertNode} demonstrates how the contents are rendered to take advantage of Hugo's `callout` syntax.
 *
 * @example Example rendering output (in Hugo Markdown)
 *
 * ```md
 * {{% callout note "Unit tests are super useful!" %}}
 *
 * More details about unit testing...
 * {{% /callout %}}
 * ```
 *
 * @public
 */
export class AlertNode extends DocumentationParentNodeBase {
	/**
	 * @param {@fluid-tools/api-markdown-documenter#DocumentationNode[]} children - Child node content.
	 * @param {string} alertKind - The kind of alert. See {@link https://hugo-docs-theme.netlify.app/docs/guide/shortcodes/callout/}.
	 * @param {string | undefined} title - (Optional) Title text for the alert.
	 */
	constructor(children, alertKind, title) {
		super(children);

		this.type = alertNodeType;

		this.alertKind = alertKind;
		this.title = title;
	}
}
