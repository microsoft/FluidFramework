/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { readAndParse } from "@fluidframework/driver-utils";
import { ISequencedDocumentMessage, ISnapshotTree, SummaryType } from "@fluidframework/protocol-definitions";
import { channelsTreeName, ISummaryTreeWithStats } from "@fluidframework/runtime-definitions";
import { gcTreeKey } from "./garbageCollection";

type OmitAttributesVersions<T> = Omit<T, "snapshotFormatVersion" | "summaryFormatVersion">;
interface IFluidDataStoreAttributes0 {
    readonly snapshotFormatVersion?: undefined;
    readonly summaryFormatVersion?: undefined;
    pkg: string;
    /**
     * This tells whether a data store is root. Root data stores are never collected.
     * Non-root data stores may be collected if they are not used. If this is not present, default it to
     * true. This will ensure that older data stores are incorrectly collected.
     */
    readonly isRootDataStore?: boolean;
}
interface IFluidDataStoreAttributes1 extends OmitAttributesVersions<IFluidDataStoreAttributes0> {
    readonly snapshotFormatVersion: "0.1";
    readonly summaryFormatVersion?: undefined;
}
interface IFluidDataStoreAttributes2 extends OmitAttributesVersions<IFluidDataStoreAttributes1> {
    /** Switch from snapshotFormatVersion to summaryFormatVersion */
    readonly snapshotFormatVersion?: undefined;
    readonly summaryFormatVersion: 2;
    /**
     * True if channels are not isolated in .channels subtrees, otherwise isolated.
     * This is required in both datastore attributes as well as the root container,
     * because reused summary handles may cause different format versions in each
     * datastore subtree within the summary.
     */
    readonly disableIsolatedChannels?: true;
}
/**
 * Added IFluidDataStoreAttributes similar to IChannelAttributes which will tell the attributes of a
 * store like the package, snapshotFormatVersion to take different decisions based on a particular
 * snapshotFormatVersion.
 */
export type ReadFluidDataStoreAttributes =
    | IFluidDataStoreAttributes0
    | IFluidDataStoreAttributes1
    | IFluidDataStoreAttributes2;
export type WriteFluidDataStoreAttributes = IFluidDataStoreAttributes1 | IFluidDataStoreAttributes2;

