/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocTableRow } from "@microsoft/api-documenter/lib/nodes/DocTableRow";
import { Utilities } from "@microsoft/api-documenter/lib/utils/Utilities";
import {
    ApiDocumentedItem,
    ApiItem,
    ApiItemKind,
    ApiPackage,
    ApiPropertyItem,
    ApiReleaseTagMixin,
    ApiReturnTypeMixin,
    ApiStaticMixin,
    Parameter,
    ReleaseTag,
} from "@microsoft/api-extractor-model";
import {
    DocCodeSpan,
    DocLinkTag,
    DocNode,
    DocParagraph,
    DocPlainText,
    DocSection,
} from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";
import { DocEmphasisSpan, DocTable, DocTableCell } from "../../doc-nodes";
import { ApiFunctionLike, getLinkUrlForApiItem, mergeSections } from "../../utilities";
import { renderExcerptWithHyperlinks, renderHeading } from "./RenderingHelpers";

/**
 * Input properties for rendering a table of API members
 */
export interface MemberTableProperties {
    /**
     * Heading text to display above the table contents.
     */
    headingTitle: string;

    /**
     * The kind of API item.
     */
    itemKind: ApiItemKind;

    /**
     * The items to be rendered as rows in the table.
     */
    items: readonly ApiItem[];
}

