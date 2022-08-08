import { Utilities } from "@microsoft/api-documenter/lib/utils/Utilities";
import { ApiItem, ApiItemKind, ApiParameterListMixin } from "@microsoft/api-extractor-model";
import { DocNodeKind, DocParagraph, DocSection, TSDocConfiguration } from "@microsoft/tsdoc";

import { Link } from "./Interfaces";
import { MarkdownDocumenterConfiguration } from "./MarkdownDocumenterConfiguration";
import { DocumentBoundaryPolicy } from "./Policies";

/**
 * Generates a complete URL for the provided {@link Link} object.
 */
export function urlFromLink(link: Link): string {
    const headingPostfix = link.headingId === undefined ? "" : `#${link.headingId}`;
    return `${link.uriBase}/${link.relativeFilePath}${headingPostfix}`;
}

export function getDisplayNameForApiItem(apiItem: ApiItem): string {
    switch (apiItem.kind) {
        case ApiItemKind.Constructor:
        case ApiItemKind.ConstructSignature:
        case ApiItemKind.Enum:
        case ApiItemKind.EnumMember:
            // Return scoped name to disambiguate
            return apiItem.getScopedNameWithinPackage();
        default:
            return apiItem.displayName;
    }
}

/**
 * Adjusts the name of the item as needed.
 * Accounts for method overloads by adding a suffix such as "MyClass.myMethod_2".
 */
export function getQualifiedApiItemName(apiItem: ApiItem): string {
    let qualifiedName: string = Utilities.getSafeFilenameForName(apiItem.displayName);
    if (ApiParameterListMixin.isBaseClassOf(apiItem) && apiItem.overloadIndex > 1) {
        // Subtract one for compatibility with earlier releases of API Documenter.
        // (This will get revamped when we fix GitHub issue #1308)
        qualifiedName += `_${apiItem.overloadIndex - 1}`;
    }
    return qualifiedName;
}

/**
 * Gets the nearest ancestor of the provided item that will have its own rendered page.
 * This can be useful for determining the file path the item will ultimately be rendered under,
 * as well as for generating links.
 */
export function getFirstAncestorWithOwnPage(
    apiItem: ApiItem,
    documentBoundaryPolicy: DocumentBoundaryPolicy,
): ApiItem {
    // Walk parentage until we reach an item kind that gets rendered to its own page.
    // That is the page we will target with the generated link.
    let result = apiItem;
    while (!documentBoundaryPolicy(result)) {
        if (result.parent === undefined) {
            throw new Error(
                "Walking site hierarchy does not converge on an item that is rendered to its own page.",
            );
        }
        result = result.parent;
    }
    return result;
}

export function appendSection(output: DocSection | DocParagraph, docSection: DocSection): void {
    for (const node of docSection.nodes) {
        output.appendNode(node);
    }
}

export function appendAndMergeSection(output: DocSection, docSection: DocSection): void {
    let firstNode: boolean = true;
    for (const node of docSection.nodes) {
        if (firstNode && node.kind === DocNodeKind.Paragraph) {
            output.appendNodesInParagraph(node.getChildNodes());
            firstNode = false;
            continue;
        }
        firstNode = false;

        output.appendNode(node);
    }
}

export function mergeSections(
    sections: DocSection[],
    tsdocConfiguration: TSDocConfiguration,
): DocSection {
    const output = new DocSection({ configuration: tsdocConfiguration });

    for (const section of sections) {
        output.appendNodes(section.nodes);
    }

    return output;
}

export function getLinkForApiItem(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
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

export function getLinkUrlForApiItem(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): string {
    const link = getLinkForApiItem(apiItem, config);
    return urlFromLink(link);
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
    config: Required<MarkdownDocumenterConfiguration>,
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
    config: Required<MarkdownDocumenterConfiguration>,
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
