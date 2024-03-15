/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { PlainTextNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";

/**
 * This logic was adapted from:
 * {@link https://github.com/microsoft/rushstack/blob/main/apps/api-documenter/src/markdown/MarkdownEmitter.ts}
 */

/**
 * Transform a {@link PlainTextNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function transformPlainText(node: PlainTextNode, context: TransformationContext): string {
	// TODO: how to handle formatting? Do we drop formatting down to plain text like we do in markdown?
	// Presumably bold, etc. can impact formatting of list bullets, etc.? Maybe not?

	// TODO: How to handle escaping vs not?
	// Maybe this? https://github.com/syntax-tree/hast-util-sanitize
	return node.text;
}
