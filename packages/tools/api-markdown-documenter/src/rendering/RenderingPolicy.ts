import {
    ApiCallSignature,
    ApiClass,
    ApiConstructSignature,
    ApiConstructor,
    ApiEnum,
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
export type RenderingPolicy<TApiItem extends ApiItem> = (
    apiItem: TApiItem,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
) => DocSection;

/**
 * TODO
 */
export interface RenderingPolicies {
    renderCallSignatureSection?: RenderingPolicy<ApiCallSignature>;
    renderClassSection?: RenderingPolicy<ApiClass>;
    renderConstructorSection?: RenderingPolicy<ApiConstructSignature | ApiConstructor>;
    renderEnumSection?: RenderingPolicy<ApiEnum>;
    renderFunctionSection?: RenderingPolicy<ApiFunction>;
    renderIndexSignatureSection?: RenderingPolicy<ApiIndexSignature>;
    renderInterfaceSection?: RenderingPolicy<ApiInterface>;
    renderMethodSection?: RenderingPolicy<ApiMethod | ApiMethodSignature>;
    renderModelSection?: RenderingPolicy<ApiModel>;
    renderNamespaceSection?: RenderingPolicy<ApiNamespace>;
    renderPackageSection?: RenderingPolicy<ApiPackage>;
    renderPropertySection?: RenderingPolicy<ApiPropertyItem>;
    renderTypeAliasSection?: RenderingPolicy<ApiTypeAlias>;
    renderVariableSection?: RenderingPolicy<ApiVariable>;
}

/**
 * TODO
 */
export const defaultRenderingPolicies: Required<RenderingPolicies> = {
    renderCallSignatureSection: DefaultRenderingPolicies.renderCallSignatureSection,
    renderClassSection: DefaultRenderingPolicies.renderClassSection,
    renderConstructorSection: DefaultRenderingPolicies.renderFunctionLikeSection,
    renderEnumSection: DefaultRenderingPolicies.renderEnumSection,
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
};
