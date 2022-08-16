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
import { DocSection } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../MarkdownDocumenterConfiguration";
import * as DefaultRenderingPolicies from "./default-policies";

/**
 * This module contains rendering-policy-related types that are consumed via the {@link MarkdownDocumenterConfiguration}.
 */

/**
 * Signature for a function which renders a `DocSection` describing an API item that potentially has child items
 * to be rendered as content under the same section.
 */
export type RenderApiItemWithChildren<TApiItem extends ApiItem> = (
    apiItem: TApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
    renderChild: (apiItem: ApiItem) => DocSection,
) => DocSection;

/**
 * Signature for a function which renders a `DocSection` describing an API item that does not have child items to
 * be rendered.
 */
export type RenderApiItemWithoutChildren<TApiItem extends ApiItem> = (
    apiItem: TApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
) => DocSection;

/**
 * Signature for a function which renders information about an API item with inner content injected into the same
 * section.
 */
export type RenderSectionWithInnerContent = (
    apiItem: ApiItem,
    innerSectionBody: DocSection | undefined,
    config: Required<MarkdownDocumenterConfiguration>,
) => DocSection;

/**
 * Policies for rendering different kinds of API content.
 *
 * @remarks For any policies not explicitly provided, {@link defaultRenderingPolicies} will be used to supply default
 * policies.
 */
export interface RenderingPolicies {
    /**
     * Policy for rendering a section describing a `Call Signature`.
     */
    renderCallSignatureSection?: RenderApiItemWithoutChildren<ApiCallSignature>;

    /**
     * Policy for rendering a section describing a `Class`.
     */
    renderClassSection?: RenderApiItemWithChildren<ApiClass>;

    /**
     * Policy for rendering a section describing a `Constructor`.
     */
    renderConstructorSection?: RenderApiItemWithoutChildren<ApiConstructSignature | ApiConstructor>;

    /**
     * Policy for rendering a section describing an `Enum`.
     */
    renderEnumSection?: RenderApiItemWithChildren<ApiEnum>;

    /**
     * Policy for rendering a section describing an `Enum Member`.
     */
    renderEnumMemberSection?: RenderApiItemWithoutChildren<ApiEnumMember>;

    /**
     * Policy for rendering a section describing a `Function`.
     */
    renderFunctionSection?: RenderApiItemWithoutChildren<ApiFunction>;

    /**
     * Policy for rendering a section describing an `Index Signature`.
     */
    renderIndexSignatureSection?: RenderApiItemWithoutChildren<ApiIndexSignature>;

    /**
     * Policy for rendering a section describing an `Interface`.
     */
    renderInterfaceSection?: RenderApiItemWithChildren<ApiInterface>;

    /**
     * Policy for rendering a section describing a `Method`.
     */
    renderMethodSection?: RenderApiItemWithoutChildren<ApiMethod | ApiMethodSignature>;

    /**
     * Policy for rendering a section describing a `Model`.
     *
     * @privateRemarks Note that this is a {@link RenderApiItemWithoutChildren} only because we handle `Model`
     * and `Package` items specially. We never render `Package` child details directly to the `Modal` document.
     * These are always rendered to seperate documents from each other.
     */
    renderModelSection?: RenderApiItemWithoutChildren<ApiModel>;

    /**
     * Policy for rendering a section describing a `Namespace`.
     */
    renderNamespaceSection?: RenderApiItemWithChildren<ApiNamespace>;

    /**
     * Policy for rendering a section describing a `Package`.
     */
    renderPackageSection?: RenderApiItemWithChildren<ApiPackage>;

    /**
     * Policy for rendering a section describing a `Property`.
     */
    renderPropertySection?: RenderApiItemWithoutChildren<ApiPropertyItem>;

    /**
     * Policy for rendering a section describing a `Type Alias`.
     */
    renderTypeAliasSection?: RenderApiItemWithoutChildren<ApiTypeAlias>;

    /**
     * Policy for rendering a section describing an `ApiVariable`.
     */
    renderVariableSection?: RenderApiItemWithoutChildren<ApiVariable>;

    /**
     * Policy for rendering the child content section within a section describing an API item that potentially
     * has children (see {@link RenderApiItemWithChildren}).
     *
     * @remarks This policy is used by the default policies of many of the other rendering policy options.
     * This can be used to adjust the layout of the child rendering section of the rendering policies without
     * having to provide new overrides for all of those content types.
     */
    renderChildrenSection?: RenderSectionWithInnerContent;
}

/**
 * The default {@link RenderingPolicies}.
 */
export const defaultRenderingPolicies: Required<RenderingPolicies> = {
    renderCallSignatureSection: DefaultRenderingPolicies.renderItemWithoutChildren,
    renderClassSection: DefaultRenderingPolicies.renderClassSection,
    renderConstructorSection: DefaultRenderingPolicies.renderFunctionLikeSection,
    renderEnumSection: DefaultRenderingPolicies.renderEnumSection,
    renderEnumMemberSection: DefaultRenderingPolicies.renderItemWithoutChildren,
    renderFunctionSection: DefaultRenderingPolicies.renderFunctionLikeSection,
    renderIndexSignatureSection: DefaultRenderingPolicies.renderItemWithoutChildren,
    renderInterfaceSection: DefaultRenderingPolicies.renderInterfaceSection,
    renderMethodSection: DefaultRenderingPolicies.renderFunctionLikeSection,
    renderModelSection: DefaultRenderingPolicies.renderModelSection,
    renderNamespaceSection: DefaultRenderingPolicies.renderNamespaceSection,
    renderPackageSection: DefaultRenderingPolicies.renderPackageSection,
    renderPropertySection: DefaultRenderingPolicies.renderItemWithoutChildren,
    renderTypeAliasSection: DefaultRenderingPolicies.renderItemWithoutChildren,
    renderVariableSection: DefaultRenderingPolicies.renderItemWithoutChildren,

    renderChildrenSection: DefaultRenderingPolicies.renderChildrenSection,
};
