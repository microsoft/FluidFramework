/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { DocumentWriter } from "./DocumentWriter";
export {
	type RenderConfiguration as HtmlRenderConfiguration,
	type RenderContext as HtmlRenderContext,
	renderDocument as renderDocumentAsHtml,
	renderNode as renderNodeAsHtml,
	renderNodes as renderNodesAsHtml,
	type Renderers as HtmlRenderers,
} from "./html-renderer";
export {
	type RenderConfiguration as MarkdownRenderConfiguration,
	type RenderContext as MarkdownRenderContext,
	renderDocument as renderDocumentAsMarkdown,
	renderNode as renderNodeAsMarkdown,
	renderNodes as renderNodesAsMarkdown,
	type Renderers as MarkdownRenderers,
} from "./markdown-renderer";
