/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { toHtml } from "hast-util-to-html";
import type { DocumentNode, DocumentationNode } from "../../documentation-domain/index.js";
import { documentToHtml } from "../../documentation-domain-to-html/index.js";
import type { DocumentWriter } from "../DocumentWriter.js";
import { type RenderConfiguration, defaultRenderers } from "./configuration/index.js";
import { type RenderContext } from "./RenderContext.js";

/**
 * Renders a {@link DocumentNode} as HTML, and returns the resulting file contents as a `string`.
 *
 * @param document - The document to render.
 * @param config - HTML rendering configuration.
 *
 * @alpha
 */
export function renderDocument(document: DocumentNode, config: RenderConfiguration): string {
	const { language, startingHeadingLevel, logger } = config;

	const hastTree = documentToHtml(document, {
		customTransformations: undefined, // TODO
		language,
		startingHeadingLevel,
		logger,
	});

	return toHtml(hastTree, {
		// This is required to handle "escaped" contents coming from the TSDoc.
		// These include things like embedded HTML and Markdown.
		allowDangerousHtml: true,

		// Self-closed tags reduce output size.
		closeSelfClosing: true,
	});
}

/**
 * Renders the provided {@link DocumentationNode} per the configured
 * {@link HtmlRenderContext.customRenderers | renderers}.
 *
 * @alpha
 */
export function renderNode(
	node: DocumentationNode,
	writer: DocumentWriter,
	context: RenderContext,
): void {
	if (
		context.customRenderers !== undefined &&
		Object.keys(context.customRenderers).includes(node.type)
	) {
		// User-provided renderers take precedence. If we found an appropriate one, use it.
		context.customRenderers[node.type](node, writer, context);
	} else if (Object.keys(defaultRenderers).includes(node.type)) {
		// If no user-provided renderer was given for this node type, but we have a default, use the default.
		defaultRenderers[node.type](node, writer, context);
	} else {
		throw new Error(
			`Encountered a DocumentationNode with neither a user-provided nor system-default renderer. Type: ${node.type}. Please provide a renderer for this type.`,
		);
	}
}

/**
 * Renders a list of child {@link DocumentationNode}s per the configured
 * {@link HtmlRenderContext.customRenderers | renderers}.
 *
 * @alpha
 */
export function renderNodes(
	children: DocumentationNode[],
	writer: DocumentWriter,
	childContext: RenderContext,
): void {
	for (const child of children) {
		renderNode(child, writer, childContext);
	}
}
