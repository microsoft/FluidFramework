/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Code as MdastCode } from "mdast";

import type { FencedCodeBlockNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";

/**
 * Transform a {@link FencedCodeBlockNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function fencedCodeBlockToMarkdown(
	node: FencedCodeBlockNode,
	context: TransformationContext,
): [MdastCode] {
	// Code blocks in mdast are represented as a literal node, rather than a parent with children.
	// This is odd, and makes the transformation strategy a bit different from the others.
	// Fortunately, since `FencedCodeBlockNode`s may only contain plain text and line breaks,
	// we don't need any complex transformation / rendering logic here to convert to a single text value.
	const lines: string[] = [];
	let currentLine = "";
	for (const child of node.children) {
		if (child.type === "text") {
			currentLine = `${currentLine}${child.value}`;
		} else if (child.type === "lineBreak") {
			lines.push(currentLine);
			currentLine = "";
		}
	}
	lines.push(currentLine);

	return [
		{
			type: "code",
			value: lines.join("\n"),
			lang: node.language,
		},
	];
}
