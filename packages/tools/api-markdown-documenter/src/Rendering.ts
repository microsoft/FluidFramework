import { DocHeading } from "@microsoft/api-documenter/lib/nodes/DocHeading";
import { DocNoteBox } from "@microsoft/api-documenter/lib/nodes/DocNoteBox";
import {
    ApiConstructSignature,
    ApiConstructor,
    ApiFunction,
    ApiItem,
    ApiItemKind,
    ApiMethod,
    ApiMethodSignature,
    ApiReleaseTagMixin,
    ReleaseTag,
} from "@microsoft/api-extractor-model";
import {
    DocLinkTag,
    DocNode,
    DocParagraph,
    DocPlainText,
    DocSection,
    TSDocConfiguration,
} from "@microsoft/tsdoc";

import { DocIdentifiableHeading } from "./DocIdentifiableHeading";
import { urlFromLink } from "./Link";
import { MarkdownDocumenterConfiguration } from "./MarkdownDocumenterConfiguration";
import {
    getDisplayNameForApiItem,
    getHeadingIdForApiItem,
    getLinkForApiItem,
    mergeSections,
} from "./utilities";

// TODOs:
// - heading level tracking

export function renderPageRootItem(
    apiItem: ApiItem,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocSection {
    if (documenterConfiguration.verbose) {
        console.log(`Rendering document for ${apiItem.displayName}...`);
    }

    // Render breadcrumb at top of any page
    const breadcrumb = renderBreadcrumb(apiItem, documenterConfiguration, tsdocConfiguration);

    // Render remaining page content
    const mainContent = renderApiItem(apiItem, documenterConfiguration, tsdocConfiguration);

    // TODO: what else?

    const result = mergeSections([breadcrumb, mainContent], tsdocConfiguration);

    if (documenterConfiguration.verbose) {
        console.log(`Document for ${apiItem.displayName} rendered successfully.`);
    }

    return result;
}

function renderApiItem(
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

    const output = new DocSection({ configuration: tsdocConfiguration });

    let writtenAnythingYet = false;
    let hierarchyItem: ApiItem | undefined = apiItem;
    while (hierarchyItem !== undefined) {
        if (documenterConfiguration.documentBoundaryPolicy(hierarchyItem)) {
            if (writtenAnythingYet) {
                output.appendNodeInParagraph(
                    new DocPlainText({
                        configuration: tsdocConfiguration,
                        text: " > ",
                    }),
                );
            }

            const link = getLinkForApiItem(hierarchyItem, documenterConfiguration);
            const linkUrl = urlFromLink(link);
            output.appendNodeInParagraph(
                new DocLinkTag({
                    configuration: tsdocConfiguration,
                    tagName: "@link",
                    linkText: link.text,
                    urlDestination: linkUrl,
                }),
            );
            writtenAnythingYet = true;
        }
    }

    return output;
}

export function renderHeading(
    apiItem: ApiItem,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocHeading {
    // TODO: heading level
    const displayName = getDisplayNameForApiItem(apiItem);
    return new DocIdentifiableHeading({
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
