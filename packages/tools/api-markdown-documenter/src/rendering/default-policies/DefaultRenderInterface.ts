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
import { DocNode, DocSection, TSDocConfiguration } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";
import { getFilteredChildren } from "../../utilities";
import { renderChildDetailsSection } from "../Rendering";
import { renderMemberTables } from "../Tables";

export function renderInterfaceSection(
    apiInterface: ApiInterface,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
    renderChild: (apiItem: ApiItem) => DocSection,
): DocSection {
    const docNodes: DocNode[] = [];

    const hasAnyChildren = apiInterface.members.length !== 0;

    if (hasAnyChildren) {
        // Accumulate child items
        const constructSignatures = getFilteredChildren(apiInterface, [
            ApiItemKind.ConstructSignature,
        ]).map((apiItem) => apiItem as ApiConstructSignature);

        const properties = getFilteredChildren(apiInterface, [ApiItemKind.PropertySignature]).map(
            (apiItem) => apiItem as ApiPropertySignature,
        );

        const callSignatures = getFilteredChildren(apiInterface, [ApiItemKind.CallSignature]).map(
            (apiItem) => apiItem as ApiCallSignature,
        );

        const indexSignatures = getFilteredChildren(apiInterface, [ApiItemKind.IndexSignature]).map(
            (apiItem) => apiItem as ApiIndexSignature,
        );

        const methods = getFilteredChildren(apiInterface, [ApiItemKind.MethodSignature]).map(
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
            documenterConfiguration,
            tsdocConfiguration,
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
            documenterConfiguration,
            tsdocConfiguration,
            renderChild,
        );

        if (renderedDetailsSection !== undefined) {
            docNodes.push(renderedDetailsSection);
        }
    }

    const innerSectionBody = new DocSection({ configuration: tsdocConfiguration }, docNodes);

    return documenterConfiguration.renderSectionBlock(
        apiInterface,
        innerSectionBody,
        documenterConfiguration,
        tsdocConfiguration,
    );
}