export function getAttributesFormatVersion(attributes: ReadFluidDataStoreAttributes): number {
    if (attributes.summaryFormatVersion) {
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
    return !!attributes.summaryFormatVersion && !attributes.disableIsolatedChannels;
}
export interface IContainerRuntimeMetadata extends ICreateContainerMetadata, IGCMetadata {
    readonly summaryFormatVersion: 1;
    /** The last message processed at the time of summary. Only primitive property types are added to the summary. */
    readonly message: ISummaryMetadataMessage | undefined;
    /** True if channels are not isolated in .channels subtrees, otherwise isolated. */
    readonly disableIsolatedChannels?: true;
    /** The summary number for a container's summary. Incremented on summaries throughout its lifetime. */
    readonly summaryNumber?: number;
}

export interface ICreateContainerMetadata {
    /** Runtime version of the container when it was first created */
    createContainerRuntimeVersion?: string;
    /** Timestamp of the container when it was first created */
    createContainerTimestamp?: number;
}

export type GCVersion = number;
export interface IGCMetadata {
    /**
     * The version of the GC code that was run to generate the GC data that is written in the summary.
     * Also, used to determine whether GC is enabled for this container or not:
     * - A value of 0 or undefined means GC is disabled.
     * - A value greater than 0 means GC is enabled.
     */
    readonly gcFeature?: GCVersion;
    /**
     * Tells whether the GC sweep phase is enabled for this container.
     * - True means sweep phase is enabled.
     * - False means sweep phase is disabled. If GC is disabled as per gcFeature, sweep is also disabled.
     */
    readonly sweepEnabled?: boolean;
    /** If this is present, the session for this container will expire after this time and the container will close */
    readonly sessionExpiryTimeoutMs?: number;
    /** How long to wait after an object is unreferenced before deleting it via GC Sweep */
    readonly sweepTimeoutMs?: number;
}

/** The properties of an ISequencedDocumentMessage to be stored in the metadata blob in summary. */
export type ISummaryMetadataMessage = Pick<ISequencedDocumentMessage,
    | "clientId"
    | "clientSequenceNumber"
    | "minimumSequenceNumber"
    | "referenceSequenceNumber"
    | "sequenceNumber"
    | "timestamp"
    | "type">;

/**
 * Extracts the properties from an ISequencedDocumentMessage as defined by ISummaryMetadataMessage. This message is
 * added to the metadata blob in summary.
 */
export const extractSummaryMetadataMessage = (
    message?: ISequencedDocumentMessage,
): ISummaryMetadataMessage | undefined => message === undefined ? undefined : {
    clientId: message.clientId,
    clientSequenceNumber: message.clientSequenceNumber,
    minimumSequenceNumber: message.minimumSequenceNumber,
    referenceSequenceNumber: message.referenceSequenceNumber,
    sequenceNumber: message.sequenceNumber,
    timestamp: message.timestamp,
    type: message.type,
};

export function getMetadataFormatVersion(metadata?: IContainerRuntimeMetadata): number {
    /**
     * Version 2+: Introduces runtime sequence number for data verification.
     *
     * Version 1+: Introduces .metadata blob and .channels trees for isolation of
     * data store trees from container-level objects.
     * Also introduces enableGC option stored in the summary.
     *
     * Version 0: metadata blob missing; format version is missing from summary.
     * This indicates it is an older version.
     */
    return metadata?.summaryFormatVersion ?? 0;
}

export const aliasBlobName = ".aliases";
export const metadataBlobName = ".metadata";
export const chunksBlobName = ".chunks";
export const electedSummarizerBlobName = ".electedSummarizer";
export const blobsTreeName = ".blobs";

export function rootHasIsolatedChannels(metadata?: IContainerRuntimeMetadata): boolean {
    return !!metadata && !metadata.disableIsolatedChannels;
}

export function getGCVersion(metadata?: IGCMetadata): GCVersion {
    if (!metadata) {
        // Force to 0/disallowed in prior versions
        return 0;
    }
    return metadata.gcFeature ?? 0;
}

export const protocolTreeName = ".protocol";

/**
 * List of tree IDs at the container level which are reserved.
 * This is for older versions of summaries that do not yet have an
 * isolated data stores namespace. Without the namespace, this must
 * be used to prevent name collisions with data store IDs.
 */
export const nonDataStorePaths = [protocolTreeName, ".logTail", ".serviceProtocol", blobsTreeName, gcTreeKey];

export const dataStoreAttributesBlobName = ".component";

/**
 * Modifies summary tree and stats to put tree under .channels tree.
 *
 * @param summarizeResult - Summary tree and stats to modify
 *
 * @example
 * Converts from:
 * ```typescript
 * {
 *     type: SummaryType.Tree,
 *     tree: { a: {...}, b: {...}, c: {...} },
 * }
 * ```
 *
 * to:
 *
 * ```typescript
 * {
 *     type: SummaryType.Tree,
 *     tree: {
 *         ".channels": {
 *             type: SummaryType.Tree,
 *             tree: { a: {...}, b: {...}, c: {...} }
 *         },
 *     },
 * }
 * ```
 * And adds +1 to treeNodeCount in stats.
 */
export function wrapSummaryInChannelsTree(summarizeResult: ISummaryTreeWithStats): void {
    summarizeResult.summary = {
        type: SummaryType.Tree,
        tree: { [channelsTreeName]: summarizeResult.summary },
    };
    summarizeResult.stats.treeNodeCount++;
}

export async function getFluidDataStoreAttributes(
    storage: IDocumentStorageService,
    snapshot: ISnapshotTree,
): Promise<ReadFluidDataStoreAttributes> {
    const attributes = await readAndParse<ReadFluidDataStoreAttributes>(
        storage, snapshot.blobs[dataStoreAttributesBlobName]);
    // Use the snapshotFormatVersion to determine how the pkg is encoded in the snapshot.
    // For snapshotFormatVersion = "0.1" (1) or above, pkg is jsonified, otherwise it is just a string.
    // However the feature of loading a detached container from snapshot, is added when the
    // snapshotFormatVersion is at least "0.1" (1), so we don't expect it to be anything else.
    const formatVersion = getAttributesFormatVersion(attributes);
    assert(formatVersion > 0,
        0x1d5 /* Invalid snapshot format version */);
    return attributes;
}
