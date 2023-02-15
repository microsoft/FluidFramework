/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	ApiCallSignature,
	ApiClass,
	ApiConstructSignature,
	ApiConstructor,
	ApiEnum,
	ApiEnumMember,
	ApiFunction,
	ApiIndexSignature,
	ApiInterface,
	ApiItem,
	ApiMethod,
	ApiMethodSignature,
	ApiModel,
	ApiNamespace,
	ApiPackage,
	ApiPropertyItem,
	ApiTypeAlias,
	ApiVariable,
} from "@microsoft/api-extractor-model";

import { MarkdownDocumenterConfiguration } from "../Configuration";
import { SectionNode } from "../documentation-domain";
import * as DefaultTransformationImplementations from "./default-implementations";

/**
 * This module contains transformation-policy-related types that are consumed via the {@link MarkdownDocumenterConfiguration}.
 */

/**
 * Signature for a function which generates one or more {@link SectionNode}s describing an
 * API item that potentially has child items to be rendered as content under it.
 */
export type TransformApiItemWithChildren<TApiItem extends ApiItem> = (
	apiItem: TApiItem,
	config: Required<MarkdownDocumenterConfiguration>,
	generateChildSection: (apiItem: ApiItem) => SectionNode[],
) => SectionNode[];

/**
 * Signature for a function which generates one or more {@link SectionNode}s describing an
 * API item that *does not* have child items to be rendered.
 */
export type TransformApiItemWithoutChildren<TApiItem extends ApiItem> = (
	apiItem: TApiItem,
	config: Required<MarkdownDocumenterConfiguration>,
) => SectionNode[];

/**
 * Signature for a function which generates information about an API item with inner content injected
 * into the same section.
 */
export type CreateChildContentSections = (
	apiItem: ApiItem,
	childSections: SectionNode[] | undefined,
	config: Required<MarkdownDocumenterConfiguration>,
) => SectionNode[];

/**
 * Policies for transforming different kinds of API content into {@link DocumentationNode} trees.
 *
 * @remarks
 *
 * For any policies not explicitly provided, {@link defaultApiItemTransformations} will be used to
 * supply defaults.
 */
export interface ApiItemTransformationConfiguration {
	/**
	 * Policy for transforming a section describing a `Call Signature`.
	 */
	transformApiCallSignature?: TransformApiItemWithoutChildren<ApiCallSignature>;

	/**
	 * Policy for transforming a section describing a `Class`.
	 */
	transformApiClass?: TransformApiItemWithChildren<ApiClass>;

	/**
	 * Policy for transforming a section describing a `Constructor`.
	 */
	transformApiConstructor?: TransformApiItemWithoutChildren<
		ApiConstructSignature | ApiConstructor
	>;

	/**
	 * Policy for transforming a section describing an `Enum`.
	 */
	transformApiEnum?: TransformApiItemWithChildren<ApiEnum>;

	/**
	 * Policy for transforming a section describing an `Enum Member`.
	 */
	transformApiEnumMember?: TransformApiItemWithoutChildren<ApiEnumMember>;

	/**
	 * Policy for transforming a section describing a `Function`.
	 */
	transformApiFunction?: TransformApiItemWithoutChildren<ApiFunction>;

	/**
	 * Policy for transforming a section describing an `Index Signature`.
	 */
	transformApiIndexSignature?: TransformApiItemWithoutChildren<ApiIndexSignature>;

	/**
	 * Policy for transforming a section describing an `Interface`.
	 */
	transformApiInterface?: TransformApiItemWithChildren<ApiInterface>;

	/**
	 * Policy for transforming a section describing a `Method`.
	 */
	transformApiMethod?: TransformApiItemWithoutChildren<ApiMethod | ApiMethodSignature>;

	/**
	 * Policy for transforming a section describing a `Model`.
	 *
	 * @remarks Note that this is a {@link TransformApiItemWithoutChildren} only because we handle `Model`
	 * and `Package` items specially. We never render `Package` child details directly to the `Modal` document.
	 * These are always rendered to seperate documents from each other.
	 */
	transformApiModel?: TransformApiItemWithoutChildren<ApiModel>;

