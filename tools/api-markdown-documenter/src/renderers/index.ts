/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { createDocumentWriter, DocumentWriter } from "./DocumentWriter";
export {
	type RenderConfiguration as MarkdownRenderConfiguration,
	type RenderContext as MarkdownRenderContext,
	renderDocument as renderDocumentAsMarkdown,
	type RenderDocumentationNode as RenderDocumentationNodeAsMarkdown,
	renderNode as renderNodeAsMarkdown,
	renderNodes as renderNodesAsMarkdown,
	type Renderers as MarkdownRenderers,
} from "./markdown-renderer";
