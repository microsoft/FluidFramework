/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    ApiCallSignature,
    ApiClass,
    ApiConstructor,
    ApiIndexSignature,
    ApiItem,
    ApiItemKind,
    ApiMethod,
    ApiProperty,
} from "@microsoft/api-extractor-model";
import { DocSection } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../Configuration";
import { ApiModifier, filterByKind, isStatic, mergeSections } from "../../utilities";
import { renderChildDetailsSection, renderMemberTables } from "../helpers";

/**
 * Default policy for rendering doc sections for `Class` items.
 *
 * @remarks Format:
 *
 * - Tables: constructors, (static) event properties, (static) properties, (static) methods,
 * (non-static) event properties, (non-static) properties, (non-static) methods, call-signatures, index-signatures
 *
 * - Details (for any types not rendered to their own documents - see {@link PolicyOptions.documentBoundaries}):
 * constructors, event properties, properties, methods, call-signatures, index-signatures
 */
export function renderClassSection(
    apiClass: ApiClass,
    config: Required<MarkdownDocumenterConfiguration>,
    renderChild: (apiItem: ApiItem) => DocSection,
): DocSection {
    const docSections: DocSection[] = [];

    const hasAnyChildren = apiClass.members.length > 0;

    if (hasAnyChildren) {
        // Accumulate child items
        const constructors = filterByKind(apiClass.members, [ApiItemKind.Constructor]).map(
            (apiItem) => apiItem as ApiConstructor,
        );

        const allProperties = filterByKind(apiClass.members, [ApiItemKind.Property]).map(
            (apiItem) => apiItem as ApiProperty,
        );

        // Split properties into event properties and non-event properties
        const standardProperties = allProperties.filter(
            (apiProperty) => !apiProperty.isEventProperty,
        );
        const eventProperties = allProperties.filter((apiProperty) => apiProperty.isEventProperty);

        // Further split event/standard properties into static and non-static
        const staticStandardProperties = standardProperties.filter((apiProperty) =>
            isStatic(apiProperty),
        );
        const nonStaticStandardProperties = standardProperties.filter(
            (apiProperty) => !isStatic(apiProperty),
        );
        const staticEventProperties = eventProperties.filter((apiProperty) =>
            isStatic(apiProperty),
        );
        const nonStaticEventProperties = eventProperties.filter(
            (apiProperty) => !isStatic(apiProperty),
        );

        const callSignatures = filterByKind(apiClass.members, [ApiItemKind.CallSignature]).map(
            (apiItem) => apiItem as ApiCallSignature,
        );

        const indexSignatures = filterByKind(apiClass.members, [ApiItemKind.IndexSignature]).map(
            (apiItem) => apiItem as ApiIndexSignature,
        );

        const allMethods = filterByKind(apiClass.members, [ApiItemKind.Method]).map(
            (apiItem) => apiItem as ApiMethod,
        );

        // Split methods into static and non-static methods
        const staticMethods = allMethods.filter((apiMethod) => isStatic(apiMethod));
        const nonStaticMethods = allMethods.filter((apiMethod) => !isStatic(apiMethod));

        // Render summary tables
        const renderedMemberTables = renderMemberTables(
            [
                {
                    headingTitle: "Constructors",
                    itemKind: ApiItemKind.Constructor,
                    items: constructors,
                },
                {
                    headingTitle: "Static Events",
                    itemKind: ApiItemKind.Property,
                    items: staticEventProperties,
                    options: {
                        modifiersToOmit: [ApiModifier.Static],
                    },
                },
                {
                    headingTitle: "Static Properties",
                    itemKind: ApiItemKind.Property,
                    items: staticStandardProperties,
                    options: {
                        modifiersToOmit: [ApiModifier.Static],
                    },
                },
                {
                    headingTitle: "Static Methods",
                    itemKind: ApiItemKind.Method,
                    items: staticMethods,
                    options: {
                        modifiersToOmit: [ApiModifier.Static],
                    },
                },
                {
                    headingTitle: "Events",
                    itemKind: ApiItemKind.Property,
                    items: nonStaticEventProperties,
                    options: {
                        modifiersToOmit: [ApiModifier.Static],
                    },
                },
                {
                    headingTitle: "Properties",
                    itemKind: ApiItemKind.Property,
                    items: nonStaticStandardProperties,
                    options: {
                        modifiersToOmit: [ApiModifier.Static],
                    },
                },
                {
                    headingTitle: "Methods",
                    itemKind: ApiItemKind.Method,
                    items: nonStaticMethods,
                    options: {
                        modifiersToOmit: [ApiModifier.Static],
                    },
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
                    headingTitle: "Constructor Details",
                    itemKind: ApiItemKind.Constructor,
                    items: constructors,
                },
                {
                    headingTitle: "Event Details",
                    itemKind: ApiItemKind.Property,
                    items: eventProperties,
                },
                {
                    headingTitle: "Property Details",
                    itemKind: ApiItemKind.Property,
                    items: standardProperties,
                },
                {
                    headingTitle: "Method Details",
                    itemKind: ApiItemKind.MethodSignature,
                    items: allMethods,
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

    return config.renderChildrenSection(apiClass, innerSectionBody, config);
}
