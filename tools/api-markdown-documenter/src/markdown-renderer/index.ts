/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Library for rendering {@link DocumentationNode} trees as `Markdown`.
 */

export {
	type RenderConfiguration as MarkdownRenderConfiguration,
	type MarkdownRenderers,
	type RenderDocumentationNode,
} from "./configuration";
export { createDocumentWriter, DocumentWriter } from "./DocumentWriter";
export {
	renderDocument as renderDocumentAsMarkdown,
	renderNode as renderNodeAsMarkdown,
	renderNodes as renderNodesAsMarkdown,
} from "./Render";
export { type MarkdownRenderContext } from "./RenderContext";
