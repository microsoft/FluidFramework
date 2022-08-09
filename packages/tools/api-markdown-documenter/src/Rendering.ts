import { MarkdownEmitter } from "@microsoft/api-documenter/lib/markdown/MarkdownEmitter";
import { Utilities } from "@microsoft/api-documenter/lib/utils/Utilities";
import {
    ApiConstructSignature,
    ApiConstructor,
    ApiDocumentedItem,
    ApiFunction,
    ApiItem,
    ApiItemKind,
    ApiMethod,
    ApiMethodSignature,
    ApiModel,
    ApiPackage,
    ApiReleaseTagMixin,
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

import { urlFromLink } from "./Link";
import { MarkdownDocument } from "./MarkdownDocument";
import { MarkdownDocumenterConfiguration } from "./MarkdownDocumenterConfiguration";
import { DocEmphasisSpan, DocHeading, DocNoteBox, DocTableCell } from "./doc-nodes";
import {
    doesItemRequireOwnDocument,
    getDisplayNameForApiItem,
    getFilteredParent,
    getHeadingIdForApiItem,
    getLinkForApiItem,
    getLinkUrlForApiItem,
    getQualifiedApiItemName,
    getRelativeFilePathForApiItem,
} from "./utilities";

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
    const headingText = "API Overview"; // TODO: from config
    // TODO: heading level
    docNodes.push(
        new DocHeading({ configuration: tsdocConfiguration, title: headingText, level: 1 }),
    );

    // Do not render breadcrumb for Model page

    // Render body contents
    docNodes.push(
        documenterConfiguration.renderModel(apiModel, documenterConfiguration, tsdocConfiguration),
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
    const headingText = apiPackage.name; // TODO: from config?
    // TODO: heading level
    docNodes.push(
        new DocHeading({ configuration: tsdocConfiguration, title: headingText, level: 1 }),
    );

    // Render breadcrumb
    docNodes.push(renderBreadcrumb(apiPackage, documenterConfiguration, tsdocConfiguration));

    // Render body contents
    docNodes.push(
        documenterConfiguration.renderPackage(
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

    // Render body content for the item
    const bodyContent = renderApiSection(apiItem, documenterConfiguration, tsdocConfiguration);

    // Render body content to section including header and footer items like the breadcrumb
    const document = renderPage(
        apiItem,
        bodyContent,
        documenterConfiguration,
        tsdocConfiguration,
        markdownEmitter,
    );

    if (documenterConfiguration.verbose) {
        console.log(`Document for ${apiItem.displayName} rendered successfully.`);
    }

    return document;
}

function renderPage(
    apiItem: ApiItem,
    bodyContent: DocSection,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
    markdownEmitter: MarkdownEmitter,
): MarkdownDocument {
    const docNodes: DocNode[] = [];

    // Render breadcrumb at top of any page
    docNodes.push(renderBreadcrumb(apiItem, documenterConfiguration, tsdocConfiguration));

    // TODO: anything else before main content?

    docNodes.push(bodyContent);

    // TODO: anything after main content?

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
        path: getRelativeFilePathForApiItem(
            apiItem,
            documenterConfiguration,
            /* includeExtension: */ true,
        ),
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
        apiItem.kind === ApiItemKind.EntryPoint
    ) {
        throw new Error(`Provided API item kind must be handled specially: "${apiItem.kind}".`);
    }

    const docNodes: DocNode[] = [];

    docNodes.push(renderHeading(apiItem, documenterConfiguration, tsdocConfiguration));

    // Render beta warning if applicable
    if (ApiReleaseTagMixin.isBaseClassOf(apiItem) && apiItem.releaseTag === ReleaseTag.Beta) {
        docNodes.push(renderBetaWarning(tsdocConfiguration));
    }

    switch (apiItem.kind) {
        case ApiItemKind.CallSignature:
            // TODO
            break;

        case ApiItemKind.Class:
            // TODO
            break;

        case ApiItemKind.ConstructSignature:
            docNodes.push(
                documenterConfiguration.renderConstructor(
                    apiItem as ApiConstructSignature,
                    documenterConfiguration,
                    tsdocConfiguration,
                ),
            );
            break;

        case ApiItemKind.Constructor:
            docNodes.push(
                documenterConfiguration.renderConstructor(
                    apiItem as ApiConstructor,
                    documenterConfiguration,
                    tsdocConfiguration,
                ),
            );
            break;

        case ApiItemKind.Enum:
            // TODO
            break;

        case ApiItemKind.EnumMember:
            // TODO
            break;

        case ApiItemKind.Function:
            docNodes.push(
                documenterConfiguration.renderFunction(
                    apiItem as ApiFunction,
                    documenterConfiguration,
                    tsdocConfiguration,
                ),
            );
            break;

        case ApiItemKind.IndexSignature:
            // TODO
            break;

        case ApiItemKind.Interface:
            // TODO
            break;

        case ApiItemKind.Method:
            docNodes.push(
                documenterConfiguration.renderMethod(
                    apiItem as ApiMethod,
                    documenterConfiguration,
                    tsdocConfiguration,
                ),
            );
            break;

        case ApiItemKind.MethodSignature:
            docNodes.push(
                documenterConfiguration.renderMethod(
                    apiItem as ApiMethodSignature,
                    documenterConfiguration,
                    tsdocConfiguration,
                ),
            );
            break;

        case ApiItemKind.Namespace:
            // TODO
            break;

        case ApiItemKind.Property:
            // TODO
            break;

        case ApiItemKind.PropertySignature:
            // TODO
            break;

        case ApiItemKind.TypeAlias:
            // TODO
            break;

        case ApiItemKind.Variable:
            // TODO
            break;

        case ApiItemKind.None:
            // TODO
            break;

        default:
            throw new Error(`Unrecognized API item kind: "${apiItem.kind}".`);
    }

    return new DocSection({ configuration: tsdocConfiguration }, docNodes);
}

export function renderBreadcrumb(
    apiItem: ApiItem,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocSection {
    // TODO: old system generated link text "Packages" for Model page

    const docNodes: DocNode[] = [];

    let writtenAnythingYet = false;
    let hierarchyItem: ApiItem | undefined = apiItem;
    while (hierarchyItem !== undefined) {
        if (doesItemRequireOwnDocument(hierarchyItem, documenterConfiguration.documentBoundaries)) {
            if (writtenAnythingYet) {
                docNodes.push(
                    new DocPlainText({
                        configuration: tsdocConfiguration,
                        text: " > ",
                    }),
                );
            }

            const link = getLinkForApiItem(hierarchyItem, documenterConfiguration);
            const linkUrl = urlFromLink(link);
            docNodes.push(
                new DocLinkTag({
                    configuration: tsdocConfiguration,
                    tagName: "@link",
                    linkText: link.text,
                    urlDestination: linkUrl,
                }),
            );
            writtenAnythingYet = true;
        }
        hierarchyItem = getFilteredParent(hierarchyItem);
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
    const displayName = getDisplayNameForApiItem(apiItem);
    return new DocHeading({
        configuration: tsdocConfiguration,
        title: displayName,
        level: 2,
        id: getHeadingIdForApiItem(apiItem, documenterConfiguration),
    });
}

export function renderBetaWarning(tsdocConfiguration: TSDocConfiguration): DocSection {
    const output = new DocSection({ configuration: tsdocConfiguration });

    const betaWarning: string =
        "This API is provided as a preview for developers and may change" +
        " based on feedback that we receive. Do not use this API in a production environment.";

    output.appendNode(
        new DocNoteBox({ configuration: tsdocConfiguration }, [
            new DocParagraph({ configuration: tsdocConfiguration }, [
                new DocPlainText({ configuration: tsdocConfiguration, text: betaWarning }),
            ]),
        ]),
    );

    return output;
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
