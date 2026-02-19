/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Library containing functionality to transform `ApiItem`s to Markdown.
 */

export {
	type ApiItemTransformationConfiguration,
	type ApiItemTransformationConfigurationBase,
	type ApiItemTransformationOptions,
	type ApiItemTransformations,
	type DefaultDocumentationSuiteConfiguration,
	type DocumentHierarchyConfiguration,
	type DocumentationHierarchyConfiguration,
	type DocumentationHierarchyConfigurationBase,
	type DocumentationSuiteConfiguration,
	type DocumentationSuiteOptions,
	FolderDocumentPlacement,
	type FolderHierarchyConfiguration,
	type HierarchyConfiguration,
	HierarchyKind,
	type HierarchyOptions,
	type SectionHierarchyConfiguration,
	type TransformApiItemWithChildren,
	type TransformApiItemWithoutChildren,
	getApiItemTransformationConfigurationWithDefaults,
} from "./configuration/index.js";
export {
	createBreadcrumbParagraph,
	createDeprecationNoticeSection,
	createExamplesSection,
	createParametersSection,
	createRemarksSection,
	createReturnsSection,
	createSeeAlsoSection,
	createSignatureSection,
	createSummarySection,
	createThrowsSection,
	createTypeParametersSection,
} from "./helpers/index.js";
export { apiItemToDocument, apiItemToSections } from "./TransformApiItem.js";
export { transformApiModel } from "./TransformApiModel.js";
export { transformTsdoc } from "./TsdocNodeTransforms.js";
export {
	checkForDuplicateDocumentPaths,
	createQualifiedDocumentNameForApiItem,
	doesItemKindRequireOwnDocument,
	doesItemRequireOwnDocument,
	filterItems,
	getHeadingForApiItem,
	getLinkForApiItem,
	shouldItemBeIncluded,
} from "./utilities/index.js";
