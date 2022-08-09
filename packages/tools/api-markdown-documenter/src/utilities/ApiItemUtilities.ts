import { Utilities } from "@microsoft/api-documenter/lib/utils/Utilities";
import { ApiItem, ApiItemKind, ApiParameterListMixin } from "@microsoft/api-extractor-model";

import { Link, urlFromLink } from "../Link";
import { MarkdownDocumenterConfiguration } from "../MarkdownDocumenterConfiguration";
import { DocumentBoundaryPolicy } from "../Policies";

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
    let hierarchyItem: ApiItem = apiItem;
    while (!documentBoundaryPolicy(hierarchyItem)) {
        const parent = getFilteredParent(hierarchyItem);
        if (parent === undefined) {
            throw new Error(
                "Walking site hierarchy does not converge on an item that is rendered to its own page.",
            );
        }
        hierarchyItem = parent;
    }
    return hierarchyItem;
}

export function getLinkForApiItem(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): Link {
    const text = config.linkTextPolicy(apiItem);
    const uriBase = config.uriBaseOverridePolicy(apiItem) ?? config.uriRoot;
    const relativeFilePath = getRelativeFilePathForApiItem(
        apiItem,
        config,
        /* includeExtension: */ false,
    );
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
 * @param includeExtension - Whether or not to include the `.md` file extension at the end of the path.
 */
export function getRelativeFilePathForApiItem(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
    includeExtension: boolean,
): string {
    const targetDocumentItem = getFirstAncestorWithOwnPage(apiItem, config.documentBoundaryPolicy);

    const fileName = config.fileNamePolicy(targetDocumentItem) + (includeExtension ? ".md" : "");

    // Walk the target page's hierarchy until we reach an item for which directory hierarchy policy is enabled.
    // We will need to include hiarachy information in the file name up to that point to ensure we don't
    // generate any filename-wise conflicts.
    let hierarchyItem = getFilteredParent(apiItem);
    if (hierarchyItem === undefined) {
        // If there is no parent item, then we can just return the file name unmodified
        return fileName;
    }
    let path = fileName;
    while (!config.fileHierarchyPolicy(hierarchyItem)) {
        const segmentName = config.fileNamePolicy(hierarchyItem);
        path = `${segmentName}-${path}`;

        const parent = getFilteredParent(hierarchyItem);
        if (parent === undefined) {
            break;
        }
        hierarchyItem = parent;
    }

    return path;
}

export function getFileNameForApiItem(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
    includeExtension: boolean,
): string | undefined {
    const targetDocumentItem = getFirstAncestorWithOwnPage(apiItem, config.documentBoundaryPolicy);

    const fileName = config.fileNamePolicy(targetDocumentItem) + (includeExtension ? ".md" : "");

    // Walk parentage up until we reach the first ancestor which injects directory hierarchy.
    // Qualify generated file name to ensure no conflicts within that directory.
    let hierarchyItem = getFilteredParent(apiItem);
    if (hierarchyItem === undefined) {
        // If there is no parent item, then we can just return the file name unmodified
        return fileName;
    }
    let path = fileName;
    while (!config.fileHierarchyPolicy(hierarchyItem)) {
        const segmentName = config.fileNamePolicy(hierarchyItem);
        if (segmentName.length === 0) {
            throw new Error("Segment name must be non-empty.");
        }

        path = `${segmentName}-${path}`;

        const parent = getFilteredParent(hierarchyItem);
        if (parent === undefined) {
            break;
        }
        hierarchyItem = parent;
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

        const parent = getFilteredParent(hierarchyItem);
        if (parent === undefined) {
            throw new Error(
                "Walking site hierarchy does not converge on an item that is rendered to its own page.",
            );
        }
        hierarchyItem = parent;
    }

    return `${baseName}-${apiItemKind}`;
}

/**
 * Gets the "filted" parent of the provided API item.
 * This logic specifically skips items of the following kinds:
 *
 * - EntryPoint
 *   - Skipped because any given Package item will have exactly 1 EntryPoint child, making this
 *     redundant in the hierarchy.
 */
export function getFilteredParent(apiItem: ApiItem): ApiItem | undefined {
    const parent = apiItem.parent;
    if (parent?.kind === ApiItemKind.EntryPoint) {
        return parent.parent;
    }
    return parent;
}

/**
 * Gets the ancestral hierarchy of the provided API item by walking up the parentage graph and emitting any items
 * matching the `includePredecate` until it reaches an item that matches the `breakPredecate`.
 *
 * Notes:
 *
 * - This will not include the provided item iteslf, even if it matches the `includePredecate`.
 *
 * - This will not include the item matching the `breakPredecate`, even if they match the `includePredecate`.
 *
 * @param apiItem - TODO
 * @param includePredecate - TODO
 * @param breakPredicate - TODO
 *
 * @returns The list of matching ancestor items, provided in descending order.
 */
export function getAncestralHierarchy(
    apiItem: ApiItem,
    includePredecate: (apiItem: ApiItem) => boolean,
    breakPredicate: (apiItem: ApiItem) => boolean,
): ApiItem[] {
    const matches: ApiItem[] = [];

    let hierarchyItem: ApiItem | undefined = getFilteredParent(apiItem);
    while (hierarchyItem !== undefined && !breakPredicate(hierarchyItem)) {
        if (includePredecate(hierarchyItem)) {
            matches.push(hierarchyItem);
        }
    }
    return matches.reverse();
}
