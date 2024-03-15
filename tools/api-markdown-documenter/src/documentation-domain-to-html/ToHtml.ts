/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Element as HastElement, Text as HastText } from "hast";
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
export function documentToHtml(document: DocumentNode, config: TransformationConfig): HastElement {
	const transformationContext = createTransformationContext(config);

	const transformedChildren = documentationNodesToHtml(document.children, transformationContext);
	return h(
		"html",
		{
			lang: config.language ?? "en",
		},
		[h("head", [h("meta", { charset: "utf8" })]), h("body", transformedChildren)],
	);

	// TODO: what to do with front-matter?
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
): HastElement | HastText {
	if (context.transformations[node.type] === undefined) {
		throw new Error(
			`Encountered a DocumentationNode with neither a user-provided nor system-default renderer. Type: ${node.type}. Please provide a renderer for this type.`,
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
): (HastElement | HastText)[] {
	return nodes.map((node) => documentationNodeToHtml(node, context));
}
