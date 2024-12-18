/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Library containing functionality to transform `ApiItem`s to {@link DocumentationNode}s.
 */

export {
	doesItemRequireOwnDocument,
	doesItemKindRequireOwnDocument,
	filterItems,
	getFilteredParent,
	getHeadingForApiItem,
	getLinkForApiItem,
	shouldItemBeIncluded,
} from "./ApiItemTransformUtilities.js";
export {
	type ApiItemTransformationConfiguration,
	type ApiItemTransformationConfigurationBase,
	type ApiItemTransformationOptions,
	type ApiItemTransformations,
	type DefaultDocumentationSuiteOptions,
	type DocumentHierarchyConfiguration,
	type DocumentHierarchyProperties,
	type DocumentationSuiteConfiguration,
	type DocumentationSuiteOptions,
	FolderDocumentPlacement,
	type FolderHierarchyConfiguration,
	type FolderHierarchyProperties,
	getApiItemTransformationConfigurationWithDefaults,
	type DocumentationHierarchyConfiguration,
	type DocumentationHierarchyConfigurationBase,
	HierarchyKind,
	type HierarchyConfiguration,
	type SectionHierarchyConfiguration,
	type SectionHierarchyProperties,
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
