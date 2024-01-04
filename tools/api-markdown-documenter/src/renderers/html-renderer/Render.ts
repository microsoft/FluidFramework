/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { DocumentNode, DocumentationNode } from "../../documentation-domain";
import { type DocumentWriter, createDocumentWriter } from "../DocumentWriter";
import { type RenderConfiguration, defaultRenderers } from "./configuration";
import { type RenderContext, getContextWithDefaults } from "./RenderContext";

/**
 * Renders a {@link DocumentNode} as HTML, and returns the resulting file contents as a `string`.
 *
 * @param document - The document to render.
 * @param config - HTML rendering configuration.
 *
 * @alpha
 */
export function renderDocument(document: DocumentNode, config: RenderConfiguration): string {
	const { customRenderers, language, startingHeadingLevel } = config;

	const writer = createDocumentWriter();
	const renderContext = getContextWithDefaults({
		headingLevel: startingHeadingLevel,
		customRenderers,
	});

	// Write top-level metadata
	writer.writeLine("<!DOCTYPE html>");
	writer.writeLine(`<html lang="${language ?? "en"}">`);
	writer.increaseIndent();
	writer.writeLine("<head>");
	writer.increaseIndent();
	writer.writeLine('<meta charset="utf-8" />');
	writer.decreaseIndent();
	writer.writeLine("</head>");

	// Write contents under the document body
	writer.writeLine(`<body>`);
	writer.increaseIndent();
	renderNodes(document.children, writer, renderContext);
	writer.ensureNewLine();
	writer.decreaseIndent();
	writer.writeLine(`</body>`);

	writer.decreaseIndent();
	writer.writeLine("</html>");

	// Trim any leading and trailing whitespace
	let renderedDocument = writer.getText().trim();

	if (document.frontMatter !== undefined) {
		// Join body contents with front-matter.
		renderedDocument = [document.frontMatter, renderedDocument].join("\n");
	}

	// Ensure file ends with a single newline.
	renderedDocument = [renderedDocument, ""].join("\n");

	return renderedDocument;
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
