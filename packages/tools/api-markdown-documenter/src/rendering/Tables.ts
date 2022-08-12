import { DocTableRow } from "@microsoft/api-documenter/lib/nodes/DocTableRow";
import { Utilities } from "@microsoft/api-documenter/lib/utils/Utilities";
import {
    ApiDocumentedItem,
    ApiItem,
    ApiItemKind,
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
    TSDocConfiguration,
} from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../MarkdownDocumenterConfiguration";
import { DocEmphasisSpan, DocHeading, DocTable, DocTableCell } from "../doc-nodes";
import { ApiFunctionLike, getLinkUrlForApiItem } from "../utilities";
import { renderExcerptWithHyperlinks } from "./Rendering";

export interface MemberTableProperties {
    headingTitle: string;
    itemKind: ApiItemKind;
    items: readonly ApiItem[];
}

export function renderMemberTables(
    memberTableProperties: readonly MemberTableProperties[],
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocSection | undefined {
    const docNodes: DocNode[] = [];

    for (const member of memberTableProperties) {
        const renderedTable = renderTableWithHeading(
            member,
            documenterConfiguration,
            tsdocConfiguration,
        );
        if (renderedTable !== undefined) {
            docNodes.push(renderedTable);
        }
    }

    return docNodes.length === 0
        ? undefined
        : new DocSection({ configuration: tsdocConfiguration }, docNodes);
}

export function renderTableWithHeading(
    memberTableProperties: MemberTableProperties,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocSection | undefined {
    const renderedTable = renderTable(
        memberTableProperties.items,
        memberTableProperties.itemKind,
        documenterConfiguration,
        tsdocConfiguration,
    );

    return renderedTable === undefined
        ? undefined
        : new DocSection({ configuration: tsdocConfiguration }, [
              new DocHeading({
                  configuration: tsdocConfiguration,
                  title: memberTableProperties.headingTitle,
              }),
              renderedTable,
          ]);
}

export function renderTable(
    apiItems: readonly ApiItem[],
    itemKind: ApiItemKind,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
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
                documenterConfiguration,
                tsdocConfiguration,
            );

        case ApiItemKind.Property:
        case ApiItemKind.PropertySignature:
            return renderPropertiesTable(
                apiItems.map((apiItem) => apiItem as ApiPropertyItem),
                documenterConfiguration,
                tsdocConfiguration,
            );

        default:
            return renderDefaultTable(
                apiItems,
                itemKind,
                documenterConfiguration,
                tsdocConfiguration,
            );
    }
}

