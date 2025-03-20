/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { DocumentationNode } from "../../documentation-domain/index.js";
import { documentationNodeToHtml } from "../../documentation-domain-to-html/index.js";
import type { DocumentWriter } from "../DocumentWriter.js";
import { renderHtml } from "../html-renderer/index.js";

import type { RenderContext as MarkdownRenderContext } from "./RenderContext.js";

/**
 * Renders the provided {@link DocumentationNode} using HTML syntax.
 *
 * @remarks Markdown supports inline HTML without any special translation, so we can just render HTML directly here.
 */
export function renderNodeWithHtmlSyntax<TNode extends DocumentationNode>(
	node: TNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	const html = documentationNodeToHtml(node, { startingHeadingLevel: context.headingLevel });
	const htmlString = renderHtml(html, { prettyFormatting: !(context.insideTable ?? false) });
	writer.write(htmlString);
}
