/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    ApiDocumentedItem,
    ApiItem,
    ApiItemKind,
    ApiPackage,
    ApiPropertyItem,
    ApiReleaseTagMixin,
    ApiReturnTypeMixin,
    Excerpt,
    Parameter,
    ReleaseTag,
} from "@microsoft/api-extractor-model";

import { MarkdownDocumenterConfiguration } from "../../Configuration";
import { transformDocNode, transformSection } from "../../doc-node-to-documentation-ast";
import {
    CodeSpanNode,
    DocumentationNode,
    HeadingNode,
    HierarchicalSectionNode,
    PlainTextNode,
    SpanNode,
    TableCellNode,
    TableNode,
    TableRowNode,
    UrlLinkNode,
} from "../../documentation-domain";
import {
    ApiFunctionLike,
    ApiModifier,
    getDefaultValueBlock,
    getLinkForApiItem,
    getModifiers,
    isDeprecated,
} from "../../utilities";
import { renderExcerptWithHyperlinks } from "./Helpers";

// TODOs:
// - rename "render" to "create", since these are really creation / builder helpers

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

    /**
     * Rendering options for the table.
     */
    options?: TableRenderingOptions;
}

/**
 * Content / formatting options for table rendering.
 */
export interface TableRenderingOptions {
    /**
     * A list of modifiers to omit from table rendering.
     *
     * @defaultValue No modifier kinds will be excluded.
     */
    modifiersToOmit?: ApiModifier[];
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
): HierarchicalSectionNode[] | undefined {
    const sections: HierarchicalSectionNode[] = [];

    for (const member of memberTableProperties) {
        const table = renderTableWithHeading(member, config);
        if (table !== undefined) {
            sections.push(table);
        }
    }

    return sections.length === 0 ? undefined : sections;
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
): HierarchicalSectionNode | undefined {
    const renderedTable = renderSummaryTable(
        memberTableProperties.items,
        memberTableProperties.itemKind,
        config,
        memberTableProperties.options,
    );

    return renderedTable === undefined
        ? undefined
        : new HierarchicalSectionNode([
              // TODO: special heading hook?
              HeadingNode.createFromPlainText(memberTableProperties.headingTitle),
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
 * @param options - Table content / formatting options.
 */
export function renderSummaryTable(
    apiItems: readonly ApiItem[],
    itemKind: ApiItemKind,
    config: Required<MarkdownDocumenterConfiguration>,
    options?: TableRenderingOptions,
): TableNode | undefined {
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
                options,
            );

        case ApiItemKind.Property:
        case ApiItemKind.PropertySignature:
            return renderPropertiesTable(
                apiItems.map((apiItem) => apiItem as ApiPropertyItem),
                config,
                options,
            );

        case ApiItemKind.Package:
            return renderPackagesTable(
                apiItems.map((apiItem) => apiItem as ApiPackage),
                config,
            );

        default:
            return renderDefaultSummaryTable(apiItems, itemKind, config, options);
    }
}

/**
 * Default summary table rendering. Displays each item's name, modifiers, and description (summary) comment.
 *
 * @param apiItems - The items to be rendered. All of these items must be of the kind specified via `itemKind`.
 * @param itemKind - The kind of items being rendered in the table. Used to determine the semantic shape of the table.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 * @param options - Table content / formatting options.
 */
export function renderDefaultSummaryTable(
    apiItems: readonly ApiItem[],
    itemKind: ApiItemKind,
    config: Required<MarkdownDocumenterConfiguration>,
    options?: TableRenderingOptions,
): TableNode | undefined {
    if (apiItems.length === 0) {
        return undefined;
    }

    // Only display "Alerts" column if there are any deprecated items in the list.
    const hasDeprecated = apiItems.some(isDeprecated);

    // Only display "Modifiers" column if there are any modifiers to display.
    const hasModifiers = apiItems.some(
        (apiItem) => getModifiers(apiItem, options?.modifiersToOmit).length !== 0,
    );

    const headerRowCells: TableCellNode[] = [
        TableCellNode.createFromPlainText(getTableHeadingTitleForApiKind(itemKind)),
    ];
    if (hasDeprecated) {
        headerRowCells.push(TableCellNode.createFromPlainText("Alerts"));
    }
    if (hasModifiers) {
        headerRowCells.push(TableCellNode.createFromPlainText("Modifiers"));
    }
    headerRowCells.push(TableCellNode.createFromPlainText("Description"));
    const headerRow = new TableRowNode(headerRowCells);

    const tableRows: TableRowNode[] = [];
    for (const apiItem of apiItems) {
        const rowCells: TableCellNode[] = [renderApiTitleCell(apiItem, config)];
        if (hasDeprecated) {
            rowCells.push(renderDeprecatedCell(apiItem));
        }
        if (hasModifiers) {
            rowCells.push(renderModifiersCell(apiItem, options?.modifiersToOmit));
        }
        rowCells.push(renderApiSummaryCell(apiItem));

        tableRows.push(new TableRowNode(rowCells));
    }

    return new TableNode(tableRows, headerRow);
}

/**
 * Renders a simple summary table for a series of parameters.
 * Displays each parameter's name, type, and description ({@link https://tsdoc.org/pages/tags/param/ | @param}) comment.
 *
 * @param apiItems - The items to be rendered. All of these items must be of the kind specified via `itemKind`.
 * @param itemKind - The kind of items being rendered in the table. Used to determine the semantic shape of the table.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderParametersSummaryTable(
    apiParameters: readonly Parameter[],
    config: Required<MarkdownDocumenterConfiguration>,
): TableNode {
    // Only display "Modifiers" column if there are any optional parameters present.
    const hasOptionalParameters = apiParameters.some((apiParameter) => apiParameter.isOptional);

    const headerRowCells: TableCellNode[] = [TableCellNode.createFromPlainText("Parameter")];
    if (hasOptionalParameters) {
        headerRowCells.push(TableCellNode.createFromPlainText("Modifiers"));
    }
    headerRowCells.push(TableCellNode.createFromPlainText("Type"));
    headerRowCells.push(TableCellNode.createFromPlainText("Description"));
    const headerRow = new TableRowNode(headerRowCells);

    function renderModifierCell(apiParameter: Parameter): TableCellNode {
        return apiParameter.isOptional
            ? TableCellNode.createFromPlainText("optional")
            : TableCellNode.Empty;
    }

    const tableRows: TableRowNode[] = [];
    for (const apiParameter of apiParameters) {
        const rowCells: TableCellNode[] = [renderParameterTitleCell(apiParameter)];
        if (hasOptionalParameters) {
            rowCells.push(renderModifierCell(apiParameter));
        }
        rowCells.push(renderParameterTypeCell(apiParameter, config));
        rowCells.push(renderParameterSummaryCell(apiParameter, config));

        tableRows.push(new TableRowNode(rowCells));
    }

    return new TableNode(tableRows, headerRow);
}

/**
 * Renders a simple summary table for function-like API items (constructors, functions, methods).
 * Displays each item's name, modifiers, return type, and description (summary) comment.
 *
 * @param apiItems - The function-like items to be rendered.
 * @param itemKind - The kind of items being rendered in the table. Used to determine the semantic shape of the table.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 * @param options - Table content / formatting options.
 */
export function renderFunctionLikeSummaryTable(
    apiItems: readonly ApiFunctionLike[],
    itemKind: ApiItemKind,
    config: Required<MarkdownDocumenterConfiguration>,
    options?: TableRenderingOptions,
): TableNode | undefined {
    if (apiItems.length === 0) {
        return undefined;
    }

    // Only display "Alerts" column if there are any deprecated items in the list.
    const hasDeprecated = apiItems.some(isDeprecated);

    // Only display "Modifiers" column if there are any modifiers to display.
    const hasModifiers = apiItems.some(
        (apiItem) => getModifiers(apiItem, options?.modifiersToOmit).length !== 0,
    );
    const hasReturnTypes = apiItems.some((apiItem) => ApiReturnTypeMixin.isBaseClassOf(apiItem));

    const headerRowCells: TableCellNode[] = [
        TableCellNode.createFromPlainText(getTableHeadingTitleForApiKind(itemKind)),
    ];
    if (hasDeprecated) {
        headerRowCells.push(TableCellNode.createFromPlainText("Alerts"));
    }
    if (hasModifiers) {
        headerRowCells.push(TableCellNode.createFromPlainText("Modifiers"));
    }
    if (hasReturnTypes) {
        headerRowCells.push(TableCellNode.createFromPlainText("Return Type"));
    }
    headerRowCells.push(TableCellNode.createFromPlainText("Description"));
    const headerRow = new TableRowNode(headerRowCells);

    const tableRows: TableRowNode[] = [];
    for (const apiItem of apiItems) {
        const rowCells: TableCellNode[] = [renderApiTitleCell(apiItem, config)];
        if (hasDeprecated) {
            rowCells.push(renderDeprecatedCell(apiItem));
        }
        if (hasModifiers) {
            rowCells.push(renderModifiersCell(apiItem, options?.modifiersToOmit));
        }
        if (hasReturnTypes) {
            rowCells.push(renderReturnTypeCell(apiItem, config));
        }
        rowCells.push(renderApiSummaryCell(apiItem));

        tableRows.push(new TableRowNode(rowCells));
    }

    return new TableNode(tableRows, headerRow);
}

/**
 * Renders a simple summary table for a series of properties.
 * Displays each property's name, modifiers, type, and description (summary) comment.
 *
 * @param apiProperties - The `Property` items to be rendered.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 * @param options - Table content / formatting options.
 */
export function renderPropertiesTable(
    apiProperties: readonly ApiPropertyItem[],
    config: Required<MarkdownDocumenterConfiguration>,
    options?: TableRenderingOptions,
): TableNode | undefined {
    if (apiProperties.length === 0) {
        return undefined;
    }

    // Only display "Alerts" column if there are any deprecated items in the list.
    const hasDeprecated = apiProperties.some(isDeprecated);

    // Only display "Modifiers" column if there are any modifiers to display.
    const hasModifiers = apiProperties.some(
        (apiItem) => getModifiers(apiItem, options?.modifiersToOmit).length !== 0,
    );
    const hasDefaultValues = apiProperties.some(
        (apiItem) => getDefaultValueBlock(apiItem, config) !== undefined,
    );

    const headerRowCells: TableCellNode[] = [TableCellNode.createFromPlainText("Property")];
    if (hasDeprecated) {
        headerRowCells.push(TableCellNode.createFromPlainText("Alerts"));
    }
    if (hasModifiers) {
        headerRowCells.push(TableCellNode.createFromPlainText("Modifiers"));
    }
    if (hasDefaultValues) {
        headerRowCells.push(TableCellNode.createFromPlainText("Default Value"));
    }
    headerRowCells.push(TableCellNode.createFromPlainText("Type"));
    headerRowCells.push(TableCellNode.createFromPlainText("Description"));
    const headerRow = new TableRowNode(headerRowCells);

    const tableRows: TableRowNode[] = [];
    for (const apiProperty of apiProperties) {
        const rowCells: TableCellNode[] = [renderApiTitleCell(apiProperty, config)];
        if (hasDeprecated) {
            rowCells.push(renderDeprecatedCell(apiProperty));
        }
        if (hasModifiers) {
            rowCells.push(renderModifiersCell(apiProperty, options?.modifiersToOmit));
        }
        if (hasDefaultValues) {
            rowCells.push(renderDefaultValueCell(apiProperty, config));
        }
        rowCells.push(renderPropertyTypeCell(apiProperty, config));
        rowCells.push(renderApiSummaryCell(apiProperty));

        tableRows.push(new TableRowNode(rowCells));
    }

    return new TableNode(tableRows, headerRow);
}

/**
 * Renders a simple summary table for a list of packages.
 * Displays each package's name and description
 * ({@link https://tsdoc.org/pages/tags/packagedocumentation/ | @packageDocumentation}) comment.
 *
 * @param apiPackages - The package items to be rendered.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderPackagesTable(
    apiPackages: readonly ApiPackage[],
    config: Required<MarkdownDocumenterConfiguration>,
): TableNode | undefined {
    if (apiPackages.length === 0) {
        return undefined;
    }

    // Only display "Alerts" column if there are any deprecated items in the list.
    const hasDeprecated = apiPackages.some(isDeprecated);

    const headerRowCells: TableCellNode[] = [TableCellNode.createFromPlainText("Package")];
    if (hasDeprecated) {
        headerRowCells.push(TableCellNode.createFromPlainText("Alerts"));
    }
    headerRowCells.push(TableCellNode.createFromPlainText("Description"));
    const headerRow = new TableRowNode(headerRowCells);

    const tableRows: TableRowNode[] = [];
    for (const apiPackage of apiPackages) {
        const rowCells: TableCellNode[] = [renderApiTitleCell(apiPackage, config)];
        if (hasDeprecated) {
            rowCells.push(renderDeprecatedCell(apiPackage));
        }
        rowCells.push(renderApiSummaryCell(apiPackage));

        tableRows.push(new TableRowNode(rowCells));
    }

    return new TableNode(tableRows, headerRow);
}

/**
 * Renders a table cell containing the description (summary) comment for the provided API item.
 * If the item has an `@beta` release tag, the comment will be annotated as being beta content.
 *
 * @param apiItem - The API item whose comment will be rendered in the cell.
 */
export function renderApiSummaryCell(apiItem: ApiItem): TableCellNode {
    const children: DocumentationNode[] = [];

    if (ApiReleaseTagMixin.isBaseClassOf(apiItem)) {
        if (apiItem.releaseTag === ReleaseTag.Beta) {
            children.push(
                new SpanNode([new PlainTextNode("(BETA)")], {
                    bold: true,
                    italic: true,
                }),
            );
        }
    }

    if (apiItem instanceof ApiDocumentedItem) {
        if (apiItem.tsdocComment !== undefined) {
            children.push(transformSection(apiItem.tsdocComment.summarySection));
        }
    }

    return children.length === 0 ? TableCellNode.Empty : new TableCellNode(children);
}

/**
 * Renders a table cell containing the return type information for the provided function-like API item,
 * if it specifies one. If it does not specify a type, an empty table cell will be rendered.
 *
 * @remarks This content will be rendered as links to type signature documentation for other items local to the same
 * API suite (model).
 *
 * @param apiItem - The API item whose return type will be rendered in the cell.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderReturnTypeCell(
    apiItem: ApiFunctionLike,
    config: Required<MarkdownDocumenterConfiguration>,
): TableCellNode {
    return ApiReturnTypeMixin.isBaseClassOf(apiItem)
        ? renderTypeExcerptCell(apiItem.returnTypeExcerpt, config)
        : TableCellNode.Empty;
}

/**
 * Renders a table cell containing the name of the provided API item.
 *
 * @remarks This content will be rendered as a link to the section content describing the API item.
 *
 * @param apiItem - The API item whose name will be rendered in the cell, and to whose content the generate link
 * will point.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderApiTitleCell(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): TableCellNode {
    const itemLink = getLinkForApiItem(apiItem, config); // TODO: symbolic link?
    return new TableCellNode([
        new UrlLinkNode({
            urlTarget: itemLink.url,
            content: new PlainTextNode(itemLink.text),
        }),
    ]);
}

/**
 * Renders a table cell containing a list of modifiers that apply.
 *
 * @param apiItem - The API item whose modifiers will be rendered in the cell.
 * @param modifiersToOmit - List of modifiers to omit from the rendered cell, even if they apply to the item.
 */
export function renderModifiersCell(
    apiItem: ApiItem,
    modifiersToOmit?: ApiModifier[],
): TableCellNode {
    const modifiers = getModifiers(apiItem, modifiersToOmit);

    const docNodes: DocumentationNode[] = [];
    let needsComma = false;
    for (const modifier of modifiers) {
        if (needsComma) {
            docNodes.push(new PlainTextNode(", "));
        }
        docNodes.push(CodeSpanNode.createFromPlainText(modifier));
    }

    return modifiers.length === 0 ? TableCellNode.Empty : new TableCellNode(docNodes);
}

/**
 * Renders a table cell containing the `@defaultValue` comment of the API item if it has one.
 *
 * @param apiItem - The API item whose `@defaultValue` comment will be rendered in the cell.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderDefaultValueCell(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): TableCellNode {
    const defaultValueSection = getDefaultValueBlock(apiItem, config); // TODO

    return defaultValueSection === undefined
        ? TableCellNode.Empty
        : new TableCellNode([transformSection(defaultValueSection)]);
}

/**
 * Renders a table cell noting that the item is deprecated if it is annotated with an `@deprecated` comment.
 * Will render an empty table cell otherwise.
 *
 * @param apiItem - The API item for which the deprecation notice will be displayed if appropriate.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderDeprecatedCell(apiItem: ApiItem): TableCellNode {
    return isDeprecated(apiItem)
        ? new TableCellNode([CodeSpanNode.createFromPlainText("DEPRECATED")])
        : TableCellNode.Empty;
}

/**
 * Renders a table cell containing the type information about the provided property.
 *
 * @remarks This content will be rendered as links to type signature documentation for other items local to the same
 * API suite (model).
 *
 * @param apiProperty - The property whose type information will be rendered in the cell.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderPropertyTypeCell(
    apiProperty: ApiPropertyItem,
    config: Required<MarkdownDocumenterConfiguration>,
): TableCellNode {
    return renderTypeExcerptCell(apiProperty.propertyTypeExcerpt, config);
}

/**
 * Renders a table cell containing the name of the provided parameter as plain text.
 *
 * @param apiParameter - The parameter whose name will be rendered in the cell.
 */
export function renderParameterTitleCell(apiParameter: Parameter): TableCellNode {
    return TableCellNode.createFromPlainText(apiParameter.name);
}

/**
 * Renders a table cell containing the type information about the provided parameter.
 *
 * @remarks This content will be rendered as links to type signature documentation for other items local to the same
 * API suite (model).
 *
 * @param apiProperty - The parameter whose type information will be rendered in the cell.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderParameterTypeCell(
    apiParameter: Parameter,
    config: Required<MarkdownDocumenterConfiguration>,
): TableCellNode {
    return renderTypeExcerptCell(apiParameter.parameterTypeExcerpt, config);
}

/**
 * Renders a table cell containing the description ({@link https://tsdoc.org/pages/tags/param/ | @param}) comment
 * of the provided parameter.
 * If the parameter has no documentation, an empty cell will be rendered.
 *
 * @param apiParameter - The parameter whose comment will be rendered in the cell
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderParameterSummaryCell(
    apiParameter: Parameter,
    config: Required<MarkdownDocumenterConfiguration>,
): TableCellNode {
    if (apiParameter.tsdocParamBlock === undefined) {
        return TableCellNode.Empty;
    }

    const cellContent = transformSection(apiParameter.tsdocParamBlock.content);

    return new TableCellNode([cellContent]);
}

/**
 * Renders a table cell containing type information.
 * @remarks This content will be rendered as links to type signature documentation for other items local to the same
 * API suite (model).
 *
 * @param typeExcerpty - An excerpt describing the type to be rendered.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderTypeExcerptCell(
    typeExcerpt: Excerpt,
    config: Required<MarkdownDocumenterConfiguration>,
): TableCellNode {
    const excerptNodes = renderExcerptWithHyperlinks(typeExcerpt, config);
    if (excerptNodes === undefined) {
        return TableCellNode.Empty;
    }

    const transformedNodes = excerptNodes.map(transformDocNode);
    return new TableCellNode(transformedNodes);
}

/**
 * Gets the appropriate heading title for the provided item kind to be used in table entries.
 */
function getTableHeadingTitleForApiKind(itemKind: ApiItemKind): string {
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
