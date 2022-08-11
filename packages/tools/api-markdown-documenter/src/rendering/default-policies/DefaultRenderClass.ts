import {
    ApiCallSignature,
    ApiClass,
    ApiConstructSignature,
    ApiConstructor,
    ApiIndexSignature,
    ApiItem,
    ApiItemKind,
    ApiMethod,
    ApiMethodSignature,
    ApiPropertyItem,
} from "@microsoft/api-extractor-model";
import { DocNode, DocSection, TSDocConfiguration } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";
import { DocHeading } from "../../doc-nodes";
import { getFilteredChildren } from "../../utilities";
import {
    renderChildrenUnderHeading,
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
        const constructors = getFilteredChildren(apiClass, [
            ApiItemKind.ConstructSignature,
            ApiItemKind.Constructor,
        ]).map((apiItem) => apiItem as ApiConstructSignature | ApiConstructor);
        const hasConstructors = constructors.length !== 0;

        const properties = getFilteredChildren(apiClass, [
            ApiItemKind.Property,
            ApiItemKind.PropertySignature,
        ]).map((apiItem) => apiItem as ApiPropertyItem);
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

        docNodes.push(new DocHeading({ configuration: tsdocConfiguration, title: "Details" }));

        // #region Render children (grouped)

        // Render constructor details
        if (hasConstructors) {
            docNodes.push(
                renderChildrenUnderHeading(
                    constructors,
                    "Constructor Details",
                    tsdocConfiguration,
                    renderChild,
                ),
            );
        }

        // Render property details
        if (hasProperties) {
            docNodes.push(
                renderChildrenUnderHeading(
                    properties,
                    "Property Details",
                    tsdocConfiguration,
                    renderChild,
                ),
            );
        }

        // Render call signature details
        if (hasCallSignatures) {
            docNodes.push(
                renderChildrenUnderHeading(
                    callSignatures,
                    "Call Signature Details",
                    tsdocConfiguration,
                    renderChild,
                ),
            );
        }

        // Render index signature details
        if (hasIndexSignatures) {
            docNodes.push(
                renderChildrenUnderHeading(
                    indexSignatures,
                    "Index Signature Details",
                    tsdocConfiguration,
                    renderChild,
                ),
            );
        }

        // Render method details
        if (hasMethods) {
            docNodes.push(
                renderChildrenUnderHeading(
                    methods,
                    "Method Details",
                    tsdocConfiguration,
                    renderChild,
                ),
            );
        }

        // #endregion
    }

    const innerSectionBody = new DocSection({ configuration: tsdocConfiguration }, docNodes);

    return documenterConfiguration.renderSectionBlock(
        apiClass,
        innerSectionBody,
        documenterConfiguration,
        tsdocConfiguration,
    );
}
