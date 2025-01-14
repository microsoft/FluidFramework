/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This module bundles Markdown-rendering capabilities as a single library export.
 */

export {
	type RenderApiModelAsMarkdownOptions as RenderApiModelOptions,
	renderApiModelAsMarkdown as renderApiModel,
	type RenderDocumentsAsMarkdownOptions as RenderDocumentsOptions,
	renderDocumentsAsMarkdown as renderDocuments,
} from "./RenderMarkdown.js";
export {
	renderDocumentAsMarkdown as renderDocument,
	renderNodeAsMarkdown as renderNode,
	renderNodesAsMarkdown as renderNodes,
} from "./renderers/index.js";
