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

// TODO: Remove comments
// export interface IChannelSnapshot extends ISnapshotTreeBase {
//     blobs: { ".attributes": string; };
//     trees: { ".data": ISnapshotTree; };
// }

// export interface IChannelsTree {
//     [id: string]: IChannelSnapshot;
// }

// export interface ISnapshotTreeBase {
//     id: string | null;
// }

// export interface IDataStoreSnapshot extends ISnapshotTreeBase {
//     blobs: { [dataStoreAttributesBlobName]: string; }
//     trees: { ".channels": ISnapshotTree };
// }

// export interface IDifferentialSnapshot<T extends IDataStoreSnapshot = IDataStoreSnapshot> extends ISnapshotTreeBase {
//     blobs: { "_outstandingOps": string; };
//     trees: { "_baseSummary": T | IDifferentialSnapshot<T> }
// }

// export type DataStoreSnapshot = IDataStoreSnapshot | IDifferentialSnapshot;

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
