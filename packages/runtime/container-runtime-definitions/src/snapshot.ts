/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISnapshotTree } from "@fluidframework/protocol-definitions";

export type PropertyValues<T> = T[keyof T];

export const containerSnapshotFormatVersions = {
    missing: undefined,
    next: "0.1",
} as const;
export type ContainerRuntimeSnapshotFormatVersion = PropertyValues<typeof containerSnapshotFormatVersions>;

export const dataStoreSnapshotFormatVersions = {
    missing: undefined,
    current: "0.1",
    next: "0.2",
} as const;
export type DataStoreSnapshotFormatVersion = PropertyValues<typeof dataStoreSnapshotFormatVersions>;

export const metadataBlobName = ".metadata";
export const chunksBlobName = ".chunks";
export const blobsTreeName = ".blobs";

export interface IContainerRuntimeMetadata {
    snapshotFormatVersion: ContainerRuntimeSnapshotFormatVersion;
}

export const protocolTreeName = ".protocol";

/**
 * List of tree IDs at the container level which are reserved.
 * This is for older versions of snapshots that do not yet have an
 * isolated data stores namespace. Without the namespace, this must
 * be used to prevent name collisions with data store IDs.
 */
export const nonDataStorePaths = [protocolTreeName, ".logTail", ".serviceProtocol", blobsTreeName];

export const dataStoreAttributesBlobName = ".component";

export interface IRuntimeSnapshot {
    id: string | null;
    blobs: {
        [chunksBlobName]: string;
        [metadataBlobName]: string;
    };
    trees: {
        [protocolTreeName]: ISnapshotTree;
        [blobsTreeName]: ISnapshotTree;
        ".dataStores": ISnapshotTree;
    },
}
