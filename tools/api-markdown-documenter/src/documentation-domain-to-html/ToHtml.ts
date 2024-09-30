/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Required in order to register the `raw` type with the `hast` ecosystem.
// eslint-disable-next-line import/no-unassigned-import
import "hast-util-raw";

import type { Root as HastRoot, Nodes as HastNodes } from "hast";
import { h } from "hastscript";
import type { DocumentNode, DocumentationNode } from "../documentation-domain/index.js";
import type { TransformationConfig } from "./configuration/index.js";
import {
	createTransformationContext,
	type TransformationContext,
} from "./TransformationContext.js";

/**
 * Generates an HTML AST from the provided {@link DocumentNode}.
 *
 * @param document - The document to transform.
 * @param config - HTML transformation configuration.
 *
 * @public
 */
export function documentToHtml(document: DocumentNode, config: TransformationConfig): HastRoot {
	const transformationContext = createTransformationContext(config);

	const transformedChildren = documentationNodesToHtml(document.children, transformationContext);
	const rootBodyContents: HastNodes[] = [];
	rootBodyContents.push({
		type: "doctype",
	});
	rootBodyContents.push(
		h(
			"html",
			{
				lang: config.language ?? "en",
			},
			// eslint-disable-next-line unicorn/text-encoding-identifier-case
			[h("head", [h("meta", { charset: "utf-8" })]), h("body", transformedChildren)],
		),
	);

	return h(undefined, rootBodyContents);
}

/**
 * Generates an HTML AST from the provided {@link DocumentationNode}.
 *
 * @param node - The documentation node to transform.
 * @param config - The HTML transformation configuration. Unspecified options will be filled with defaults.
 *
 * @public
 */
export function documentationNodeToHtml(
	node: DocumentationNode,
	config: TransformationConfig,
): HastNodes;
/**
 * Generates an HTML AST from the provided {@link DocumentationNode}.
 *
 * @param node - The documentation node to transform.
 * @param context - The HTML transformation context.
 *
 * @public
 */
export function documentationNodeToHtml(
	node: DocumentationNode,
	context: TransformationContext,
): HastNodes;
/**
 * `documentationNodeToHtml` implementation.
 */
export function documentationNodeToHtml(
	node: DocumentationNode,
	configOrContext: TransformationConfig | TransformationContext,
): HastNodes {
	const context = getContext(configOrContext);

	if (context.transformations[node.type] === undefined) {
		throw new Error(
			`Encountered a DocumentationNode with neither a user-provided nor system-default renderer. Type: "${node.type}". Please provide a transformation for this type.`,
		);
	}

	return context.transformations[node.type](node, context);
}

/**
 * Generates a series of HTML ASTs from the provided {@link DocumentationNode}s.
 *
 * @public
 */
export function documentationNodesToHtml(
	nodes: DocumentationNode[],
	config: TransformationConfig,
): HastNodes[];
/**
 * Generates a series of HTML ASTs from the provided {@link DocumentationNode}s.
 *
 * @public
 */
export function documentationNodesToHtml(
	nodes: DocumentationNode[],
	transformationContext: TransformationContext,
): HastNodes[];
/**
 * `documentationNodesToHtml` implementation.
 */
export function documentationNodesToHtml(
	nodes: DocumentationNode[],
	configOrContext: TransformationConfig | TransformationContext,
): HastNodes[] {
	const context = getContext(configOrContext);
	return nodes.map((node) => documentationNodeToHtml(node, context));
}

function getContext(
	configOrContext: TransformationConfig | TransformationContext,
): TransformationContext {
	return (configOrContext as Partial<TransformationContext>).transformations === undefined
		? createTransformationContext(configOrContext)
		: (configOrContext as TransformationContext);
}
