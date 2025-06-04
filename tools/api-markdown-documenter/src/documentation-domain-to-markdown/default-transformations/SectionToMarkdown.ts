/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { RootContent as MdastRootContent } from "mdast";

import type { SectionNode } from "../../documentation-domain/index.js";
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
export function sectionToMarkdown(
	node: SectionNode,
	context: TransformationContext,
): MdastRootContent {
	const { headingLevel, transformations } = context;

	const transformedChildren: MdastRootContent[] = [];

	if (node.heading !== undefined) {
		const transformedHeading = transformations.heading(node.heading, context);
		transformedChildren.push(transformedHeading);
	}

	transformedChildren.push(
		...node.children.map((child) =>
			transformations[child.type](child, {
				...context,
				headingLevel: headingLevel + 1, // Increase heading level for nested sections
			}),
		),
	);

	throw new Error("TODO");
}
