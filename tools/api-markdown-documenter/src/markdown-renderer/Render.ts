/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { StringBuilder } from "@microsoft/tsdoc";

import type { DocumentNode, DocumentationNode } from "../documentation-domain";
import { RenderConfiguration, defaultMarkdownRenderers } from "./configuration";
import { DocumentWriter } from "./DocumentWriter";
import { MarkdownRenderContext, getContextWithDefaults } from "./RenderContext";

/**
 * Renders a {@link DocumentNode} as Markdown, and returns the resulting file contents as a `string`.
 *
 * @param document - The document to render.
 * @param config - Partial Markdown rendering configuration.
 *
 * @public
 */
export function renderDocument(document: DocumentNode, config: RenderConfiguration): string {
	const writer = new DocumentWriter(new StringBuilder());
	const renderContext = getContextWithDefaults({
		headingLevel: config.startingHeadingLevel,
		customRenderers: config.customRenderers,
	});

	renderNodes(document.children, writer, renderContext);

	// Trim any leading and trailing whitespace
	let renderedDocument = writer.getText().trim();

	if (document.frontMatter !== undefined) {
		// Join body contents with front-matter, separated by a blank line.
		renderedDocument = [document.frontMatter, "", renderedDocument].join("\n");
	}

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
	context: MarkdownRenderContext,
): void {
	if (
		context.customRenderers !== undefined &&
		Object.keys(context.customRenderers).includes(node.type)
	) {
		// User-provided renderers take precedence. If we found an appropriate one, use it.
		context.customRenderers[node.type](node, writer, context);
	} else if (Object.keys(defaultMarkdownRenderers).includes(node.type)) {
		// If no user-provided renderer was given for this node type, but we have a default, use the default.
		defaultMarkdownRenderers[node.type](node, writer, context);
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
	childContext: MarkdownRenderContext,
): void {
	for (const child of children) {
		renderNode(child, writer, childContext);
	}
}
