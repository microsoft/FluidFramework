import { DocTableRow } from "@microsoft/api-documenter/lib/nodes/DocTableRow";
import { Utilities } from "@microsoft/api-documenter/lib/utils/Utilities";
import {
    ApiCallSignature,
    ApiConstructSignature,
    ApiConstructor,
    ApiDocumentedItem,
    ApiIndexSignature,
    ApiItem,
    ApiMethod,
    ApiMethodSignature,
    ApiPropertyItem,
    ApiReleaseTagMixin,
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
    TSDocConfiguration,
} from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../MarkdownDocumenterConfiguration";
import { DocEmphasisSpan, DocTable, DocTableCell } from "../doc-nodes";
import { getLinkUrlForApiItem } from "../utilities";
import { renderExcerptWithHyperlinks } from "./Rendering";

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
            // TODO
            // cssClass: 'param-list',
            // caption: 'List of parameters'
        },
        tableRows,
    );
}

export function renderConstructorsTable(
    apiConstructors: ReadonlyArray<ApiConstructSignature | ApiConstructor>,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocTable | undefined {
    if (apiConstructors.length === 0) {
        return undefined;
    }

    const headerTitles = ["Constructor", "Modifiers", "Description"];
    const tableRows: DocTableRow[] = apiConstructors.map(
        (apiConstructor) =>
            new DocTableRow({ configuration: tsdocConfiguration }, [
                renderApiTitleCell(apiConstructor, documenterConfiguration, tsdocConfiguration),
                renderModifiersCell(apiConstructor, tsdocConfiguration),
                renderApiSummaryCell(apiConstructor, tsdocConfiguration),
            ]),
    );

    return new DocTable(
        {
            configuration: tsdocConfiguration,
            headerTitles,
            // TODO
            // cssClass: 'param-list',
            // caption: 'List of parameters'
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
            // TODO
            // cssClass: 'property-list',
            // caption: 'List of properties on this class'
        },
        tableRows,
    );
}

export function renderSignaturesTable(
    apiSignatures: ReadonlyArray<ApiCallSignature | ApiIndexSignature>,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocTable | undefined {
    if (apiSignatures.length === 0) {
        return undefined;
    }

    const headerTitles = ["Signature", "Modifiers", "Description"];
    const tableRows: DocTableRow[] = apiSignatures.map(
        (apiSignature) =>
            new DocTableRow({ configuration: tsdocConfiguration }, [
                renderApiTitleCell(apiSignature, documenterConfiguration, tsdocConfiguration),
                renderModifiersCell(apiSignature, tsdocConfiguration),
                renderApiSummaryCell(apiSignature, tsdocConfiguration),
            ]),
    );

    return new DocTable(
        {
            configuration: tsdocConfiguration,
            headerTitles,
            // TODO
            // cssClass: 'signatures-list',
            // caption: 'List of properties on this class'
        },
        tableRows,
    );
}

export function renderMethodsTable(
    apiMethods: ReadonlyArray<ApiMethod | ApiMethodSignature>,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocTable | undefined {
    if (apiMethods.length === 0) {
        return undefined;
    }

    const headerTitles = ["Method", "Modifiers", "Description"];
    const tableRows: DocTableRow[] = apiMethods.map(
        (apiMethod) =>
            new DocTableRow({ configuration: tsdocConfiguration }, [
                renderApiTitleCell(apiMethod, documenterConfiguration, tsdocConfiguration),
                renderModifiersCell(apiMethod, tsdocConfiguration),
                renderApiSummaryCell(apiMethod, tsdocConfiguration),
            ]),
    );

    return new DocTable(
        {
            configuration: tsdocConfiguration,
            headerTitles,
            // TODO
            // cssClass: 'method-list',
            // caption: 'List of properties on this class'
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
