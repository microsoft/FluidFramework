/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Library for rendering {@link DocumentationNode} trees as `Markdown`.
 */

export {
	type RenderConfiguration,
	getRenderConfigurationWithDefaults,
	type MarkdownRenderers,
	type RenderDocumentationNode,
} from "./configuration";
export { createDocumentWriter, DocumentWriter } from "./DocumentWriter";
export { renderDocument, renderNode, renderNodes } from "./Render";
export { type MarkdownRenderContext } from "./RenderContext";
