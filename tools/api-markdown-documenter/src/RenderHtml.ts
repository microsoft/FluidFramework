/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Path from "node:path";

import { FileSystem, NewlineKind } from "@rushstack/node-core-library";

import type { MarkdownDocument } from "./ApiDocument.js";
import type { FileSystemConfiguration } from "./FileSystemConfiguration.js";
import {
	type ApiItemTransformationOptions,
	transformApiModel,
} from "./api-item-transforms/index.js";
import { type RenderHtmlConfiguration, renderDocumentAsHtml } from "./renderers/index.js";

/**
 * API Model HTML rendering options.
 *
 * @alpha
 */
export interface RenderApiModelAsHtmlOptions
	extends ApiItemTransformationOptions,
		RenderHtmlConfiguration,
		FileSystemConfiguration {}

/**
 * Renders the provided model and its contents, and writes each document to a file on disk.
 *
 * @alpha
 */
export async function renderApiModelAsHtml(
	options: RenderApiModelAsHtmlOptions,
): Promise<void> {
	const documents = transformApiModel(options);

	return renderDocumentsAsHtml(documents, options);
}

/**
 * Options for rendering {@link MarkdownDocument}s as HTML.
 *
 * @alpha
 */
export interface RenderDocumentsAsHtmlOptions
	extends RenderHtmlConfiguration,
		FileSystemConfiguration {}

/**
 * Renders the provided documents using HTML syntax, and writes each document to a file on disk.
 *
 * @param documents - The documents to render. Each will be rendered to its own file on disk per
 * {@link ApiDocument.documentPath} (relative to the provided output directory).
 *
 * @alpha
 */
export async function renderDocumentsAsHtml(
	documents: readonly MarkdownDocument[],
	options: RenderDocumentsAsHtmlOptions,
): Promise<void> {
	const { logger, newlineKind, outputDirectoryPath } = options;

	logger?.verbose("Rendering documents as HTML and writing to disk...");

	await FileSystem.ensureEmptyFolderAsync(outputDirectoryPath);

	await Promise.all(
		documents.map(async (document) => {
			const renderedDocument = renderDocumentAsHtml(document, options);

			const filePath = Path.join(outputDirectoryPath, `${document.documentPath}.html`);
			await FileSystem.writeFileAsync(filePath, renderedDocument.contents, {
				convertLineEndings: newlineKind ?? NewlineKind.OsDefault,
				ensureFolderExists: true,
			});
		}),
	);

	logger?.success("HTML documents written to disk.");
}
