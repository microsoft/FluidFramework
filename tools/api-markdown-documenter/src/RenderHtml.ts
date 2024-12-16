/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Path from "node:path";

import { FileSystem, NewlineKind } from "@rushstack/node-core-library";

import type { FileSystemConfiguration } from "./FileSystemConfiguration.js";
import {
	type ApiItemTransformationConfiguration,
	transformApiModel,
} from "./api-item-transforms/index.js";
import type { DocumentNode } from "./documentation-domain/index.js";
import { type RenderDocumentAsHtmlConfig, renderDocumentAsHtml } from "./renderers/index.js";

/**
 * API Model HTML rendering options.
 *
 * @public
 */
export interface RenderApiModelAsHtmlOptions
	extends ApiItemTransformationConfiguration,
		RenderDocumentAsHtmlConfig,
		FileSystemConfiguration {}

/**
 * Renders the provided model and its contents, and writes each document to a file on disk.
 *
 * @remarks
 *
 * Which API members get their own documents and which get written to the contents of their parent is
 * determined by {@link DocumentationSuiteOptions.documentBoundaries}.
 *
 * The file paths under which the files will be generated is determined by the provided output path and the
 * following configuration properties:
 *
 * - {@link DocumentationSuiteOptions.documentBoundaries}
 * - {@link DocumentationSuiteOptions.hierarchyBoundaries}
 *
 * @param transformConfig - Configuration for transforming API items into {@link DocumentationNode}s.
 * @param renderConfig - Configuration for rendering {@link DocumentNode}s as HTML.
 * @param fileSystemConfig - Configuration for writing document files to disk.
 * @param logger - Receiver of system log data. Default: {@link defaultConsoleLogger}.
 *
 * @alpha
 */
export async function renderApiModelAsHtml(options: RenderApiModelAsHtmlOptions): Promise<void> {
	const documents = transformApiModel(options);

	return renderDocumentsAsHtml(documents, options);
}

/**
 * Options for rendering {@link DocumentNode}s as HTML.
 *
 * @public
 */
export interface RenderDocumentsAsHtmlOptions
	extends RenderDocumentAsHtmlConfig,
		FileSystemConfiguration {}

/**
 * Renders the provided documents using HTML syntax, and writes each document to a file on disk.
 *
 * @param documents - The documents to render. Each will be rendered to its own file on disk per
 * {@link DocumentNode.documentPath} (relative to the provided output directory).
 * @param renderConfig - Configuration for rendering {@link DocumentNode}s as HTML.
 * @param fileSystemConfig - Configuration for writing document files to disk.
 * @param logger - Receiver of system log data. Default: {@link defaultConsoleLogger}.
 *
 * @alpha
 */
export async function renderDocumentsAsHtml(
	documents: DocumentNode[],
	options: RenderDocumentsAsHtmlOptions,
): Promise<void> {
	const { logger, newlineKind, outputDirectoryPath } = options;

	logger?.verbose("Rendering documents as HTML and writing to disk...");

	await FileSystem.ensureEmptyFolderAsync(outputDirectoryPath);

	await Promise.all(
		documents.map(async (document) => {
			const renderedDocument = renderDocumentAsHtml(document, options);

			const filePath = Path.join(outputDirectoryPath, `${document.documentPath}.html`);
			await FileSystem.writeFileAsync(filePath, renderedDocument, {
				convertLineEndings: newlineKind ?? NewlineKind.OsDefault,
				ensureFolderExists: true,
			});
		}),
	);

	logger?.success("HTML documents written to disk.");
}
