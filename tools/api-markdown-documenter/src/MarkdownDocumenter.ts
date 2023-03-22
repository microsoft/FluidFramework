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
	MarkdownRenderers,
	getMarkdownRenderConfigurationWithDefaults,
	renderDocumentAsMarkdown,
} from "./markdown-renderer";

/**
 * This module contains the primary rendering entrypoints to the system.
 *
 * @remarks
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
 * Which API members get their own documents and which get written to the contents of their parent is
 * determined by {@link DocumentationSuiteOptions.documentBoundaries}.
 *
 * @param transformConfig - A partial {@link ApiItemTransformationConfiguration}.
 * Missing values will be filled in with defaults via {@link getApiItemTransformationConfigurationWithDefaults}.
 */
export function transformApiModel(
	transformConfig: ApiItemTransformationConfiguration,
): DocumentNode[] {
	const config = getApiItemTransformationConfigurationWithDefaults(transformConfig);
	const apiModel = config.apiModel;

	config.logger.info(
		`Generating Markdown documentation for API Model ${apiModel.displayName}...`,
	);

	const documents: DocumentNode[] = [];

	// Always render Model document
	documents.push(apiModelToDocument(apiModel, config));

	const filteredPackages = apiModel.packages.filter(
		(apiPackage) => !config.skipPackage(apiPackage),
	);
	if (filteredPackages.length > 0) {
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
	}

	config.logger.success("Documents generated!");

	return documents;
}

/**
 * Renders the provided model and its contents, and writes each document to a file on disk.
 *
 * @remarks
 * Which API members get their own documents and which get written to the contents of their parent is
 * determined by {@link DocumentationSuiteOptions.documentBoundaries}.
 *
 * The file paths under which the files will be saved is determined by the provided output path and the
 * following configuration properties:
 *
 * - {@link DocumentationSuiteOptions.documentBoundaries}
 * - {@link DocumentationSuiteOptions.hierarchyBoundaries}
 *
 * @param apiModel - The API model being processed.
 * This is the output of {@link https://api-extractor.com/ | API-Extractor}.
 * @param transformConfig - A partial {@link ApiItemTransformationConfiguration}.
 * Missing values will be filled in with defaults via {@link getApiItemTransformationConfigurationWithDefaults}.
 * @param customRenderers - Custom {@link DocumentationNode} Markdown renderers.
 * Specified per {@link DocumentationNode."type"}.
 */
export async function renderApiModelAsMarkdown(
	transformConfig: ApiItemTransformationConfiguration,
	renderConfig: MarkdownRenderConfiguration,
	outputDirectoryPath: string,
	customRenderers?: MarkdownRenderers,
): Promise<void> {
	const completeTransformConfig =
		getApiItemTransformationConfigurationWithDefaults(transformConfig);
	const completeRenderConfig = getMarkdownRenderConfigurationWithDefaults(renderConfig);

	await FileSystem.ensureEmptyFolderAsync(outputDirectoryPath);

	const documents = transformApiModel(completeTransformConfig);

	await Promise.all(
		documents.map(async (document) => {
			const renderedDocument = renderDocumentAsMarkdown(document, customRenderers);

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
