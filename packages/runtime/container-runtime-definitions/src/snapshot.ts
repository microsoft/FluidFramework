/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISnapshotTree } from "@fluidframework/protocol-definitions";

export const missingSnapshotFormatVersion = undefined;

export const nextContainerSnapshotFormatVersion = "1.0";
export type ContainerRuntimeSnapshotFormatVersion =
    | typeof missingSnapshotFormatVersion
    | typeof nextContainerSnapshotFormatVersion;

export const currentDataStoreSnapshotFormatVersion = "1.0";
export const nextDataStoreSnapshotFormatVersion = "2.0";
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

const protocolTreeName = ".protocol";

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
