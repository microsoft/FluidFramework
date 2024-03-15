/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { Element as HastElement, Text as HastText } from "hast";
import { h } from "hastscript";
import type { SectionNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { transformChildrenUnderTag } from "../Utilities.js";
import { documentationNodeToHtml } from "../ToHtml.js";

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
export function transformSection(node: SectionNode, context: TransformationContext): HastElement {
	const transformedChildren: (HastElement | HastText)[] = [];
	if (node.heading !== undefined) {
		transformedChildren.push(documentationNodeToHtml(node.heading, context));
	}

	transformedChildren.push(
		transformChildrenUnderTag({ name: "section" }, node.children, {
			...context,
			headingLevel: context.headingLevel + 1, // Increment heading level for child content
		}),
	);

	return h("section", transformedChildren);
}
