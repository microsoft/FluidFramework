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
 * Renders a {@link DocumentNode} as HTML, and returns the resulting file contents as a `string`.
 *
 * @param document - The document to render.
 * @param config - HTML rendering configuration.
 *
 * @alpha
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
 * Renders the provided {@link DocumentationNode} per the configured
 * {@link HtmlRenderContext.customRenderers | renderers}.
 *
 * @alpha
 */
export function documentationNodeToHtml(
	node: DocumentationNode,
	context: TransformationContext,
): HastNodes {
	if (context.transformations[node.type] === undefined) {
		throw new Error(
			`Encountered a DocumentationNode with neither a user-provided nor system-default renderer. Type: "${node.type}". Please provide a transformation for this type.`,
		);
	}
	return context.transformations[node.type](node, context);
}

/**
 * Renders a list of {@link DocumentationNode}s per the configured
 * {@link HtmlRenderContext.customRenderers | renderers}.
 *
 * @alpha
 */
export function documentationNodesToHtml(
	nodes: DocumentationNode[],
	context: TransformationContext,
): HastNodes[] {
	return nodes.map((node) => documentationNodeToHtml(node, context));
}
