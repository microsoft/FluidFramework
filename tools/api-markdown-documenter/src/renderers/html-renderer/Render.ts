/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Root as HastRoot, Nodes as HastTree } from "hast";
import { format } from "hast-util-format";
import { toHtml as toHtmlString } from "hast-util-to-html";

import type { MarkdownDocument, RenderedDocument } from "../../ApiDocument.js";
import {
	documentToHtml,
	type TransformationConfiguration,
} from "../../documentation-domain-to-html/index.js";

/**
 * Configuration for rendering HTML.
 *
 * @sealed
 * @public
 */
export interface RenderHtmlConfiguration {
	/**
	 * Whether or not to render the generated HTML "pretty", human-readable formatting.
	 * @defaultValue `true`
	 */
	readonly prettyFormatting?: boolean;
}

/**
 * Configuration for rendering a document as HTML.
 *
 * @sealed
 * @public
 */
export interface RenderDocumentConfiguration
	extends TransformationConfiguration,
		RenderHtmlConfiguration {}

/**
 * Renders a {@link MarkdownDocument} as HTML, and returns the resulting file contents as a string.
 *
 * @param document - The document to render.
 * @param config - HTML transformation configuration.
 *
 * @public
 */
export function renderDocument(
	document: MarkdownDocument,
	config: RenderDocumentConfiguration,
): RenderedDocument {
	const htmlDocument = documentToHtml(document, config);
	return {
		apiItem: htmlDocument.apiItem,
		contents: renderHtml(htmlDocument.contents, config),
		documentPath: htmlDocument.documentPath,
	};
}

/**
 * Renders a {@link MarkdownDocument} as HTML, and returns the resulting file contents as a string.
 *
 * @param document - The document to render.
 * @param config - HTML transformation configuration.
 *
 * @public
 */
export function renderHtml(html: HastTree, config: RenderHtmlConfiguration): string {
	const { prettyFormatting } = config;
	if (prettyFormatting !== false) {
		// Pretty formatting. Modifies the tree in place.
		// Note: this API is specifically typed to only accept a `Root` node, but its code only requires any `Nodes`.
		// TODO: file an issue.
		format(html as HastRoot);
	}
	return toHtmlString(html, {
		// Needed as a temporary workaround for lack of support for `hast` trees directly in `mdast`.
		// Only raw HTML strings are supported by default in `mdast`.
		// In a future PR, we will introduce an extension that allows `hast` trees to be used directly instead of this.
		// All HTML content is generated directly by this library. No user HTML content is passed through, so this is safe, just not a best practice.
		allowDangerousHtml: true,
	});
}
