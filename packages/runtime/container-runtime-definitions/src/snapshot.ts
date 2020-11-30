/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISnapshotTree } from "@fluidframework/protocol-definitions";

export const missingSnapshotFormatVersion = undefined;

export const nextContainerSnapshotFormatVersion = "0.1";
export type ContainerRuntimeSnapshotFormatVersion =
    | typeof missingSnapshotFormatVersion
    | typeof nextContainerSnapshotFormatVersion;

export const currentDataStoreSnapshotFormatVersion = "0.1";
export const nextDataStoreSnapshotFormatVersion = "0.2";
export type DataStoreSnapshotFormatVersion =
    | typeof missingSnapshotFormatVersion
    | typeof currentDataStoreSnapshotFormatVersion
    | typeof nextDataStoreSnapshotFormatVersion;

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
