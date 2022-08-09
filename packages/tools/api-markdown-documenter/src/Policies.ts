import { Utilities } from "@microsoft/api-documenter/lib/utils/Utilities";
import { ApiItem, ApiItemKind } from "@microsoft/api-extractor-model";
import { PackageName } from "@rushstack/node-core-library";

import { getQualifiedApiItemName } from "./Utilities";

// TODOs:
// - Better handling of path-segment vs file name policy (e.g. what to do in index model?)
// - Add simple pre-canned policies (index, adjacency, flat, etc.)

/**
 * Determines whether or not a separate document should be generated for the API item, rather than adding
 * contents directly to the page containing the parent element's contents.
 *
 * @remarks Note that `Model` and `Package` items will *always* have separate documents generated for them, even if
 * not specified.
 *
 * Also note that `EntryPoint` items will always be ignored by the system, even if specified here.
 *
 * @param apiItem - The API item in question.
 * @returns `true` if the item should have a separate document generated. `false` otherwise.
 */
export type DocumentBoundaryPolicy = (apiItem: ApiItem) => boolean;

/**
 * Policy for overriding the URI base for a specific API item.
 *
 * @remarks This can be used to match on particular item kinds, package names, etc., and adjust the links generated
 * in the documentation accordingly.
 *
 * @param apiItem - The API item in question.
 * @returns The URI base to use for the API item, or undefined if the default base should be used.
 */
export type UriBaseOverridePolicy = (apiItem: ApiItem) => string | undefined;

/**
 * Policy for generating link text for a particular API item.
 *
 * @param apiItem - The API item in question.
 * @returns The link text to use for the API item.
 */
export type LinkTextPolicy = (apiItem: ApiItem) => string;

/**
 * Policy for naming of files / directories for API items.
 * Does not include a file extension.
 *
 * @param apiItem - The API item in question.
 * @returns The file name to use for a document generated for the specified API item.
 */
export type FileNamePolicy = (apiItem: ApiItem) => string;

/**
 * Policy for determining if an API item contributes to the resulting directory hierarchy.
 * I.e. for a specified API item, should its child items be written under a sub-directory named for the API item?
 *
 * If so, the name of the sub-directory will be defined by the {@link FileNamePolicy}.
 *
 * @param apiItem - The API item in question.
 * @returns `true` if child items should be written under a sub-directory named for the API item. `false` if not
 * (i.e. they should be placed adjacent to the item's document).
 */
export type FileHierarchyPolicy = (apiItem: ApiItem) => boolean;

/**
 * Policy configuration options
 */
export interface PolicyOptions {
    /**
     * See {@link DocumentBoundaryPolicy}.
     *
     * @defaultValue {@link DefaultPolicies.defaultDocumentBoundaryPolicy}
     */
    documentBoundaryPolicy?: DocumentBoundaryPolicy;

    /**
     * See {@link UriBaseOverridePolicy}.
     *
     * @defaultValue {@link DefaultPolicies.defaultUriBaseOverridePolicy}
     */
    uriBaseOverridePolicy?: UriBaseOverridePolicy;

    /**
     * See {@link LinkTextPolicy}.
     *
     * @defaultValue {@link DefaultPolicies.defaultUriBaseOverridePolicy}
     */
    linkTextPolicy?: LinkTextPolicy;

    /**
     * See {@link FileNamePolicy}.
     *
     * @defaultValue {@link DefaultPolicies.defaultFileNamePolicy}
     */
    fileNamePolicy?: FileNamePolicy;

    /**
     * See {@link FileHierarchyPolicy}.
     *
     * @defaultValue {@link DefaultPolicies.defaultFileHierarchyPolicy}
     */
    fileHierarchyPolicy?: FileHierarchyPolicy;
}

export namespace DefaultPolicies {
    /**
     * Default {@link PolicyOptions.documentBoundaryPolicy}.
     *
     * Generates separate documents for the following types:
     *
     * - Model
     * - Package
     * - Class
     * - Interface
     * - Namespace
     */
    export function defaultDocumentBoundaryPolicy(apiItem: ApiItem): boolean {
        return (
            apiItem.kind === ApiItemKind.Class ||
            apiItem.kind === ApiItemKind.Interface ||
            apiItem.kind === ApiItemKind.Namespace
        );
    }

    /**
     * Default {@link PolicyOptions.filterContentsPolicy}.
     *
     * Filters out the following content types:
     *
     * - EntryPoint
     */
    export function defaultFilterContentsPolicy(apiItem: ApiItem): boolean {
        return apiItem.kind === ApiItemKind.EntryPoint;
    }

    /**
     * Default {@link PolicyOptions.uriBaseOverridePolicy}.
     *
     * Always uses default URI base.
     */
    export function defaultUriBaseOverridePolicy(): string | undefined {
        return undefined;
    }

    /**
     * Default {@link PolicyOptions.linkTextPolicy}.
     *
     * Always uses the item's `displayName`.
     */
    export function defaultLinkTextPolicy(apiItem: ApiItem): string {
        return apiItem.displayName;
    }

    /**
     * Default {@link PolicyOptions.fileNamePolicy}.
     *
     * Uses a cleaned-up version of the item's `displayName`, except for Package items,
     * in which case only the unscoped portion of the package name is used.
     *
     * Returns "index" for Model items, as the hierarchy enforces there is only a single Model at the root.
     */
    export function defaultFileNamePolicy(apiItem: ApiItem): string {
        switch (apiItem.kind) {
            case ApiItemKind.Model:
                return "index";
            case ApiItemKind.Package:
                return Utilities.getSafeFilenameForName(
                    PackageName.getUnscopedName(apiItem.displayName),
                );
            default:
                return getQualifiedApiItemName(apiItem);
        }
    }

    /**
     * Default {@link PolicyOptions.fileHierarchyPolicy}.
     *
     * Only create sub-directories for Model and Package items.
     */
    export function defaultFileHierarchyPolicy(apiItem: ApiItem): boolean {
        switch (apiItem.kind) {
            case ApiItemKind.Model:
            case ApiItemKind.Package:
                return true;
            default:
                return false;
        }
    }
}

/**
 * Default {@link PolicyOptions} configuration
 */
export const defaultPolicyOptions: Required<PolicyOptions> = {
    documentBoundaryPolicy: DefaultPolicies.defaultDocumentBoundaryPolicy,
    uriBaseOverridePolicy: DefaultPolicies.defaultUriBaseOverridePolicy,
    linkTextPolicy: DefaultPolicies.defaultLinkTextPolicy,
    fileNamePolicy: DefaultPolicies.defaultFileNamePolicy,
    fileHierarchyPolicy: DefaultPolicies.defaultFileHierarchyPolicy,
};
