/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { MarkdownDocument } from "./ApiDocument.js";
import { type SaveDocumentsOptions, saveDocuments } from "./FileSystem.js";
import {
	type ApiItemTransformationOptions,
	transformApiModel,
} from "./api-item-transforms/index.js";
import {
	type RenderMarkdownConfiguration,
	renderDocumentAsMarkdown,
} from "./renderers/index.js";

/**
 * API Model Markdown rendering options.
 *
 * @public
 */
export interface RenderApiModelAsMarkdownOptions
	extends ApiItemTransformationOptions,
		RenderMarkdownConfiguration,
		SaveDocumentsOptions {}

/**
 * Renders the provided model and its contents, and writes each document to a file on disk.
 *
 * @public
 */
export async function renderApiModelAsMarkdown(
	options: RenderApiModelAsMarkdownOptions,
): Promise<void> {
	const documents = transformApiModel(options);

	return renderMarkdownDocuments(documents, options);
}

/**
 * Options for rendering {@link MarkdownDocument}s as Markdown.
 *
 * @public
 */
export interface RenderDocumentsAsMarkdownOptions
	extends RenderMarkdownConfiguration,
		SaveDocumentsOptions {}

/**
 * Renders the provided documents using Markdown syntax, and writes each document to a file on disk.
 *
 * @param documents - The documents to render. Each will be rendered to its own file on disk per
 * {@link ApiDocument.documentPath} (relative to the provided output directory).
 *
 * @public
 */
export async function renderMarkdownDocuments(
	documents: readonly MarkdownDocument[],
	options: RenderDocumentsAsMarkdownOptions,
): Promise<void> {
	const { logger } = options;

	logger?.verbose("Rendering documents as Markdown...");

	const renderedDocuments = await Promise.all(
		documents.map((document) => renderDocumentAsMarkdown(document, options)),
	);

	logger?.success("Documents rendered as Markdown!");

	return saveDocuments(renderedDocuments, options);
}
