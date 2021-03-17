/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SummaryType } from "@fluidframework/protocol-definitions";
import { channelsTreeName, ISummaryTreeWithStats } from "@fluidframework/runtime-definitions";

interface IFluidDataStoreAttributes1 {
    pkg: string;
    readonly snapshotFormatVersion?: "0.1";
    /**
     * This tells whether a data store is root. Root data stores are never collected.
     * Non-root data stores may be collected if they are not used. If this is not present, default it to
     * true. This will ensure that older data stores are incorrectly collected.
     */
    readonly isRootDataStore?: boolean;
}
interface IFluidDataStoreAttributes2 extends IFluidDataStoreAttributes1 {
    readonly snapshotFormatVersion?: undefined;
    readonly summaryFormatVersion: 2;
    /** True if channels are not isolated in .channels subtrees, otherwise isolated. */
    readonly disableIsolatedChannels?: true;
}
/**
 * Added IFluidDataStoreAttributes similar to IChannelAttributes which will tell the attributes of a
 * store like the package, snapshotFormatVersion to take different decisions based on a particular
 * snapshotFormatVersion.
 */
export type ReadFluidDataStoreAttributes = IFluidDataStoreAttributes1 | IFluidDataStoreAttributes2;
export type WriteFluidDataStoreAttributes = IFluidDataStoreAttributes2;

export function getAttributesFormatVersion(attributes: ReadFluidDataStoreAttributes): number {
    if ("summaryFormatVersion" in attributes && attributes.summaryFormatVersion !== undefined) {
        /**
         * Version 2+: Introduces .channels trees for isolation of
         * channel trees from data store objects.
         */
        return attributes.summaryFormatVersion;
    } else if (attributes.snapshotFormatVersion === "0.1") {
        /**
         * Version 1: from this version the pkg within the data store
         * attributes blob is a JSON array rather than a string.
         */
        return 1;
    }
    /**
     * Version 0: format version is missing from summary.
     * This indicates it is an older version.
     */
    return 0;
}

export function hasIsolatedChannels(attributes: ReadFluidDataStoreAttributes): boolean {
    const version = getAttributesFormatVersion(attributes);
    if (version < 2) {
        return false;
    }
    return !("disableIsolatedChannels" in attributes && attributes.disableIsolatedChannels);
}

export interface IContainerRuntimeMetadata {
    readonly summaryFormatVersion: 1;
    /** True if channels are not isolated in .channels subtrees, otherwise isolated. */
    readonly disableIsolatedChannels?: true;
}

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function getMetadataFormatVersion(metadata: IContainerRuntimeMetadata | undefined): number {
    /**
     * Version 1+: Introduces .metadata blob and .channels trees for isolation of
     * data store trees from container-level objects.
     *
     * Version 0: metadata blob missing; format version is missing from summary.
     * This indicates it is an older version.
     */
    return metadata?.summaryFormatVersion ?? 0;
}

export const metadataBlobName = ".metadata";
export const chunksBlobName = ".chunks";
export const blobsTreeName = ".blobs";

export function rootHasIsolatedChannels(metadata: IContainerRuntimeMetadata | undefined): boolean {
    const version = getMetadataFormatVersion(metadata);
    if (version < 1) {
        return false;
    }
    return !(metadata && "disableIsolatedChannels" in metadata && metadata.disableIsolatedChannels);
}

export const protocolTreeName = ".protocol";

/**
 * List of tree IDs at the container level which are reserved.
 * This is for older versions of summaries that do not yet have an
 * isolated data stores namespace. Without the namespace, this must
 * be used to prevent name collisions with data store IDs.
 */
export const nonDataStorePaths = [protocolTreeName, ".logTail", ".serviceProtocol", blobsTreeName];

export const dataStoreAttributesBlobName = ".component";

/**
 * Modifies summary tree and stats to put tree under .channels tree.
 * Converts from: {
 *     type: SummaryType.Tree,
 *     tree: { a: {...}, b: {...}, c: {...} },
 * }
 * to: {
 *     type: SummaryType.Tree,
 *     tree: {
 *         ".channels": {
 *             type: SummaryType.Tree,
 *             tree: { a: {...}, b: {...}, c: {...} }
 *         },
 *     },
 * }
 * And adds +1 to treeNodeCount in stats.
 * @param summarizeResult - summary tree and stats to modify
 */
export function wrapSummaryInChannelsTree(summarizeResult: ISummaryTreeWithStats): void {
    summarizeResult.summary = {
        type: SummaryType.Tree,
        tree: { [channelsTreeName]: summarizeResult.summary },
    };
    summarizeResult.stats.treeNodeCount++;
}
