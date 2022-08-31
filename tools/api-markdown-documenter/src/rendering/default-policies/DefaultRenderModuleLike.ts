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

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";
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
 *   - classes
 *
 *   - enums
 *
 *   - functions
 *
 *   - interfaces
 *
 *   - namespaces
 *
 *   - variables
 *
 *   - type-aliases
 *
 * - Details (for any types not rendered to their own documents - see
 *   {@link PolicyOptions.documentBoundaries})
 *
 *   - classes
 *
 *   - enums
 *
 *   - functions
 *
 *   - interfaces
 *
 *   - namespaces
 *
 *   - variables
 *
 *   - type-aliases
 *
 * Note: this ordering was established to mirror existing fluidframework.com rendering.
 * The plan is to change this in a subsequent change (before public release).
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
                    headingTitle: "Functions",
                    itemKind: ApiItemKind.Function,
                    items: functions,
                },
                {
                    headingTitle: "Interfaces",
                    itemKind: ApiItemKind.Interface,
                    items: interfaces,
                },
                {
                    headingTitle: "Namespaces",
                    itemKind: ApiItemKind.Namespace,
                    items: namespaces,
                },
                {
                    headingTitle: "Variables",
                    itemKind: ApiItemKind.Variable,
                    items: variables,
                },
                {
                    headingTitle: "Types",
                    itemKind: ApiItemKind.TypeAlias,
                    items: types,
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
                    headingTitle: "Classe Details",
                    itemKind: ApiItemKind.Class,
                    items: classes,
                },
                {
                    headingTitle: "Enumeration Details",
                    itemKind: ApiItemKind.Enum,
                    items: enums,
                },
                {
                    headingTitle: "Function Details",
                    itemKind: ApiItemKind.Function,
                    items: functions,
                },
                {
                    headingTitle: "Interface Details",
                    itemKind: ApiItemKind.Interface,
                    items: interfaces,
                },
                {
                    headingTitle: "Namespace Details",
                    itemKind: ApiItemKind.Namespace,
                    items: namespaces,
                },
                {
                    headingTitle: "Variable Details",
                    itemKind: ApiItemKind.Variable,
                    items: variables,
                },
                {
                    headingTitle: "Type Details",
                    itemKind: ApiItemKind.TypeAlias,
                    items: types,
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
