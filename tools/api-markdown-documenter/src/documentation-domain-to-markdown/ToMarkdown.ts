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
	DocumentationNode,
	DocumentNode,
	PhrasingContent,
	SectionContent,
} from "../documentation-domain/index.js";

import {
	createTransformationContext,
	type TransformationContext,
} from "./TransformationContext.js";
import type {
	Transformation,
	TransformationConfiguration,
	Transformations,
} from "./configuration/index.js";

/**
 * Generates a Markdown AST from the provided {@link DocumentNode}.
 *
 * @param document - The document to transform.
 * @param config - Markdown transformation configuration.
 *
 * @public
 */
export function documentToMarkdown(
	document: DocumentNode,
	config: TransformationConfiguration,
): MdastRoot {
	const transformationContext = createTransformationContext(config);

	const transformedSections: MdastRootContent[] = [];
	for (const section of document.children) {
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

	const transformation = transformations[node.type] as Transformation<
		SectionContent,
		MdastRootContent[]
	>;
	if (transformation === undefined) {
		throw new Error(`No transformation defined for node type: ${node.type}`);
	}
	return transformation(node, context);
}

/**
 * Generates a Markdown AST from the provided {@link SectionContent}.
 *
 * @param node - The node to transform.
 * @param config - Markdown transformation configuration.
 *
 * @public
 */
export function blockContentToMarkdown(
	node: BlockContent,
	context: TransformationContext,
): [MdastBlockContent] {
	const { transformations } = context;

	const transformation = transformations[node.type] as Transformation<
		BlockContent,
		[MdastBlockContent]
	>;
	if (transformation === undefined) {
		throw new Error(`No transformation defined for node type: ${node.type}`);
	}
	return transformation(node, context);
}

/**
 * Generates a Markdown AST from the provided {@link SectionContent}.
 *
 * @param node - The node to transform.
 * @param config - Markdown transformation configuration.
 *
 * @public
 */
export function phrasingContentToMarkdown(
	node: PhrasingContent,
	context: TransformationContext,
): [MdastPhrasingContent] {
	const { transformations } = context;

	const transformation = transformations[node.type] as Transformation<
		PhrasingContent,
		[MdastPhrasingContent]
	>;
	if (transformation === undefined) {
		throw new Error(`No transformation defined for node type: ${node.type}`);
	}
	return transformation(node, context);
}

/**
 * TODO
 */
export function documentationNodeToMarkdown<TNode extends DocumentationNode>(
	node: TNode,
	context: TransformationContext,
): TNode["type"] extends keyof Transformations
	? ReturnType<Transformations[TNode["type"]]>
	: never {
	if (context.transformations[node.type] === undefined) {
		throw new Error(
			`Encountered a DocumentationNode with neither a user-provided nor system-default renderer. Type: "${node.type}". Please provide a transformation for this type.`,
		);
	}

	// eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
	return context.transformations[node.type](node, context);
}
