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
import { DocNode, DocSection } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";
import { ApiModuleLike, filterByKind } from "../../utilities";
import { renderChildDetailsSection } from "../RenderingHelpers";
import { renderMemberTables } from "../Tables";

export function renderModuleLikeSection(
    apiItem: ApiModuleLike,
    childItems: readonly ApiItem[],
    config: Required<MarkdownDocumenterConfiguration>,
    renderChild: (apiItem: ApiItem) => DocSection,
): DocSection {
    const docNodes: DocNode[] = [];

    const hasAnyChildren = apiItem.members.length !== 0;

    // Child item kinds:
    // - Interface
    // - Class
    // - Variable
    // - Enum
    // - Function
    // - Namespace
    // - Type Alias

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
                    headingTitle: "Namespaces",
                    itemKind: ApiItemKind.Namespace,
                    items: namespaces,
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
                    headingTitle: "Enumerations",
                    itemKind: ApiItemKind.Enum,
                    items: enums,
                },
                {
                    headingTitle: "Variables",
                    itemKind: ApiItemKind.Variable,
                    items: variables,
                },
            ],
            config,
        );

        if (renderedMemberTables !== undefined) {
            docNodes.push(renderedMemberTables);
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
                    headingTitle: "Classe Details",
                    itemKind: ApiItemKind.Class,
                    items: classes,
                },
                {
                    headingTitle: "Namespace Details",
                    itemKind: ApiItemKind.Namespace,
                    items: namespaces,
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
                    headingTitle: "Enumeration Details",
                    itemKind: ApiItemKind.Enum,
                    items: enums,
                },
                {
                    headingTitle: "Variable Details",
                    itemKind: ApiItemKind.Variable,
                    items: variables,
                },
            ],
            config,
            renderChild,
        );

        if (renderedDetailsSection !== undefined) {
            docNodes.push(renderedDetailsSection);
        }
    }

    const innerSectionBody = new DocSection({ configuration: config.tsdocConfiguration }, docNodes);

    return config.renderSectionBlock(apiItem, innerSectionBody, config);
}
