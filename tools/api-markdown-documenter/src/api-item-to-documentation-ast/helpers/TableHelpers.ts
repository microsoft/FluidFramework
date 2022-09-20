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
    LinkNode,
    PlainTextNode,
    SpanNode,
    TableCellNode,
    TableNode,
    TableRowNode,
} from "../../documentation-domain";
import {
    ApiFunctionLike,
    ApiModifier,
    getDefaultValueBlock,
    getLinkForApiItem,
    getModifiers,
    isDeprecated,
} from "../../utilities";
import { createExcerptSpanWithHyperlinks } from "./Helpers";

/**
 * Input properties for creating a table of API members
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
     * The items to be displayed as rows in the table.
     */
    items: readonly ApiItem[];

    /**
     * Creation options for the table.
     */
    options?: TableCreationOptions;
}

/**
 * Content / formatting options for table creation.
 */
export interface TableCreationOptions {
    /**
     * A list of modifiers to omit from table creation.
     *
     * @defaultValue No modifier kinds will be excluded.
     */
    modifiersToOmit?: ApiModifier[];
}

/**
 * Creates a simple section containing a series of headings and tables, representing the API members of some parent
 * item, organized by kind.
 *
 * @param memberTableProperties - List of table configurations.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function createMemberTables(
    memberTableProperties: readonly MemberTableProperties[],
    config: Required<MarkdownDocumenterConfiguration>,
): HierarchicalSectionNode[] | undefined {
    const sections: HierarchicalSectionNode[] = [];

    for (const member of memberTableProperties) {
        const table = createTableWithHeading(member, config);
        if (table !== undefined) {
            sections.push(table);
        }
    }

    return sections.length === 0 ? undefined : sections;
}

/**
 * Creates a simple section containing a heading and a table, based on the provided properties.
 *
 * @param memberTableProperties - The table configuration.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function createTableWithHeading(
    memberTableProperties: MemberTableProperties,
    config: Required<MarkdownDocumenterConfiguration>,
): HierarchicalSectionNode | undefined {
    const table = createSummaryTable(
        memberTableProperties.items,
        memberTableProperties.itemKind,
        config,
        memberTableProperties.options,
    );

    return table === undefined
        ? undefined
        : new HierarchicalSectionNode([
              // TODO: special heading hook?
              HeadingNode.createFromPlainText(memberTableProperties.headingTitle),
              table,
          ]);
}

/**
 * Creates a simple summary table for API items of the specified kind.
 * This is intended to represent a simple overview of the items.
 *
 * @remarks General use-case is to display a summary of child items of a given kind for some parent API item.
 *
 * @param apiItems - The items to be displayed. All of these items must be of the kind specified via `itemKind`.
 * @param itemKind - The kind of items being displayed in the table. Used to determine the semantic shape of the table.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 * @param options - Table content / formatting options.
 */
export function createSummaryTable(
    apiItems: readonly ApiItem[],
    itemKind: ApiItemKind,
    config: Required<MarkdownDocumenterConfiguration>,
    options?: TableCreationOptions,
): TableNode | undefined {
    if (itemKind === ApiItemKind.Model || itemKind === ApiItemKind.EntryPoint) {
        throw new Error(
            `Summary table creation does not support provided API item kind: "${itemKind}".`,
        );
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
            return createFunctionLikeSummaryTable(
                apiItems.map((apiItem) => apiItem as ApiFunctionLike),
                itemKind,
                config,
                options,
            );

        case ApiItemKind.Property:
        case ApiItemKind.PropertySignature:
            return createPropertiesTable(
                apiItems.map((apiItem) => apiItem as ApiPropertyItem),
                config,
                options,
            );

        case ApiItemKind.Package:
            return createPackagesTable(
                apiItems.map((apiItem) => apiItem as ApiPackage),
                config,
            );

        default:
            return createDefaultSummaryTable(apiItems, itemKind, config, options);
    }
}

/**
 * Default summary table generation. Displays each item's name, modifiers, and description (summary) comment.
 *
 * @param apiItems - The items to be displayed. All of these items must be of the kind specified via `itemKind`.
 * @param itemKind - The kind of items being displayed in the table. Used to determine the semantic shape of the table.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 * @param options - Table content / formatting options.
 */
export function createDefaultSummaryTable(
    apiItems: readonly ApiItem[],
    itemKind: ApiItemKind,
    config: Required<MarkdownDocumenterConfiguration>,
    options?: TableCreationOptions,
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
        const rowCells: TableCellNode[] = [createApiTitleCell(apiItem, config)];
        if (hasDeprecated) {
            rowCells.push(createDeprecatedCell(apiItem));
        }
        if (hasModifiers) {
            rowCells.push(createModifiersCell(apiItem, options?.modifiersToOmit));
        }
        rowCells.push(createApiSummaryCell(apiItem));

        tableRows.push(new TableRowNode(rowCells));
    }

    return new TableNode(tableRows, headerRow);
}

