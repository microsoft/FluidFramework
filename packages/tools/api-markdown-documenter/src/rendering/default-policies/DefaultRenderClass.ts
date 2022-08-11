import {
    ApiCallSignature,
    ApiClass,
    ApiConstructSignature,
    ApiConstructor,
    ApiIndexSignature,
    ApiItemKind,
    ApiMethod,
    ApiMethodSignature,
    ApiPropertyItem,
} from "@microsoft/api-extractor-model";
import {
    DocNode,
    DocParagraph,
    DocPlainText,
    DocSection,
    TSDocConfiguration,
} from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";
import { DocHeading } from "../../doc-nodes";
import { getFilteredChildren } from "../../utilities";
import {
    renderConstructorsTable,
    renderMethodsTable,
    renderPropertiesTable,
    renderSignaturesTable,
} from "../Rendering";

export function renderClassSection(
    apiClass: ApiClass,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocSection {
    const docNodes: DocNode[] = [];

    const hasAnyChildren = apiClass.members.length !== 0;

    if (hasAnyChildren) {
        // Render constructors table
        const constructors = getFilteredChildren(apiClass, [
            ApiItemKind.ConstructSignature,
            ApiItemKind.Constructor,
        ]).map((apiItem) => apiItem as ApiConstructSignature | ApiConstructor);

        const constructorsTable = renderConstructorsTable(
            constructors,
            documenterConfiguration,
            tsdocConfiguration,
        );
        if (constructorsTable !== undefined) {
            docNodes.push(
                new DocSection({ configuration: tsdocConfiguration }, [
                    new DocHeading({ configuration: tsdocConfiguration, title: "Constructors" }),
                    constructorsTable,
                ]),
            );
        }

        // Render properties table
        const properties = getFilteredChildren(apiClass, [
            ApiItemKind.Property,
            ApiItemKind.PropertySignature,
        ]).map((apiItem) => apiItem as ApiPropertyItem);

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

        // Render call signatures table
        const callSignatures = getFilteredChildren(apiClass, [ApiItemKind.CallSignature]).map(
            (apiItem) => apiItem as ApiCallSignature,
        );

        const callSignaturesTable = renderSignaturesTable(
            callSignatures,
            documenterConfiguration,
            tsdocConfiguration,
        );
        if (callSignaturesTable !== undefined) {
            docNodes.push(
                new DocSection({ configuration: tsdocConfiguration }, [
                    new DocHeading({ configuration: tsdocConfiguration, title: "Call Signatures" }),
                    callSignaturesTable,
                ]),
            );
        }

        // Render index signatures table
        const indexSignatures = getFilteredChildren(apiClass, [ApiItemKind.IndexSignature]).map(
            (apiItem) => apiItem as ApiIndexSignature,
        );

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

        // Render methods table
        const methods = getFilteredChildren(apiClass, [
            ApiItemKind.Method,
            ApiItemKind.MethodSignature,
        ]).map((apiItem) => apiItem as ApiMethod | ApiMethodSignature);

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

        docNodes.push(new DocHeading({ configuration: tsdocConfiguration, title: "Details" }));

        // Render children (grouped)
        // TODO
        docNodes.push(
            new DocParagraph({ configuration: tsdocConfiguration }, [
                new DocPlainText({
                    configuration: tsdocConfiguration,
                    text: "TODO: Render children in groups",
                }),
            ]),
        );
    }

    const innerSectionBody = new DocSection({ configuration: tsdocConfiguration }, docNodes);

    return documenterConfiguration.renderSectionBlock(
        apiClass,
        innerSectionBody,
        documenterConfiguration,
        tsdocConfiguration,
    );
}
