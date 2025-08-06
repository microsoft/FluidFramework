/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { RootContent as MdastRootContent } from "mdast";

import type { HierarchicalSection } from "../../mdast/index.js";
import { sectionContentToMarkdown } from "../ToMarkdown.js";
import type { TransformationContext } from "../TransformationContext.js";

/**
 * Transform a {@link HierarchicalSection} to Markdown.
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
	node: HierarchicalSection,
	context: TransformationContext,
): MdastRootContent[] {
	const { headingLevel, transformations } = context;

	const transformedSectionContent: MdastRootContent[] = [];

	if (node.heading !== undefined) {
		const transformedHeading = transformations.identifiableHeading(node.heading, context);
		transformedSectionContent.push(...transformedHeading);
	}

	for (const child of node.children) {
		transformedSectionContent.push(
			...sectionContentToMarkdown(child, {
				...context,
				headingLevel: headingLevel + 1, // Increase heading level for nested sections
			}),
		);
	}

	return transformedSectionContent;
}
