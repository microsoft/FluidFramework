/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { IDocumentStorageService, ISummaryContext } from "@fluidframework/driver-definitions";
import { buildSnapshotTree } from "@fluidframework/driver-utils";
import {
    ICreateBlobResponse,
    ISummaryHandle,
    ISummaryTree,
    ITree,
    IVersion,
    TreeEntry,
} from "@fluidframework/protocol-definitions";
import {
    FileSnapshotReader,
    IFileSnapshot,
} from "@fluidframework/replay-driver";

/**
 * This storage service provides the following functionalities:
 * - It can be used to load a container with a saved snapshot in `IFileSnapshot` format.
 * - When a snapshot is written, it calls a callback and provide the snapshot to it in `IFileSnapshot` format. The
 *   callback should be provided when creating the storage service.
 */
export class SnapshotStorageService extends FileSnapshotReader implements IDocumentStorageService {
    public constructor(
        json: IFileSnapshot,
        private readonly snapshotCb: (snapshot: IFileSnapshot) => void,
    ) {
        super(json);
    }

    public async uploadSummaryWithContext(summary: ISummaryTree, context: ISummaryContext): Promise<string> {
        return Promise.reject(new Error("Invalid operation"));
    }

    public async createBlob(file: ArrayBufferLike): Promise<ICreateBlobResponse> {
        return Promise.reject(new Error("Invalid operation"));
    }

    public async downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
        return Promise.reject(new Error("Invalid operation"));
    }

    public get repositoryUrl(): string {
        throw new Error("Invalid operation");
    }

    public async write(
        tree: ITree,
        parents: string[],
        message: string,
        ref: string,
    ): Promise<IVersion> {
        assert(ref === "", "This should only be called to write container snapshot whose ref is empty");

        // Remove null ids from the tree before calling the callback to notify the new snapshot. This is requried
        // because the saved reference snapshots have the null ids removed.
        removeNullTreeIds(tree);

        this.docTree = buildSnapshotTree(tree.entries, this.blobs);
        const fileSnapshot: IFileSnapshot = { tree, commits: {} };
        // Call the callback with the snapshot in `IFileSnapshot` format.
        this.snapshotCb(fileSnapshot);

        return {
            id: "container",
            date: new Date().toUTCString(),
            treeId: FileSnapshotReader.FileStorageVersionTreeId,
        };
    }
}

/**
 * Removed null ids from the snapshot tree for ease of reading and comparison.
 */
function removeNullTreeIds(tree: ITree) {
    for (const node of tree.entries) {
        if (node.type === TreeEntry.Tree) {
            removeNullTreeIds(node.value);
        }
    }
    // eslint-disable-next-line no-null/no-null
    if (tree.id === undefined || tree.id === null) {
        delete tree.id;
    }
}
