/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type DocumentationNode } from "../../documentation-domain";
import { type DocumentWriter } from "../DocumentWriter";
import {
	type RenderContext as HtmlRenderContext,
	renderNode as renderNodeAsHtml,
} from "../html-renderer";
import { type RenderContext as MarkdownRenderContext } from "./RenderContext";

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
	renderNodeAsHtml(node, writer, translateContext(context));
}

/**
 * Translates a {@link MarkdownRenderContext} to a {@link HtmlRenderContext} for rendering HTML content to a Markdown
 * document.
 */
function translateContext(markdownContext: MarkdownRenderContext): HtmlRenderContext {
	return {
		...markdownContext,

		// If we are in a table context, it is not valid to render child contents in a multi-line form.
		prettyFormatting: !(markdownContext.insideTable ?? false),
	};
}
