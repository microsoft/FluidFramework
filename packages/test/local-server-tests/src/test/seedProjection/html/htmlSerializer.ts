/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	allowedHtmlTags,
	parseHtml,
	validateAttributeName,
	type HtmlNode,
} from "./htmlSeedFormat.js";

/** Encode text and attribute values using one deterministic spelling per reserved character. */
function escape(text: string): string {
	return text.replaceAll(/[&<>"']/gu, (character) => {
		const names: Record<string, string> = {
			"&": "amp",
			"<": "lt",
			">": "gt",
			'"': "quot",
			"'": "apos",
		};
		return `&${names[character]};`;
	});
}

/**
 * Serialize model content for application summaries and display without mutating it.
 * The external producer already has HTML and needs only the shared parser, not this serializer.
 * Identical content yields identical attribute order, entity spelling, and bytes.
 */
export function serializeHtml(nodes: readonly HtmlNode[]): string {
	// The tree schema models structure, not the HTML grammar. Validate edited output too.
	const result = serializeNodes(nodes, 0);
	parseHtml(result);
	return result;
}

/** Recursively serialize validated structure in document order, enforcing the nesting limit. */
function serializeNodes(nodes: readonly HtmlNode[], depth: number): string {
	if (depth > 64) throw new Error("HTML nesting exceeds reference format limit");
	return nodes
		.map((node) => {
			if ("text" in node) return escape(node.text);
			if (!allowedHtmlTags.has(node.tag)) throw new Error("Unsupported element");
			if (node.tag === "br" && node.children.length > 0) {
				throw new Error("A br element cannot have children");
			}
			const attrs = Object.keys(node.attributes)
				.sort()
				.map((key) => {
					validateAttributeName(key);
					return ` ${key}="${escape(node.attributes[key])}"`;
				})
				.join("");
			return `<${node.tag}${attrs}>${node.tag === "br" ? "" : `${serializeNodes(node.children, depth + 1)}</${node.tag}>`}`;
		})
		.join("");
}
