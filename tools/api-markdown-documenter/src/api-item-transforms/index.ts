/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Library containing functionality to transform `ApiItem`s to {@link DocumentationNode}s.
 */

export {
	createQualifiedDocumentNameForApiItem,
	doesItemRequireOwnDocument,
	doesItemKindRequireOwnDocument,
	filterItems,
	getHeadingForApiItem,
	getLinkForApiItem,
	shouldItemBeIncluded,
} from "./ApiItemTransformUtilities.js";
export {
	type ApiItemTransformationConfiguration,
	type ApiItemTransformationConfigurationBase,
	type ApiItemTransformationOptions,
	type ApiItemTransformations,
	type DefaultDocumentationSuiteConfiguration,
	type DocumentHierarchyConfiguration,
	type DocumentationSuiteConfiguration,
	type DocumentationSuiteOptions,
	FolderDocumentPlacement,
	type FolderHierarchyConfiguration,
	getApiItemTransformationConfigurationWithDefaults,
	type DocumentationHierarchyConfiguration,
	type DocumentationHierarchyConfigurationBase,
	HierarchyKind,
	type HierarchyConfiguration,
	type HierarchyOptions,
	type SectionHierarchyConfiguration,
	type TransformApiItemWithChildren,
	type TransformApiItemWithoutChildren,
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
	createSummaryParagraph,
	createThrowsSection,
	createTypeParametersSection,
} from "./helpers/index.js";
export { transformTsdocNode } from "./TsdocNodeTransforms.js";
export { apiItemToDocument, apiItemToSections } from "./TransformApiItem.js";
export { transformApiModel } from "./TransformApiModel.js";
export { checkForDuplicateDocumentPaths } from "./Utilities.js";
