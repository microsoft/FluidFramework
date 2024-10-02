/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This module bundles Markdown-rendering capabilities as a single library export.
 */

export {
	renderApiModelAsHtml as renderApiModel,
	renderDocumentsAsHtml as renderDocuments,
} from "./RenderHtml.js";
export { renderDocumentAsHtml as renderDocument, renderHtml } from "./renderers/index.js";
