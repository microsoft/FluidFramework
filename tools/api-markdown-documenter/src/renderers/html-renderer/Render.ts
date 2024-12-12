/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Root as HastRoot, Nodes as HastTree } from "hast";
import { format } from "hast-util-format";
import { toHtml as toHtmlString } from "hast-util-to-html";

import type { DocumentNode } from "../../documentation-domain/index.js";
import {
	documentToHtml,
	type TransformationConfig,
} from "../../documentation-domain-to-html/index.js";

/**
 * Configuration for rendering HTML.
 *
 * @sealed
 * @public
 */
export interface RenderHtmlConfig {
	/**
	 * Whether or not to render the generated HTML "pretty", human-readable formatting.
	 * @defaultValue `true`
	 */
	prettyFormatting?: boolean;
}

/**
 * Configuration for rendering a document as HTML.
 *
 * @sealed
 * @public
 */
export interface RenderDocumentConfig extends TransformationConfig, RenderHtmlConfig {}

/**
 * Renders a {@link DocumentNode} as HTML, and returns the resulting file contents as a string.
 *
 * @param document - The document to render.
 * @param config - HTML transformation configuration.
 *
 * @public
 */
export function renderDocument(document: DocumentNode, config: RenderDocumentConfig): string {
	const htmlTree = documentToHtml(document, config);
	return renderHtml(htmlTree, config);
}

/**
 * Renders a {@link DocumentNode} as HTML, and returns the resulting file contents as a string.
 *
 * @param document - The document to render.
 * @param config - HTML transformation configuration.
 *
 * @public
 */
export function renderHtml(
	html: HastTree,
	{ prettyFormatting }: { prettyFormatting?: boolean },
): string {
	if (prettyFormatting !== false) {
		// Pretty formatting. Modifies the tree in place.
		// Note: this API is specifically typed to only accept a `Root` node, but its code only requires any `Nodes`.
		// TODO: file an issue.
		format(html as HastRoot);
	}
	return toHtmlString(html);
}
