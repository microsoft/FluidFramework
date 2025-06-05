/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	BlockContent as MdastBlockContent,
	Root as MdastRoot,
	RootContent as MdastRootContent,
	PhrasingContent as MdastPhrasingContent,
} from "mdast";

import type {
	BlockContent,
	DocumentNode,
	PhrasingContent,
	SectionContent,
} from "../documentation-domain/index.js";

import {
	createTransformationContext,
	type TransformationContext,
} from "./TransformationContext.js";
import type { Transformation, TransformationConfiguration } from "./configuration/index.js";

/**
 * Generates an HTML AST from the provided {@link DocumentNode}.
 *
 * @param document - The document to transform.
 * @param config - HTML transformation configuration.
 *
 * @beta
 */
export function documentToMarkdown(
	document: DocumentNode,
	config: TransformationConfiguration,
): MdastRoot {
	const transformationContext = createTransformationContext(config);

	const transformedChildren = document.children.map((child) =>
		transformSectionContent(child, transformationContext),
	);

	return {
		type: "root",
		children: transformedChildren,
	};
}

/**
 * TODO
 */
export function transformSectionContent(
	node: SectionContent,
	context: TransformationContext,
): MdastRootContent {
	const { transformations } = context;

	const transformation = transformations[node.type] as Transformation<
		SectionContent,
		MdastRootContent
	>;
	if (transformation === undefined) {
		throw new Error(`No transformation defined for node type: ${node.type}`);
	}
	return transformation(node, context);
}

/**
 * TODO
 */
export function transformBlockContent(
	node: BlockContent,
	context: TransformationContext,
): MdastBlockContent {
	const { transformations } = context;

	const transformation = transformations[node.type] as Transformation<
		BlockContent,
		MdastBlockContent
	>;
	if (transformation === undefined) {
		throw new Error(`No transformation defined for node type: ${node.type}`);
	}
	return transformation(node, context);
}

/**
 * TODO
 */
export function transformPhrasingContent(
	node: PhrasingContent,
	context: TransformationContext,
): MdastPhrasingContent {
	const { transformations } = context;

	const transformation = transformations[node.type] as Transformation<
		PhrasingContent,
		MdastPhrasingContent
	>;
	if (transformation === undefined) {
		throw new Error(`No transformation defined for node type: ${node.type}`);
	}
	return transformation(node, context);
}
