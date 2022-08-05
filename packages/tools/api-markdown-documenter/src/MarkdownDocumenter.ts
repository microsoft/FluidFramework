import { ApiItem, ApiItemKind, ApiModel } from "@microsoft/api-extractor-model";
import { DocLinkTag, DocPlainText, DocSection, TSDocConfiguration } from "@microsoft/tsdoc";

import { Link } from "./Interfaces";
import { MarkdownDocumenterConfig, markdownDocumenterConfigurationWithDefaults } from "./MarkdownDocumenterConfig";
import { DocumentBoundaryPolicy } from "./Policies";
import { getFirstAncestorWithOwnPage, getQualifiedApiItemName, urlFromLink } from "./Utilities";

// TODOs:
// - Document assumptions around file placements: flat list of package directories
// - `pick` types to make unit testing easier

/**
 * TODO
 *
 * @remarks
 * This implementation is based on API-Documenter's standard MarkdownDocumenter implementation,
 * but has been updated to be used programatically rather than just from a CLI, and to be more extensible.
 *
 * The reference implementation can be found
 * {@link https://github.com/microsoft/rushstack/blob/main/apps/api-documenter/src/documenters/MarkdownDocumenter.ts
 * | here}.
 */
export class MarkdownDocumenter {
    /**
     * API model for which the documentation will be generated.
     */
    public readonly apiModel: ApiModel;

    /**
     * TODO
     */
    public readonly documenterConfig: Required<MarkdownDocumenterConfig>;

    /**
     * TODO
     */
    // private readonly tsdocConfiguration: TSDocConfiguration;

    /**
     * TODO
     */
    // private readonly markdownEmitter: CustomMarkdownEmitter;

    constructor(apiModel: ApiModel, documenterConfig: MarkdownDocumenterConfig) {
        this.apiModel = apiModel;
        this.documenterConfig = markdownDocumenterConfigurationWithDefaults(documenterConfig);

        // this.tsdocConfiguration = CustomDocNodes.configuration;
        // this.markdownEmitter = new CustomMarkdownEmitter(this.apiModel);
    }
}

/**
 * Walks the provided API item's member tree and reports all API items that should be rendered to their own documents.
 * @param apiItem - The API item in question.
 * @param documentBoundaryPolicy - The policy defining which items should be rendered to their own documents,
 * and which should be rendered to their parent's document.
 */
export function getDocumentItems(
    apiItem: ApiItem,
    documentBoundaryPolicy: DocumentBoundaryPolicy,
): ApiItem[] {
    const result: ApiItem[] = [];
    for (const member of apiItem.members) {
        if (documentBoundaryPolicy(member)) {
            result.push(member);
        }
        result.push(...getDocumentItems(member, documentBoundaryPolicy));
    }
    return result;
}

export function renderBreadcrumb(
    apiItem: ApiItem,
    output: DocSection,
    documenterConfiguration: Required<MarkdownDocumenterConfig>,
    tsdocConfiguration: TSDocConfiguration,
): void {
    // TODO: old system generated link text "Packages" for Model page

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
}

export function getLinkForApiItem(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfig>,
): Link {
    const text = config.linkTextPolicy(apiItem);
    const uriBase = config.uriBaseOverridePolicy(apiItem) ?? config.uriRoot;
    const relativeFilePath = getRelativeFilePathForApiItem(apiItem, config);
    const headingId = getHeadingIdForApiItem(apiItem, config);

    return {
        text,
        uriBase,
        relativeFilePath,
        headingId,
    };
}

/**
 * Gets the file path for the specified API item.
 * In the case of an item that does not get rendered to its own page, this will point to the page
 * of the ancestor item under which the provided item will be rendered.
 *
 * @param apiItem - TODO
 * @param config - TODO
 */
export function getRelativeFilePathForApiItem(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfig>,
): string {
    const targetDocumentItem = getFirstAncestorWithOwnPage(apiItem, config.documentBoundaryPolicy);

    // Walk the target document item's hierarchy to create the path to it
    let path: string = "";
    let convergedOnDocument = false;
    for (const hierarchyItem of targetDocumentItem.getHierarchy()) {
        if (config.documentBoundaryPolicy(hierarchyItem)) {
            // Terminal case: we have found the item whose document we are rendering to
            if (hierarchyItem !== apiItem) {
                throw new Error(
                    "Converged on the wrong document item. This should not be possible.",
                );
            }
            const fileName = config.fileNamePolicy(apiItem);
            path = path.length === 0 ? fileName : `${path}/${fileName}`;
            convergedOnDocument = true;
        } else if (config.fileHierarchyPolicy(hierarchyItem)) {
            // This item in the API hierarchy also contributes to the file-wise hierarchy per provided policy.
            // Append filename to directory path.
            const pathSegmentName = config.fileNamePolicy(hierarchyItem);
            path = path.length === 0 ? pathSegmentName : `${path}/${pathSegmentName}`;
        } else {
            // This item in the API hierarchy does not represent the document being rendered to,
            // nor is it specified to contribute to the resulting file hierarchy. Skip it.
        }
    }

    if (!convergedOnDocument) {
        throw new Error("Item's hierarchy did not converge on a file");
    }

    return path;
}

export function getHeadingIdForApiItem(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfig>,
): string | undefined {
    if (config.documentBoundaryPolicy(apiItem)) {
        // If this API item is being rendered to its own document, then links to it do not require
        // a heading ID.
        return undefined;
    }

    let baseName: string | undefined;
    const apiItemKind: ApiItemKind = apiItem.kind;

    // Walk parentage up until we reach the ancestor into whose document we're being rendered.
    // Generate ID information for everything back to that point
    let hierarchyItem = apiItem;
    while (!config.documentBoundaryPolicy(hierarchyItem)) {
        const qualifiedName = getQualifiedApiItemName(hierarchyItem);

        // Since we're walking up the tree, we'll build the string from the end for simplicity
        baseName = baseName === undefined ? qualifiedName : `${qualifiedName}-${baseName}`;

        if (hierarchyItem.parent === undefined) {
            throw new Error(
                "Walking site hierarchy does not converge on an item that is rendered to its own page.",
            );
        }
        hierarchyItem = hierarchyItem.parent;
    }

    return `${baseName}-${apiItemKind}`;
}
