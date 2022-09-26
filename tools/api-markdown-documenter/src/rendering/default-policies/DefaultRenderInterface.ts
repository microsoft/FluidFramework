/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
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
import { DocSection } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../Configuration";
import { filterByKind, mergeSections } from "../../utilities";
import { renderChildDetailsSection, renderMemberTables } from "../helpers";

/**
 * Default policy for rendering doc sections for `Interface` items.
 *
 * @remarks Format:
 *
 * - Tables: constructor-signatures, event properties, properties, methods, call-signatures, index-signatures
 *
 * - Details (for any types not rendered to their own documents - see {@link PolicyOptions.documentBoundaries}):
 * constructor-signatures, event properties, properties, methods, call-signatures, index-signatures
 */
export function renderInterfaceSection(
    apiInterface: ApiInterface,
    config: Required<MarkdownDocumenterConfiguration>,
    renderChild: (apiItem: ApiItem) => DocSection,
): DocSection {
    const docSections: DocSection[] = [];

    const hasAnyChildren = apiInterface.members.length > 0;

    if (hasAnyChildren) {
        // Accumulate child items
        const constructSignatures = filterByKind(apiInterface.members, [
            ApiItemKind.ConstructSignature,
        ]).map((apiItem) => apiItem as ApiConstructSignature);

        const allProperties = filterByKind(apiInterface.members, [
            ApiItemKind.PropertySignature,
        ]).map((apiItem) => apiItem as ApiPropertySignature);

        // Split properties into event properties and non-event properties
        const standardProperties = allProperties.filter(
            (apiProperty) => !apiProperty.isEventProperty,
        );
        const eventProperties = allProperties.filter((apiProperty) => apiProperty.isEventProperty);

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
                    headingTitle: "Events",
                    itemKind: ApiItemKind.PropertySignature,
                    items: eventProperties,
                },
                {
                    headingTitle: "Properties",
                    itemKind: ApiItemKind.PropertySignature,
                    items: standardProperties,
                },
                {
                    headingTitle: "Methods",
                    itemKind: ApiItemKind.MethodSignature,
                    items: methods,
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
            ],
            config,
        );

        if (renderedMemberTables !== undefined) {
            docSections.push(renderedMemberTables);
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
                    headingTitle: "Event Details",
                    itemKind: ApiItemKind.PropertySignature,
                    items: eventProperties,
                },
                {
                    headingTitle: "Property Details",
                    itemKind: ApiItemKind.PropertySignature,
                    items: standardProperties,
                },
                {
                    headingTitle: "Method Details",
                    itemKind: ApiItemKind.MethodSignature,
                    items: methods,
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
            ],
            config,
            renderChild,
        );

        if (renderedDetailsSection !== undefined) {
            docSections.push(renderedDetailsSection);
        }
    }

    // Merge sections to reduce and simplify hierarchy
    const innerSectionBody = mergeSections(docSections, config.tsdocConfiguration);

    return config.renderChildrenSection(apiInterface, innerSectionBody, config);
}
