/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ApiEntryPoint, ApiItem, ApiModel, ApiPackage } from "@microsoft/api-extractor-model";

import { DocumentNode, SectionNode } from "../documentation-domain";
import { createDocument } from "./Utilities";
import {
	ApiItemTransformationConfiguration,
	getApiItemTransformationConfigurationWithDefaults,
} from "./configuration";
import { doesItemRequireOwnDocument } from "./ApiItemUtilities";
import { createBreadcrumbParagraph, createEntryPointList, wrapInSection } from "./helpers";
import { apiItemToDocument, apiItemToSections } from "./TransformApiItem";

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
	const { apiModel, logger, skipPackage } = config;

	logger.verbose(`Generating documentation for API Model...`);

	// If a package has multiple entry-points, it's possible for the same API item to appear under more than one
	// entry-point (i.e., we are traversing a graph, rather than a tree).
	// To avoid redundant computation, we will keep a ledger of which API items we have transformed.
	const documents: Map<ApiItem, DocumentNode> = new Map<ApiItem, DocumentNode>();

	// Always render Model document (this is the "root" of the generated documentation suite).
	documents.set(apiModel, createDocumentForApiModel(apiModel, config));

	const packages = apiModel.packages;

	if (packages.length === 0) {
		logger.warning("No packages found.");
		return [];
	}

	// Filter out packages not wanted per user config
	const filteredPackages = apiModel.packages.filter((apiPackage) => !skipPackage(apiPackage));

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

			documents.set(
				packageItem,
				createDocumentForSingleEntryPointPackage(packageItem, entryPoint, config),
			);

			const packageDocumentItems = getDocumentItems(entryPoint, config);
			for (const apiItem of packageDocumentItems) {
				if (!documents.has(apiItem)) {
					documents.set(apiItem, apiItemToDocument(apiItem, config));
				}
			}
		} else {
			// If a package contains multiple entry-points, we will generate a separate document for each.
			// The package-level document will enumerate the entry-points.

			documents.set(
				packageItem,
				createDocumentForMultiEntryPointPackage(packageItem, packageEntryPoints, config),
			);

			for (const entryPoint of packageEntryPoints) {
				documents.set(entryPoint, createDocumentForApiEntryPoint(entryPoint, config));

				const packageDocumentItems = getDocumentItems(entryPoint, config);
				for (const apiItem of packageDocumentItems) {
					if (!documents.has(apiItem)) {
						documents.set(apiItem, apiItemToDocument(apiItem, config));
					}
				}
			}
		}
	}

	logger.success("API Model documents generated!");

	return [...documents.values()];
}

/**
 * Walks the provided API item's member tree and reports all API items that should be rendered to their own documents.
 *
 * @param apiItem - The API item in question.
 * @param config - See {@link ApiItemTransformationConfiguration}
 */
function getDocumentItems(
	apiItem: ApiItem,
	config: Required<ApiItemTransformationConfiguration>,
): ApiItem[] {
	const { documentBoundaries } = config;

	const result: ApiItem[] = [];
	for (const childItem of apiItem.members) {
		if (doesItemRequireOwnDocument(childItem, documentBoundaries)) {
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
	config: Required<ApiItemTransformationConfiguration>,
): DocumentNode {
	const { logger, transformApiModel: createModelBodySections } = config;

	logger.verbose(`Generating API Model document...`);

	// Note: We don't render the breadcrumb for Model document, as it is always the root of the file hierarchical

	// Render body contents
	const sections = createModelBodySections(apiModel, config);

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
	config: Required<ApiItemTransformationConfiguration>,
): DocumentNode {
	const { includeBreadcrumb, logger, transformApiEntryPoint } = config;

	logger.verbose(`Generating ${apiPackage.name} package document...`);

	const sections: SectionNode[] = [];

	// Render breadcrumb
	if (includeBreadcrumb) {
		sections.push(wrapInSection([createBreadcrumbParagraph(apiPackage, config)]));
	}

	// Render sub-sections for the single entry-point. We will bundle these with body comments from the package item.
	const entryPointSections = transformApiEntryPoint(apiEntryPoint, config, (childItem) =>
		apiItemToSections(childItem, config),
	);

	// Wrap entry-point contents with package-level docs
	sections.push(...config.createChildContentSections(apiPackage, entryPointSections, config));

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
	config: Required<ApiItemTransformationConfiguration>,
): DocumentNode {
	const { includeBreadcrumb, logger } = config;

	logger.verbose(`Generating ${apiPackage.name} package document...`);

	const sections: SectionNode[] = [];

	// Render breadcrumb
	if (includeBreadcrumb) {
		sections.push(wrapInSection([createBreadcrumbParagraph(apiPackage, config)]));
	}

	// Render list of entry-points
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
	config: Required<ApiItemTransformationConfiguration>,
): DocumentNode {
	const { includeBreadcrumb, logger, transformApiEntryPoint } = config;

	logger.verbose(`Generating ${apiEntryPoint.displayName} API entry-point document...`);

	const sections: SectionNode[] = [];

	// Render breadcrumb
	if (includeBreadcrumb) {
		sections.push(wrapInSection([createBreadcrumbParagraph(apiEntryPoint, config)]));
	}

	// Render body contents
	sections.push(
		...transformApiEntryPoint(apiEntryPoint, config, (childItem) =>
			apiItemToSections(childItem, config),
		),
	);

	logger.verbose(`Entry-point document rendered successfully.`);

	return createDocument(apiEntryPoint, sections, config);
}
