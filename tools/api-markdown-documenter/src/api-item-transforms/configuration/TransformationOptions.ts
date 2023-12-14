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
	type ApiMethod,
	type ApiMethodSignature,
	type ApiModel,
	type ApiNamespace,
	type ApiPropertyItem,
	type ApiTypeAlias,
	type ApiVariable,
} from "@microsoft/api-extractor-model";

import { type SectionNode } from "../../documentation-domain";
import * as DefaultTransformationImplementations from "../default-implementations";
import { type ApiItemTransformationConfiguration } from "./Configuration";

/**
 * Signature for a function which generates one or more {@link SectionNode}s describing an
 * API item that potentially has child items to be rendered as content under it.
 *
 * @public
 */
export type TransformApiItemWithChildren<TApiItem extends ApiItem> = (
	apiItem: TApiItem,
	config: Required<ApiItemTransformationConfiguration>,
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
	config: Required<ApiItemTransformationConfiguration>,
) => SectionNode[];

/**
 * Transformations for generating {@link DocumentationNode} trees from different kinds of API content.
 *
 * @remarks For any transformation not explicitly configured, a default will be used.
 *
 * @public
 */
export interface ApiItemTransformationOptions {
	/**
	 * Generates the default layout used by all default API item transformations.
	 *
	 * @remarks
	 *
	 * Can be used to uniformly control the default content layout for all API item kinds.
	 *
	 * API item kind-specific details are passed in, and can be displayed as desired.
	 *
	 * @returns The list of {@link SectionNode}s that comprise the top-level section body for the API item.
	 */
	createDefaultLayout?: (
		apiItem: ApiItem,
		childSections: SectionNode[] | undefined,
		config: Required<ApiItemTransformationConfiguration>,
	) => SectionNode[];

	/**
	 * Transformation to generate a {@link SectionNode} for a `Call Signature`.
	 */
	transformApiCallSignature?: TransformApiItemWithoutChildren<ApiCallSignature>;

	/**
	 * Transformation to generate a {@link SectionNode} for a `Class`.
	 */
	transformApiClass?: TransformApiItemWithChildren<ApiClass>;

	/**
	 * Transformation to generate a {@link SectionNode} for a `Constructor`.
	 */
	transformApiConstructor?: TransformApiItemWithoutChildren<
		ApiConstructSignature | ApiConstructor
	>;

	/**
	 * Transformation to generate a {@link SectionNode} for a package `EntryPoint`.
	 *
	 * @remarks
	 *
	 * Note: for packages that have a single entry-point, this content will be bubbled up to the generated
	 * package-level document to reduce unecessary indirection in the generated suite.
	 */
	transformApiEntryPoint?: TransformApiItemWithChildren<ApiEntryPoint>;

	/**
	 * Transformation to generate a {@link SectionNode} for an `Enum`.
	 */
	transformApiEnum?: TransformApiItemWithChildren<ApiEnum>;

	/**
	 * Transformation to generate a {@link SectionNode} for an `Enum Member` (flag).
	 */
	transformApiEnumMember?: TransformApiItemWithoutChildren<ApiEnumMember>;

	/**
	 * Transformation to generate a {@link SectionNode} for a `Function`.
	 */
	transformApiFunction?: TransformApiItemWithoutChildren<ApiFunction>;

	/**
	 * Transformation to generate a {@link SectionNode} for an `Index Signature`.
	 */
	transformApiIndexSignature?: TransformApiItemWithoutChildren<ApiIndexSignature>;

	/**
	 * Transformation to generate a {@link SectionNode} for an `Interface`.
	 */
	transformApiInterface?: TransformApiItemWithChildren<ApiInterface>;

	/**
	 * Transformation to generate a {@link SectionNode} for a `Method`.
	 */
	transformApiMethod?: TransformApiItemWithoutChildren<ApiMethod | ApiMethodSignature>;

	/**
	 * Transformation to generate a {@link SectionNode} for an `ApiModel`.
	 *
	 * @remarks
	 *
	 * Note that this is a {@link TransformApiItemWithoutChildren} only because we handle `Model`
	 * and `Package` items specially. We never render `Package` child details directly to the `Modal` document.
	 * These are always rendered to seperate documents from each other.
	 */
	transformApiModel?: TransformApiItemWithoutChildren<ApiModel>;

	/**
	 * Transformation to generate a {@link SectionNode} for a `Namespace`.
	 */
	transformApiNamespace?: TransformApiItemWithChildren<ApiNamespace>;

	/**
	 * Transformation to generate a {@link SectionNode} for a `Property`.
	 */
	transformApiProperty?: TransformApiItemWithoutChildren<ApiPropertyItem>;

	/**
	 * Transformation to generate a {@link SectionNode} for a `Type Alias`.
	 */
	transformApiTypeAlias?: TransformApiItemWithoutChildren<ApiTypeAlias>;

	/**
	 * Transformation to generate a {@link SectionNode} for an `Variable`.
	 */
	transformApiVariable?: TransformApiItemWithoutChildren<ApiVariable>;
}

/**
 * The default {@link ApiItemTransformationConfiguration}.
 */
const defaultApiItemTransformationOptions: Required<ApiItemTransformationOptions> = {
	transformApiCallSignature: DefaultTransformationImplementations.transformApiItemWithoutChildren,
	transformApiClass: DefaultTransformationImplementations.transformApiClass,
	transformApiConstructor: DefaultTransformationImplementations.transformApiFunctionLike,
	transformApiEntryPoint: DefaultTransformationImplementations.transformApiEntryPoint,
	transformApiEnum: DefaultTransformationImplementations.transformApiEnum,
	transformApiEnumMember: DefaultTransformationImplementations.transformApiItemWithoutChildren,
	transformApiFunction: DefaultTransformationImplementations.transformApiFunctionLike,
	transformApiIndexSignature:
		DefaultTransformationImplementations.transformApiItemWithoutChildren,
	transformApiInterface: DefaultTransformationImplementations.transformApiInterface,
	transformApiMethod: DefaultTransformationImplementations.transformApiFunctionLike,
	transformApiModel: DefaultTransformationImplementations.transformApiModel,
	transformApiNamespace: DefaultTransformationImplementations.transformApiNamespace,
	transformApiProperty: DefaultTransformationImplementations.transformApiItemWithoutChildren,
	transformApiTypeAlias: DefaultTransformationImplementations.transformApiItemWithoutChildren,
	transformApiVariable: DefaultTransformationImplementations.transformApiItemWithoutChildren,
	createDefaultLayout: DefaultTransformationImplementations.createDefaultLayout,
};

/**
 * Gets a complete {@link ApiItemTransformationOptions} using the provided partial configuration, and filling
 * in the remainder with the documented defaults.
 */
export function getApiItemTransformationOptionsWithDefaults(
	inputOptions: ApiItemTransformationOptions,
): Required<ApiItemTransformationOptions> {
	return {
		...defaultApiItemTransformationOptions,
		...inputOptions,
	};
}
