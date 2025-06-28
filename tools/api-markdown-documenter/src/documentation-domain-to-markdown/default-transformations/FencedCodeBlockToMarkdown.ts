/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Code as MdastCode } from "mdast";

import type { FencedCodeBlockNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";

/**
 * Transform a {@link FencedCodeBlockNode} to Markdown.
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
	const text: string[] = [];
	for (const child of node.children) {
		if (child.type === "text") {
			text.push(child.value);
		} else if (child.type === "lineBreak") {
			text.push("\n");
		}
	}

	const result: MdastCode = {
		type: "code",
		value: text.join(""),
	};
	if (node.language !== undefined) {
		result.lang = node.language;
	}

	return [result];
}
