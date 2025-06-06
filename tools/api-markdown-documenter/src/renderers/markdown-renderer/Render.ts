/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Nodes as MdastTree } from "mdast";
import { toMarkdown as toMarkdownString } from "mdast-util-to-markdown";

import type { DocumentNode } from "../../documentation-domain/index.js";
import {
	documentToMarkdown,
	type TransformationConfiguration,
} from "../../documentation-domain-to-markdown/index.js";

/**
 * Configuration for rendering HTML.
 *
 * @sealed
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface RenderMarkdownConfiguration {
	// TODO
}

/**
 * Configuration for rendering a document as Markdown.
 *
 * @sealed
 * @public
 */
export interface RenderDocumentConfiguration
	extends TransformationConfiguration,
		RenderMarkdownConfiguration {}

/**
 * Renders a {@link DocumentNode} as HTML, and returns the resulting file contents as a string.
 *
 * @param document - The document to render.
 * @param config - HTML transformation configuration.
 *
 * @public
 */
export function renderDocument(
	document: DocumentNode,
	config: RenderDocumentConfiguration,
): string {
	const markdownTree = documentToMarkdown(document, config);
	return renderMarkdown(markdownTree);
}

/**
 * Renders a {@link DocumentNode} as HTML, and returns the resulting file contents as a string.
 *
 * @param document - The document to render.
 * @param config - HTML transformation configuration.
 *
 * @public
 */
export function renderMarkdown(tree: MdastTree): string {
	return toMarkdownString(tree);
}
