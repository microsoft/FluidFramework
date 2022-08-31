/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Utilities } from "@microsoft/api-documenter/lib/utils/Utilities";
import {
    ApiCallSignature,
    ApiConstructSignature,
    ApiConstructor,
    ApiDocumentedItem,
    ApiFunction,
    ApiIndexSignature,
    ApiItem,
    ApiItemKind,
    ApiMethod,
    ApiMethodSignature,
    ApiNamespace,
    ApiOptionalMixin,
    ApiPackage,
    ApiParameterListMixin,
    ApiReadonlyMixin,
    ApiStaticMixin,
} from "@microsoft/api-extractor-model";
import { DocSection, StandardTags } from "@microsoft/tsdoc";
import { PackageName } from "@rushstack/node-core-library";
import * as Path from "path";

import { Heading } from "../Heading";
import { Link } from "../Link";
import { logError } from "../LoggingUtilities";
import { MarkdownDocumenterConfiguration } from "../MarkdownDocumenterConfiguration";
import { DocumentBoundaries, HierarchyBoundaries } from "../Policies";

/**
 * Represents "member" API item kinds.
 * These are the kinds of items the system supports generally for rendering, file-system, etc. policies.
 *
 * @remarks This type explicitly excludes the following API item kinds represented in API-Extractor models:
 *
 * - `None`
 *
 * - `EntryPoint`
 *
 * - `Model`
 *
 * - `Package`
 */
export type ApiMemberKind = Omit<
    ApiItemKind,
    ApiItemKind.EntryPoint | ApiItemKind.Model | ApiItemKind.None | ApiItemKind.Package
>;

/**
 * `ApiItem` union type representing function-like API kinds.
 */
export type ApiFunctionLike =
    | ApiConstructSignature
    | ApiConstructor
    | ApiFunction
    | ApiMethod
    | ApiMethodSignature;

/**
 * `ApiItem` union type representing call-signature-like API kinds.
 */
export type ApiSignatureLike = ApiCallSignature | ApiIndexSignature;

/**
 * `ApiItem` union type representing module-like API kinds.
 */
export type ApiModuleLike = ApiPackage | ApiNamespace;

/**
 * Represents an API item modifier.
 */
export enum ApiModifier {
    /**
     * Indicates an `optional` parameter or property.
     */
    Optional = "optional",

    /**
     * Indicates a `readonly` parameter or property.
     */
    Readonly = "readonly",

    /**
     * Indicates a `static` member of a `class` or `interface`.
     */
    Static = "static",
}

/**
 * Adjusts the name of the item as needed.
 * Accounts for method overloads by adding a suffix such as "myMethod_2".
 *
 * @param apiItem - The API item for which the qualified name is being queried.
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
 * Gets the nearest ancestor of the provided item that will have its own rendered document.
 *
 * @remarks
 * This can be useful for determining the file path the item will ultimately be rendered under,
 * as well as for generating links.
 *
 * @param apiItem - The API item for which we are generating a file path.
 * @param documentBoundaries - See {@link DocumentBoundaries}
 */
export function getFirstAncestorWithOwnDocument(
    apiItem: ApiItem,
    documentBoundaries: DocumentBoundaries,
): ApiItem {
    // Walk parentage until we reach an item kind that gets rendered to its own document.
    // That is the document we will target with the generated link.
    let hierarchyItem: ApiItem = apiItem;
    while (!doesItemRequireOwnDocument(hierarchyItem, documentBoundaries)) {
        const parent = getFilteredParent(hierarchyItem);
        if (parent === undefined) {
            throw new Error(
                `Walking hierarchy from "${apiItem.displayName}" does not converge on an item that is rendered to its own document.`,
            );
        }
        hierarchyItem = parent;
    }
    return hierarchyItem;
}

