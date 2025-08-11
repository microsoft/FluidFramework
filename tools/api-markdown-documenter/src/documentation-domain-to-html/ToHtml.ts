/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Root as HastRoot, Nodes as HastTree } from "hast";
import { h } from "hastscript";

import type { DocumentNode, DocumentationNode } from "../documentation-domain/index.js";

import {
	createTransformationContext,
	type TransformationContext,
} from "./TransformationContext.js";
import type { TransformationConfiguration } from "./configuration/index.js";

/**
 * Generates an HTML AST from the provided {@link DocumentNode}.
 *
 * @param document - The document to transform.
 * @param config - HTML transformation configuration.
 *
 * @public
 */
export function documentToHtml(
	document: DocumentNode,
	config: TransformationConfiguration,
): HastRoot {
	const transformationContext = createTransformationContext(config);

	const transformedChildren = documentationNodesToHtml(
		document.children,
		transformationContext,
	);
	return treeFromBody(transformedChildren, config);
}

/**
 * Creates a complete HTML AST from the provided body contents.
 *
 * @privateRemarks Exported for testing purposes. Not intended for external use.
 */
export function treeFromBody(body: HastTree[], config: TransformationConfiguration): HastRoot {
	const rootBodyContents: HastTree[] = [];
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
			[h("head", [h("meta", { charset: "utf-8" })]), h("body", body)],
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
	config: TransformationConfiguration,
): HastTree;
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
): HastTree;
/**
 * `documentationNodeToHtml` implementation.
 */
export function documentationNodeToHtml(
	node: DocumentationNode,
	configOrContext: TransformationConfiguration | TransformationContext,
): HastTree {
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
	config: TransformationConfiguration,
): HastTree[];
/**
 * Generates a series of HTML ASTs from the provided {@link DocumentationNode}s.
 *
 * @public
 */
export function documentationNodesToHtml(
	nodes: DocumentationNode[],
	transformationContext: TransformationContext,
): HastTree[];
/**
 * `documentationNodesToHtml` implementation.
 */
export function documentationNodesToHtml(
	nodes: DocumentationNode[],
	configOrContext: TransformationConfiguration | TransformationContext,
): HastTree[] {
	const context = getContext(configOrContext);
	return nodes.map((node) => documentationNodeToHtml(node, context));
}

function getContext(
	configOrContext: TransformationConfiguration | TransformationContext,
): TransformationContext {
	return (configOrContext as Partial<TransformationContext>).transformations === undefined
		? createTransformationContext(configOrContext)
		: (configOrContext as TransformationContext);
}