/**
 * Renders a simple section containing a series of headings and tables, representing the API members of some parent
 * item, organized by kind.
 *
 * @param memberTableProperties - List of table configurations.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderMemberTables(
    memberTableProperties: readonly MemberTableProperties[],
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection | undefined {
    const docSections: DocSection[] = [];

    for (const member of memberTableProperties) {
        const renderedTable = renderTableWithHeading(member, config);
        if (renderedTable !== undefined) {
            docSections.push(renderedTable);
        }
    }

    return docSections.length === 0
        ? undefined
        : mergeSections(docSections, config.tsdocConfiguration);
}

/**
 * Renders a simple section containing a heading and a table, based on the provided properties.
 *
 * @param memberTableProperties - The table configuration.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderTableWithHeading(
    memberTableProperties: MemberTableProperties,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection | undefined {
    const renderedTable = renderSummaryTable(
        memberTableProperties.items,
        memberTableProperties.itemKind,
        config,
    );

    return renderedTable === undefined
        ? undefined
        : new DocSection({ configuration: config.tsdocConfiguration }, [
              renderHeading({ title: memberTableProperties.headingTitle }, config),
              renderedTable,
          ]);
}

/**
 * Renders a simple summary table for API items of the specified kind.
 * This is intended to represent a simple overview of the items.
 *
 * @remarks General use-case is to render a summary of child items of a given kind for some parent API item.
 *
 * @param apiItems - The items to be rendered. All of these items must be of the kind specified via `itemKind`.
 * @param itemKind - The kind of items being rendered in the table. Used to determine the semantic shape of the table.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderSummaryTable(
    apiItems: readonly ApiItem[],
    itemKind: ApiItemKind,
    config: Required<MarkdownDocumenterConfiguration>,
): DocTable | undefined {
    if (itemKind === ApiItemKind.Model || itemKind === ApiItemKind.EntryPoint) {
        throw new Error(`Table rendering does not support provided API item kind: "${itemKind}".`);
    }

    if (apiItems.length === 0) {
        return undefined;
    }

    switch (itemKind) {
        case ApiItemKind.ConstructSignature:
        case ApiItemKind.Constructor:
        case ApiItemKind.Function:
        case ApiItemKind.Method:
        case ApiItemKind.MethodSignature:
            return renderFunctionLikeSummaryTable(
                apiItems.map((apiItem) => apiItem as ApiFunctionLike),
                itemKind,
                config,
            );

        case ApiItemKind.Property:
        case ApiItemKind.PropertySignature:
            return renderPropertiesTable(
                apiItems.map((apiItem) => apiItem as ApiPropertyItem),
                config,
            );

        case ApiItemKind.Package:
            return renderPackagesTable(
                apiItems.map((apiItem) => apiItem as ApiPackage),
                config,
            );

        default:
            return renderDefaultSummaryTable(apiItems, itemKind, config);
    }
}

/**
 * Default summary table rendering. Displays each item's name, modifiers, and description (summary) comment.
 *
 * @param apiItems - The items to be rendered. All of these items must be of the kind specified via `itemKind`.
 * @param itemKind - The kind of items being rendered in the table. Used to determine the semantic shape of the table.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderDefaultSummaryTable(
    apiItems: readonly ApiItem[],
    itemKind: ApiItemKind,
    config: Required<MarkdownDocumenterConfiguration>,
): DocTable | undefined {
    if (apiItems.length === 0) {
        return undefined;
    }

    const headerTitles = [getHeadingTitleForApiKind(itemKind), "Modifiers", "Description"];
    const tableRows: DocTableRow[] = apiItems.map(
        (apiItem) =>
            new DocTableRow({ configuration: config.tsdocConfiguration }, [
                renderApiTitleCell(apiItem, config),
                renderModifiersCell(apiItem, config),
                renderApiSummaryCell(apiItem, config),
            ]),
    );

    return new DocTable(
        {
            configuration: config.tsdocConfiguration,
            headerTitles,
        },
        tableRows,
    );
}

/**
 * Renders a simple summary table for a series of parameters.
 * Displays each parameter's name, type, and description (summary) comment.
 *
 * @param apiItems - The items to be rendered. All of these items must be of the kind specified via `itemKind`.
 * @param itemKind - The kind of items being rendered in the table. Used to determine the semantic shape of the table.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderParametersSummaryTable(
    apiParameters: readonly Parameter[],
    config: Required<MarkdownDocumenterConfiguration>,
): DocTable {
    const headerTitles = ["Parameter", "Type", "Description"];
    const tableRows: DocTableRow[] = apiParameters.map(
        (apiParameter) =>
            new DocTableRow({ configuration: config.tsdocConfiguration }, [
                renderParameterTitleCell(apiParameter, config),
                renderParameterTypeCell(apiParameter, config),
                renderParameterSummaryCell(apiParameter, config),
            ]),
    );

    return new DocTable(
        {
            configuration: config.tsdocConfiguration,
            headerTitles,
        },
        tableRows,
    );
}

/**
 * Renders a simple summary table for function-like API items (constructors, functions, methods).
 * Displays each item's name, modifiers, return type, and description (summary) comment.
 *
 * @param apiItems - The function-like items to be rendered.
 * @param itemKind - The kind of items being rendered in the table. Used to determine the semantic shape of the table.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderFunctionLikeSummaryTable(
    apiItems: readonly ApiFunctionLike[],
    itemKind: ApiItemKind,
    config: Required<MarkdownDocumenterConfiguration>,
): DocTable | undefined {
    if (apiItems.length === 0) {
        return undefined;
    }

    const headerTitles = [
        getHeadingTitleForApiKind(itemKind),
        "Modifiers",
        "Return Type",
        "Description",
    ];
    const tableRows: DocTableRow[] = apiItems.map(
        (apiItem) =>
            new DocTableRow({ configuration: config.tsdocConfiguration }, [
                renderApiTitleCell(apiItem, config),
                renderModifiersCell(apiItem, config),
                renderReturnTypeCell(apiItem, config),
                renderApiSummaryCell(apiItem, config),
            ]),
    );

    return new DocTable(
        {
            configuration: config.tsdocConfiguration,
            headerTitles,
        },
        tableRows,
    );
}

/**
 * Renders a simple summary table for a series of properties.
 * Displays each property's name, modifiers, type, and description (summary) comment.
 *
 * @param apiItems - The items to be rendered. All of these items must be of the kind specified via `itemKind`.
 * @param itemKind - The kind of items being rendered in the table. Used to determine the semantic shape of the table.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderPropertiesTable(
    apiProperties: readonly ApiPropertyItem[],
    config: Required<MarkdownDocumenterConfiguration>,
): DocTable | undefined {
    if (apiProperties.length === 0) {
        return undefined;
    }

    const headerTitles = ["Property", "Modifiers", "Type", "Description"];
    const tableRows: DocTableRow[] = apiProperties.map(
        (apiProperty) =>
            new DocTableRow({ configuration: config.tsdocConfiguration }, [
                renderApiTitleCell(apiProperty, config),
                renderModifiersCell(apiProperty, config),
                renderPropertyTypeCell(apiProperty, config),
                renderApiSummaryCell(apiProperty, config),
            ]),
    );

    return new DocTable(
        {
            configuration: config.tsdocConfiguration,
            headerTitles,
        },
        tableRows,
    );
}

/**
 * Renders a simple summary table for a list of packages.
 * Displays each package's name and description (summary) comment.
 *
 * @param apiItems - The items to be rendered. All of these items must be of the kind specified via `itemKind`.
 * @param itemKind - The kind of items being rendered in the table. Used to determine the semantic shape of the table.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderPackagesTable(
    apiPackages: readonly ApiPackage[],
    config: Required<MarkdownDocumenterConfiguration>,
): DocTable | undefined {
    if (apiPackages.length === 0) {
        return undefined;
    }

    const headerTitles = ["Package", "Description"];
    const tableRows: DocTableRow[] = apiPackages.map(
        (apiProperty) =>
            new DocTableRow({ configuration: config.tsdocConfiguration }, [
                renderApiTitleCell(apiProperty, config),
                renderApiSummaryCell(apiProperty, config),
            ]),
    );

    return new DocTable(
        {
            configuration: config.tsdocConfiguration,
            headerTitles,
        },
        tableRows,
    );
}

/**
 * Renders a table cell containing the description (summary) comment for the provided API item.
 * If the item has an `@beta` release tag, the comment will be annotated as being beta content.
 *
 * @param apiItem - The API item whose comment will be rendered in the cell.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderApiSummaryCell(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): DocTableCell {
    const docNodes: DocNode[] = [];

    if (ApiReleaseTagMixin.isBaseClassOf(apiItem)) {
        if (apiItem.releaseTag === ReleaseTag.Beta) {
            docNodes.push(
                new DocEmphasisSpan(
                    { configuration: config.tsdocConfiguration, bold: true, italic: true },
                    [
                        new DocPlainText({
                            configuration: config.tsdocConfiguration,
                            text: "(BETA)",
                        }),
                    ],
                ),
            );
            docNodes.push(
                new DocPlainText({ configuration: config.tsdocConfiguration, text: " " }),
            );
        }
    }

    if (apiItem instanceof ApiDocumentedItem) {
        if (apiItem.tsdocComment !== undefined) {
            docNodes.push(apiItem.tsdocComment.summarySection);
        }
    }

    return new DocTableCell({ configuration: config.tsdocConfiguration }, docNodes);
}

/**
 * Renders a table cell containing the type information about the provided API item.
 * @remarks This content will be rendered as links to type signature documentation for other items local to the same
 * API suite (model).
 *
 * @param apiItem - The API item whose comment will be rendered in the cell.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderReturnTypeCell(
    apiItem: ApiFunctionLike,
    config: Required<MarkdownDocumenterConfiguration>,
): DocTableCell {
    const docNodes: DocNode[] = [];

    if (ApiReturnTypeMixin.isBaseClassOf(apiItem)) {
        docNodes.push(renderExcerptWithHyperlinks(apiItem.returnTypeExcerpt, config));
    }

    return new DocTableCell({ configuration: config.tsdocConfiguration }, [
        new DocParagraph({ configuration: config.tsdocConfiguration }, docNodes),
    ]);
}

/**
 * Renders a table cell containing the name of the provided API item.
 * @remarks This content will be rendered as a link to the section content describing the API item.
 *
 * @param apiItem - The API item whose name will be rendered in the cell, and to whose content the generate link
 * will point.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderApiTitleCell(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): DocTableCell {
    return new DocTableCell({ configuration: config.tsdocConfiguration }, [
        new DocParagraph({ configuration: config.tsdocConfiguration }, [
            new DocLinkTag({
                configuration: config.tsdocConfiguration,
                tagName: "@link",
                linkText: Utilities.getConciseSignature(apiItem),
                urlDestination: getLinkUrlForApiItem(apiItem, config),
            }),
        ]),
    ]);
}

/**
 * Renders a table cell containing a list of modifiers that apply.
 * @remarks This content will be rendered as links to type signature documentation for other items local to the same
 * API suite (model).
 *
 * @param apiItem - The API item whose comment will be rendered in the cell.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderModifiersCell(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): DocTableCell {
    const modifierNodes: DocNode[] = [];

    if (ApiStaticMixin.isBaseClassOf(apiItem)) {
        if (apiItem.isStatic) {
            modifierNodes.push(
                new DocCodeSpan({ configuration: config.tsdocConfiguration, code: "static" }),
            );
        }
    }

    return new DocTableCell({ configuration: config.tsdocConfiguration }, modifierNodes);
}

export function renderPropertyTypeCell(
    apiItem: ApiPropertyItem,
    config: Required<MarkdownDocumenterConfiguration>,
): DocTableCell {
    return new DocTableCell({ configuration: config.tsdocConfiguration }, [
        new DocParagraph({ configuration: config.tsdocConfiguration }, [
            renderExcerptWithHyperlinks(apiItem.propertyTypeExcerpt, config),
        ]),
    ]);
}

export function renderParameterTitleCell(
    apiParameter: Parameter,
    config: Required<MarkdownDocumenterConfiguration>,
): DocTableCell {
    return new DocTableCell({ configuration: config.tsdocConfiguration }, [
        new DocParagraph({ configuration: config.tsdocConfiguration }, [
            new DocPlainText({ configuration: config.tsdocConfiguration, text: apiParameter.name }),
        ]),
    ]);
}

export function renderParameterTypeCell(
    apiParameter: Parameter,
    config: Required<MarkdownDocumenterConfiguration>,
): DocTableCell {
    return new DocTableCell({ configuration: config.tsdocConfiguration }, [
        new DocParagraph({ configuration: config.tsdocConfiguration }, [
            renderExcerptWithHyperlinks(apiParameter.parameterTypeExcerpt, config),
        ]),
    ]);
}

export function renderParameterSummaryCell(
    apiParameter: Parameter,
    config: Required<MarkdownDocumenterConfiguration>,
): DocTableCell {
    return new DocTableCell(
        { configuration: config.tsdocConfiguration },
        apiParameter.tsdocParamBlock === undefined ? [] : [apiParameter.tsdocParamBlock.content],
    );
}

function getHeadingTitleForApiKind(itemKind: ApiItemKind): string {
    switch (itemKind) {
        case ApiItemKind.EnumMember:
            return "Flag";
        case ApiItemKind.MethodSignature:
            return ApiItemKind.Method;
        case ApiItemKind.PropertySignature:
            return ApiItemKind.Property;
        default:
            return itemKind;
    }
}
