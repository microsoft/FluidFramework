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
import { DocSection, TSDocConfiguration } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../MarkdownDocumenterConfiguration";
import * as DefaultRenderingPolicies from "./default-policies";

/**
 * TODO
 */
export type RenderApiItemWithChildren<TApiItem extends ApiItem> = (
    apiItem: TApiItem,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
    renderChild: (apiItem: ApiItem) => DocSection,
) => DocSection;

/**
 * TODO
 */
export type RenderApiItemWithoutChildren<TApiItem extends ApiItem> = (
    apiItem: TApiItem,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
) => DocSection;

/**
 * TODO
 */
export type RenderSectionBlock = (
    apiItem: ApiItem,
    innerSectionBody: DocSection,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
) => DocSection;

/**
 * TODO
 */
export interface RenderingPolicies {
    renderCallSignatureSection?: RenderApiItemWithoutChildren<ApiCallSignature>;
    renderClassSection?: RenderApiItemWithChildren<ApiClass>;
    renderConstructorSection?: RenderApiItemWithoutChildren<ApiConstructSignature | ApiConstructor>;
    renderEnumSection?: RenderApiItemWithChildren<ApiEnum>;
    renderEnumMemberSection?: RenderApiItemWithoutChildren<ApiEnumMember>;
    renderFunctionSection?: RenderApiItemWithoutChildren<ApiFunction>;
    renderIndexSignatureSection?: RenderApiItemWithoutChildren<ApiIndexSignature>;
    renderInterfaceSection?: RenderApiItemWithChildren<ApiInterface>;
    renderMethodSection?: RenderApiItemWithoutChildren<ApiMethod | ApiMethodSignature>;
    renderModelSection?: RenderApiItemWithChildren<ApiModel>;
    renderNamespaceSection?: RenderApiItemWithChildren<ApiNamespace>;
    renderPackageSection?: RenderApiItemWithChildren<ApiPackage>;
    renderPropertySection?: RenderApiItemWithoutChildren<ApiPropertyItem>;
    renderTypeAliasSection?: RenderApiItemWithoutChildren<ApiTypeAlias>;
    renderVariableSection?: RenderApiItemWithoutChildren<ApiVariable>;

    renderSectionBlock?: RenderSectionBlock;
}

/**
 * TODO
 */
export const defaultRenderingPolicies: Required<RenderingPolicies> = {
    renderCallSignatureSection: DefaultRenderingPolicies.renderCallSignatureSection,
    renderClassSection: DefaultRenderingPolicies.renderClassSection,
    renderConstructorSection: DefaultRenderingPolicies.renderFunctionLikeSection,
    renderEnumSection: DefaultRenderingPolicies.renderEnumSection,
    renderEnumMemberSection: DefaultRenderingPolicies.renderEnumMemberSection,
    renderFunctionSection: DefaultRenderingPolicies.renderFunctionLikeSection,
    renderIndexSignatureSection: DefaultRenderingPolicies.renderIndexSignatureSection,
    renderInterfaceSection: DefaultRenderingPolicies.renderInterfaceSection,
    renderMethodSection: DefaultRenderingPolicies.renderFunctionLikeSection,
    renderModelSection: DefaultRenderingPolicies.renderModelSection,
    renderNamespaceSection: DefaultRenderingPolicies.renderNamespaceSection,
    renderPackageSection: DefaultRenderingPolicies.renderPackageSection,
    renderPropertySection: DefaultRenderingPolicies.renderPropertySection,
    renderTypeAliasSection: DefaultRenderingPolicies.renderTypeAliasSection,
    renderVariableSection: DefaultRenderingPolicies.renderVariableSection,

    renderSectionBlock: DefaultRenderingPolicies.renderSectionBlock,
};
