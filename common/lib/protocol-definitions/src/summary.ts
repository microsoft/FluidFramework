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
      * Binary data to be uploaded to the server.
      */
     export const Blob: Blob = 2 as const;
     /**
      * Path to an already stored tree that hasn't changed since the last summary.
      */
     export const Handle: Handle = 3 as const;

     /**
      *  Handle to blobs uploaded outside of the summary.
      */
     export const Attachment: Attachment = 4 as const;
}
export type SummaryType = SummaryType.Attachment | SummaryType.Blob | SummaryType.Handle | SummaryType.Tree;

export type SummaryTypeNoHandle = SummaryType.Tree | SummaryType.Blob | SummaryType.Attachment;

/**
 * Path to a previous summary, that hasn't changed since then.
 * To illustrate, if a DataStore did not get any ops since last summary, the framework runtime will use a handle for the
 * entire DataStore instead of re-sending the entire subtree.  Same concept will be applied for a DDS.
 * Notice that handles are optimizations from the Fluid Framework Runtime.
 */
export interface ISummaryHandle {
    type: SummaryType.Handle;

    /**
     * All Summary types are supported, with the exception of the handles which is NOT supported here.
     */
    handleType: SummaryTypeNoHandle;

    /**
     * Unique path that identifies the stored handle reference.
     */
    handle: string;
}

/**
 * Binary data to be uploaded to the server as part of the document's Summary.
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
 *  Recursive data structure that is composed by leaf nodes of SummaryObject type.
 */
export interface ISummaryTree {
    type: SummaryType.Tree;

    // TODO type I can infer from SummaryObject. File mode I may want to directly specify so have symlink+exec access
    tree: { [path: string]: SummaryObject; };

    // Indicates that this tree entry is unreferenced. If this is not present, the tree entry is considered referenced.
    unreferenced?: true;
}
