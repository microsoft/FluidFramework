/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Nodes as MdastTree } from "mdast";
import { gfmToMarkdown } from "mdast-util-gfm";
import {
	toMarkdown as toMarkdownString,
	type Options as MdastToMarkdownOptions,
} from "mdast-util-to-markdown";

import type { DocumentNode } from "../../documentation-domain/index.js";
import {
	documentToMarkdown,
	type TransformationConfiguration,
} from "../../documentation-domain-to-markdown/index.js";

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
 * Renders a {@link DocumentNode} as Markdown and returns the resulting file contents as a string.
 *
 * @param document - The document to render.
 * @param config - Markdown transformation configuration.
 *
 * @public
 */
export function renderDocument(
	document: DocumentNode,
	config: RenderDocumentConfiguration,
): string {
	const markdownTree = documentToMarkdown(document, config);
	return renderMarkdown(markdownTree, config);
}

/**
 * Configuration for rendering Markdown content.
 *
 * @sealed
 * @public
 */
export interface RenderMarkdownConfiguration {
	/**
	 * Options for the Markdown renderer.
	 *
	 * @see {@link https://github.com/syntax-tree/mdast-util-to-markdown?tab=readme-ov-file#options}
	 */
	readonly mdastToMarkdownOptions?: Partial<MdastToMarkdownOptions>;
}

/**
 * Renders the provided Markdown tree and returns the resulting file contents as a string.
 *
 * @remarks Leverages {@link https://github.com/syntax-tree/mdast-util-to-markdown | mdast-util-to-markdown}
 *
 * @param document - The document to transform.
 * @param config - Markdown transformation configuration.
 *
 * @public
 */
export function renderMarkdown(tree: MdastTree, config: RenderMarkdownConfiguration): string {
	const options: MdastToMarkdownOptions = {
		emphasis: "_",
		bullet: "-",
		incrementListMarker: false,
		extensions: [
			gfmToMarkdown({
				tablePipeAlign: false,
			}),
		],
		...config.mdastToMarkdownOptions,
	};
	return toMarkdownString(tree, options);
}
