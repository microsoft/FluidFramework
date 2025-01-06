/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { DocumentWriter } from "./DocumentWriter.js";
export {
	renderDocument as renderDocumentAsHtml,
	type RenderDocumentConfiguration as RenderDocumentAsHtmlConfiguration,
	renderHtml,
	type RenderHtmlConfiguration,
} from "./html-renderer/index.js";
export {
	type RenderConfiguration as MarkdownRenderConfiguration,
	type RenderContext as MarkdownRenderContext,
	renderDocument as renderDocumentAsMarkdown,
	renderNode as renderNodeAsMarkdown,
	renderNodes as renderNodesAsMarkdown,
	type Renderers as MarkdownRenderers,
} from "./markdown-renderer/index.js";
