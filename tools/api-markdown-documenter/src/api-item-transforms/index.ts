/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Library containing functionality to transform `ApiItem`s to {@link DocumentationNode}s.
 */

export {
	doesItemRequireOwnDocument,
	filterItems,
	getHeadingForApiItem,
	getLinkForApiItem,
	shouldItemBeIncluded,
} from "./ApiItemTransformUtilities.js";
export {
	type ApiItemTransformationConfiguration,
	type ApiItemTransformationOptions,
	type DefaultDocumentationSuiteOptions,
	defaultHierarchyConfig,
	type DocumentHierarchyConfig,
	type DocumentHierarchyOptions,
	type DocumentationSuiteOptions,
	FolderDocumentPlacement,
	type FolderHierarchyConfig,
	type FolderHierarchyOptions,
	getApiItemTransformationConfigurationWithDefaults,
	type HierarchyConfig,
	type HierarchyConfigBase,
	HierarchyKind,
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