/**
 * Creates a {@link Link} for the provided API item.
 *
 * @remarks
 * If that item is one that will be rendered to a parent document, it will contain the necessary heading identifier
 * information to link to the appropriate heading.
 *
 * @param apiItem - The API item for which we are generating the link.
 * @param config - See {@link MarkdownDocumenterConfiguration}
 * @param textOverride - Text to use in the link. If not provided, the default item name/signature will be used.
 */
export function getLinkForApiItem(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
    textOverride?: string,
): Link {
    const text = textOverride ?? config.linkTextPolicy(apiItem);
    const url = getLinkUrlForApiItem(apiItem, config);
    return {
        text,
        url,
    };
}

/**
 * Creates a link URL to the specified API item.
 *
 * @remarks
 * If that item is one that will be rendered to a parent document, it will contain the necessary heading identifier
 * information to link to the appropriate heading.
 *
 * @param apiItem - The API item for which we are generating the link.
 * @param config - See {@link MarkdownDocumenterConfiguration}
 */
export function getLinkUrlForApiItem(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): string {
    const uriBase = config.uriBaseOverridePolicy(apiItem) ?? config.uriRoot;
    const documentPath = getFilePathForApiItem(apiItem, config, /* includeExtension: */ false);

    // Don't bother with heading ID if we are linking to the root item of a document
    let headingPostfix = "";
    if (!doesItemRequireOwnDocument(apiItem, config.documentBoundaries)) {
        const headingId = getHeadingIdForApiItem(apiItem, config);
        headingPostfix = `#${headingId}`;
    }

    return `${uriBase}/${documentPath}${headingPostfix}`;
}

/**
 * Gets the unscoped version of the provided package's name.
 *
 * @example For the package `@foo/bar`, this would return `bar`.
 */
export function getUnscopedPackageName(apiPackage: ApiPackage): string {
    return PackageName.getUnscopedName(apiPackage.displayName);
}

/**
 * Gets the file path for the specified API item.
 *
 * @remarks
 * In the case of an item that does not get rendered to its own document, this will point to the document
 * of the ancestor item under which the provided item will be rendered.
 *
 * The generated path is relative to {@link MarkdownDocumenterConfiguration.uriRoot}.
 *
 * @param apiItem - The API item for which we are generating a file path.
 * @param config - See {@link MarkdownDocumenterConfiguration}
 * @param includeExtension - Whether or not to include the `.md` file extension at the end of the path.
 */
export function getFilePathForApiItem(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
    includeExtension: boolean,
): string {
    const targetDocumentItem = getFirstAncestorWithOwnDocument(apiItem, config.documentBoundaries);

    const fileName = getFileNameForApiItem(apiItem, config, includeExtension);

    // Filtered ancestry in ascending order
    const documentAncestry = getAncestralHierarchy(targetDocumentItem, (hierarchyItem) =>
        doesItemGenerateHierarchy(hierarchyItem, config.hierarchyBoundaries),
    );

    let path = fileName;
    for (const hierarchyItem of documentAncestry) {
        const segmentName = config.fileNamePolicy(hierarchyItem);
        path = Path.join(segmentName, path);
    }
    return path;
}

/**
 * Gets the file name for the specified API item.
 *
 * @remarks
 * In the case of an item that does not get rendered to its own document, this will be the file name for the document
 * of the ancestor item under which the provided item will be rendered.
 *
 * Note: This is strictly the name of the file, not a path to that file.
 * To get the path, use {@link getFilePathForApiItem}.
 *
 * @param apiItem - The API item for which we are generating a file path.
 * @param config - See {@link MarkdownDocumenterConfiguration}
 * @param includeExtension - Whether or not to include the `.md` file extension at the end of the file name.
 */
