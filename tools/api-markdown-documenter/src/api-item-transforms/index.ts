/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Library containing functionality to transform `ApiItem`s to {@link DocumentationNode}s.
 */

export {
	ApiFunctionLike,
	ApiMemberKind,
	ApiModuleLike,
	ApiSignatureLike,
	ApiModifier,
	doesItemRequireOwnDocument,
	getDefaultValueBlock,
	getDeprecatedBlock,
	getExampleBlocks,
	getHeadingForApiItem,
	getLinkForApiItem,
	getModifiers,
	getQualifiedApiItemName,
	getReleaseTag,
	getReturnsBlock,
	getSeeBlocks,
	getThrowsBlocks,
	getUnscopedPackageName,
	isDeprecated,
	isOptional,
	isReadonly,
	isStatic,
} from "./ApiItemUtilities";
export {
	type ApiItemTransformationConfiguration,
	type ApiItemTransformationOptions,
	type DefaultDocumentationSuiteOptions,
	type DocumentationSuiteOptions,
	type DocumentBoundaries,
	getApiItemTransformationConfigurationWithDefaults,
	type HierarchyBoundaries,
	type TransformApiItemWithChildren,
	type TransformApiItemWithoutChildren,
} from "./configuration";
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
} from "./helpers";
export { transformTsdocNode } from "./TsdocNodeTransforms";
export { apiItemToDocument, apiItemToSections } from "./TransformApiItem";
export { transformApiModel } from "./TransformApiModel";
