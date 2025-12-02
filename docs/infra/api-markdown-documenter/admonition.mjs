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
 * @param {BlockContent[]} body - Admonition body content.
 * @param {AdmonitionKind} admonitionKind - The kind of admonition. See {@link https://docusaurus.io/docs/markdown-features/admonitions}.
 * @param {string | undefined} title - (Optional) Title text for the admonition.
 *
 * @returns {ContainerDirective} The Markdown AST representing the admonition.
 */
export function createAdmonition(body, admonitionKind, title) {
	/** @type {BlockContent[]} */
	const children = [];

	// If the admonition has a title, prepend it to the list of children with the `directiveLabel` property set.
	if (title !== undefined) {
		children.push({
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

	children.push(...body);

	return {
		type: "containerDirective",
		name: admonitionKind,
		children,
	};
}
