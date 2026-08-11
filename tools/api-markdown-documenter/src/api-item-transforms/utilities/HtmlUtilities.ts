/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { toHtml } from "hast-util-to-html";
import type { Nodes as MarkdownTree } from "mdast";
import { toHast } from "mdast-util-to-hast";
import { visit } from "unist-util-visit";

/**
 * Converts an `mdast` Markdown tree to an HTML string.
 * @remarks Ensures that text content is properly escaped for use in a Markdown context.
 */
export function mdastToHtml(markdown: MarkdownTree): string {
	// In this library, the HTML we generate is intended for use within a Markdown context.
	// The conversion from `mdast` to `hast` assumes that the content will be used in an HTML context, so it will only perform character escaping as needed for HTML.
	// This is a problem for us, though, because some characters that are valid in HTML are not valid in Markdown, and nested Markdown in HTML in Markdown is actually supported by many Markdown processors.
	// To work around this, we will walk the newly generated HTML tree and perform any necessary Markdown-specific escaping on text nodes.
	visit(markdown, (node) => {
		if (node.type === "text") {
			node.value = escapeMarkdown(node.value);
		}
	});

	const htmlTree = toHast(markdown);
	return toHtml(htmlTree);
}

function escapeMarkdown(text: string): string {
	return text.replace(/([!#()*+[\]_{}-])/g, "\\$1");
}
