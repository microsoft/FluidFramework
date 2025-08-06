/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Root as MdastRoot, RootContent as MdastRootContent } from "mdast";

import type { ApiDocument } from "../ApiDocument.js";
import type { SectionContent } from "../documentation-domain/index.js";

import {
	createTransformationContext,
	type TransformationContext,
} from "./TransformationContext.js";
import type { Transformation, TransformationConfiguration } from "./configuration/index.js";

/**
 * Generates a Markdown AST from the provided {@link ApiDocument}.
 *
 * @param document - The document to transform.
 * @param config - Markdown transformation configuration.
 *
 * @public
 */
export function documentToMarkdown(
	document: ApiDocument,
	config: TransformationConfiguration,
): MdastRoot {
	const transformationContext = createTransformationContext(config);

	const transformedSections: MdastRootContent[] = [];
	for (const section of document.contents) {
		transformedSections.push(...sectionContentToMarkdown(section, transformationContext));
	}

	return {
		type: "root",
		children: transformedSections,
	};
}

/**
 * Generates a Markdown AST from the provided {@link SectionContent}.
 *
 * @param node - The node to transform.
 * @param config - Markdown transformation configuration.
 *
 * @public
 */
export function sectionContentToMarkdown(
	node: SectionContent,
	context: TransformationContext,
): MdastRootContent[] {
	const { transformations } = context;

	// If the node is not a section, then it is Markdown "block content" and can be returned directly.
	if (node.type !== "section") {
		return [node];
	}

	const transformation = transformations[node.type] as Transformation<
		SectionContent,
		MdastRootContent[]
	>;
	if (transformation === undefined) {
		throw new Error(`No transformation defined for node type: ${node.type}`);
	}
	return transformation(node, context);
}
