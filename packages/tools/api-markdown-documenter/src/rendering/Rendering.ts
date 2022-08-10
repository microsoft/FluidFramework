import { MarkdownEmitter } from "@microsoft/api-documenter/lib/markdown/MarkdownEmitter";
import { Utilities } from "@microsoft/api-documenter/lib/utils/Utilities";
import {
    ApiCallSignature,
    ApiClass,
    ApiConstructSignature,
    ApiConstructor,
    ApiDocumentedItem,
    ApiEnum,
    ApiFunction,
    ApiIndexSignature,
    ApiInterface,
    ApiItem,
    ApiItemKind,
    ApiMethod,
    ApiMethodSignature,
    ApiModel,
    ApiNamespace,
    ApiPackage,
    ApiPropertyItem,
    ApiReleaseTagMixin,
    ApiTypeAlias,
    ApiVariable,
    ReleaseTag,
} from "@microsoft/api-extractor-model";
import {
    DocLinkTag,
    DocNode,
    DocParagraph,
    DocPlainText,
    DocSection,
    StringBuilder,
    TSDocConfiguration,
} from "@microsoft/tsdoc";

import { Link, urlFromLink } from "../Link";
import { MarkdownDocument } from "../MarkdownDocument";
import { MarkdownDocumenterConfiguration } from "../MarkdownDocumenterConfiguration";
import { DocEmphasisSpan, DocHeading, DocNoteBox, DocTableCell } from "../doc-nodes";
import {
    doesItemRequireOwnDocument,
    getAncestralHierarchy,
    getFilePathForApiItem,
    getHeadingIdForApiItem,
    getHeadingTitleForApiItem,
    getLinkForApiItem,
    getLinkUrlForApiItem,
    getQualifiedApiItemName,
} from "../utilities";

// TODOs:
// - heading level tracking
// - Model heading text from config

/**
 * TODO
 * Note: no breadcrumb
 * @param apiModel - TODO
 * @param documenterConfiguration - TODO
 * @param tsdocConfiguration - TODO
 */
export function renderModelPage(
    apiModel: ApiModel,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
    markdownEmitter: MarkdownEmitter,
): MarkdownDocument {
    if (documenterConfiguration.verbose) {
        console.log(`Rendering API Model page...`);
    }

    const docNodes: DocNode[] = [];

    // Render heading
    // TODO: heading level
    if (documenterConfiguration.includeTopLevelDocumentHeading) {
        docNodes.push(renderHeading(apiModel, documenterConfiguration, tsdocConfiguration));
    }

    // Do not render breadcrumb for Model page

    // Render body contents
    docNodes.push(
        documenterConfiguration.renderModelSection(
            apiModel,
            documenterConfiguration,
            tsdocConfiguration,
        ),
    );

    if (documenterConfiguration.verbose) {
        console.log(`API Model page rendered successfully.`);
    }

    return createMarkdownDocument(
        apiModel,
        new DocSection({ configuration: tsdocConfiguration }, docNodes),
        documenterConfiguration,
        markdownEmitter,
    );
}

export function renderPackagePage(
    apiPackage: ApiPackage,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
    markdownEmitter: MarkdownEmitter,
): MarkdownDocument {
    if (documenterConfiguration.verbose) {
        console.log(`Rendering ${apiPackage.name} package page...`);
    }

    const docNodes: DocNode[] = [];

    // Render heading
    // TODO: heading level
    if (documenterConfiguration.includeTopLevelDocumentHeading) {
        docNodes.push(renderHeading(apiPackage, documenterConfiguration, tsdocConfiguration));
    }

    // Render breadcrumb
    docNodes.push(renderBreadcrumb(apiPackage, documenterConfiguration, tsdocConfiguration));

    // Render body contents
    docNodes.push(
        documenterConfiguration.renderPackageSection(
            apiPackage,
            documenterConfiguration,
            tsdocConfiguration,
        ),
    );

    if (documenterConfiguration.verbose) {
        console.log(`Package page rendered successfully.`);
    }

    return createMarkdownDocument(
        apiPackage,
        new DocSection({ configuration: tsdocConfiguration }, docNodes),
        documenterConfiguration,
        markdownEmitter,
    );
}

