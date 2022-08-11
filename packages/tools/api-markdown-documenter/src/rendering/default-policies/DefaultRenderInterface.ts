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
import { DocHeading } from "../../doc-nodes";
import { getFilteredChildren } from "../../utilities";
import { renderChildDetailsSection } from "../Rendering";
import {
    renderConstructorsTable,
    renderMethodsTable,
    renderPropertiesTable,
    renderSignaturesTable,
} from "../Tables";

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
        const hasConstructSignatures = constructSignatures.length !== 0;

        const properties = getFilteredChildren(apiInterface, [ApiItemKind.PropertySignature]).map(
            (apiItem) => apiItem as ApiPropertySignature,
        );
        const hasProperties = properties.length !== 0;

        const callSignatures = getFilteredChildren(apiInterface, [ApiItemKind.CallSignature]).map(
            (apiItem) => apiItem as ApiCallSignature,
        );
        const hasCallSignatures = callSignatures.length !== 0;

        const indexSignatures = getFilteredChildren(apiInterface, [ApiItemKind.IndexSignature]).map(
            (apiItem) => apiItem as ApiIndexSignature,
        );
        const hasIndexSignatures = indexSignatures.length !== 0;

        const methods = getFilteredChildren(apiInterface, [ApiItemKind.MethodSignature]).map(
            (apiItem) => apiItem as ApiMethodSignature,
        );
        const hasMethods = methods.length !== 0;

        // #region Render summary tables

        // Render construct signatures table
        if (hasConstructSignatures) {
            const constructSignaturesTable = renderConstructorsTable(
                constructSignatures,
                documenterConfiguration,
                tsdocConfiguration,
            );
            if (constructSignaturesTable !== undefined) {
                docNodes.push(
                    new DocSection({ configuration: tsdocConfiguration }, [
                        new DocHeading({
                            configuration: tsdocConfiguration,
                            title: "Construct Signatures",
                        }),
                        constructSignaturesTable,
                    ]),
                );
            }
        }

        // Render properties table
        if (hasProperties) {
            const propertiesTable = renderPropertiesTable(
                properties,
                documenterConfiguration,
                tsdocConfiguration,
            );
            if (propertiesTable !== undefined) {
                docNodes.push(
                    new DocSection({ configuration: tsdocConfiguration }, [
                        new DocHeading({ configuration: tsdocConfiguration, title: "Properties" }),
                        propertiesTable,
                    ]),
                );
            }
        }

        // Render call signatures table
        if (hasCallSignatures) {
            const callSignaturesTable = renderSignaturesTable(
                callSignatures,
                documenterConfiguration,
                tsdocConfiguration,
            );
            if (callSignaturesTable !== undefined) {
                docNodes.push(
                    new DocSection({ configuration: tsdocConfiguration }, [
                        new DocHeading({
                            configuration: tsdocConfiguration,
                            title: "Call Signatures",
                        }),
                        callSignaturesTable,
                    ]),
                );
            }
        }

        // Render index signatures table
        if (hasIndexSignatures) {
            const indexSignaturesTable = renderSignaturesTable(
                indexSignatures,
                documenterConfiguration,
                tsdocConfiguration,
            );
            if (indexSignaturesTable !== undefined) {
                docNodes.push(
                    new DocSection({ configuration: tsdocConfiguration }, [
                        new DocHeading({
                            configuration: tsdocConfiguration,
                            title: "Index Signatures",
                        }),
                        indexSignaturesTable,
                    ]),
                );
            }
        }

        // Render methods table
        if (hasMethods) {
            const methodsTable = renderMethodsTable(
                methods,
                documenterConfiguration,
                tsdocConfiguration,
            );
            if (methodsTable !== undefined) {
                docNodes.push(
                    new DocSection({ configuration: tsdocConfiguration }, [
                        new DocHeading({ configuration: tsdocConfiguration, title: "Methods" }),
                        methodsTable,
                    ]),
                );
            }
        }

        // #endregion

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
