/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { StringBuilder } from "@microsoft/tsdoc";

import type { DocumentNode, DocumentationNode } from "../documentation-domain";
import { RenderConfiguration } from "./configuration";
import { DocumentWriter } from "./DocumentWriter";
import { MarkdownRenderContext, getContextWithDefaults } from "./RenderContext";

/**
 * Renders a {@link DocumentNode} as Markdown, and returns the resulting file contents as a `string`.
 *
 * @param document - The document to render.
 * @param config - Partial Markdown rendering configuration.
 */
export function renderDocument(document: DocumentNode, config: RenderConfiguration): string {
	const writer = new DocumentWriter(new StringBuilder());
	const renderContext = getContextWithDefaults({ renderers: config.renderers });

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
 * {@link MarkdownRenderContext.renderers | renderers}.
 */
export function renderNode(
	node: DocumentationNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	if (Object.keys(context.renderers).includes(node.type)) {
		context.renderers[node.type](node, writer, context);
	} else {
		throw new Error(
			`Encountered an unrecognized DocumentationNode type: ${node.type}. Please provide a renderer for this type.`,
		);
	}
}

/**
 * Renders a list of child {@link DocumentationNode}s per the configured
 * {@link MarkdownRenderContext.renderers | renderers}.
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