export function renderApiPage(
    apiItem: ApiItem,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
    markdownEmitter: MarkdownEmitter,
): MarkdownDocument {
    if (
        apiItem.kind === ApiItemKind.Model ||
        apiItem.kind === ApiItemKind.Package ||
        apiItem.kind === ApiItemKind.EntryPoint
    ) {
        throw new Error(`Provided API item kind must be handled specially: "${apiItem.kind}".`);
    }

    if (documenterConfiguration.verbose) {
        console.log(`Rendering document for ${apiItem.displayName}...`);
    }

    const docNodes: DocNode[] = [];

    // Render heading
    if (documenterConfiguration.includeTopLevelDocumentHeading) {
        docNodes.push(renderHeading(apiItem, documenterConfiguration, tsdocConfiguration));
    }

    // Render breadcrumb
    if (documenterConfiguration.includeBreadcrumb) {
        docNodes.push(renderBreadcrumb(apiItem, documenterConfiguration, tsdocConfiguration));
    }

    // Render body content for the item
    docNodes.push(renderApiSection(apiItem, documenterConfiguration, tsdocConfiguration));

    if (documenterConfiguration.verbose) {
        console.log(`Document for ${apiItem.displayName} rendered successfully.`);
    }

    return createMarkdownDocument(
        apiItem,
        new DocSection({ configuration: tsdocConfiguration }, docNodes),
        documenterConfiguration,
        markdownEmitter,
    );
}

function createMarkdownDocument(
    apiItem: ApiItem,
    renderedContents: DocSection,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    markdownEmitter: MarkdownEmitter,
): MarkdownDocument {
    const emittedContents = markdownEmitter.emit(new StringBuilder(), renderedContents, {
        /* TODO */
    });
    return {
        contents: emittedContents,
        apiItemName: getQualifiedApiItemName(apiItem),
        path: getFilePathForApiItem(apiItem, documenterConfiguration, /* includeExtension: */ true),
    };
}

