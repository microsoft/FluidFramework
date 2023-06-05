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
	getFilePathForApiItem,
	getHeadingForApiItem,
	getLinkForApiItem,
	getModifiers,
	getQualifiedApiItemName,
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
	ApiItemTransformationConfiguration,
	ApiItemTransformationOptions,
	CreateChildContentSections,
	// Consumers should not use this, it exists externally for documentation purposes only.
	type DefaultDocumentationSuiteOptions,
	DocumentationSuiteOptions,
	DocumentBoundaries,
	getApiItemTransformationConfigurationWithDefaults,
	HierarchyBoundaries,
	TransformApiItemWithChildren,
	TransformApiItemWithoutChildren,
} from "./configuration";
export { transformDocNode } from "./DocNodeTransforms";
export { apiItemToDocument, apiItemToSections } from "./TransformApiItem";
export { transformApiModel } from "./TransformApiModel";
