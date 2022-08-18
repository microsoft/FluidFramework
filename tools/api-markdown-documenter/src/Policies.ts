/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Utilities } from "@microsoft/api-documenter/lib/utils/Utilities";
import { ApiItem, ApiItemKind } from "@microsoft/api-extractor-model";

// TODOs:
// - use `kind` not `type` (and link to ApiModel docs)

/**
 * This module contains policy-related types that are consumed via the {@link MarkdownDocumenterConfiguration}.
 */

/**
 * List of item kinds for which separate documents should be generated.
 * Items specified will be rendered to their own documents.
 * Items not specified will be rendered into their parent's contents.
 *
 * @remarks Note that `Model` and `Package` items will *always* have separate documents generated for them, even if
 * not specified.
 *
 * Also note that `EntryPoint` items will always be ignored by the system, even if specified here.
 *
 * @example
 * TODO
 */
export type DocumentBoundaries = ApiItemKind[];

/**
 * List of item kinds for which sub-directories will be generated, and under which child item documents will be created.
 * If not specified for an item kind, any children of items of that kind will be generated adjacent to the parent.
 *
 * @example
 * TODO
 */
export type HierarchyBoundaries = ApiItemKind[];

/**
 * Policy for overriding the URI base for a specific API item.
 *
 * @remarks This can be used to match on particular item kinds, package names, etc., and adjust the links generated
 * in the documentation accordingly.
 *
 * @example
 * TODO
 *
 * @param apiItem - The API item in question.
 * @returns The URI base to use for the API item, or undefined if the default base should be used.
 */
export type UriBaseOverridePolicy = (apiItem: ApiItem) => string | undefined;

/**
 * Policy for generating heading titles for API items.
 *
 * @param apiItem - The API item for which the heading is being generated.
 * @returns The heading title for the API item.
 */
export type HeadingTitlePolicy = (apiItem: ApiItem) => string;

/**
 * Policy for generating text in links to API items.
 *
 * @param apiItem - The API item for which the link is being generated.
 * @returns The text to use in the link to the API item.
 */
export type LinkTextPolicy = (apiItem: ApiItem) => string;

/**
 * Policy configuration options
 */
export interface PolicyOptions {
    /**
     * Whether or not to include a top-level heading in rendered documents.
     *
     * @defaultValue true
     *
     * @remarks If you will be rendering the document contents into some other document content that will inject its
     * own root heading, this can be used to omit that heading from what is rendered by this system.
     */
    includeTopLevelDocumentHeading?: boolean;

    /**
     * Whether or not to include a navigation breadcrumb at the top of rendered documents.
     *
     * @defaultValue true
     *
     * @remarks Note: `Model` items will never have a breadcrumb rendered, even if this is specfied.
     */
    includeBreadcrumb?: boolean;

    /**
     * See {@link DocumentBoundaries}.
     *
     * @defaultValue {@link DefaultPolicies.defaultDocumentBoundaries}
     */
    documentBoundaries?: DocumentBoundaries;

    /**
     * See {@link HierarchyBoundaries}.
     *
     * @defaultValue {@link DefaultPolicies.defaultHierarchyBoundaries}
     */
    hierarchyBoundaries?: HierarchyBoundaries;

    /**
     * See {@link UriBaseOverridePolicy}.
     *
     * @defaultValue {@link DefaultPolicies.defaultUriBaseOverridePolicy}
     */
    uriBaseOverridePolicy?: UriBaseOverridePolicy;

    /**
     * See {@link HeadingTitlePolicy}.
     *
     * @defaultValue {@link DefaultPolicies.defaultHeadingTitlePolicy}
     */
    headingTitlePolicy?: HeadingTitlePolicy;

    /**
     * See {@link LinkTextPolicy}.
     *
     * @defaultValue {@link DefaultPolicies.defaultLinkTextPolicy}
     */
    linkTextPolicy?: LinkTextPolicy;
}

export namespace DefaultPolicies {
    /**
     * Default {@link PolicyOptions.documentBoundaries}.
     *
     * Generates separate documents for the following types:
     *
     * - Model*
     * - Package*
     * - Class
     * - Interface
     * - Namespace
     */
    export const defaultDocumentBoundaries: ApiItemKind[] = [
        ApiItemKind.Model,
        ApiItemKind.Package,
        ApiItemKind.Class,
        ApiItemKind.Interface,
        ApiItemKind.Namespace,
    ];

    /**
     * Default {@link PolicyOptions.hierarchyBoundaries}.
     *
     * Creates sub-directories for the following types:
     *
     * - Package*
     * - Namespace
     */
    export const defaultHierarchyBoundaries: ApiItemKind[] = [
        ApiItemKind.Package,
        ApiItemKind.Namespace,
    ];

    /**
     * Default {@link PolicyOptions.uriBaseOverridePolicy}.
     *
     * Always uses default URI base.
     */
    export function defaultUriBaseOverridePolicy(): string | undefined {
        return undefined;
    }

    /**
     * Default {@link PolicyOptions.headingTitlePolicy}.
     *
     * Uses the item's `displayName`, except for `Model` items, in which case the text "API Overview" is displayed.
     */
    export function defaultHeadingTitlePolicy(apiItem: ApiItem): string {
        switch (apiItem.kind) {
            case ApiItemKind.Model:
                return "API Overview";
            default:
                return apiItem.displayName;
        }
    }

    /**
     * Default {@link PolicyOptions.headingTitlePolicy}.
     *
     * Uses the item's signature, except for `Model` items, in which case the text "Packages" is displayed.
     */
    export function defaultLinkTextPolicy(apiItem: ApiItem): string {
        switch (apiItem.kind) {
            case ApiItemKind.Model:
                return "Packages";
            default:
                return Utilities.getConciseSignature(apiItem);
        }
    }
}

/**
 * Default {@link PolicyOptions} configuration
 */
export const defaultPolicyOptions: Required<PolicyOptions> = {
    includeTopLevelDocumentHeading: true,
    includeBreadcrumb: true,
    documentBoundaries: DefaultPolicies.defaultDocumentBoundaries,
    hierarchyBoundaries: DefaultPolicies.defaultHierarchyBoundaries,
    uriBaseOverridePolicy: DefaultPolicies.defaultUriBaseOverridePolicy,
    headingTitlePolicy: DefaultPolicies.defaultHeadingTitlePolicy,
    linkTextPolicy: DefaultPolicies.defaultLinkTextPolicy,
};
