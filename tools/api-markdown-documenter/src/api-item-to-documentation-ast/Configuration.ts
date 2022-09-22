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
import { HierarchicalSectionNode } from "../documentation-domain";
import * as DefaultTransformationImplementations from "./default-implementations";

/**
 * This module contains transformation-policy-related types that are consumed via the {@link MarkdownDocumenterConfiguration}.
 */

/**
 * Signature for a function which renders a `HierarchicalSectionNode` describing an API item that potentially has child items
 * to be rendered as content under the same section.
 */
export type TransformApiItemWithChildren<TApiItem extends ApiItem> = (
    apiItem: TApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
    generateChildSection: (apiItem: ApiItem) => HierarchicalSectionNode,
) => HierarchicalSectionNode;

/**
 * Signature for a function which renders a `HierarchicalSectionNode` describing an API item that does not have child items to
 * be rendered.
 */
export type TransformApiItemWithoutChildren<TApiItem extends ApiItem> = (
    apiItem: TApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
) => HierarchicalSectionNode;

/**
 * Signature for a function which renders information about an API item with inner content injected into the same
 * section.
 */
export type CreateSectionWithChildContent = (
    apiItem: ApiItem,
    childSections: HierarchicalSectionNode[] | undefined,
    config: Required<MarkdownDocumenterConfiguration>,
) => HierarchicalSectionNode;

/**
 * Policies for rendering different kinds of API content.
 *
 * @remarks For any policies not explicitly provided, {@link defaultApiItemTransformations} will be used to supply default
 * policies.
 */
export interface ApiItemTransformationConfiguration {
    /**
     * Policy for rendering a section describing a `Call Signature`.
     */
    transformApiCallSignature?: TransformApiItemWithoutChildren<ApiCallSignature>;

    /**
     * Policy for rendering a section describing a `Class`.
     */
    transformApiClass?: TransformApiItemWithChildren<ApiClass>;

    /**
     * Policy for rendering a section describing a `Constructor`.
     */
    transformApiConstructor?: TransformApiItemWithoutChildren<
        ApiConstructSignature | ApiConstructor
    >;

    /**
     * Policy for rendering a section describing an `Enum`.
     */
    transformApiEnum?: TransformApiItemWithChildren<ApiEnum>;

    /**
     * Policy for rendering a section describing an `Enum Member`.
     */
    transformApiEnumMember?: TransformApiItemWithoutChildren<ApiEnumMember>;

    /**
     * Policy for rendering a section describing a `Function`.
     */
    transformApiFunction?: TransformApiItemWithoutChildren<ApiFunction>;

    /**
     * Policy for rendering a section describing an `Index Signature`.
     */
    transformApiIndexSignature?: TransformApiItemWithoutChildren<ApiIndexSignature>;

    /**
     * Policy for rendering a section describing an `Interface`.
     */
    transformApiInterface?: TransformApiItemWithChildren<ApiInterface>;

    /**
     * Policy for rendering a section describing a `Method`.
     */
    transformApiMethod?: TransformApiItemWithoutChildren<ApiMethod | ApiMethodSignature>;

    /**
     * Policy for rendering a section describing a `Model`.
     *
     * @remarks Note that this is a {@link TransformApiItemWithoutChildren} only because we handle `Model`
     * and `Package` items specially. We never render `Package` child details directly to the `Modal` document.
     * These are always rendered to seperate documents from each other.
     */
    transformApiModel?: TransformApiItemWithoutChildren<ApiModel>;

    /**
     * Policy for rendering a section describing a `Namespace`.
     */
    transformApiNamespace?: TransformApiItemWithChildren<ApiNamespace>;

    /**
     * Policy for rendering a section describing a `Package`.
     */
    transformApiPackage?: TransformApiItemWithChildren<ApiPackage>;

    /**
     * Policy for rendering a section describing a `Property`.
     */
    transformApiProperty?: TransformApiItemWithoutChildren<ApiPropertyItem>;

    /**
     * Policy for rendering a section describing a `Type Alias`.
     */
    transformApiTypeAlias?: TransformApiItemWithoutChildren<ApiTypeAlias>;

    /**
     * Policy for rendering a section describing an `ApiVariable`.
     */
    transformApiVariable?: TransformApiItemWithoutChildren<ApiVariable>;

    /**
     * Policy for rendering the child content section within a section describing an API item that potentially
     * has children (see {@link TransformApiItemWithChildren}).
     *
     * @remarks This policy is used by the default policies of many of the other rendering policy options.
     * This can be used to adjust the layout of the child rendering section of the rendering policies without
     * having to provide new overrides for all of those content types.
     */
    createSectionWithChildContent?: CreateSectionWithChildContent;
}

/**
 * The default {@link ApiItemTransformationConfiguration}.
 */
export const defaultApiItemTransformations: Required<ApiItemTransformationConfiguration> = {
    /**
     * Default policy for rendering `Call Signature`s.
     */
    transformApiCallSignature: DefaultTransformationImplementations.transformApiItemWithoutChildren,

    /**
     * Default policy for rendering `Classes`.
     */
    transformApiClass: DefaultTransformationImplementations.transformApiClass,

    /**
     * Default policy for rendering `Constructors`.
     */
    transformApiConstructor: DefaultTransformationImplementations.transformApiFunctionLike,

    /**
     * Default policy for rendering `Enums`.
     */
    transformApiEnum: DefaultTransformationImplementations.transformApiEnum,

    /**
     * Default policy for rendering `Enum Members`.
     */
    transformApiEnumMember: DefaultTransformationImplementations.transformApiItemWithoutChildren,

    /**
     * Default policy for rendering `Functions`.
     */
    transformApiFunction: DefaultTransformationImplementations.transformApiFunctionLike,

    /**
     * Default policy for rendering `Index Signatures`.
     */
    transformApiIndexSignature:
        DefaultTransformationImplementations.transformApiItemWithoutChildren,

    /**
     * Default policy for rendering `Interfaces`.
     */
    transformApiInterface: DefaultTransformationImplementations.transformApiInterface,

    /**
     * Default policy for rendering `Methods`.
     */
    transformApiMethod: DefaultTransformationImplementations.transformApiFunctionLike,

    /**
     * Default policy for rendering `Models`.
     */
    transformApiModel: DefaultTransformationImplementations.transformApiModel,

    /**
     * Default policy for rendering `Namespaces`.
     */
    transformApiNamespace: DefaultTransformationImplementations.transformApiNamespace,

    /**
     * Default policy for rendering `Packages`.
     */
    transformApiPackage: DefaultTransformationImplementations.transformApiPackage,

    /**
     * Default policy for rendering `Properties`.
     */
    transformApiProperty: DefaultTransformationImplementations.transformApiItemWithoutChildren,

    /**
     * Default policy for rendering `Type Aliases`.
     */
    transformApiTypeAlias: DefaultTransformationImplementations.transformApiItemWithoutChildren,

    /**
     * Default policy for rendering `Variables`.
     */
    transformApiVariable: DefaultTransformationImplementations.transformApiItemWithoutChildren,

    /**
     * Default policy for rendering child content sections.
     */
    createSectionWithChildContent:
        DefaultTransformationImplementations.createSectionWithChildContent,
};
