/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ApiItemKind,
	type ApiEntryPoint,
	type ApiItem,
	type ApiModel,
	type ApiPackage,
} from "@microsoft/api-extractor-model";

import type { DocumentNode, SectionNode } from "../documentation-domain/index.js";

import { doesItemRequireOwnDocument, shouldItemBeIncluded } from "./ApiItemTransformUtilities.js";
import { apiItemToDocument, apiItemToSections } from "./TransformApiItem.js";
import { checkForDuplicateDocumentPaths, createDocument } from "./Utilities.js";
import {
	type ApiItemTransformationConfiguration,
	type ApiItemTransformationOptions,
	getApiItemTransformationConfigurationWithDefaults,
} from "./configuration/index.js";
import { createBreadcrumbParagraph, createEntryPointList, wrapInSection } from "./helpers/index.js";

/**
 * Renders the provided model and its contents to a series of {@link DocumentNode}s.
 *
 * @public
 */
export function transformApiModel(options: ApiItemTransformationOptions): DocumentNode[] {
	const config = getApiItemTransformationConfigurationWithDefaults(options);
	const { apiModel, logger, excludeItem } = config;

	logger.verbose(`Generating documentation for API Model...`);

	// If a package has multiple entry-points, it's possible for the same API item to appear under more than one
	// entry-point (i.e., we are traversing a graph, rather than a tree).
	// To avoid redundant computation, we will keep a ledger of which API items we have transformed.
	const documentsMap: Map<ApiItem, DocumentNode> = new Map<ApiItem, DocumentNode>();

	// Always render Model document (this is the "root" of the generated documentation suite).
	documentsMap.set(apiModel, createDocumentForApiModel(apiModel, config));

	const packages = apiModel.packages;

	if (packages.length === 0) {
		logger.warning("No packages found.");
		return [];
	}

	// Filter out packages not wanted per user config
	const filteredPackages = apiModel.packages.filter((apiPackage) => !excludeItem(apiPackage));

	if (filteredPackages.length === 0) {
		logger.warning("No packages found after filtering per `skipPackages` configuration.");
		return [];
	}

	// For each package, walk the child graph to find API items which should be rendered to their own document
	// per provided document boundaries configuration.

	for (const packageItem of filteredPackages) {
		const packageEntryPoints = packageItem.entryPoints;

		if (packageEntryPoints.length === 0) {
			throw new Error(
				`Package "${packageItem.name}" contains no entry-point. This is not expected.`,
			);
		}

		if (packageEntryPoints.length === 1) {
			// If a package only contains a single entry-point, we will bubble up the entry-point's contents
			// directly into the package-level document.

			const entryPoint = packageEntryPoints[0];

			documentsMap.set(
				packageItem,
				createDocumentForSingleEntryPointPackage(packageItem, entryPoint, config),
			);

			const packageDocumentItems = getDocumentItems(entryPoint, config);
			for (const apiItem of packageDocumentItems) {
				if (!documentsMap.has(apiItem)) {
					documentsMap.set(apiItem, apiItemToDocument(apiItem, config));
				}
			}
		} else {
			// If a package contains multiple entry-points, we will generate a separate document for each.
			// The package-level document will enumerate the entry-points.

			documentsMap.set(
				packageItem,
				createDocumentForMultiEntryPointPackage(packageItem, packageEntryPoints, config),
			);

			for (const entryPoint of packageEntryPoints) {
				documentsMap.set(entryPoint, createDocumentForApiEntryPoint(entryPoint, config));

				const packageDocumentItems = getDocumentItems(entryPoint, config);
				for (const apiItem of packageDocumentItems) {
					if (!documentsMap.has(apiItem)) {
						documentsMap.set(apiItem, apiItemToDocument(apiItem, config));
					}
				}
			}
		}
	}

	const documents = [...documentsMap.values()];

	try {
		checkForDuplicateDocumentPaths(documents);
	} catch (error: unknown) {
		logger.warning((error as Error).message);
	}

	logger.success("API Model documents generated!");
	return documents;
}

/**
 * Walks the provided API item's member tree and reports all API items that should be rendered to their own documents.
 *
 * @param apiItem - The API item in question.
 * @param config - See {@link ApiItemTransformationConfiguration}
 */
function getDocumentItems(apiItem: ApiItem, config: ApiItemTransformationConfiguration): ApiItem[] {
	const { hierarchy } = config;

	const result: ApiItem[] = [];
	for (const childItem of apiItem.members) {
		if (
			shouldItemBeIncluded(childItem, config) &&
			doesItemRequireOwnDocument(childItem, hierarchy)
		) {
			result.push(childItem);
		}
		result.push(...getDocumentItems(childItem, config));
	}
	return result;
}

