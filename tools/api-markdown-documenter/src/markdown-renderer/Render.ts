/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { StringBuilder } from "@microsoft/tsdoc";

import type { DocumentNode, DocumentationNode } from "../documentation-domain";
import { DocumentWriter } from "./DocumentWriter";
import { MarkdownRenderers, defaultMarkdownRenderers } from "./RenderConfiguration";
import { MarkdownRenderContext } from "./RenderContext";

/**
 * Generates the root {@link MarkdownRenderContext} for rendering a document with the provided `renderers`.
 */
export function getRootRenderContext(renderers: MarkdownRenderers): MarkdownRenderContext {
	return {
		insideTable: false,
		insideCodeBlock: false,
		insideHtml: false,
		headingLevel: 1,
		renderers,
	};
}

/**
 * Renders a {@link DocumentNode} as Markdown, and returns the resulting file contents as a `string`.
 */
export function renderDocument(
	document: DocumentNode,
	customRenderers?: MarkdownRenderers,
): string {
	const renderers = {
		...defaultMarkdownRenderers,
		...customRenderers,
	};

	const writer = new DocumentWriter(new StringBuilder());
	renderNodes(document.children, writer, getRootRenderContext(renderers));

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
 * Renders the provided {@link DocumentationNode} per the configured policy
 * ({@link MarkdownRenderContext.renderers}).
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
 * Renders a list of child {@link DocumentationNode}s per the configured policy
 * ({@link MarkdownRenderContext.renderers}).
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
