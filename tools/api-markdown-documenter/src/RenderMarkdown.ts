/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as Path from "node:path";

import { FileSystem } from "@rushstack/node-core-library";

import {
	ApiItemTransformationConfiguration,
	getApiItemTransformationConfigurationWithDefaults,
	transformApiModel,
} from "./api-item-transforms";
import { DocumentNode } from "./documentation-domain";
import {
	MarkdownRenderConfiguration,
	getMarkdownRenderConfigurationWithDefaults,
	renderDocumentAsMarkdown,
} from "./markdown-renderer";

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
 * @param renderConfig - Configuration for rendering {@link DocumentNode}s as Markdown.
 * @param outputDirectoryPath - The directory under which the document files will be generated.
 *
 * @public
 */
export async function renderApiModelAsMarkdown(
	transformConfig: ApiItemTransformationConfiguration,
	renderConfig: MarkdownRenderConfiguration,
	outputDirectoryPath: string,
): Promise<void> {
	const completeTransformConfig =
		getApiItemTransformationConfigurationWithDefaults(transformConfig);

	const documents = transformApiModel(completeTransformConfig);

	return renderDocumentsAsMarkdown(documents, renderConfig, outputDirectoryPath);
}

/**
 * Renders the provided documents using Markdown syntax, and writes each document to a file on disk.
 *
 * @param documents - The documents to render. Each will be rendered to its own file on disk per
 * {@link DocumentNode.filePath} (relative to the provided output directory).
 *
 * @param config - A partial {@link MarkdownRenderConfiguration}.
 * Missing values will be filled in with system defaults.
 *
 * @param outputDirectoryPath - The directory under which the document files will be generated.
 *
 * @public
 */
export async function renderDocumentsAsMarkdown(
	documents: DocumentNode[],
	config: MarkdownRenderConfiguration,
	outputDirectoryPath: string,
): Promise<void> {
	const { logger } = config;

	logger?.verbose("Rendering documents as Markdown and writing to disk...");

	const completeRenderConfig = getMarkdownRenderConfigurationWithDefaults(config);

	await FileSystem.ensureEmptyFolderAsync(outputDirectoryPath);

	await Promise.all(
		documents.map(async (document) => {
			const renderedDocument = renderDocumentAsMarkdown(document, config);

			const filePath = Path.join(outputDirectoryPath, document.filePath);
			await FileSystem.writeFileAsync(filePath, renderedDocument, {
				convertLineEndings: completeRenderConfig.newlineKind,
				ensureFolderExists: true,
			});
		}),
	);

	logger?.success("Markdown documents written to disk.");
}
