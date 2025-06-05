/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { Element as HastElement, Nodes as HastNodes } from "hast";
import { h } from "hastscript";

import type { HeadingNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { transformChildrenUnderTag } from "../Utilities.js";

/**
 * Maximum heading level supported by most systems.
 *
 * @remarks This corresponds with the max HTML heading level.
 */
const maxHeadingLevel = 6;

/**
 * Transforms a {@link HeadingNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 *
 * @remarks
 *
 * Observes {@link RenderContext.headingLevel} to determine the heading level to use.
 */
export function headingToHtml(
	headingNode: HeadingNode,
	context: TransformationContext,
): HastNodes {
	const { headingLevel } = context;

	// HTML only supports heading levels up to 6. If our level is beyond that, we will transform the input to simple
	// bold text, with an accompanying anchor to ensure we can still link to the text.
	const transformAsHeadingElement = headingLevel <= maxHeadingLevel;
	if (transformAsHeadingElement) {
		const attributes: Record<string, string> = {};
		if (headingNode.id !== undefined) {
			attributes.id = headingNode.id;
		}

		return transformChildrenUnderTag(
			{ name: `h${headingLevel}`, attributes },
			headingNode.children,
			context,
		);
	} else {
		const transformedChildren: HastElement[] = [];
		if (headingNode.id !== undefined) {
			transformedChildren.push(h("a", { id: headingNode.id }));
		}
		transformedChildren.push(
			transformChildrenUnderTag({ name: "b" }, headingNode.children, context),
		);

		// Wrap the 2 child elements in a fragment
		return h(undefined, transformedChildren);
	}
}
