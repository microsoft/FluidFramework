/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { DocumentNode, DocumentationNode } from "../../documentation-domain/index.js";
import { DocumentWriter } from "../DocumentWriter.js";

import { type RenderContext, getContextWithDefaults } from "./RenderContext.js";
import { type RenderConfiguration, defaultRenderers } from "./configuration/index.js";

/**
 * Renders a {@link DocumentNode} as Markdown, and returns the resulting file contents as a `string`.
 *
 * @param document - The document to render.
 * @param config - Markdown rendering configuration.
 *
 * @public
 */
export function renderDocument(document: DocumentNode, config: RenderConfiguration): string {
	const writer = DocumentWriter.create();
	const renderContext = getContextWithDefaults({
		headingLevel: config.startingHeadingLevel,
		customRenderers: config.customRenderers,
	});

	renderNodes(document.children, writer, renderContext);

	// Trim any leading and trailing whitespace
	let renderedDocument = writer.getText().trim();

	// Ensure file ends with a single newline.
	renderedDocument = [renderedDocument, ""].join("\n");

	return renderedDocument;
}

/**
 * Renders the provided {@link DocumentationNode} per the configured
 * {@link MarkdownRenderContext.customRenderers | renderers}.
 *
 * @public
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
 * {@link MarkdownRenderContext.customRenderers | renderers}.
 *
 * @public
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
