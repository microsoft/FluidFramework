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

import type { SectionNode } from "../../documentation-domain/index.js";
import { documentationNodeToHtml, documentationNodesToHtml } from "../ToHtml.js";
import type { TransformationContext } from "../TransformationContext.js";

/**
 * Transform a {@link SectionNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 *
 * @remarks
 *
 * Automatically increases the context's {@link RenderContext.headingLevel}, when rendering child contents,
 * such that heading levels increase appropriately through nested sections.
 */
export function sectionToHtml(node: SectionNode, context: TransformationContext): HastElement {
	const transformedChildren: HastNodes[] = [];
	if (node.heading !== undefined) {
		transformedChildren.push(documentationNodeToHtml(node.heading, context));
	}

	transformedChildren.push(
		...documentationNodesToHtml(node.children, {
			...context,
			headingLevel: context.headingLevel + 1, // Increment heading level for child content
		}),
	);

	return h("section", transformedChildren);
}
