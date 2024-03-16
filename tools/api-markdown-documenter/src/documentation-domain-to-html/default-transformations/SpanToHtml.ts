/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { Element as HastElement } from "hast";
import { h } from "hastscript";
import type { SpanNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { documentationNodesToHtml } from "../ToHtml.js";

/**
 * Transform a {@link SpanNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function spanToHtml(node: SpanNode, context: TransformationContext): HastElement {
	const transformedChildren = documentationNodesToHtml(node.children, context);

	if (node.textFormatting === undefined) {
		return h("span", transformedChildren);
	}

	let formatWrapped: HastElement | undefined;
	function wrapWithTag(tag: string): void {
		formatWrapped = h(tag, formatWrapped === undefined ? transformedChildren : [formatWrapped]);
	}

	// The ordering in which we wrap here is effectively arbitrary, but impacts the order of the tags in the output.
	// Note if you're editing: tests may implicitly rely on this ordering.
	if (node.textFormatting.strikethrough === true) {
		wrapWithTag("s");
	}
	if (node.textFormatting.italic === true) {
		wrapWithTag("i");
	}
	if (node.textFormatting.bold === true) {
		wrapWithTag("b");
	}

	return h("span", formatWrapped ?? transformedChildren);
}
