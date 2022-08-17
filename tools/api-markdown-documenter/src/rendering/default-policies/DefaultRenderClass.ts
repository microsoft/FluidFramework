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

        const properties = filterByKind(apiClass.members, [ApiItemKind.Property]).map(
            (apiItem) => apiItem as ApiProperty,
        );

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
