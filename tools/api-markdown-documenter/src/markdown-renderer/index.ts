/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Library for rendering {@link DocumentationNode} trees as `Markdown`.
 */

export {
	defaultMarkdownRenderers,
	getRenderersWithDefaults,
	type MarkdownRenderers,
	type RenderDocumentationNode,
} from "./RenderConfiguration";
export { createDocumentWriter, DocumentWriter } from "./DocumentWriter";
export { renderDocument, renderNode, renderNodes } from "./Render";
export { getContextWithDefaults, type MarkdownRenderContext } from "./RenderContext";
