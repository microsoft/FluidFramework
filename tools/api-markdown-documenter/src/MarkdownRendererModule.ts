/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This module bundles Markdown-rendering capabilities as a single library export.
 */

export {
	type RenderApiModelAsMarkdownOptions as RenderApiModelOptions,
	type RenderDocumentsAsMarkdownOptions as RenderDocumentsOptions,
	renderApiModelAsMarkdown as renderApiModel,
	renderMarkdownDocuments,
} from "./RenderMarkdown.js";
export { renderDocumentAsMarkdown as renderDocument } from "./renderers/index.js";