/**
 * Creates a simple summary table for a series of parameters.
 * Displays each parameter's name, type, and description ({@link https://tsdoc.org/pages/tags/param/ | @param}) comment.
 *
 * @param apiItems - The items to be displayed. All of these items must be of the kind specified via `itemKind`.
 * @param itemKind - The kind of items being displayed in the table. Used to determine the semantic shape of the table.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function createParametersSummaryTable(
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

    function createModifierCell(apiParameter: Parameter): TableCellNode {
        return apiParameter.isOptional
            ? TableCellNode.createFromPlainText("optional")
            : TableCellNode.Empty;
    }

    const tableRows: TableRowNode[] = [];
    for (const apiParameter of apiParameters) {
        const rowCells: TableCellNode[] = [createParameterTitleCell(apiParameter)];
        if (hasOptionalParameters) {
            rowCells.push(createModifierCell(apiParameter));
        }
        rowCells.push(createParameterTypeCell(apiParameter, config));
        rowCells.push(createParameterSummaryCell(apiParameter));

        tableRows.push(new TableRowNode(rowCells));
    }

    return new TableNode(tableRows, headerRow);
}

/**
 * Creates a simple summary table for function-like API items (constructors, functions, methods).
 * Displays each item's name, modifiers, return type, and description (summary) comment.
 *
 * @param apiItems - The function-like items to be displayed.
 * @param itemKind - The kind of items being rendered in the table. Used to determine the semantic shape of the table.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 * @param options - Table content / formatting options.
 */
export function createFunctionLikeSummaryTable(
    apiItems: readonly ApiFunctionLike[],
    itemKind: ApiItemKind,
    config: Required<MarkdownDocumenterConfiguration>,
    options?: TableCreationOptions,
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
        const rowCells: TableCellNode[] = [createApiTitleCell(apiItem, config)];
        if (hasDeprecated) {
            rowCells.push(createDeprecatedCell(apiItem));
        }
        if (hasModifiers) {
            rowCells.push(createModifiersCell(apiItem, options?.modifiersToOmit));
        }
        if (hasReturnTypes) {
            rowCells.push(createReturnTypeCell(apiItem, config));
        }
        rowCells.push(createApiSummaryCell(apiItem));

        tableRows.push(new TableRowNode(rowCells));
    }

    return new TableNode(tableRows, headerRow);
}

/**
 * Creates a simple summary table for a series of properties.
 * Displays each property's name, modifiers, type, and description (summary) comment.
 *
 * @param apiProperties - The `Property` items to be displayed.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 * @param options - Table content / formatting options.
 */
export function createPropertiesTable(
    apiProperties: readonly ApiPropertyItem[],
    config: Required<MarkdownDocumenterConfiguration>,
    options?: TableCreationOptions,
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
        const rowCells: TableCellNode[] = [createApiTitleCell(apiProperty, config)];
        if (hasDeprecated) {
            rowCells.push(createDeprecatedCell(apiProperty));
        }
        if (hasModifiers) {
            rowCells.push(createModifiersCell(apiProperty, options?.modifiersToOmit));
        }
        if (hasDefaultValues) {
            rowCells.push(createDefaultValueCell(apiProperty, config));
        }
        rowCells.push(createPropertyTypeCell(apiProperty, config));
        rowCells.push(createApiSummaryCell(apiProperty));

        tableRows.push(new TableRowNode(rowCells));
    }

    return new TableNode(tableRows, headerRow);
}

/**
 * Creates a simple summary table for a list of packages.
 * Displays each package's name and description
 * ({@link https://tsdoc.org/pages/tags/packagedocumentation/ | @packageDocumentation}) comment.
 *
 * @param apiPackages - The package items to be displayed.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function createPackagesTable(
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
        const rowCells: TableCellNode[] = [createApiTitleCell(apiPackage, config)];
        if (hasDeprecated) {
            rowCells.push(createDeprecatedCell(apiPackage));
        }
        rowCells.push(createApiSummaryCell(apiPackage));

        tableRows.push(new TableRowNode(rowCells));
    }

    return new TableNode(tableRows, headerRow);
}

/**
 * Creates a table cell containing the description (summary) comment for the provided API item.
 * If the item has an `@beta` release tag, the comment will be annotated as being beta content.
 *
 * @param apiItem - The API item whose comment will be rendered in the cell.
 */
