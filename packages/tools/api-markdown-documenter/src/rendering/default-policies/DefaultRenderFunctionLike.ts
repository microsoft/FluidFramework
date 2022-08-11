import {
    ApiConstructSignature,
    ApiConstructor,
    ApiFunction,
    ApiMethod,
    ApiMethodSignature,
} from "@microsoft/api-extractor-model";
import { DocNode, DocSection, TSDocConfiguration } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";

export function renderFunctionLikeSection(
    apiFunctionLike:
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
    const innerSectionBody = new DocSection({ configuration: tsdocConfiguration }, docNodes);

    return documenterConfiguration.renderSectionBlock(
        apiFunctionLike,
        innerSectionBody,
        documenterConfiguration,
        tsdocConfiguration,
    );
}
