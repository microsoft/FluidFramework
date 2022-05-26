/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type SummaryObject = ISummaryTree | ISummaryBlob | ISummaryHandle | ISummaryAttachment;

export type SummaryTree = ISummaryTree | ISummaryHandle;

export interface ISummaryAuthor {
    name: string;
    email: string;
    // ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ
    date: string;
}

export interface ISummaryCommitter {
    name: string;
    email: string;
    // ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ
    date: string;
}

/**
 *  Represents a leaf node from the Summary Tree.
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace SummaryType {
    export type Tree = 1;
    export type Blob = 2;
    export type Handle = 3;
    export type Attachment = 4;

    /**
     *  Another recursive data structure.
     */
     export const Tree: Tree = 1 as const;

     /**
      * Binary data to be uploaded to the server. The data is sent to the drivers
      * and each driver will decide how the blob will be uploaded to the server.
      */
     export const Blob: Blob = 2 as const;
     /**
      * Path to an already stored tree that hasn't changed since the last summary.
      */
     export const Handle: Handle = 3 as const;

     /**
      * Unique identifier to larger blobs uploaded outside of the summary.
      * Ex. DDS has large images or video that will be uploaded by the BlobManager and
      * receive an Id that can be used in the summary.
      */
     export const Attachment: Attachment = 4 as const;
}
export type SummaryType = SummaryType.Attachment | SummaryType.Blob | SummaryType.Handle | SummaryType.Tree;

export type SummaryTypeNoHandle = SummaryType.Tree | SummaryType.Blob | SummaryType.Attachment;

/**
 * Path to a summary tree object from the last uploaded summary indicating the summary object hasn't
 * changed since it was uploaded.
 * To illustrate, if a DataStore did not get any ops since last summary, the framework runtime will use a handle for the
 * entire DataStore instead of re-sending the entire subtree. Same concept will be applied for a DDS.
 * If a DDS did not receive any ops since the last summary, the ISummary tree for that DDS will not have changed and
 * the fluid framework will send that DDS' handle so the server can use that previous handle instead of sending the
 * entire DDS. An example of handle would be: '/<DataStoreId>/<DDSId>'.
 * Notice that handles are optimizations from the Fluid Framework Runtime and the DDS is not aware of the handles.
 * Also, the use of Summary Handles is currently restricted to DataStores and DDS.
 */
export interface ISummaryHandle {
    type: SummaryType.Handle;

    /**
     * Type of Summary Handle all Summary types with the exception of handles (which are NOT supported).
     */
    handleType: SummaryTypeNoHandle;

    /**
     * Unique path that identifies the stored handle reference.
     */
    handle: string;
}

/**
 * String or Binary data to be uploaded to the server as part of the document's Summary.
 */
export interface ISummaryBlob {
    type: SummaryType.Blob;
    content: string | Uint8Array;
}

/**
 * Handle to blobs uploaded outside of the summary. Attachment Blobs are uploaded and downloaded separately via
 * http requests and  are not included on the snapshot payload. The ISummaryAttachment are handles to these blobs.
 * Additional information can be found here: https://github.com/microsoft/FluidFramework/issues/6374
 */
export interface ISummaryAttachment {
    type: SummaryType.Attachment;
    id: string;
}

/**
 * Tree Node  data structure with children that are nodes of SummaryObject type:
 * Blob, Handle, Attachment or another Tree.
 */
export interface ISummaryTree {
    type: SummaryType.Tree;

    // TODO type I can infer from SummaryObject. File mode I may want to directly specify so have symlink+exec access
    tree: { [path: string]: SummaryObject; };

    // Indicates that this tree entry is unreferenced. If this is not present, the tree entry is considered referenced.
    unreferenced?: true;
}