export function createApiSummaryCell(apiItem: ApiItem): TableCellNode {
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
 * Creates a table cell containing the return type information for the provided function-like API item,
 * if it specifies one. If it does not specify a type, an empty table cell will be used.
 *
 * @remarks This content will be generated as links to type signature documentation for other items local to the same
 * API suite (model).
 *
 * @param apiItem - The API item whose return type will be displayed in the cell.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function createReturnTypeCell(
    apiItem: ApiFunctionLike,
    config: Required<MarkdownDocumenterConfiguration>,
): TableCellNode {
    return ApiReturnTypeMixin.isBaseClassOf(apiItem)
        ? createTypeExcerptCell(apiItem.returnTypeExcerpt, config)
        : TableCellNode.Empty;
}

/**
 * Creates a table cell containing the name of the provided API item.
 *
 * @remarks This content will be generated as a link to the section content describing the API item.
 *
 * @param apiItem - The API item whose name will be displayed in the cell, and to whose content the generate link
 * will point.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function createApiTitleCell(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): TableCellNode {
    const itemLink = getLinkForApiItem(apiItem, config); // TODO: symbolic link?
    return new TableCellNode([
        new LinkNode({
            target: itemLink.url,
            content: new PlainTextNode(itemLink.text),
        }),
    ]);
}

/**
 * Creates a table cell containing a list of modifiers that apply.
 *
 * @param apiItem - The API item whose modifiers will be displayed in the cell.
 * @param modifiersToOmit - List of modifiers to omit from the generated cell, even if they apply to the item.
 */
export function createModifiersCell(
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
 * Creates a table cell containing the `@defaultValue` comment of the API item if it has one.
 *
 * @param apiItem - The API item whose `@defaultValue` comment will be displayed in the cell.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function createDefaultValueCell(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): TableCellNode {
    const defaultValueSection = getDefaultValueBlock(apiItem, config); // TODO

    return defaultValueSection === undefined
        ? TableCellNode.Empty
        : new TableCellNode([transformSection(defaultValueSection)]);
}

/**
 * Creates a table cell noting that the item is deprecated if it is annotated with an `@deprecated` comment.
 * Will use an empty table cell otherwise.
 *
 * @param apiItem - The API item for which the deprecation notice will be displayed if appropriate.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function createDeprecatedCell(apiItem: ApiItem): TableCellNode {
    return isDeprecated(apiItem)
        ? new TableCellNode([CodeSpanNode.createFromPlainText("DEPRECATED")])
        : TableCellNode.Empty;
}

/**
 * Creates a table cell containing the type information about the provided property.
 *
 * @remarks This content will be generated as links to type signature documentation for other items local to the same
 * API suite (model).
 *
 * @param apiProperty - The property whose type information will be displayed in the cell.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function createPropertyTypeCell(
    apiProperty: ApiPropertyItem,
    config: Required<MarkdownDocumenterConfiguration>,
): TableCellNode {
    return createTypeExcerptCell(apiProperty.propertyTypeExcerpt, config);
}

/**
 * Creates a table cell containing the name of the provided parameter as plain text.
 *
 * @param apiParameter - The parameter whose name will be displayed in the cell.
 */
export function createParameterTitleCell(apiParameter: Parameter): TableCellNode {
    return TableCellNode.createFromPlainText(apiParameter.name);
}

/**
 * Creates a table cell containing the type information about the provided parameter.
 *
 * @remarks This content will be generated as links to type signature documentation for other items local to the same
 * API suite (model).
 *
 * @param apiProperty - The parameter whose type information will be displayed in the cell.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function createParameterTypeCell(
    apiParameter: Parameter,
    config: Required<MarkdownDocumenterConfiguration>,
): TableCellNode {
    return createTypeExcerptCell(apiParameter.parameterTypeExcerpt, config);
}

/**
 * Creates a table cell containing the description ({@link https://tsdoc.org/pages/tags/param/ | @param}) comment
 * of the provided parameter.
 * If the parameter has no documentation, an empty cell will be used.
 *
 * @param apiParameter - The parameter whose comment will be displayed in the cell
 */
export function createParameterSummaryCell(apiParameter: Parameter): TableCellNode {
    if (apiParameter.tsdocParamBlock === undefined) {
        return TableCellNode.Empty;
    }

    const cellContent = transformSection(apiParameter.tsdocParamBlock.content);

    return new TableCellNode([cellContent]);
}

/**
 * Creates a table cell containing type information.
 * @remarks This content will be generated as links to type signature documentation for other items local to the same
 * API suite (model).
 *
 * @param typeExcerpty - An excerpt describing the type to be displayed in the cell.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function createTypeExcerptCell(
    typeExcerpt: Excerpt,
    config: Required<MarkdownDocumenterConfiguration>,
): TableCellNode {
    const excerptNodes = createExcerptSpanWithHyperlinks(typeExcerpt, config);
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
