import { Utilities } from "@microsoft/api-documenter/lib/utils/Utilities";
import { ApiItem, ApiParameterListMixin } from "@microsoft/api-extractor-model";
import { DocNodeKind, DocParagraph, DocSection } from "@microsoft/tsdoc";

import { Link } from "./Interfaces";
import { DocumentBoundaryPolicy } from "./Policies";

/**
 * Generates a complete URL for the provided {@link Link} object.
 */
export function urlFromLink(link: Link): string {
    const headingPostfix = link.headingId === undefined ? "" : `#${link.headingId}`;
    return `${link.uriBase}/${link.relativeFilePath}${headingPostfix}`;
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
