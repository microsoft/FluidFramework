/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const {
	createNodesFromPlainText,
	DocumentationParentNodeBase,
} = require("@fluid-tools/api-markdown-documenter");

/**
 * The {@link @fluid-tools/api-markdown-documenter#DocumentationNode."type"} of {@link AlertNode}.
 */
const alertNodeType = "Alert";

/**
 * An highlighted notice about nearby content for the user.
 *
 * @example Markdown
 *
 * ```md
 * > [TIP]: Unit tests are super useful!
 * >
 * > More details about unit tests...
 * ```
 *
 * @example HTML
 *
 * ```html
 * <blockquote>
 * 	<b>[TIP]: Unit tests are super useful!</b>
 * 	<br>
 * 	<br>
 * 	More details about unit tests...
 * </blockquote>
 * ```
 *
 * @public
 */
class AlertNode extends DocumentationParentNodeBase {
	/**
	 * @param {@fluid-tools/api-markdown-documenter#DocumentationNode[]} children - Child node content.
	 * @param {string} alertKind - The kind of alert.
	 * @param {string | undefined} title - (Optional) Title text for the alert.
	 */
	constructor(children, alertKind, title) {
		super(children);

		this.type = alertNodeType;

		this.alertKind = alertKind;
		this.title = title;
	}

	/**
	 * Generates an `AlertNode` from the provided string.
	 *
	 * @param {string} text - The node's text content.
	 * @param {string} alertKind - The kind of alert.
	 * @param {string | undefined} title - (Optional) Title text for the alert.
	 */
	static createFromPlainText(text, alertKind, title) {
		return new AlertNode(createNodesFromPlainText(text), alertKind, title);
	}
}

module.exports = {
	AlertNode,
	alertNodeType,
};