function renderApiSection(
    apiItem: ApiItem,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocSection {
    if (
        apiItem.kind === ApiItemKind.Model ||
        apiItem.kind === ApiItemKind.Package ||
        apiItem.kind === ApiItemKind.EnumMember ||
        apiItem.kind === ApiItemKind.EntryPoint ||
        apiItem.kind === ApiItemKind.None
    ) {
        throw new Error(`Provided API item kind must be handled specially: "${apiItem.kind}".`);
    }

    switch (apiItem.kind) {
        case ApiItemKind.CallSignature:
            return documenterConfiguration.renderCallSignatureSection(
                apiItem as ApiCallSignature,
                documenterConfiguration,
                tsdocConfiguration,
            );

        case ApiItemKind.Class:
            return documenterConfiguration.renderClassSection(
                apiItem as ApiClass,
                documenterConfiguration,
                tsdocConfiguration,
            );

        case ApiItemKind.ConstructSignature:
            return documenterConfiguration.renderConstructorSection(
                apiItem as ApiConstructSignature,
                documenterConfiguration,
                tsdocConfiguration,
            );

        case ApiItemKind.Constructor:
            return documenterConfiguration.renderConstructorSection(
                apiItem as ApiConstructor,
                documenterConfiguration,
                tsdocConfiguration,
            );

        case ApiItemKind.Enum:
            return documenterConfiguration.renderEnumSection(
                apiItem as ApiEnum,
                documenterConfiguration,
                tsdocConfiguration,
            );

        case ApiItemKind.Function:
            return documenterConfiguration.renderFunctionSection(
                apiItem as ApiFunction,
                documenterConfiguration,
                tsdocConfiguration,
            );

        case ApiItemKind.IndexSignature:
            return documenterConfiguration.renderIndexSignatureSection(
                apiItem as ApiIndexSignature,
                documenterConfiguration,
                tsdocConfiguration,
            );

        case ApiItemKind.Interface:
            return documenterConfiguration.renderInterfaceSection(
                apiItem as ApiInterface,
                documenterConfiguration,
                tsdocConfiguration,
            );

        case ApiItemKind.Method:
            return documenterConfiguration.renderMethodSection(
                apiItem as ApiMethod,
                documenterConfiguration,
                tsdocConfiguration,
            );

        case ApiItemKind.MethodSignature:
            return documenterConfiguration.renderMethodSection(
                apiItem as ApiMethodSignature,
                documenterConfiguration,
                tsdocConfiguration,
            );

        case ApiItemKind.Namespace:
            return documenterConfiguration.renderNamespaceSection(
                apiItem as ApiNamespace,
                documenterConfiguration,
                tsdocConfiguration,
            );

        case ApiItemKind.Property:
        case ApiItemKind.PropertySignature:
            return documenterConfiguration.renderPropertySection(
                apiItem as ApiPropertyItem,
                documenterConfiguration,
                tsdocConfiguration,
            );

        case ApiItemKind.TypeAlias:
            return documenterConfiguration.renderTypeAliasSection(
                apiItem as ApiTypeAlias,
                documenterConfiguration,
                tsdocConfiguration,
            );

        case ApiItemKind.Variable:
            return documenterConfiguration.renderVariableSection(
                apiItem as ApiVariable,
                documenterConfiguration,
                tsdocConfiguration,
            );

        default:
            throw new Error(`Unrecognized API item kind: "${apiItem.kind}".`);
    }
}

export function renderBasicSectionBody(
    apiItem: ApiItem,
    innerSectionBody: DocSection,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocSection {
    const docNodes: DocNode[] = [];

    // Render beta warning if applicable
    if (ApiReleaseTagMixin.isBaseClassOf(apiItem) && apiItem.releaseTag === ReleaseTag.Beta) {
        docNodes.push(renderBetaWarning(tsdocConfiguration));
    }

    // TODO: anything else before inner body

    docNodes.push(innerSectionBody);

    // TODO: anything after inner body?

    return new DocSection({ configuration: tsdocConfiguration }, docNodes);
}

export function renderBreadcrumb(
    apiItem: ApiItem,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocSection {
    // TODO: old system generated link text "Packages" for Model page

    const docNodes: DocNode[] = [];

    // Get ordered ancestry of document items
    const ancestry = getAncestralHierarchy(apiItem, (hierarchyItem) =>
        doesItemRequireOwnDocument(hierarchyItem, documenterConfiguration.documentBoundaries),
    ).reverse(); // Reverse from ascending to descending order

    function createLinkTag(link: Link): DocLinkTag {
        const linkUrl = urlFromLink(link);
        return new DocLinkTag({
            configuration: tsdocConfiguration,
            tagName: "@link",
            linkText: link.text,
            urlDestination: linkUrl,
        });
    }

    let writtenAnythingYet = false;
    for (const hierarchyItem of ancestry) {
        if (writtenAnythingYet) {
            docNodes.push(
                new DocPlainText({
                    configuration: tsdocConfiguration,
                    text: " > ",
                }),
            );
        }

        const link = getLinkForApiItem(hierarchyItem, documenterConfiguration);
        docNodes.push(createLinkTag(link));

        writtenAnythingYet = true;
    }

    return new DocSection({ configuration: tsdocConfiguration }, [
        new DocParagraph({ configuration: tsdocConfiguration }, docNodes),
    ]);
}

export function renderHeading(
    apiItem: ApiItem,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocHeading {
    // TODO: heading level
    const displayName = getHeadingTitleForApiItem(apiItem, documenterConfiguration);
    return new DocHeading({
        configuration: tsdocConfiguration,
        title: displayName,
        id: getHeadingIdForApiItem(apiItem, documenterConfiguration),
    });
}

export function renderBetaWarning(tsdocConfiguration: TSDocConfiguration): DocSection {
    const betaWarning: string =
        "This API is provided as a preview for developers and may change" +
        " based on feedback that we receive. Do not use this API in a production environment.";

    return new DocSection({ configuration: tsdocConfiguration }, [
        new DocNoteBox({ configuration: tsdocConfiguration }, [
            new DocParagraph({ configuration: tsdocConfiguration }, [
                new DocPlainText({ configuration: tsdocConfiguration, text: betaWarning }),
            ]),
        ]),
    ]);
}

export function renderTitleCell(
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

export function renderSummaryCell(
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
