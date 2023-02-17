/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Library containing functionality to transform `ApiItem`s to {@link DocumentationNode}s.
 */

export {
	ApiItemTransformationConfiguration,
	CreateChildContentSections,
	defaultApiItemTransformations,
	TransformApiItemWithChildren,
	TransformApiItemWithoutChildren,
} from "./Configuration";
export { apiItemToDocument, apiItemToSections } from "./TransformApiItem";
export { apiPackageToDocument } from "./TransformApiPackage";
export { apiModelToDocument } from "./TransformModel";
export { transformDocNode, DocNodeTransformOptions } from "./DocNodeTransforms";
