import {
    ApiConstructSignature,
    ApiConstructor,
    ApiFunction,
    ApiItem,
    ApiMethod,
    ApiMethodSignature,
    ApiModel,
    ApiPackage,
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
    renderConstructorSection?: RenderingPolicy<ApiConstructSignature | ApiConstructor>;
    renderFunctionSection?: RenderingPolicy<ApiFunction>;
    renderMethodSection?: RenderingPolicy<ApiMethod | ApiMethodSignature>;
    renderModelSection?: RenderingPolicy<ApiModel>;
    renderPackageSection?: RenderingPolicy<ApiPackage>;
}

/**
 * TODO
 */
export const defaultRenderingPolicies: Required<RenderingPolicies> = {
    renderConstructorSection: DefaultRenderingPolicies.renderFunctionLikeSection,
    renderFunctionSection: DefaultRenderingPolicies.renderFunctionLikeSection,
    renderMethodSection: DefaultRenderingPolicies.renderFunctionLikeSection,
    renderModelSection: DefaultRenderingPolicies.renderModelSection,
    renderPackageSection: DefaultRenderingPolicies.renderPackageSection,
};
