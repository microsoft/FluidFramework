import {
    ApiCallSignature,
    ApiConstructSignature,
    ApiIndexSignature,
    ApiInterface,
    ApiItem,
    ApiItemKind,
    ApiMethodSignature,
    ApiPropertySignature,
} from "@microsoft/api-extractor-model";
import { DocNode, DocSection } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";
import { filterByKind } from "../../utilities";
import { renderChildDetailsSection } from "../Rendering";
import { renderMemberTables } from "../Tables";

export function renderInterfaceSection(
    apiInterface: ApiInterface,
    config: Required<MarkdownDocumenterConfiguration>,
    renderChild: (apiItem: ApiItem) => DocSection,
): DocSection {
    const docNodes: DocNode[] = [];

    const hasAnyChildren = apiInterface.members.length !== 0;

    if (hasAnyChildren) {
        // Accumulate child items
        const constructSignatures = filterByKind(apiInterface.members, [
            ApiItemKind.ConstructSignature,
        ]).map((apiItem) => apiItem as ApiConstructSignature);

        const properties = filterByKind(apiInterface.members, [ApiItemKind.PropertySignature]).map(
            (apiItem) => apiItem as ApiPropertySignature,
        );

        const callSignatures = filterByKind(apiInterface.members, [ApiItemKind.CallSignature]).map(
            (apiItem) => apiItem as ApiCallSignature,
        );

        const indexSignatures = filterByKind(apiInterface.members, [
            ApiItemKind.IndexSignature,
        ]).map((apiItem) => apiItem as ApiIndexSignature);

        const methods = filterByKind(apiInterface.members, [ApiItemKind.MethodSignature]).map(
            (apiItem) => apiItem as ApiMethodSignature,
        );

        // Render summary tables
        const renderedMemberTables = renderMemberTables(
            [
                {
                    headingTitle: "Construct Signatures",
                    itemKind: ApiItemKind.ConstructSignature,
                    items: constructSignatures,
                },
                {
                    headingTitle: "Properties",
                    itemKind: ApiItemKind.PropertySignature,
                    items: properties,
                },
                {
                    headingTitle: "Call Signatures",
                    itemKind: ApiItemKind.CallSignature,
                    items: callSignatures,
                },
                {
                    headingTitle: "Index Signatures",
                    itemKind: ApiItemKind.IndexSignature,
                    items: indexSignatures,
                },
                {
                    headingTitle: "Methods",
                    itemKind: ApiItemKind.MethodSignature,
                    items: methods,
                },
            ],
            config,
        );

        if (renderedMemberTables !== undefined) {
            docNodes.push(renderedMemberTables);
        }

        // Render child item details if there are any that will not be rendered to their own documents
        const renderedDetailsSection = renderChildDetailsSection(
            [
                {
                    headingTitle: "Construct Signature Details",
                    itemKind: ApiItemKind.ConstructSignature,
                    items: constructSignatures,
                },
                {
                    headingTitle: "Property Details",
                    itemKind: ApiItemKind.PropertySignature,
                    items: properties,
                },
                {
                    headingTitle: "Call Signature Details",
                    itemKind: ApiItemKind.CallSignature,
                    items: callSignatures,
                },
                {
                    headingTitle: "Index Signature Details",
                    itemKind: ApiItemKind.IndexSignature,
                    items: indexSignatures,
                },
                {
                    headingTitle: "Method Details",
                    itemKind: ApiItemKind.MethodSignature,
                    items: methods,
                },
            ],
            config,
            renderChild,
        );

        if (renderedDetailsSection !== undefined) {
            docNodes.push(renderedDetailsSection);
        }
    }

    const innerSectionBody = new DocSection({ configuration: config.tsdocConfiguration }, docNodes);

    return config.renderSectionBlock(apiInterface, innerSectionBody, config);
}
