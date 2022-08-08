import {
    ApiConstructSignature,
    ApiConstructor,
    ApiFunction,
    ApiItem,
    ApiMethod,
    ApiMethodSignature,
} from "@microsoft/api-extractor-model";
import { DocNode, DocSection, TSDocConfiguration } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "./MarkdownDocumenterConfiguration";

export type RenderingPolicy<TApiItem extends ApiItem> = (
    apiItem: TApiItem,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
) => DocSection;

export interface RenderingPolicies {
    renderConstructor?: RenderingPolicy<ApiConstructSignature | ApiConstructor>;
    renderFunction?: RenderingPolicy<ApiFunction>;
    renderMethod?: RenderingPolicy<ApiMethod | ApiMethodSignature>;
}

export namespace DefaultRenderingPolicies {
    export function defaultRenderFunctionLike(
        apiItem:
            | ApiConstructor
            | ApiConstructSignature
            | ApiFunction
            | ApiMethod
            | ApiMethodSignature,
        documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
        tsdocConfiguration: TSDocConfiguration,
    ): DocSection {
        const docNodes: DocNode[] = [];
        // Render parameter table
        // TODO
        // TODO: what else?
        return new DocSection({ configuration: tsdocConfiguration }, docNodes);
    }

    export function defaultRenderConstructor(
        apiItem: ApiConstructor | ApiConstructSignature,
        documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
        tsdocConfiguration: TSDocConfiguration,
    ): DocSection {
        return defaultRenderFunctionLike(apiItem, documenterConfiguration, tsdocConfiguration);
    }

    export function defaultRenderFunction(
        apiItem: ApiFunction,
        documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
        tsdocConfiguration: TSDocConfiguration,
    ): DocSection {
        return defaultRenderFunctionLike(apiItem, documenterConfiguration, tsdocConfiguration);
    }

    export function defaultRenderMethod(
        apiItem: ApiMethod | ApiMethodSignature,
        documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
        tsdocConfiguration: TSDocConfiguration,
    ): DocSection {
        return defaultRenderFunctionLike(apiItem, documenterConfiguration, tsdocConfiguration);
    }
}

export const defaultRenderingPolicies: Required<RenderingPolicies> = {
    renderConstructor: DefaultRenderingPolicies.defaultRenderConstructor,
    renderFunction: DefaultRenderingPolicies.defaultRenderFunction,
    renderMethod: DefaultRenderingPolicies.defaultRenderMethod,
};
