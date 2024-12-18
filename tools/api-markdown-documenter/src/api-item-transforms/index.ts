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
	type DocumentHierarchyConfig,
	type DocumentHierarchyOptions,
	type DocumentationSuiteConfiguration,
	type DocumentationSuiteOptions,
	FolderDocumentPlacement,
	type FolderHierarchyConfig,
	type FolderHierarchyOptions,
	getApiItemTransformationConfigurationWithDefaults,
	type HierarchyConfig,
	type HierarchyConfigBase,
	HierarchyKind,
	type HierarchyOptions,
	type SectionHierarchyConfig,
	type SectionHierarchyOptions,
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