/**
 * Generates a {@link DocumentNode} for the specified `apiModel`.
 *
 * @param apiModel - The API model content to be rendered. Represents the root of the API suite.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 *
 * @returns The rendered Markdown document.
 */
function createDocumentForApiModel(
	apiModel: ApiModel,
	config: ApiItemTransformationConfiguration,
): DocumentNode {
	const { logger, transformations } = config;

	logger.verbose(`Generating API Model document...`);

	// Note: We don't render the breadcrumb for Model document, as it is always the root of the file hierarchy.

	// Render body contents
	const sections = transformations[ApiItemKind.Model](apiModel, config);

	logger.verbose(`API Model document rendered successfully.`);

	return createDocument(apiModel, sections, config);
}

/**
 * Creates a {@link DocumentNode} for an `ApiPackage` that has a single entry-point.
 *
 * Bubbles up the entry-point's contents into the package-level document to reduce indirection in the generated
 * documentation.
 *
 * @param apiPackage - The package content to be rendered.
 * @param apiEntryPoint - The package's single entry-point.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 *
 * @returns The rendered Markdown document.
 */
function createDocumentForSingleEntryPointPackage(
	apiPackage: ApiPackage,
	apiEntryPoint: ApiEntryPoint,
	config: ApiItemTransformationConfiguration,
): DocumentNode {
	const { includeBreadcrumb, logger, transformations } = config;

	logger.verbose(`Generating ${apiPackage.name} package document...`);

	const sections: SectionNode[] = [];

	// Render breadcrumb
	if (includeBreadcrumb) {
		sections.push(wrapInSection([createBreadcrumbParagraph(apiPackage, config)]));
	}

	// Render sub-sections for the single entry-point. We will bundle these with body comments from the package item.
	const entryPointSections = transformations[ApiItemKind.EntryPoint](
		apiEntryPoint,
		config,
		(childItem) => apiItemToSections(childItem, config),
	);

	// Wrap entry-point contents with package-level docs
	// TODO: Make package transformation configurable
	sections.push(...config.defaultSectionLayout(apiPackage, entryPointSections, config));

	logger.verbose(`Package document rendered successfully.`);

	return createDocument(apiPackage, sections, config);
}

/**
 * Creates a {@link DocumentNode} for an `ApiPackage` that has a 2 or more entry-points.
 *
 * The document will include a list of links to the entry-points, which will have their own documents generated.
 *
 * @param apiPackage - The package content to be rendered.
 * @param apiEntryPoints - The package's single entry-point.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 *
 * @returns The rendered Markdown document.
 */
function createDocumentForMultiEntryPointPackage(
	apiPackage: ApiPackage,
	apiEntryPoints: readonly ApiEntryPoint[],
	config: ApiItemTransformationConfiguration,
): DocumentNode {
	const { includeBreadcrumb, logger } = config;

	logger.verbose(`Generating ${apiPackage.name} package document...`);

	const sections: SectionNode[] = [];

	// Render breadcrumb
	if (includeBreadcrumb) {
		sections.push(wrapInSection([createBreadcrumbParagraph(apiPackage, config)]));
	}

	// Render list of links to entry-points, each of which will get its own document.
	const renderedEntryPointList = createEntryPointList(apiEntryPoints, config);
	if (renderedEntryPointList !== undefined) {
		sections.push(
			wrapInSection([renderedEntryPointList], {
				title: "Entry Points",
			}),
		);
	}

	logger.verbose(`Package document rendered successfully.`);

	return createDocument(apiPackage, sections, config);
}

function createDocumentForApiEntryPoint(
	apiEntryPoint: ApiEntryPoint,
	config: ApiItemTransformationConfiguration,
): DocumentNode {
	const { includeBreadcrumb, logger, transformations } = config;

	logger.verbose(`Generating ${apiEntryPoint.displayName} API entry-point document...`);

	const sections: SectionNode[] = [];

	// Render breadcrumb
	if (includeBreadcrumb) {
		sections.push(wrapInSection([createBreadcrumbParagraph(apiEntryPoint, config)]));
	}

	// Render body contents
	sections.push(
		...transformations[ApiItemKind.EntryPoint](apiEntryPoint, config, (childItem) =>
			apiItemToSections(childItem, config),
		),
	);

	logger.verbose(`Entry-point document rendered successfully.`);

	return createDocument(apiEntryPoint, sections, config);
}
