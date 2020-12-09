/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { ISummaryTree, ITree } from "@fluidframework/protocol-definitions";
import { IChannelStorageService } from "@fluidframework/datastore-definitions";
import { convertSummaryTreeToITree, listBlobsAtTreePath } from "@fluidframework/runtime-utils";

/**
 * Mock implementation of IChannelStorageService based on ITree input.
 */
export class MockStorage implements IChannelStorageService {
    public static createFromSummary(summaryTree: ISummaryTree) {
        const tree = convertSummaryTreeToITree(summaryTree);
        return new MockStorage(tree);
    }

    public async readBlob(path: string): Promise<ArrayBufferLike> {
        return this.readBlobInternal(this.tree, path.split("/"));
    }

    constructor(protected tree?: ITree) {
    }

    public async contains(path: string): Promise<boolean> {
        return await this.readBlob(path) !== undefined;
    }

    public async list(path: string): Promise<string[]> {
        return listBlobsAtTreePath(this.tree, path);
    }

    private async readBlobInternal(tree: ITree, paths: string[]): Promise<ArrayBufferLike> {
        if (tree) {
            for (const entry of tree.entries) {
                if (entry.path === paths[0]) {
                    if (entry.type === "Blob") {
                        // eslint-disable-next-line prefer-rest-params
                        assert(paths.length === 1, JSON.stringify({ ...arguments }));
                        const blob = entry.value;
                        return blob;
                    }
                    if (entry.type === "Tree") {
                        return this.readBlobInternal(entry.value as ITree, paths.slice(1));
                    }
                    return undefined;
                }
            }
            return undefined;
        }
    }
}
