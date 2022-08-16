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

export interface MemberTableProperties {
    headingTitle: string;
    itemKind: ApiItemKind;
    items: readonly ApiItem[];
}

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

export function renderTableWithHeading(
    memberTableProperties: MemberTableProperties,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection | undefined {
    const renderedTable = renderTable(
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

export function renderTable(
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
            return renderFunctionLikeTable(
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
            return renderDefaultTable(apiItems, itemKind, config);
    }
}

export function renderDefaultTable(
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

export function renderParametersTable(
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

export function renderFunctionLikeTable(
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
