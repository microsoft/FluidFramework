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
	renderDocument as renderDocumentAsMarkdown,
	type RenderDocumentConfiguration as RenderDocumentAsMarkdownConfiguration,
	renderMarkdown,
	type RenderMarkdownConfiguration,
} from "./markdown-renderer/index.js";