export function getFileNameForApiItem(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
    includeExtension: boolean,
): string {
    const targetDocumentItem = getFirstAncestorWithOwnDocument(apiItem, config.documentBoundaries);

    let unscopedFileName = config.fileNamePolicy(targetDocumentItem);

    // For items of kinds other than `Model` or `Package` (which are handled specially file-system-wise),
    // append the item kind to disambiguate file names resulting from members whose names may conflict in a
    // casing-agnostic context (e.g. type "Foo" and function "foo").
    if (
        targetDocumentItem.kind !== ApiItemKind.Model &&
        targetDocumentItem.kind !== ApiItemKind.Package
    ) {
        unscopedFileName = `${unscopedFileName}-${targetDocumentItem.kind.toLocaleLowerCase()}`;
    }

    // Append file extension if requested
    if (includeExtension) {
        unscopedFileName = `${unscopedFileName}.md`;
    }

    // Walk parentage up until we reach the first ancestor which injects directory hierarchy.
    // Qualify generated file name to ensure no conflicts within that directory.
    let hierarchyItem = getFilteredParent(targetDocumentItem);
    if (hierarchyItem === undefined) {
        // If there is no parent item, then we can just return the file name unmodified
        return unscopedFileName;
    }

    let scopedFileName = unscopedFileName;
    while (
        hierarchyItem.kind !== ApiItemKind.Model &&
        !doesItemGenerateHierarchy(hierarchyItem, config.hierarchyBoundaries)
    ) {
        const segmentName = config.fileNamePolicy(hierarchyItem);
        if (segmentName.length === 0) {
            throw new Error("Segment name must be non-empty.");
        }

        scopedFileName = `${segmentName}-${scopedFileName}`;

        const parent = getFilteredParent(hierarchyItem);
        if (parent === undefined) {
            break;
        }
        hierarchyItem = parent;
    }

    return scopedFileName;
}

/**
 * Generates a {@link Heading} for the specified API item.
 *
 * @param apiItem - The API item for which the heading is being generated.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 * @param headingLevel - Heading level to use.
 * If not specified, the heading level will be automatically generated based on the item's context in the resulting
 * document.
 */
export function getHeadingForApiItem(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
    headingLevel?: number,
): Heading {
    // Don't generate an ID for the root heading
    const id = doesItemRequireOwnDocument(apiItem, config.documentBoundaries)
        ? undefined
        : getHeadingIdForApiItem(apiItem, config);

    return {
        title: config.headingTitlePolicy(apiItem),
        id,
        level: headingLevel,
    };
}

/**
 * Generates a unique heading ID for the provided API item.
 *
 * @remarks
 * Notes:
 *
 * - If the item is one that will be rendered to its own document, this will return `undefined`.
 *   Any links pointing to this item may simply link to the document; no heading ID is needed.
 * - The resulting ID is context-dependent. In order to guarantee uniqueness, it will need to express
 *   hierarchical information up to the ancester item whose document the specified item will ultimately be rendered to.
 *
 * @param apiItem - The API item for which the heading ID is being generated.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 *
 * @returns A unique heading ID for the API item if one is needed. Otherwise, `undefined`.
 */
export function getHeadingIdForApiItem(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): string {
    let baseName: string | undefined;
    const apiItemKind: ApiItemKind = apiItem.kind;

    // Walk parentage up until we reach the ancestor into whose document we're being rendered.
    // Generate ID information for everything back to that point
    let hierarchyItem = apiItem;
    while (!doesItemRequireOwnDocument(hierarchyItem, config.documentBoundaries)) {
        const qualifiedName = getQualifiedApiItemName(hierarchyItem);

        // Since we're walking up the tree, we'll build the string from the end for simplicity
        baseName = baseName === undefined ? qualifiedName : `${qualifiedName}-${baseName}`;

        const parent = getFilteredParent(hierarchyItem);
        if (parent === undefined) {
            throw new Error(
                "Walking site hierarchy does not converge on an item that is rendered to its own document.",
            );
        }
        hierarchyItem = parent;
    }

    return `${baseName}-${apiItemKind.toLowerCase()}`;
}

