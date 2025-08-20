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

import type { ApiDocument, RenderedDocument } from "../../ApiDocument.js";
import type { LoggingConfiguration } from "../../LoggingConfiguration.js";

/**
 * Configuration for rendering Markdown content.
 *
 * @sealed
 * @public
 */
export interface RenderMarkdownConfiguration extends LoggingConfiguration {
	/**
	 * Options for the Markdown renderer.
	 *
	 * @see {@link https://github.com/syntax-tree/mdast-util-to-markdown?tab=readme-ov-file#options}
	 */
	readonly mdastToMarkdownOptions?: Partial<MdastToMarkdownOptions>;
}

/**
 * Renders a {@link ApiDocument} as Markdown and returns the resulting file contents as a string.
 *
 * @param document - The document to render.
 * @param config - Markdown transformation configuration.
 *
 * @public
 */
export function renderDocument(
	document: ApiDocument,
	config: RenderMarkdownConfiguration,
): RenderedDocument {
	return {
		apiItem: document.apiItem,
		contents: renderMarkdown(document.contents, config),
		filePath: `${document.documentPath}.md`, // Append .md extension
	};
}

/**
 * Renders the provided Markdown tree and returns the resulting file contents as a string.
 *
 * @remarks Leverages {@link https://github.com/syntax-tree/mdast-util-to-markdown | mdast-util-to-markdown}
 *
 * @param document - The document to transform.
 * @param config - Markdown transformation configuration.
 */
function renderMarkdown(tree: MdastTree, config: RenderMarkdownConfiguration): string {
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
