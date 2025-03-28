/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ApiCallSignature,
	type ApiClass,
	type ApiConstructSignature,
	type ApiConstructor,
	type ApiEntryPoint,
	type ApiEnum,
	type ApiEnumMember,
	type ApiFunction,
	type ApiIndexSignature,
	type ApiInterface,
	type ApiItem,
	ApiItemKind,
	type ApiMethod,
	type ApiMethodSignature,
	type ApiModel,
	type ApiNamespace,
	type ApiProperty,
	type ApiPropertySignature,
	type ApiTypeAlias,
	type ApiVariable,
} from "@microsoft/api-extractor-model";

import type { SectionNode } from "../../documentation-domain/index.js";
import * as DefaultTransformationImplementations from "../default-implementations/index.js";

import type { ApiItemTransformationConfiguration } from "./Configuration.js";

/**
 * Signature for a function which generates one or more {@link SectionNode}s describing an
 * API item that potentially has child items to be rendered as content under it.
 *
 * @public
 */
export type TransformApiItemWithChildren<TApiItem extends ApiItem> = (
	apiItem: TApiItem,
	config: ApiItemTransformationConfiguration,
	generateChildSection: (apiItem: ApiItem) => SectionNode[],
) => SectionNode[];

/**
 * Signature for a function which generates one or more {@link SectionNode}s describing an
 * API item that *does not* have child items to be rendered.
 *
 * @public
 */
export type TransformApiItemWithoutChildren<TApiItem extends ApiItem> = (
	apiItem: TApiItem,
	config: ApiItemTransformationConfiguration,
) => SectionNode[];

/**
 * Transformations for generating {@link DocumentationNode} trees from different kinds of API content.
 *
 * @privateRemarks TODO: Make transformation for package items configurable
 *
 * @public
 */
export interface ApiItemTransformations {
	readonly [ApiItemKind.CallSignature]: TransformApiItemWithoutChildren<ApiCallSignature>;
	readonly [ApiItemKind.Class]: TransformApiItemWithChildren<ApiClass>;
	readonly [ApiItemKind.Constructor]: TransformApiItemWithoutChildren<ApiConstructor>;
	readonly [ApiItemKind.ConstructSignature]: TransformApiItemWithoutChildren<ApiConstructSignature>;

	/**
	 * `ApiEntryPoint` handler.
	 *
	 * @remarks
	 *
	 * Note: for packages that have a single entry-point, this content will be bubbled up to the generated
	 * package-level document to reduce unnecessary indirection in the generated suite.
	 */
	readonly [ApiItemKind.EntryPoint]: TransformApiItemWithChildren<ApiEntryPoint>;
	readonly [ApiItemKind.Enum]: TransformApiItemWithChildren<ApiEnum>;
	readonly [ApiItemKind.EnumMember]: TransformApiItemWithoutChildren<ApiEnumMember>;
	readonly [ApiItemKind.Function]: TransformApiItemWithoutChildren<ApiFunction>;
	readonly [ApiItemKind.IndexSignature]: TransformApiItemWithoutChildren<ApiIndexSignature>;
	readonly [ApiItemKind.Interface]: TransformApiItemWithChildren<ApiInterface>;
	readonly [ApiItemKind.Method]: TransformApiItemWithoutChildren<ApiMethod>;
	readonly [ApiItemKind.MethodSignature]: TransformApiItemWithoutChildren<ApiMethodSignature>;

	/**
	 * `ApiModel` handler.
	 *
	 * @remarks
	 *
	 * Note that this is a {@link TransformApiItemWithoutChildren} only because we handle `Model`
	 * and `Package` items specially. We never render `Package` child details directly to the `Model` document.
	 * These are always rendered to separate documents from each other.
	 */
	readonly [ApiItemKind.Model]: TransformApiItemWithoutChildren<ApiModel>;
	readonly [ApiItemKind.Namespace]: TransformApiItemWithChildren<ApiNamespace>;
	readonly [ApiItemKind.Property]: TransformApiItemWithoutChildren<ApiProperty>;
	readonly [ApiItemKind.PropertySignature]: TransformApiItemWithoutChildren<ApiPropertySignature>;
	readonly [ApiItemKind.TypeAlias]: TransformApiItemWithChildren<ApiTypeAlias>;
	readonly [ApiItemKind.Variable]: TransformApiItemWithoutChildren<ApiVariable>;
}

/**
 * The default {@link ApiItemTransformationConfiguration}.
 */
const defaultApiItemTransformationOptions: ApiItemTransformations = {
	[ApiItemKind.CallSignature]:
		DefaultTransformationImplementations.transformApiItemWithoutChildren,
	[ApiItemKind.Class]: DefaultTransformationImplementations.transformApiTypeLike,
	[ApiItemKind.Constructor]: DefaultTransformationImplementations.transformApiFunctionLike,
	[ApiItemKind.ConstructSignature]:
		DefaultTransformationImplementations.transformApiFunctionLike,
	[ApiItemKind.EntryPoint]: DefaultTransformationImplementations.transformApiEntryPoint,
	[ApiItemKind.Enum]: DefaultTransformationImplementations.transformApiEnum,
	[ApiItemKind.EnumMember]:
		DefaultTransformationImplementations.transformApiItemWithoutChildren,
	[ApiItemKind.Function]: DefaultTransformationImplementations.transformApiFunctionLike,
	[ApiItemKind.IndexSignature]:
		DefaultTransformationImplementations.transformApiItemWithoutChildren,
	[ApiItemKind.Interface]: DefaultTransformationImplementations.transformApiTypeLike,
	[ApiItemKind.Method]: DefaultTransformationImplementations.transformApiFunctionLike,
	[ApiItemKind.MethodSignature]: DefaultTransformationImplementations.transformApiFunctionLike,
	[ApiItemKind.Model]: DefaultTransformationImplementations.transformApiModel,
	[ApiItemKind.Namespace]: DefaultTransformationImplementations.transformApiNamespace,
	[ApiItemKind.Property]: DefaultTransformationImplementations.transformApiItemWithoutChildren,
	[ApiItemKind.PropertySignature]:
		DefaultTransformationImplementations.transformApiItemWithoutChildren,
	[ApiItemKind.TypeAlias]: DefaultTransformationImplementations.transformApiTypeLike,
	[ApiItemKind.Variable]: DefaultTransformationImplementations.transformApiItemWithoutChildren,
};

/**
 * Gets a complete {@link ApiItemTransformations} using the provided partial configuration, and filling
 * in the remainder with the documented defaults.
 */
export function getApiItemTransformationsWithDefaults(
	options?: Partial<ApiItemTransformations>,
): ApiItemTransformations {
	return {
		...defaultApiItemTransformationOptions,
		...options,
	};
}
