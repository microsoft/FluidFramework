/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as Path from "node:path";

import { ApiItem } from "@microsoft/api-extractor-model";
import { FileSystem } from "@rushstack/node-core-library";

import {
	ApiItemTransformationConfiguration,
	apiItemToDocument,
	apiModelToDocument,
	apiPackageToDocument,
	doesItemRequireOwnDocument,
	getApiItemTransformationConfigurationWithDefaults,
} from "./api-item-transforms";
import { DocumentNode } from "./documentation-domain";
import {
	MarkdownRenderConfiguration,
	getMarkdownRenderConfigurationWithDefaults,
	renderDocumentAsMarkdown,
} from "./markdown-renderer";

/**
 * This module contains the primary rendering entrypoints to the system.
 *
 * @remarks
 *
 * This implementation is based on API-Documenter's standard MarkdownDocumenter implementation,
 * but has been updated to be used programmatically rather than just from a CLI, and to be more extensible.
 *
 * The reference implementation can be found
 * {@link https://github.com/microsoft/rushstack/blob/main/apps/api-documenter/src/documenters/MarkdownDocumenter.ts
 * | here}.
 */

/**
 * Renders the provided model and its contents to a series of {@link DocumentNode}s.
 *
 * @remarks
 *
 * Which API members get their own documents and which get written to the contents of their parent is
 * determined by {@link DocumentationSuiteOptions.documentBoundaries}.
 *
 * The generated nodes' {@link DocumentNode.filePath}s are determined by the provided output path and the
 * following configuration properties:
 *
 * - {@link DocumentationSuiteOptions.documentBoundaries}
 * - {@link DocumentationSuiteOptions.hierarchyBoundaries}
 *
 * @param transformConfig - Configuration for transforming API items into {@link DocumentationNode}s.
 */
export function transformApiModel(
	transformConfig: ApiItemTransformationConfiguration,
): DocumentNode[] {
	const config = getApiItemTransformationConfigurationWithDefaults(transformConfig);
	const { apiModel, logger } = config;

	logger.info(`Generating Markdown documentation for API Model ${apiModel.displayName}...`);

	const documents: DocumentNode[] = [];

	// Always render Model document (this is the "root" of the generated documentation suite).
	documents.push(apiModelToDocument(apiModel, config));

	const packages = apiModel.packages;

	if (packages.length === 0) {
		logger.warning("No packages found.");
		return [];
	}

	// Filter out packages not wanted per user config
	const filteredPackages = apiModel.packages.filter(
		(apiPackage) => !config.skipPackage(apiPackage),
	);

	if (filteredPackages.length === 0) {
		logger.warning("No packages found after filtering per `skipPackages` configuration.");
		return [];
	}

	// For each package, walk the child graph to find API items which should be rendered to their own document
	// per provided document boundaries configuration.

	for (const packageItem of filteredPackages) {
		// Always render documents for packages under the model
		documents.push(apiPackageToDocument(packageItem, config));

		const packageEntryPoints = packageItem.entryPoints;
		if (packageEntryPoints.length !== 1) {
			throw new Error(
				`Encountered multiple EntryPoint items under package "${packageItem.name}". ` +
					"API-Extractor only supports single-entry packages, so this should not be possible.",
			);
		}

		const packageEntryPointItem = packageEntryPoints[0];

		const packageDocumentItems = getDocumentItems(packageEntryPointItem, config);
		for (const apiItem of packageDocumentItems) {
			documents.push(apiItemToDocument(apiItem, config));
		}
	}

	logger.success("Documents generated!");

	return documents;
}

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
 */
export async function renderDocumentsAsMarkdown(
	documents: DocumentNode[],
	config: MarkdownRenderConfiguration,
	outputDirectoryPath: string,
): Promise<void> {
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
	console.log("Documents written to disk.");
}

/**
 * Walks the provided API item's member tree and reports all API items that should be rendered to their own documents.
 *
 * @param apiItem - The API item in question.
 * @param transformConfig - See {@link ApiItemTransformationConfiguration}
 */
function getDocumentItems(
	apiItem: ApiItem,
	transformConfig: Required<ApiItemTransformationConfiguration>,
): ApiItem[] {
	const result: ApiItem[] = [];
	for (const childItem of apiItem.members) {
		if (doesItemRequireOwnDocument(childItem, transformConfig.documentBoundaries)) {
			result.push(childItem);
		}
		result.push(...getDocumentItems(childItem, transformConfig));
	}
	return result;
}
