import {
    ApiCallSignature,
    ApiClass,
    ApiConstructor,
    ApiIndexSignature,
    ApiItem,
    ApiItemKind,
    ApiMethod,
    ApiMethodSignature,
    ApiProperty,
} from "@microsoft/api-extractor-model";
import { DocNode, DocSection, TSDocConfiguration } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";
import { getFilteredChildren } from "../../utilities";
import { renderChildDetailsSection } from "../Rendering";
import { renderMemberTables } from "../Tables";

export function renderClassSection(
    apiClass: ApiClass,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
    renderChild: (apiItem: ApiItem) => DocSection,
): DocSection {
    const docNodes: DocNode[] = [];

    const hasAnyChildren = apiClass.members.length !== 0;

    if (hasAnyChildren) {
        // Accumulate child items
        const constructors = getFilteredChildren(apiClass, [ApiItemKind.Constructor]).map(
            (apiItem) => apiItem as ApiConstructor,
        );

        const properties = getFilteredChildren(apiClass, [ApiItemKind.Property]).map(
            (apiItem) => apiItem as ApiProperty,
        );

        const callSignatures = getFilteredChildren(apiClass, [ApiItemKind.CallSignature]).map(
            (apiItem) => apiItem as ApiCallSignature,
        );

        const indexSignatures = getFilteredChildren(apiClass, [ApiItemKind.IndexSignature]).map(
            (apiItem) => apiItem as ApiIndexSignature,
        );

        const methods = getFilteredChildren(apiClass, [
            ApiItemKind.Method,
            ApiItemKind.MethodSignature,
        ]).map((apiItem) => apiItem as ApiMethod | ApiMethodSignature);

        // Render summary tables
        const renderedMemberTables = renderMemberTables(
            [
                {
                    headingTitle: "Constructors",
                    itemKind: ApiItemKind.Constructor,
                    items: constructors,
                },
                {
                    headingTitle: "Properties",
                    itemKind: ApiItemKind.Property,
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
                    itemKind: ApiItemKind.Method,
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
                    headingTitle: "Constructor Details",
                    itemKind: ApiItemKind.Constructor,
                    items: constructors,
                },
                {
                    headingTitle: "Property Details",
                    itemKind: ApiItemKind.Property,
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
        apiClass,
        innerSectionBody,
        documenterConfiguration,
        tsdocConfiguration,
    );
}
