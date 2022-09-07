/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    ApiClass,
    ApiEnum,
    ApiFunction,
    ApiInterface,
    ApiItem,
    ApiItemKind,
    ApiNamespace,
    ApiTypeAlias,
    ApiVariable,
} from "@microsoft/api-extractor-model";
import { DocSection } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../Configuration";
import { ApiModuleLike, filterByKind, mergeSections } from "../../utilities";
import { renderMemberTables } from "../helpers";
import { renderChildDetailsSection } from "../helpers/RenderingHelpers";

/**
 * Default policy for rendering doc sections for module-like API items (packages, namespaces).
 *
 * @remarks Format:
 *
 * - Tables
 *
 *   - interfaces
 *
 *   - classes
 *
 *   - enums
 *
 *   - type-aliases
 *
 *   - functions
 *
 *   - variables
 *
 *   - namespaces
 *
 * - Details (for any types not rendered to their own documents - see
 *   {@link PolicyOptions.documentBoundaries})
 *
 * - Tables
 *
 *   - interfaces
 *
 *   - classes
 *
 *   - enums
 *
 *   - type-aliases
 *
 *   - functions
 *
 *   - variables
 *
 *   - namespaces
 */
export function renderModuleLikeSection(
    apiItem: ApiModuleLike,
    childItems: readonly ApiItem[],
    config: Required<MarkdownDocumenterConfiguration>,
    renderChild: (apiItem: ApiItem) => DocSection,
): DocSection {
    const docSections: DocSection[] = [];

    const hasAnyChildren = apiItem.members.length !== 0;

    if (hasAnyChildren) {
        // Accumulate child items
        const interfaces = filterByKind(childItems, [ApiItemKind.Interface]).map(
            (apiItem) => apiItem as ApiInterface,
        );

        const classes = filterByKind(childItems, [ApiItemKind.Class]).map(
            (apiItem) => apiItem as ApiClass,
        );

        const namespaces = filterByKind(childItems, [ApiItemKind.Namespace]).map(
            (apiItem) => apiItem as ApiNamespace,
        );

        const types = filterByKind(childItems, [ApiItemKind.TypeAlias]).map(
            (apiItem) => apiItem as ApiTypeAlias,
        );

        const functions = filterByKind(childItems, [ApiItemKind.Function]).map(
            (apiItem) => apiItem as ApiFunction,
        );

        const enums = filterByKind(childItems, [ApiItemKind.Enum]).map(
            (apiItem) => apiItem as ApiEnum,
        );

        const variables = filterByKind(childItems, [ApiItemKind.Variable]).map(
            (apiItem) => apiItem as ApiVariable,
        );

        // Render summary tables
        const renderedMemberTables = renderMemberTables(
            [
                {
                    headingTitle: "Interfaces",
                    itemKind: ApiItemKind.Interface,
                    items: interfaces,
                },
                {
                    headingTitle: "Classes",
                    itemKind: ApiItemKind.Class,
                    items: classes,
                },
                {
                    headingTitle: "Enumerations",
                    itemKind: ApiItemKind.Enum,
                    items: enums,
                },
                {
                    headingTitle: "Types",
                    itemKind: ApiItemKind.TypeAlias,
                    items: types,
                },
                {
                    headingTitle: "Functions",
                    itemKind: ApiItemKind.Function,
                    items: functions,
                },
                {
                    headingTitle: "Variables",
                    itemKind: ApiItemKind.Variable,
                    items: variables,
                },
                {
                    headingTitle: "Namespaces",
                    itemKind: ApiItemKind.Namespace,
                    items: namespaces,
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
                    headingTitle: "Interface Details",
                    itemKind: ApiItemKind.Interface,
                    items: interfaces,
                },
                {
                    headingTitle: "Class Details",
                    itemKind: ApiItemKind.Class,
                    items: classes,
                },
                {
                    headingTitle: "Enumeration Details",
                    itemKind: ApiItemKind.Enum,
                    items: enums,
                },
                {
                    headingTitle: "Type Details",
                    itemKind: ApiItemKind.TypeAlias,
                    items: types,
                },
                {
                    headingTitle: "Function Details",
                    itemKind: ApiItemKind.Function,
                    items: functions,
                },
                {
                    headingTitle: "Variable Details",
                    itemKind: ApiItemKind.Variable,
                    items: variables,
                },
                {
                    headingTitle: "Namespace Details",
                    itemKind: ApiItemKind.Namespace,
                    items: namespaces,
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
    return config.renderChildrenSection(apiItem, innerSectionBody, config);
}
