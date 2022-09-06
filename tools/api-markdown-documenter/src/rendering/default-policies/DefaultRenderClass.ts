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

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";
import { filterByKind, mergeSections } from "../../utilities";
import { renderChildDetailsSection, renderMemberTables } from "../helpers";

/**
 * Default policy for rendering doc sections for `Class` items.
 *
 * @remarks Format:
 *
 * - Tables
 *
 *   - event properties
 *
 *   - constructors
 *
 *   - properties
 *
 *   - methods
 *
 *   - call-signatures
 *
 *   - index-signatures
 *
 * - Details (for any types not rendered to their own documents - see
 *   {@link PolicyOptions.documentBoundaries})
 *
 *   - event properties
 *
 *   - constructors
 *
 *   - properties
 *
 *   - methods
 *
 *   - call-signatures
 *
 *   - index-signatures
 *
 * Note: this ordering was established to mirror existing fluidframework.com rendering.
 * The plan is to change this in a subsequent change (before public release).
 */
export function renderClassSection(
    apiClass: ApiClass,
    config: Required<MarkdownDocumenterConfiguration>,
    renderChild: (apiItem: ApiItem) => DocSection,
): DocSection {
    const docSections: DocSection[] = [];

    const hasAnyChildren = apiClass.members.length !== 0;

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

        const callSignatures = filterByKind(apiClass.members, [ApiItemKind.CallSignature]).map(
            (apiItem) => apiItem as ApiCallSignature,
        );

        const indexSignatures = filterByKind(apiClass.members, [ApiItemKind.IndexSignature]).map(
            (apiItem) => apiItem as ApiIndexSignature,
        );

        const methods = filterByKind(apiClass.members, [ApiItemKind.Method]).map(
            (apiItem) => apiItem as ApiMethod,
        );

        // Render summary tables
        const renderedMemberTables = renderMemberTables(
            [
                {
                    headingTitle: "Events",
                    itemKind: ApiItemKind.Property,
                    items: eventProperties,
                },
                {
                    headingTitle: "Constructors",
                    itemKind: ApiItemKind.Constructor,
                    items: constructors,
                },
                {
                    headingTitle: "Properties",
                    itemKind: ApiItemKind.Property,
                    items: standardProperties,
                },
                {
                    headingTitle: "Methods",
                    itemKind: ApiItemKind.Method,
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
                    headingTitle: "Event Details",
                    itemKind: ApiItemKind.Property,
                    items: eventProperties,
                },
                {
                    headingTitle: "Constructor Details",
                    itemKind: ApiItemKind.Constructor,
                    items: constructors,
                },
                {
                    headingTitle: "Property Details",
                    itemKind: ApiItemKind.Property,
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

    return config.renderChildrenSection(apiClass, innerSectionBody, config);
}
