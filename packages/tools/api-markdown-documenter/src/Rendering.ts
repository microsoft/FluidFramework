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
import { MarkdownDocumenterConfiguration } from "./MarkdownDocumenterConfiguration";
import {
    getDisplayNameForApiItem,
    getHeadingIdForApiItem,
    getLinkForApiItem,
    mergeSections,
    urlFromLink,
} from "./Utilities";

// TODOs:
// - heading level tracking

export function renderPageRootItem(
    apiItem: ApiItem,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocSection {
    // Render breadcrumb at top of any page
    const breadcrumb = renderBreadcrumb(apiItem, documenterConfiguration, tsdocConfiguration);

    // Render remaining page content
    const mainContent = renderApiItem(apiItem, documenterConfiguration, tsdocConfiguration);

    // TODO: what else?

    const result = mergeSections([breadcrumb, mainContent], tsdocConfiguration);
    return result;
}

function renderApiItem(
    apiItem: ApiItem,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocSection {
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
                    tsdocConfiguration,
                ),
            );
            break;

        case ApiItemKind.Constructor:
            docNodes.push(
                documenterConfiguration.renderConstructor(
                    apiItem as ApiConstructor,
                    tsdocConfiguration,
                ),
            );
            break;

        case ApiItemKind.EntryPoint:
            // TODO
            break;

        case ApiItemKind.Enum:
            // TODO
            break;

        case ApiItemKind.EnumMember:
            // TODO
            break;

        case ApiItemKind.Function:
            docNodes.push(
                documenterConfiguration.renderFunction(apiItem as ApiFunction, tsdocConfiguration),
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
                documenterConfiguration.renderMethod(apiItem as ApiMethod, tsdocConfiguration),
            );
            break;

        case ApiItemKind.MethodSignature:
            docNodes.push(
                documenterConfiguration.renderMethod(
                    apiItem as ApiMethodSignature,
                    tsdocConfiguration,
                ),
            );
            break;

        case ApiItemKind.Model:
            // TODO
            break;

        case ApiItemKind.Namespace:
            // TODO
            break;

        case ApiItemKind.Package:
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
    for (const hierarchyItem of apiItem.getHierarchy()) {
        if (
            documenterConfiguration.documentBoundaryPolicy(hierarchyItem) &&
            !documenterConfiguration.filterContentsPolicy(hierarchyItem)
        ) {
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
