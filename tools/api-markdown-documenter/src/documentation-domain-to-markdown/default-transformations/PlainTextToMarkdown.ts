/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { PhrasingContent as MdastPhrasingContent, Text as MdastText } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";

import type { PlainTextNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";

import { applyFormatting } from "./Utilities.js";

/**
 * Transform a {@link PlainTextNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function plainTextToMarkdown(
	node: PlainTextNode,
	context: TransformationContext,
): MdastPhrasingContent[] {
	if (node.escaped) {
		return escapedTextToMarkdown(node.value);
	}

	const transformed: MdastText = {
		type: "text",
		value: node.value,
	};

	return [applyFormatting(transformed, context)];
}

function escapedTextToMarkdown(text: string): MdastPhrasingContent[] {
	const parsed = fromMarkdown(text);
	if (parsed.children.length !== 1) {
		throw new Error(
			`Expected a single node at the root of parsed escaped text, but got ${parsed.children.length}.`,
		);
	}
	if (parsed.children[0].type !== "paragraph") {
		throw new Error(
			`Expected a paragraph at the root of parsed escaped text, but got "${parsed.type}".`,
		);
	}

	return parsed.children[0].children;
}