export function renderDefaultTable(
    apiItems: readonly ApiItem[],
    itemKind: ApiItemKind,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocTable | undefined {
    if (apiItems.length === 0) {
        return undefined;
    }

    const headerTitles = [getHeadingTitleForApiKind(itemKind), "Modifiers", "Description"];
    const tableRows: DocTableRow[] = apiItems.map(
        (apiItem) =>
            new DocTableRow({ configuration: tsdocConfiguration }, [
                renderApiTitleCell(apiItem, documenterConfiguration, tsdocConfiguration),
                renderModifiersCell(apiItem, tsdocConfiguration),
                renderApiSummaryCell(apiItem, tsdocConfiguration),
            ]),
    );

    return new DocTable(
        {
            configuration: tsdocConfiguration,
            headerTitles,
        },
        tableRows,
    );
}

export function renderParametersTable(
    apiParameters: readonly Parameter[],
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocTable {
    const headerTitles = ["Parameter", "Type", "Description"];
    // TODO: denote optional parameters?
    const tableRows: DocTableRow[] = apiParameters.map(
        (apiParameter) =>
            new DocTableRow({ configuration: tsdocConfiguration }, [
                renderParameterTitleCell(apiParameter, tsdocConfiguration),
                renderParameterTypeCell(apiParameter, documenterConfiguration, tsdocConfiguration),
                renderParameterSummaryCell(apiParameter, tsdocConfiguration),
            ]),
    );

    return new DocTable(
        {
            configuration: tsdocConfiguration,
            headerTitles,
        },
        tableRows,
    );
}

export function renderFunctionLikeTable(
    apiItems: readonly ApiFunctionLike[],
    itemKind: ApiItemKind,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
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
            new DocTableRow({ configuration: tsdocConfiguration }, [
                renderApiTitleCell(apiItem, documenterConfiguration, tsdocConfiguration),
                renderModifiersCell(apiItem, tsdocConfiguration),
                renderReturnTypeCell(apiItem, documenterConfiguration, tsdocConfiguration),
                renderApiSummaryCell(apiItem, tsdocConfiguration),
            ]),
    );

    return new DocTable(
        {
            configuration: tsdocConfiguration,
            headerTitles,
        },
        tableRows,
    );
}

export function renderPropertiesTable(
    apiProperties: readonly ApiPropertyItem[],
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocTable | undefined {
    if (apiProperties.length === 0) {
        return undefined;
    }

    const headerTitles = ["Property", "Modifiers", "Type", "Description"];
    const tableRows: DocTableRow[] = apiProperties.map(
        (apiProperty) =>
            new DocTableRow({ configuration: tsdocConfiguration }, [
                renderApiTitleCell(apiProperty, documenterConfiguration, tsdocConfiguration),
                renderModifiersCell(apiProperty, tsdocConfiguration),
                renderPropertyTypeCell(apiProperty, documenterConfiguration, tsdocConfiguration),
                renderApiSummaryCell(apiProperty, tsdocConfiguration),
            ]),
    );

    return new DocTable(
        {
            configuration: tsdocConfiguration,
            headerTitles,
        },
        tableRows,
    );
}

export function renderApiSummaryCell(
    apiItem: ApiItem,
    tsdocConfiguration: TSDocConfiguration,
): DocTableCell {
    const docNodes: DocNode[] = [];

    if (ApiReleaseTagMixin.isBaseClassOf(apiItem)) {
        if (apiItem.releaseTag === ReleaseTag.Beta) {
            docNodes.push(
                new DocEmphasisSpan(
                    { configuration: tsdocConfiguration, bold: true, italic: true },
                    [new DocPlainText({ configuration: tsdocConfiguration, text: "(BETA)" })],
                ),
            );
            docNodes.push(new DocPlainText({ configuration: tsdocConfiguration, text: " " }));
        }
    }

    if (apiItem instanceof ApiDocumentedItem) {
        if (apiItem.tsdocComment !== undefined) {
            docNodes.push(apiItem.tsdocComment.summarySection);
        }
    }

    return new DocTableCell({ configuration: tsdocConfiguration }, docNodes);
}

export function renderReturnTypeCell(
    apiItem: ApiFunctionLike,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocTableCell {
    const docNodes: DocNode[] = [];

    if (ApiReturnTypeMixin.isBaseClassOf(apiItem)) {
        docNodes.push(
            renderExcerptWithHyperlinks(
                apiItem.returnTypeExcerpt,
                documenterConfiguration,
                tsdocConfiguration,
            ),
        );
    }

    return new DocTableCell({ configuration: tsdocConfiguration }, [
        new DocParagraph({ configuration: tsdocConfiguration }, docNodes),
    ]);
}

export function renderApiTitleCell(
    apiItem: ApiItem,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocTableCell {
    return new DocTableCell({ configuration: tsdocConfiguration }, [
        new DocParagraph({ configuration: tsdocConfiguration }, [
            new DocLinkTag({
                configuration: tsdocConfiguration,
                tagName: "@link",
                linkText: Utilities.getConciseSignature(apiItem),
                urlDestination: getLinkUrlForApiItem(apiItem, documenterConfiguration),
            }),
        ]),
    ]);
}

export function renderModifiersCell(
    apiItem: ApiItem,
    tsdocConfiguration: TSDocConfiguration,
): DocTableCell {
    const modifierNodes: DocNode[] = [];
    if (ApiStaticMixin.isBaseClassOf(apiItem)) {
        if (apiItem.isStatic) {
            modifierNodes.push(
                new DocCodeSpan({ configuration: tsdocConfiguration, code: "static" }),
            );
        }
    }

    return new DocTableCell({ configuration: tsdocConfiguration }, modifierNodes);
}

export function renderPropertyTypeCell(
    apiItem: ApiPropertyItem,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocTableCell {
    return new DocTableCell({ configuration: tsdocConfiguration }, [
        new DocParagraph({ configuration: tsdocConfiguration }, [
            renderExcerptWithHyperlinks(
                apiItem.propertyTypeExcerpt,
                documenterConfiguration,
                tsdocConfiguration,
            ),
        ]),
    ]);
}

export function renderParameterTitleCell(
    apiParameter: Parameter,
    tsdocConfiguration: TSDocConfiguration,
): DocTableCell {
    return new DocTableCell({ configuration: tsdocConfiguration }, [
        new DocParagraph({ configuration: tsdocConfiguration }, [
            new DocPlainText({ configuration: tsdocConfiguration, text: apiParameter.name }),
        ]),
    ]);
}

export function renderParameterTypeCell(
    apiParameter: Parameter,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocTableCell {
    return new DocTableCell({ configuration: tsdocConfiguration }, [
        new DocParagraph({ configuration: tsdocConfiguration }, [
            renderExcerptWithHyperlinks(
                apiParameter.parameterTypeExcerpt,
                documenterConfiguration,
                tsdocConfiguration,
            ),
        ]),
    ]);
}

export function renderParameterSummaryCell(
    apiParameter: Parameter,
    tsdocConfiguration: TSDocConfiguration,
): DocTableCell {
    return new DocTableCell(
        { configuration: tsdocConfiguration },
        apiParameter.tsdocParamBlock === undefined ? [] : [apiParameter.tsdocParamBlock.content],
    );
}

export function getHeadingTitleForApiKind(itemKind: ApiItemKind): string {
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
