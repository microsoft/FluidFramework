/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ApiItem } from "@microsoft/api-extractor-model";

import {
	ApiItemTransformationConfiguration,
	apiItemToDocument,
	apiModelToDocument,
	apiPackageToDocument,
	doesItemRequireOwnDocument,
	getApiItemTransformationConfigurationWithDefaults,
} from "./api-item-transforms";
import { DocumentNode } from "./documentation-domain";

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