/**
 * Gets the "filted" parent of the provided API item.
 * This logic specifically skips items of the following kinds:
 *
 * - EntryPoint
 *   - Skipped because any given Package item will have exactly 1 EntryPoint child, making this
 *     redundant in the hierarchy.
 *
 * @param apiItem - The API item whose filtered parent will be returned.
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
 * @remarks Notes:
 *
 * - This will not include the provided item itself, even if it matches the `includePredecate`.
 *
 * - This will not include the item matching the `breakPredecate`, even if they match the `includePredecate`.
 *
 * @param apiItem - The API item whose ancestral hierarchy is being queried.
 * @param includePredecate - Predicate to determine which items in the hierarchy should be preserved in the
 * returned list. The provided API item will not be included in the output, even if it would be included by this.
 * @param breakPredicate - Predicate to determine when to break from the traversal and return.
 * The item matching this predicate will not be included, even if it would be included by `includePredicate`.
 *
 * @returns The list of matching ancestor items, provided in *ascending* order.
 */
export function getAncestralHierarchy(
    apiItem: ApiItem,
    includePredecate: (apiItem: ApiItem) => boolean,
    breakPredicate?: (apiItem: ApiItem) => boolean,
): ApiItem[] {
    const matches: ApiItem[] = [];

    let hierarchyItem: ApiItem | undefined = getFilteredParent(apiItem);
    while (
        hierarchyItem !== undefined &&
        (breakPredicate === undefined || !breakPredicate(hierarchyItem))
    ) {
        if (includePredecate(hierarchyItem)) {
            matches.push(hierarchyItem);
        }
        hierarchyItem = getFilteredParent(hierarchyItem);
    }
    return matches;
}

/**
 * Determines whether or not the specified API item kind is one that should be rendered to its own document.
 *
 * @remarks
 * This is essentially a wrapper around {@link PolicyOptions.documentBoundaries}, but also enforces system-wide invariants.
 *
 * Namely...
 *
 * - `Model` and `Package` items are *always* rendered to their own documents, regardless of the specified policy.
 * - `EntryPoint` items are *never* rendered to their own documents (as they are completely ignored by this system),
 *   regardless of the specified policy.
 *
 * @param kind - The kind of API item.
 * @param documentBoundaries - See {@link DocumentBoundaries}
 *
 * @returns `true` if the item should be rendered to its own document. `false` otherwise.
 */
export function doesItemKindRequireOwnDocument(
    kind: ApiItemKind,
    documentBoundaries: DocumentBoundaries,
): boolean {
    if (kind === ApiItemKind.Model || kind === ApiItemKind.Package) {
        return true;
    }
    if (kind === ApiItemKind.EntryPoint) {
        return false;
    }
    return documentBoundaries.includes(kind);
}

/**
 * Determines whether or not the specified API item is one that should be rendered to its own document.
 *
 * @remarks This is based on the item's `kind`. See {@link doesItemKindRequireOwnDocument}.
 *
 * @param apiItem - The API being queried.
 * @param documentBoundaries - See {@link DocumentBoundaries}
 */
export function doesItemRequireOwnDocument(
    apiItem: ApiItem,
    documentBoundaries: DocumentBoundaries,
): boolean {
    return doesItemKindRequireOwnDocument(apiItem.kind, documentBoundaries);
}

/**
 * Determines whether or not the specified API item kind is one that should generate directory-wise hierarchy
 * in the resulting documentation suite.
 * I.e. whether or not child item documents should be generated under a sub-directory adjacent to the item in question.
 *
 * @remarks
 * This is essentially a wrapper around {@link PolicyOptions.hierarchyBoundaries}, but also enforces system-wide invariants.
 *
 * Namely...
 *
 * - `Package` items are *always* rendered to their own documents, regardless of the specified policy.
 * - `EntryPoint` items are *never* rendered to their own documents (as they are completely ignored by this system),
 *   regardless of the specified policy.
 *
 * @param kind - The kind of API item.
 * @param hierarchyBoundaries - See {@link HierarchyBoundaries}
 *
 * @returns `true` if the item should contribute to directory-wise hierarchy in the output. `false` otherwise.
 */
