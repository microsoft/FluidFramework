/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Path from "node:path";

import { FileSystem, NewlineKind } from "@rushstack/node-core-library";

import type { FileSystemConfiguration } from "./FileSystemConfiguration.js";
import {
	type ApiItemTransformationOptions,
	transformApiModel,
} from "./api-item-transforms/index.js";
import type { DocumentNode } from "./documentation-domain/index.js";
import { type MarkdownRenderConfiguration, renderDocumentAsMarkdown } from "./renderers/index.js";

/**
 * API Model Markdown rendering options.
 *
 * @public
 */
export interface RenderApiModelAsMarkdownOptions
	extends ApiItemTransformationOptions,
		MarkdownRenderConfiguration,
		FileSystemConfiguration {}

/**
 * Renders the provided model and its contents, and writes each document to a file on disk.
 *
 * @public
 */
export async function renderApiModelAsMarkdown(
	options: RenderApiModelAsMarkdownOptions,
): Promise<void> {
	const documents = transformApiModel(options);

	return renderDocumentsAsMarkdown(documents, options);
}

/**
 * Options for rendering {@link DocumentNode}s as Markdown.
 *
 * @public
 */
export interface RenderDocumentsAsMarkdownOptions
	extends MarkdownRenderConfiguration,
		FileSystemConfiguration {}

/**
 * Renders the provided documents using Markdown syntax, and writes each document to a file on disk.
 *
 * @param documents - The documents to render. Each will be rendered to its own file on disk per
 * {@link DocumentNode.documentPath} (relative to the provided output directory).
 *
 * @public
 */
export async function renderDocumentsAsMarkdown(
	documents: readonly DocumentNode[],
	options: RenderDocumentsAsMarkdownOptions,
): Promise<void> {
	const { logger, newlineKind, outputDirectoryPath } = options;

	logger?.verbose("Rendering documents as Markdown and writing to disk...");

	await FileSystem.ensureEmptyFolderAsync(outputDirectoryPath);

	await Promise.all(
		documents.map(async (document) => {
			const renderedDocument = renderDocumentAsMarkdown(document, options);

			const filePath = Path.join(outputDirectoryPath, `${document.documentPath}.md`);
			await FileSystem.writeFileAsync(filePath, renderedDocument, {
				convertLineEndings: newlineKind ?? NewlineKind.OsDefault,
				ensureFolderExists: true,
			});
		}),
	);

	logger?.success("Markdown documents written to disk.");
}
