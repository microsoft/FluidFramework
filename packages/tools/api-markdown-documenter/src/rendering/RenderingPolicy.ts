import {
    ApiCallSignature,
    ApiClass,
    ApiConstructSignature,
    ApiConstructor,
    ApiEnum,
    ApiFunction,
    ApiInterface,
    ApiItem,
    ApiMethod,
    ApiMethodSignature,
    ApiModel,
    ApiPackage,
    ApiProperty,
    ApiPropertySignature,
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
    renderInterfaceSection?: RenderingPolicy<ApiInterface>;
    renderMethodSection?: RenderingPolicy<ApiMethod | ApiMethodSignature>;
    renderModelSection?: RenderingPolicy<ApiModel>;
    renderPackageSection?: RenderingPolicy<ApiPackage>;
    renderPropertySection?: RenderingPolicy<ApiProperty | ApiPropertySignature>;
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
    renderInterfaceSection: DefaultRenderingPolicies.renderInterfaceSection,
    renderMethodSection: DefaultRenderingPolicies.renderFunctionLikeSection,
    renderModelSection: DefaultRenderingPolicies.renderModelSection,
    renderPackageSection: DefaultRenderingPolicies.renderPackageSection,
    renderPropertySection: DefaultRenderingPolicies.renderPropertySection,
};
