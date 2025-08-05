/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Root as HastRoot, Nodes as HastTree } from "hast";
import { h } from "hastscript";
import { toHast } from "mdast-util-to-hast";

import type { DocumentationNode, DocumentNode } from "../documentation-domain/index.js";

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

	// If the node is a section or a heading, then transform it using the configured transformation.
	if (node.type === "section" || node.type === "heading") {
		if (context.transformations[node.type] === undefined) {
			throw new Error(`Missing HTML transformation for type: "${node.type}".`);
		}

		return context.transformations[node.type](node, context);
	}

	// If the node is not a section or a heading, then it is Markdown "block content" and can be converted directly to HTML.
	return toHast(node, {
		// Needed as a temporary workaround for lack of support for `hast` trees directly in `mdast`.
		// Only raw HTML strings are supported by default in `mdast`.
		// In a future PR, we will introduce an extension that allows `hast` trees to be used directly instead of this.
		// All HTML content is generated directly by this library. No user HTML content is passed through, so this is safe, just not a best practice.
		allowDangerousHtml: true,
	});
}

/**
 * Generates a series of HTML ASTs from the provided {@link DocumentationNode}s.
 *
 * @public
 */
export function documentationNodesToHtml(
	nodes: readonly DocumentationNode[],
	config: TransformationConfiguration,
): HastTree[];
/**
 * Generates a series of HTML ASTs from the provided {@link DocumentationNode}s.
 *
 * @public
 */
export function documentationNodesToHtml(
	nodes: readonly DocumentationNode[],
	transformationContext: TransformationContext,
): HastTree[];
/**
 * `documentationNodesToHtml` implementation.
 */
export function documentationNodesToHtml(
	nodes: readonly DocumentationNode[],
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
