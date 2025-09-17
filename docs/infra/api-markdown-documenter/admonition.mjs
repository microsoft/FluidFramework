/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

//@ts-check
/** @typedef {import("mdast").BlockContent} BlockContent */
/** @typedef {import("mdast-util-directive").ContainerDirective} ContainerDirective */
/** @typedef {import("mdast").PhrasingContent} PhrasingContent */
/** @typedef {"note" | "tip" | "info" | "warning" | "danger"} AdmonitionKind */

/**
 * Generates Markdown representing a Docusaurus Admonition.
 *
 * @param {BlockContent[]} children - Child node content.
 * @param {AdmonitionKind} admonitionKind - The kind of admonition. See {@link https://docusaurus.io/docs/markdown-features/admonitions}.
 * @param {string | undefined} title - (Optional) Title text for the admonition.
 *
 * @returns {ContainerDirective} The Markdown AST representing the admonition.
 */
export function createAdmonition(children, admonitionKind, title) {
	// If the admonition has a title, prepend it to the list of children with the `directiveLabel` property set.
	if (title !== undefined) {
		children.unshift({
			type: "paragraph",
			data: {
				directiveLabel: true,
			},
			children: [
				{
					type: "text",
					value: title,
				},
			],
		});
	}

	return {
		type: "containerDirective",
		name: admonitionKind,
		children,
	};
}
