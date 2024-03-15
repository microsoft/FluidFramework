/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { Element as HastElement } from "hast";
import type { SpanNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { transformChildrenUnderTag } from "../Utilities.js";

/**
 * Transform a {@link SpanNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function transformSpan(node: SpanNode, context: TransformationContext): HastElement {
	// TODO: how to handle formatting? Do we drop formatting down to plain text like we do in markdown?
	// Presumably bold, etc. can impact formatting of list bullets, etc.? Maybe not?
	return transformChildrenUnderTag({ name: "span" }, node.children, context);
}