	/**
	 * Policy for transforming a section describing a `Namespace`.
	 */
	transformApiNamespace?: TransformApiItemWithChildren<ApiNamespace>;

	/**
	 * Policy for transforming a section describing a `Package`.
	 */
	transformApiPackage?: TransformApiItemWithChildren<ApiPackage>;

	/**
	 * Policy for transforming a section describing a `Property`.
	 */
	transformApiProperty?: TransformApiItemWithoutChildren<ApiPropertyItem>;

	/**
	 * Policy for transforming a section describing a `Type Alias`.
	 */
	transformApiTypeAlias?: TransformApiItemWithoutChildren<ApiTypeAlias>;

	/**
	 * Policy for transforming a section describing an `ApiVariable`.
	 */
	transformApiVariable?: TransformApiItemWithoutChildren<ApiVariable>;

	/**
	 * Policy for generating child content sections within a section describing an API item that potentially
	 * has children (see {@link TransformApiItemWithChildren}).
	 *
	 * @remarks
	 *
	 * This policy is used by the default policies of many of the other transformation policy options.
	 * This can be used to adjust the layout of the child sections for API item kinds that have
	 * without having to provide new transformation overrides for all of those content types.
	 */
	createChildContentSections?: CreateChildContentSections;
}

/**
 * The default {@link ApiItemTransformationConfiguration}.
 */
export const defaultApiItemTransformations: Required<ApiItemTransformationConfiguration> = {
	/**
	 * Default policy for transforming `Call Signature`s.
	 */
	transformApiCallSignature: DefaultTransformationImplementations.transformApiItemWithoutChildren,

	/**
	 * Default policy for transforming `Classes`.
	 */
	transformApiClass: DefaultTransformationImplementations.transformApiClass,

	/**
	 * Default policy for transforming `Constructors`.
	 */
	transformApiConstructor: DefaultTransformationImplementations.transformApiFunctionLike,

	/**
	 * Default policy for transforming `Enums`.
	 */
	transformApiEnum: DefaultTransformationImplementations.transformApiEnum,

	/**
	 * Default policy for transforming `Enum Members`.
	 */
	transformApiEnumMember: DefaultTransformationImplementations.transformApiItemWithoutChildren,

	/**
	 * Default policy for transforming `Functions`.
	 */
	transformApiFunction: DefaultTransformationImplementations.transformApiFunctionLike,

	/**
	 * Default policy for transforming `Index Signatures`.
	 */
	transformApiIndexSignature:
		DefaultTransformationImplementations.transformApiItemWithoutChildren,

	/**
	 * Default policy for transforming `Interfaces`.
	 */
	transformApiInterface: DefaultTransformationImplementations.transformApiInterface,

	/**
	 * Default policy for transforming `Methods`.
	 */
	transformApiMethod: DefaultTransformationImplementations.transformApiFunctionLike,

	/**
	 * Default policy for transforming `Models`.
	 */
	transformApiModel: DefaultTransformationImplementations.transformApiModel,

	/**
	 * Default policy for transforming `Namespaces`.
	 */
	transformApiNamespace: DefaultTransformationImplementations.transformApiNamespace,

	/**
	 * Default policy for transforming `Packages`.
	 */
	transformApiPackage: DefaultTransformationImplementations.transformApiPackage,

	/**
	 * Default policy for transforming `Properties`.
	 */
	transformApiProperty: DefaultTransformationImplementations.transformApiItemWithoutChildren,

	/**
	 * Default policy for transforming `Type Aliases`.
	 */
	transformApiTypeAlias: DefaultTransformationImplementations.transformApiItemWithoutChildren,

	/**
	 * Default policy for transforming `Variables`.
	 */
	transformApiVariable: DefaultTransformationImplementations.transformApiItemWithoutChildren,

	/**
	 * Default policy for transforming child content sections.
	 */
	createChildContentSections: DefaultTransformationImplementations.createSectionWithChildContent,
};