export function doesItemKindGenerateHierarchy(
    kind: ApiItemKind,
    hierarchyBoundaries: HierarchyBoundaries,
): boolean {
    if (kind === ApiItemKind.Package) {
        return true;
    }
    if (kind === ApiItemKind.EntryPoint) {
        return false;
    }
    return hierarchyBoundaries.includes(kind);
}

/**
 * Determines whether or not the specified API item is one that should generate directory-wise hierarchy
 * in the resulting documentation suite.
 * I.e. whether or not child item documents should be generated under a sub-directory adjacent to the item in question.
 *
 * @remarks This is based on the item's `kind`. See {@link doesItemKindGenerateHierarchy}.
 *
 * @param apiItem - The API item being queried.
 * @param hierarchyBoundaries - See {@link HierarchyBoundaries}
 */
export function doesItemGenerateHierarchy(
    apiItem: ApiItem,
    hierarchyBoundaries: HierarchyBoundaries,
): boolean {
    return doesItemKindGenerateHierarchy(apiItem.kind, hierarchyBoundaries);
}

/**
 * Filters the provided list of API items based on the provided `kinds`.
 *
 * @param apiItems - The list of items being filtered.
 * @param kinds - The kinds of items to consider. An item is considered a match if it matches any kind in this list.
 *
 * @returns - The filtered list of items.
 */
export function filterByKind(apiItems: readonly ApiItem[], kinds: ApiItemKind[]): ApiItem[] {
    return apiItems.filter((apiMember) => kinds.includes(apiMember.kind));
}

/**
 * Gets any custom-tag comment blocks on the API item matching the provided tag name, if any.
 * Intended for use with tag types for which only multiple instances are allowed in a TSDoc comment (e.g.
 * {@link https://tsdoc.org/pages/tags/throws/ | @throws}).
 *
 * @param apiItem - The API item whose documentation is being queried.
 * @param tagName - The TSDoc tag name being queried for.
 * Must start with "@". See {@link https://tsdoc.org/pages/spec/tag_kinds/#block-tags}.
 *
 * @returns The list of comment blocks with the matching tag, if any. Otherwise, `undefined`.
 */
function getCustomBlockSectionsForMultiInstanceTags(
    apiItem: ApiItem,
    tagName: string,
): DocSection[] | undefined {
    if (!tagName.startsWith("@")) {
        throw new Error("Invalid TSDoc tag name. Tag names must start with `@`.");
    }
    if (apiItem instanceof ApiDocumentedItem && apiItem.tsdocComment?.customBlocks !== undefined) {
        const defaultValueBlocks = apiItem.tsdocComment.customBlocks.filter(
            (block) => block.blockTag.tagName === tagName,
        );
        return defaultValueBlocks.map((block) => block.content);
    }
    return undefined;
}

/**
 * Gets the custom-tag comment block on the API item matching the provided tag name, if one is found.
 * Intended for use with tag types for which only 1 instance is allowed in a TSDoc comment (e.g.
 * {@link https://tsdoc.org/pages/tags/returns/ | @returns}).
 *
 * @remarks If multiple `@returns` comments are detected, this will log an error and return the first one it
 * encountered.
 *
 * @param apiItem - The API item whose documentation is being queried.
 * @param tagName - The TSDoc tag name being queried for.
 * Must start with "@". See {@link https://tsdoc.org/pages/spec/tag_kinds/#block-tags}.
 *
 * @returns The list of comment blocks with the matching tag, if any. Otherwise, `undefined`.
 */
function getCustomBlockSectionForSingleInstanceTag(
    apiItem: ApiItem,
    tagName: string,
): DocSection | undefined {
    const blocks = getCustomBlockSectionsForMultiInstanceTags(apiItem, tagName);
    if (blocks === undefined) {
        return undefined;
    }

    if (blocks.length > 1) {
        logError(
            `API item ${apiItem.displayName} has multiple "${tagName}" comment blocks. This is not supported.`,
        );
    }

    return blocks[0];
}

