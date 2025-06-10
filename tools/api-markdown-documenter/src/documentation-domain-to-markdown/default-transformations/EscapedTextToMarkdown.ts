/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { PhrasingContent as MdastPhrasingContent } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";

import type { EscapedTextNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";

/**
 * Transform a {@link PlainTextNode} to Markdown.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function escapedTextToMarkdown(
	node: EscapedTextNode,
	context: TransformationContext,
): MdastPhrasingContent[] {
	if (node.isEmpty) {
		return [];
	}

	const parsed = fromMarkdown(node.value);
	if (parsed.children.length === 0) {
		return [];
	}

	if (parsed.children.length !== 1) {
		throw new Error(
			`Expected a single node at the root of parsed escaped text, but got ${parsed.children.length}.`,
		);
	}

	const container = parsed.children[0];
	if (container.type !== "paragraph") {
		throw new Error(
			`Expected a paragraph at the root of parsed escaped text, but got "${container.type}".\nFull tree: ${JSON.stringify(container)}`,
		);
	}

	// TODO: strip positioning data from result before returning.
	return container.children;
}
