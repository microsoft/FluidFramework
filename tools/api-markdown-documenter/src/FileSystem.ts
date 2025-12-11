/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Path from "node:path";

import { FileSystem, NewlineKind } from "@rushstack/node-core-library";

import type { RenderedDocument } from "./ApiDocument.js";
import type { LoggingConfiguration } from "./LoggingConfiguration.js";

/**
 * Options for writing {@link RenderedDocument}s to disk.
 *
 * @public
 */
export interface SaveDocumentsOptions extends LoggingConfiguration {
	/**
	 * The directory under which the document files will be generated.
	 */
	readonly outputDirectoryPath: string;

	/**
	 * Specifies what type of newlines API Documenter should use when writing output files.
	 *
	 * @defaultValue {@link @rushstack/node-core-library#NewlineKind.OsDefault}
	 */
	readonly newlineKind?: NewlineKind;
}

/**
 * Renders the provided documents using Markdown syntax, and writes each document to a file on disk.
 *
 * @param documents - The rendered documents to write to disk. Each will be rendered to its own file on disk per
 * {@link ApiDocument.documentPath} (relative to the provided output directory).
 *
 * @public
 */
export async function saveDocuments(
	documents: readonly RenderedDocument[],
	options: SaveDocumentsOptions,
): Promise<void> {
	const { logger, newlineKind, outputDirectoryPath } = options;

	logger?.verbose(`Writing ${documents.length} documents to disk...`);

	await FileSystem.ensureEmptyFolderAsync(outputDirectoryPath);

	await Promise.all(
		documents.map(async (document) => {
			const filePath = Path.join(outputDirectoryPath, document.filePath);
			await FileSystem.writeFileAsync(filePath, document.contents, {
				convertLineEndings: newlineKind ?? NewlineKind.OsDefault,
				ensureFolderExists: true,
			});
		}),
	);

	logger?.success("Documents written to disk.");
}