/**
 * Gets any {@link https://tsdoc.org/pages/tags/example/ | @example} comment blocks from the API item if it has them.
 *
 * @param apiItem - The API item whose documentation is being queried.
 *
 * @returns The `@example` comment block sections, if the API item has one. Otherwise, `undefined`.
 */
export function getExampleBlocks(apiItem: ApiItem): DocSection[] | undefined {
    return getCustomBlockSectionsForMultiInstanceTags(apiItem, StandardTags.example.tagName);
}

/**
 * Gets any {@link https://tsdoc.org/pages/tags/throws/ | @throws} comment blocks from the API item if it has them.
 *
 * @param apiItem - The API item whose documentation is being queried.
 *
 * @returns The `@throws` comment block sections, if the API item has one. Otherwise, `undefined`.
 */
export function getThrowsBlocks(apiItem: ApiItem): DocSection[] | undefined {
    return getCustomBlockSectionsForMultiInstanceTags(apiItem, StandardTags.throws.tagName);
}

/**
 * Gets the {@link https://tsdoc.org/pages/tags/defaultvalue/ | @defaultValue} comment block from the API item,
 * if it has one.
 *
 * @param apiItem - The API item whose documentation is being queried.
 *
 * @returns The `@defaultValue` comment block section, if the API item has one. Otherwise, `undefined`.
 */
export function getDefaultValueBlock(apiItem: ApiItem): DocSection | undefined {
    return getCustomBlockSectionForSingleInstanceTag(apiItem, StandardTags.defaultValue.tagName);
}

/**
 * Gets the {@link https://tsdoc.org/pages/tags/returns/ | @returns} comment block from the API item if it has one.
 *
 * @param apiItem - The API item whose documentation is being queried.
 *
 * @returns The `@returns` comment block section, if the API item has one. Otherwise, `undefined`.
 */
export function getReturnsBlock(apiItem: ApiItem): DocSection | undefined {
    if (apiItem instanceof ApiDocumentedItem && apiItem.tsdocComment?.returnsBlock !== undefined) {
        return apiItem.tsdocComment.returnsBlock.content;
    }
    return undefined;
}

/**
 * Returns whether or not the provided API item is of a kind that can be marked as optional, and if it is
 * indeed optional.
 */
export function isOptional(apiItem: ApiItem): boolean {
    if (ApiOptionalMixin.isBaseClassOf(apiItem)) {
        return apiItem.isOptional;
    }
    return false;
}

/**
 * Returns whether or not the provided API item is of a kind that can be marked as readonly, and if it is
 * indeed readonly.
 */
export function isReadonly(apiItem: ApiItem): boolean {
    if (ApiReadonlyMixin.isBaseClassOf(apiItem)) {
        return apiItem.isReadonly;
    }
    return false;
}

/**
 * Returns whether or not the provided API item is of a kind that can be marked as static, and if it is
 * indeed static.
 */
export function isStatic(apiItem: ApiItem): boolean {
    if (ApiStaticMixin.isBaseClassOf(apiItem)) {
        return apiItem.isStatic;
    }
    return false;
}

/**
 * Gets the {@link ApiModifier}s that apply to the provided API item.
 *
 * @param apiItem - The API item being queried.
 * @param modifiersToOmit - An optional list of modifier kinds to omit, even if they apply to the provided item.
 */
export function getModifiers(apiItem: ApiItem, modifiersToOmit?: ApiModifier[]): ApiModifier[] {
    const modifiers: ApiModifier[] = [];

    if (isOptional(apiItem) && !modifiersToOmit?.includes(ApiModifier.Optional)) {
        modifiers.push(ApiModifier.Optional);
    }

    if (isReadonly(apiItem) && !modifiersToOmit?.includes(ApiModifier.Readonly)) {
        modifiers.push(ApiModifier.Readonly);
    }

    if (isStatic(apiItem) && !modifiersToOmit?.includes(ApiModifier.Static)) {
        modifiers.push(ApiModifier.Static);
    }

    return modifiers;
}
