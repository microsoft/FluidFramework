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
import { DocHeading } from "../../doc-nodes";
import { getFilteredChildren } from "../../utilities";
import {
    renderChildDetailsSection,
    renderConstructorsTable,
    renderMethodsTable,
    renderPropertiesTable,
    renderSignaturesTable,
} from "../Rendering";

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
        const hasConstructors = constructors.length !== 0;

        const properties = getFilteredChildren(apiClass, [ApiItemKind.Property]).map(
            (apiItem) => apiItem as ApiProperty,
        );
        const hasProperties = properties.length !== 0;

        const callSignatures = getFilteredChildren(apiClass, [ApiItemKind.CallSignature]).map(
            (apiItem) => apiItem as ApiCallSignature,
        );
        const hasCallSignatures = callSignatures.length !== 0;

        const indexSignatures = getFilteredChildren(apiClass, [ApiItemKind.IndexSignature]).map(
            (apiItem) => apiItem as ApiIndexSignature,
        );
        const hasIndexSignatures = indexSignatures.length !== 0;

        const methods = getFilteredChildren(apiClass, [
            ApiItemKind.Method,
            ApiItemKind.MethodSignature,
        ]).map((apiItem) => apiItem as ApiMethod | ApiMethodSignature);
        const hasMethods = methods.length !== 0;

        // #region Render summary tables

        // Render constructors table
        if (hasConstructors) {
            const constructorsTable = renderConstructorsTable(
                constructors,
                documenterConfiguration,
                tsdocConfiguration,
            );
            if (constructorsTable !== undefined) {
                docNodes.push(
                    new DocSection({ configuration: tsdocConfiguration }, [
                        new DocHeading({
                            configuration: tsdocConfiguration,
                            title: "Constructors",
                        }),
                        constructorsTable,
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
